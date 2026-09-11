/**
 * The message path: one inbound WhatsApp message, from the tenant's runtime
 * to a reply, a hold or a handoff.
 *
 * Persist first, then read the memory (Postgres; the Blob copy only while it
 * is still written — see api/whatsapp.ts), then the gates in order: unknown
 * state, consent, dedupe, what kind of message it is, its age, the pause and
 * the day's cap, the token budget, the mode in force. Past the gates the
 * brain composes, layer two checks the words (steps.ts), and the reply goes
 * out now or waits in the hold window. Every branch reports through the sink
 * (persist.ts) and tells a person where one is needed (alerts.ts).
 *
 * The decisions with no side effects live in steps.ts as truth tables; this
 * file is the order they happen in.
 */
import { isThreadUnknown, threadNamespace, type ThreadState } from "../store.js";
import { normalizeInbound, withCarrierConsent, type CarrierConsent, type WaChangeValue, type WaRawMessage } from "../workspace/channels.js";
import { shortCode, optInConfirmation } from "../workspace/contracts.js";
import { describeLead, type IngestResult } from "../workspace/db.js";
import type { Json, RoutedChannel } from "../workspace/db.js";
import { waCfgFor } from "../tenant-runtime.js";
import { isVisionMime, photoUserText, toBase64, VISION_MAX_BYTES } from "../vision.js";
import type { BrainConfig, BrainMeta, NotificationsConfig, SendPurpose } from "../workspace/contracts.js";
import { isOptedOutContact, resolveSystemPrompt, describeNow } from "../workspace/contracts.js";
import { replyPosture, effectiveReplyMode } from "../reply-posture.js";
import { resolveConsent } from "../consent.js";
import { logger, errField } from "../log.js";
import type { NotifyTarget } from "../notify.js";
import { FALLBACK_BRAIN, FALLBACK_NOTIFICATIONS } from "../tenant-fallback.js";
import { PG_MISS, IngestFailed } from "./persist.js";
import { realPorts, type InboundPorts } from "./ports.js";
import type { Wire } from "../workspace/core.js";
import { MAX_REPLIES_PER_DAY, PAUSE_MS, ageVerdict, threadVerdict, holdPlan, layerTwo, holdCopy, noModelPlan, NO_MODEL_PAGE } from "./steps.js";


/**
 * A channel other than WhatsApp riding the same road. It says how a reply
 * goes out, what the words become on its wire (a text's first reply to a
 * person carries the footer), and whether every message is held for a
 * person for now (a line the carriers have not approved for texting).
 * Null = WhatsApp, on the tenant's credentials, as before.
 */
export interface InboundCarrier {
  channel: "sms";
  send(to: string, body: string): Promise<{ ok: boolean; wamid: string | null; status: number }>;
  body(text: string, isFirstReply: boolean): string;
  held: { reason: string; details: string } | null;
  /** What the carrier itself decided about the text: its STOP or START outranks our reading of the words. */
  consent?: CarrierConsent | null;
}


export async function handleInbound(
  m: WaRawMessage,
  value: WaChangeValue,
  tenantId: string | null,
  routed: RoutedChannel | null,
  isEnvDefault: boolean,
  routingFailed = false,
  carrier: InboundCarrier | null = null,
  /** Everything outside this function: the real modules unless a test says otherwise (./ports.ts). */
  ports: InboundPorts = realPorts(),
): Promise<void> {
  const from = m.from;
  const n = withCarrierConsent(normalizeInbound(m, value), carrier?.consent ?? null);
  const channel: "whatsapp" | "sms" = carrier?.channel ?? "whatsapp";
  const db = ports.db();
  const t0 = Date.now();
  // Bound once, here, where the tenant becomes known. Every line below carries
  // it, which is the only way that stays true as this function changes.
  const L = logger({ tenant_id: tenantId, wamid: m.id, from, type: m.type });
  // The thread store is keyed per TENANT. A phone number is not a globally
  // unique identity, and this object holds history, pause, dedupe and the
  // reply cap — all four of which two businesses would otherwise share.
  const ns = threadNamespace(tenantId);

  // The control plane, through its one door (PRD §03). A tenant with no brain
  // profile never auto-replies — silence over someone else's voice — while the
  // env-default tenant keeps its baked DR fallback when the plane is UNREADABLE
  // (same semantics as the creds env fallback: absence configures, errors fall
  // back).
  const rt = db && routed ? await ports.runtime(db, routed) : null;
  // The posture rules live in ./reply-posture.ts, dependency-free and tested as
  // a truth table — they were four inline booleans, and one of them made
  // `status='disabled'` fail to silence the receptionist.
  const posture = replyPosture({
    isEnvDefault,
    routingConsulted: !!db,
    routingFailed,
    channelResolved: !!routed,
    runtimeUsable: !!rt && !rt.loadFailed,
    policyMode: rt?.policy["reply"]?.mode,
  });
  const { drFallback } = posture;
  // Reassigned once THIS person's own setting is known, just before the
  // policy is consulted below.
  let replyMode = posture.replyMode;
  let personMode: string | null = null;
  const brainCfg: BrainConfig | null = rt?.brain ?? (drFallback ? FALLBACK_BRAIN : null);
  const notif: NotificationsConfig | null = rt?.notifications ?? (drFallback ? FALLBACK_NOTIFICATIONS : null);
  // One addressing decision per message, reused by every alert below.
  const notifyTarget: NotifyTarget = { tenantId, notifications: notif, isEnvDefault };
  const replyLimits = rt?.policy["reply"]?.limits ?? {};
  const maxRepliesDay = replyLimits.max_replies_day ?? MAX_REPLIES_PER_DAY;
  const pauseMs = (replyLimits.pause_hours ? replyLimits.pause_hours * 3600 * 1000 : PAUSE_MS);
  // The number the handoff email states. It reads the same limit the pause
  // does, so the email and Settings never disagree about it.
  const pauseHours = Math.round(pauseMs / 3600000);
  // Persist first, or say so. An ingest write that fails is the one loss the
  // provider can undo: the customer's words go to the workspace mailbox as a
  // copy, and IngestFailed travels up to the webhook, which answers 503 so
  // Meta redelivers (the ingest's is_new gate makes that idempotent). Twilio
  // retries nothing, so the SMS ingress alerts the platform on the same signal.
  const recordOrSay = async (): Promise<IngestResult | null> => {
    try {
      return await ports.persist.ingest(db, tenantId, n, channel);
    } catch (e) {
      if (e instanceof IngestFailed) {
        // The copy is best effort: a mailbox that cannot be reached must not mask the loss.
        try {
          await ports.alertStaff(from, n.body ?? `[${m.type} message]`, "(NOT recorded: the database did not accept the message; the provider will retry)", "message not recorded", notifyTarget, pauseHours, "inbox", n.profileName ?? null, null);
        } catch (alertErr) {
          L.error("wa_unrecorded_alert_failed", { error: errField(alertErr) });
        }
      }
      throw e;
    }
  };
  // What is open, from the calendar feed, when the workspace has one. Cached
  // for five minutes on the edge; a feed that cannot be read says nothing.
  const openings = rt ? await ports.calendar.openings(rt) : null;

  // THE PILOT ALLOWLIST, scoped to the number it was made for.
  //
  // It exists so the deployment's OWN WhatsApp number — the pilot line in
  // WHATSAPP_PHONE_ID — answers only the testers while something is being
  // tried. It was applied to every message on every channel, which was
  // harmless while there was one tenant and became a silent muzzle the
  // moment there were more: a business that connected its own number would
  // have its customers persisted, marked processed, and never answered,
  // with one event to show for it. The salon has only escaped it because
  // the one allowlisted number is the only person who has written to them.
  //
  // A tenant that brought its own number, and every text on a line this
  // product bought, is never gated by it.
  // A short code is a sender, never a person. A carrier notice, a two-factor
  // code or a bank alert lands on a business's line like any other text, and
  // nothing can be sent back to one from a ten-digit number — so composing a
  // reply spends a model call to produce a message Twilio will refuse, and the
  // failure then raises "Reply delivery failed" at an owner who never wrote it.
  //
  // Recorded, exactly like any other message, because an owner should be able
  // to see what arrived on their line. Not answered. This gates the REPLY, not
  // the persist, for the same reason the allowlist below does.
  if (shortCode(from)) {
    const ing = await recordOrSay();
    const sink = ports.persist.sink(db, tenantId, ing, rt, channel);
    await sink.unreachableSender();
    await sink.processed();
    return;
  }

  const allow = ports.env.allowlist.split(",").map((s) => s.trim()).filter(Boolean);
  if (isEnvDefault && allow.length && !allow.includes(from)) {
    // §4 delta (deliberate): allowlist gates the REPLY, not the persist.
    const ing = await recordOrSay();
    const sink = ports.persist.sink(db, tenantId, ing, rt, channel);
    await sink.allowlistSkip();
    await sink.processed();
    return;
  }

  // Persist first (P3/§4): the customer's message is never lost to a later
  // failure.
  //
  // Gate 1b (PG_READS=on): Postgres becomes the SOURCE of the bot's memory
  // instead of a write-only shadow of Blob. Flag-gated and reversible by an env
  // flip so the live salon line can be rolled back without a redeploy; Blob is
  // still written underneath, which is what makes that rollback safe.
  let ing: IngestResult | null;
  let thread: ThreadState;
  let memory: "pg" | "blob" = "blob";
  if (ports.env.pgReads) {
    ing = await recordOrSay();
    thread = await ports.persist.thread(db, tenantId, ing);
    memory = thread === PG_MISS ? "blob" : "pg";
    // With the store retired this read answers "unknown", and the thread goes
    // to a human below instead of to a second copy of its memory.
    if (memory === "blob") thread = await ports.store.get(ns, from);
  } else {
    // The Blob read is side-effect-free, so it runs alongside the write.
    [ing, thread] = (await Promise.all([recordOrSay(), ports.store.get(ns, from)])) as
      [IngestResult | null, ThreadState];
  }
  const ingestMs = Date.now() - t0;
  // This message's wires: WhatsApp on the tenant's credentials (the
  // environment's pair only for the environment's own number), or the
  // carrier that brought the text in. Bound here, where the credentials
  // are; the door refuses when the wire for this channel is missing.
  const wires: Wire = {
    whatsapp: ports.sender(waCfgFor(rt, isEnvDefault)),
    ...(carrier ? { sms: (to: string, p: { body: string }) => carrier.send(to, p.body) } : {}),
  };
  const sink = ports.persist.sink(db, tenantId, ing, rt, channel, wires);
  // One door out: the carrier shapes the words for its wire (the footer on
  // the first reply to a person), and the sink's door sends them -- re-reading
  // consent, the pause and the workspace's status the moment before.
  const firstReply = thread.replies.length === 0 && !thread.history.some((h) => h.role === "assistant");
  const wire = (text: string) => (carrier ? carrier.body(text, firstReply) : text);
  const send = (text: string, meta?: Record<string, Json>) => sink.deliver(from, wire(text), meta);

  // Atomic concurrent-redelivery gate. PG_READS implies it: Postgres-sourced
  // memory carries no `seen` list, so is_new IS the dedupe — and it is stronger
  // than the array was (a unique index two concurrent lambdas cannot both miss).
  // A missed auto-reply beats a double text, so processed-state is deliberately
  // not consulted.
  if ((ports.env.pgDedupe || memory === "pg") && ing && !ing.is_new) {
    L.info("wa_skip_pg_dupe");
    return;
  }

  // The person's own receptionist mode (People → profile → "Receptionist
  // for …") wins over the workspace policy. Looked up per message and never
  // cached: "Never" for a difficult customer must apply to their NEXT message.
  // A failed lookup keeps the workspace mode — a blip must neither silence
  // nor unmute anyone.
  //
  // Looked up HERE, before the first branch that can speak. It used to sit
  // just above the policy consult, below the non-text acknowledgement — so a
  // person set to Never who sent a photo got the canned "I can't read
  // attachments" text from the receptionist that was told to stay out.
  if (db && tenantId && ing?.contact_id && !drFallback) {
    try {
      personMode = await ports.leads.personReplyMode(db, tenantId, ing.contact_id);
      replyMode = effectiveReplyMode(posture, personMode);
    } catch (e) {
      L.warn("wa_person_mode_lookup_failed", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Both memory sources failed: Postgres missed AND the Blob read errored. We
  // do not know whether a human has taken this thread over, what was already
  // said, or how many replies have gone out today — so every gate below would
  // be answering from an invented empty history. Hand to a human instead of
  // guessing; the customer's message is already persisted above.
  if (isThreadUnknown(thread)) {
    L.error("wa_state_unavailable", { memory });
    await Promise.all([
      sink.escalate(
        "state_unavailable",
        "The receptionist could not read this thread's history, so it did not reply. Please answer this one.",
      ),
      ports.alertStaff(from, n.body ?? `[${m.type}]`, "(no reply sent — the receptionist could not read the thread state)", "state unavailable", notifyTarget, pauseHours, ing ? `inbox/th-${ing.conversation_id}` : "inbox", n.profileName ?? null, ing ? { type: "conversation", id: ing.conversation_id } : null),
      sink.processed(),
    ]);
    return;
  }

  // CONSENT GATE — before every branch below that can send, because all of
  // them could: the non-text acknowledgement, the brain's reply, even the
  // greeting fallback. Until now `consent` was written by ingest and read by
  // nothing, so texting STOP recorded the opt-out and then got an AI reply in
  // the same request.
  //
  // Two independent sources, and either is enough:
  //   n.optOut  — THIS message is the opt-out. Local knowledge, no database
  //               needed, so it holds even when Postgres is unreachable.
  //   ing.dnc   — they opted out earlier, per Postgres, which owns consent.
  //   thread.optedOut — the same fact CACHED on the thread, consulted only when
  //               Postgres did not answer. This used to be the hole: `ing` is
  //               null during an outage, so an opt-out made last week silently
  //               stopped applying and the bot resumed replying to someone who
  //               had asked it to stop. The cache is never preferred over
  //               Postgres, so a customer who has since texted START is not
  //               held out by a stale copy, and an explicit START in THIS
  //               message clears it even while the database is down.
  //
  // Nothing is sent back — not even a confirmation. A tenant-authored opt-out
  // acknowledgement is a config item, and inventing copy in the salon's voice
  // is exactly what the brain profile exists to prevent.
  const consent = resolveConsent({
    optOutNow: n.optOut,
    optInNow: n.optIn,
    recorded: ing ? isOptedOutContact(ing) : null,
    cached: thread.optedOut,
  });
  const optedOut = consent.optedOut;

  // Keep the cache current for the NEXT request — which may be the one that
  // finds Postgres down. Written only on a transition, so the steady state
  // costs nothing.
  if (thread.optedOut !== consent.cache) {
    thread.optedOut = consent.cache;
    await ports.store.save(ns, from, thread);
  }
  if (optedOut) {
    const post: Promise<unknown>[] = [sink.processed()];
    if (n.optOut) {
      // Only on the opt-out message itself. upsertEscalation keeps ONE open
      // escalation per conversation, so a repeated STOP updates rather than
      // piles up — but a customer leaving is a business event the owner should
      // see once, not a log line.
      post.push(
        sink.escalate("opt_out", "Customer asked to stop receiving messages. Automatic replies are off for this contact until they text START."),
        ports.alertStaff(from, n.body ?? `[${m.type}]`, "(no reply sent — the customer opted out)", "opt-out", notifyTarget, pauseHours, ing ? `inbox/th-${ing.conversation_id}` : "inbox", n.profileName ?? null, ing ? { type: "conversation", id: ing.conversation_id } : null),
      );
    }
    await Promise.all(post);
    // `decided_by` matters after the fact: "cache" means Postgres was down and
    // the local copy is the only reason this customer was not texted.
    L.info("wa_skip_opt_out", {
      this_message: n.optOut,
      on_record: ing?.consent ?? null,
      decided_by: consent.source,
    });
    return;
  }

  // THE CARRIERS' HOLD (a line not yet approved for texting). The text is
  // kept above; it is held for a person with its own reason, and nothing is
  // answered until the line is approved. After consent, which outranks it;
  // before every branch that can speak.
  if (carrier?.held) {
    await Promise.all([
      sink.escalate(carrier.held.reason, carrier.held.details),
      ports.alertStaff(from, n.body ?? `[${m.type}]`, "(no reply sent — the carriers have not approved this line for texting yet)", "carriers", notifyTarget, pauseHours, ing ? `inbox/th-${ing.conversation_id}` : "inbox", n.profileName ?? null, ing ? { type: "conversation", id: ing.conversation_id } : null),
      sink.processed(),
    ]);
    L.info("sms_held_for_carriers");
    return;
  }

  // Routing is on the NORMALIZED type, not the raw one. A quick-reply tap or a
  // list selection arrives as type "button"/"interactive" with the customer's
  // words in a different field; matching on m.type sent every one of them down
  // the "I can't read that" path. normalizeInbound resolves what they chose.
  // Nothing was asked of us. A customer tapping a thumbs-up on the
  // receptionist's reply is the commonest gesture on WhatsApp, and it used to
  // be answered with "sorry, I can't read that", followed by the receptionist
  // going silent on that customer for twenty-four hours, an escalation, an
  // email to the owner, and a deadman nag two hours later. A system notice is
  // not from the customer at all. Both are already persisted by ingest; record
  // that we handled them and stop.
  if (n.kind === "reaction" || n.kind === "system") {
    L.info("wa_skip_no_request", { kind: n.kind });
    await sink.processed();
    return;
  }

  // Readable, but not ours to answer. A pin drop or a contact card is
  // perfectly legible to a person — the customer is telling the salon
  // something, and normalizeInbound has already written it as a sentence. What
  // would be wrong is the apology: acknowledging it as unreadable tells the
  // customer we did not receive what they plainly sent. So this escalates like
  // the branch below, without the ack and without muting the receptionist.
  if (n.kind === "location" || n.kind === "contacts") {
    await Promise.all([
      sink.escalate("non_text", `${n.body} — needs a person.`),
      ports.alertStaff(from, n.body ?? `[${m.type}]`, "(no reply sent — passed to a human)", n.kind, notifyTarget, pauseHours, ing ? `inbox/th-${ing.conversation_id}` : "inbox", n.profileName ?? null, ing ? { type: "conversation", id: ing.conversation_id } : null),
      sink.processed(),
    ]);
    L.info("wa_escalate_readable_nontext", { kind: n.kind });
    return;
  }

  // A photo the receptionist may look at (features.vision, off by default).
  // Fetched now rather than after the acknowledgement, because the reply
  // needs the bytes; stored on the way like every attachment. Anything that
  // is not a small image, or a workspace where the receptionist may not
  // speak right now, takes the branch below exactly as before.
  let photo: { mime: string; base64: string } | null = null;
  let photoTried = false;
  if (
    n.type === "media" && n.media && rt?.features?.vision && isVisionMime(n.media.mime_type)
    && brainCfg && (replyMode === "auto" || replyMode === "veto") && Date.now() > thread.pausedUntil
  ) {
    photoTried = true;
    const got = await sink.media(n);
    if (got && isVisionMime(got.mime) && got.bytes.byteLength <= VISION_MAX_BYTES) {
      photo = { mime: got.mime, base64: toBase64(got.bytes) };
      L.info("wa_photo_seen", { bytes: got.bytes.byteLength, mime: got.mime });
    } else {
      L.info("wa_photo_not_seen", { fetched: !!got, bytes: got?.bytes.byteLength ?? null, mime: got?.mime ?? null });
    }
  }

  if (!photo && (n.type !== "text" || !n.body)) {
    // genuinely unreadable (voice note, image, sticker): hand to a human.
    //
    // sink.media() downloads the attachment from Meta (an 8s metadata fetch,
    // then up to 25MB with a 15s timeout) and uploads it to storage. That ran
    // HERE, above the acknowledgement — so someone who sent a voice note waited
    // through two Graph round trips and a multi-megabyte upload, as much as
    // ~23s of pure timeout, before being told we had seen it. Nothing in the
    // ack depends on those bytes, so it joins the post-reply work below.
    const media = photoTried ? Promise.resolve(null) : sink.media(n);
    if (Date.now() > thread.pausedUntil) {
      // The acknowledgement is the receptionist speaking, so it obeys the
      // same rule as every reply: only when the mode in force lets it speak.
      // A workspace on Ask, or a person set to Never, gets no canned text —
      // the message still escalates so a human sees it. No persona -> no ack.
      const mayAck = !!brainCfg && (replyMode === "auto" || replyMode === "veto");
      if (mayAck) {
        // A courtesy, not an answer: marked so it does not spend the daily cap.
        await send(brainCfg!.fallbacks.non_text, { ack: true });
        thread.pausedUntil = Date.now() + pauseMs;
        await ports.store.save(ns, from, thread);
      }
      const why = mayAck
        ? "auto-acknowledged, bot paused"
        : !brainCfg
          ? "no auto-reply configured"
          : personMode
            ? `no acknowledgement — this person is set to '${replyMode}'`
            : `no acknowledgement — reply mode is '${replyMode}'`;
      await Promise.all([
        ...(mayAck ? [sink.pause(new Date(Date.now() + pauseMs).toISOString())] : []),
        sink.escalate("non_text", `Customer sent a ${m.type} message — ${why}.`),
        ports.alertStaff(from, `[${m.type} message]`, `(${why})`, "non-text message", notifyTarget, pauseHours, ing ? `inbox/th-${ing.conversation_id}` : "inbox", n.profileName ?? null, ing ? { type: "conversation", id: ing.conversation_id } : null),
      ]);
      L.info("wa_nontext", { acked: mayAck, mode: replyMode, person_mode: personMode });
    }
    await Promise.all([media, sink.processed()]);
    return;
  }
  // Past the gate above, this is the customer's message as words — typed, or
  // the label of what they tapped. Everything downstream reads it from here so
  // no branch can reach back to m.text and miss the tapped case.
  //
  // Named bodyText, not text: `text` is the HTTP helper imported at the top of
  // this file, and shadowing it here would make a later `return text(200, …)`
  // inside this function fail in a thoroughly confusing way.
  //
  // For a photo the receptionist looks at, the words on record are the
  // caption, or the fact of the photo; what the MODEL is told is built beside
  // the image, in vision.ts, and never lands in an alert or the memory.
  const bodyText: string = photo ? (n.media?.caption?.trim() || "[photo]") : (n.body ?? "");

  // Late, but somebody is still waiting.
  //
  // This used to stamp anything over ten minutes old as processed and return —
  // no reply, no escalation, nobody told. Meta redelivers undelivered webhooks
  // with backoff for days, so a fifteen-minute outage turned its entire
  // redelivery backlog into customers who wrote and were never answered, and
  // the only trace was one log line per message. The guard was written against
  // webhook REPLAYS, and replays are already stopped by the dedupe gate below
  // in both memory modes, so this only ever caught late FIRST deliveries.
  //
  // Two ages, because the right answer changes with the delay. Inside the
  // reply horizon the customer is still in the conversation they started, and
  // answering late beats not answering. Beyond it an automated reply would
  // arrive out of nowhere, so a person picks it up — but a person is told.
  const { ageMs, verdict: age } = ageVerdict(m.timestamp);
  if (age === "stale") {
    await Promise.all([
      sink.escalate("stale", `Message arrived ${Math.round(ageMs / 60000)} minutes late — too old to answer automatically.`),
      ports.alertStaff(from, n.body ?? `[${m.type}]`, "(no reply sent — arrived too late to answer automatically)", "late message", notifyTarget, pauseHours, ing ? `inbox/th-${ing.conversation_id}` : "inbox", n.profileName ?? null, ing ? { type: "conversation", id: ing.conversation_id } : null),
      sink.processed(),
    ]);
    L.info("wa_stale_escalated", { age_ms: ageMs });
    return;
  }
  if (age === "late") L.info("wa_late_but_answering", { age_ms: ageMs });

  if (thread.seen.includes(m.id)) { L.info("wa_skip_dupe"); return; }
  thread.seen.push(m.id);

  // A YES IS CONFIRMED, and in these words. Every recurring program owes the
  // person who opted in an immediate confirmation naming the program, the
  // frequency, the rates disclosure, HELP and STOP, however the yes was given
  // (the reviewers' onboarding guide; CTIA). The words are the campaign's own
  // filed opt-in message, from contracts, so the filing and the wire cannot
  // disagree. Not the receptionist speaking: a system message, sent whatever
  // the reply mode and never a model call -- and a courtesy against the daily
  // cap, like the acknowledgement. Which question was answered decides which
  // confirmation goes; neither confirms the other, which is what the carriers
  // refused the live campaign for three times.
  // Offers go by WhatsApp, never by text: the texting line's carrier
  // registration is informational, so a YES OFFERS that arrives by text is
  // recorded (ingest keeps the answer; it is honoured on WhatsApp) and answered
  // like any other words, not confirmed as a subscription on this number.
  if (n.optIn || (n.optInMarketing && channel === "whatsapp")) {
    const purpose: SendPurpose = n.optInMarketing ? "marketing" : "conversational";
    const words = optInConfirmation(brainCfg?.business_name ?? rt?.known?.workspace?.name ?? "", purpose);
    thread.history.push({ role: "user", content: bodyText });
    thread.history.push({ role: "assistant", content: words });
    await ports.store.save(ns, from, thread);
    await send(words, { ack: true, confirmation: purpose });
    await sink.processed();
    L.info("wa_opt_in_confirmed", { purpose, channel });
    return;
  }

  const gate = threadVerdict(thread, maxRepliesDay);
  if (gate === "paused") {
    thread.history.push({ role: "user", content: bodyText });
    await ports.store.save(ns, from, thread);
    L.info("wa_skip_paused", { paused_until: thread.pausedUntil });
    await sink.processed();
    return;
  }
  if (gate === "ratecap") {
    await ports.store.save(ns, from, thread);
    L.info("wa_skip_ratecap", { cap: maxRepliesDay, used: thread.replies.length });
    // A customer who hits the cap was being abandoned to a console line: no
    // escalation, no alert, nothing on Today. `rate_cap` has been a declared,
    // CHECK-allowed, LABELLED escalation reason this whole time with no
    // emitter anywhere in the repo. At the shipped default of 20/day this
    // fires on a busy thread, not only when someone lowers the limit.
    await Promise.all([
      sink.escalate("rate_cap", `Thread hit ${maxRepliesDay} automatic replies today — the receptionist stopped and is waiting for a human.`),
      ports.alertStaff(from, bodyText, "(no reply sent — daily automatic-reply limit reached)", "rate cap", notifyTarget, pauseHours, ing ? `inbox/th-${ing.conversation_id}` : "inbox", n.profileName ?? null, ing ? { type: "conversation", id: ing.conversation_id } : null),
      sink.processed(),
    ]);
    return;
  }
  // THE TOKEN BUDGET (limits.max_llm_tokens_day; 0 or absent is off).
  //
  // A rolling day of model usage for this workspace, from the usage events
  // every reply writes. Over it the receptionist stops and says so, exactly
  // as it does at the reply cap: a margin is a setting, not an accident, and
  // a customer at the cap is never abandoned to a log line.
  const tokenCap = typeof replyLimits.max_llm_tokens_day === "number" ? replyLimits.max_llm_tokens_day : 0;
  if (tokenCap > 0 && db && tenantId) {
    const used = await ports.budget.tokensLast24h(db, tenantId);
    if (used >= tokenCap) {
      await ports.store.save(ns, from, thread);
      L.info("wa_skip_budget", { cap: tokenCap, used });
      await Promise.all([
        sink.escalate("budget", `The workspace used ${used.toLocaleString("en-US")} of its ${tokenCap.toLocaleString("en-US")} model tokens in the last 24 hours — the receptionist stopped and is waiting for a human.`),
        ports.alertStaff(from, bodyText, "(no reply sent — the day's model budget is used up)", "budget", notifyTarget, pauseHours, ing ? `inbox/th-${ing.conversation_id}` : "inbox", n.profileName ?? null, ing ? { type: "conversation", id: ing.conversation_id } : null),
        sink.processed(),
      ]);
      return;
    }
  }

  // THE PAUSE (tenants.status = 'paused', written by billing for a workspace
  // whose subscription stopped). The customer's message is already kept
  // above; it is held for a person with its own reason, and nothing is
  // answered until the workspace resumes. Said the way the budget says it:
  // the escalation is the Inbox's row, the alert the owner's mail.
  if (rt?.paused) {
    await ports.store.save(ns, from, thread);
    L.info("wa_skip_paused");
    await Promise.all([
      sink.escalate("paused", "The workspace is paused because billing stopped, so the receptionist did not answer. Resume from Settings › Billing, or answer this one yourself."),
      ports.alertStaff(from, bodyText, "(no reply sent — the workspace is paused until billing resumes)", "paused", notifyTarget, pauseHours, ing ? `inbox/th-${ing.conversation_id}` : "inbox", n.profileName ?? null, ing ? { type: "conversation", id: ing.conversation_id } : null),
      sink.processed(),
    ]);
    return;
  }

  // E3: the reply policy is consulted BEFORE generation. 'ask' is the timid
  // mode — everything escalates, a human answers; a tenant with no persona
  // behaves identically. The customer's message is already persisted above.
  // 'veto' composes a reply like 'auto' and then HOLDS it for a configured
  // window before sending, so the business can redirect the bot before the
  // customer sees it. It reaches the brain; what differs is the dispatch below.
  if (!brainCfg || (replyMode !== "auto" && replyMode !== "veto")) {
    await ports.store.save(ns, from, thread);
    // A hold the owner chose for THIS person is its own reason: it is not a
    // workspace setting, and the Inbox should say "you handle this person",
    // not "held by policy". It also alerts ONCE per open hold rather than
    // once per message — the owner asked to handle this person themselves,
    // and a thread already in their Inbox does not need a second email.
    const hold = holdCopy({ brainCfg, personMode, replyMode, configBroken: !!rt?.configBroken });
    const outcome = await sink.escalate(hold.reason, hold.details);
    const alertNeeded = !hold.personHold || outcome !== "refreshed";
    await Promise.all([
      ...(alertNeeded
        ? [
            ports.alertStaff(
              from,
              bodyText,
              hold.botText,
              hold.why,
              notifyTarget,
              pauseHours,
              ing ? `inbox/th-${ing.conversation_id}` : "inbox",
              n.profileName ?? null,
              ing ? { type: "conversation", id: ing.conversation_id } : null,
            ),
          ]
        : []),
      sink.processed(),
    ]);
    L.info("wa_held_by_policy", { mode: replyMode, person_mode: personMode, persona: !!brainCfg, config_broken: !!rt?.configBroken, escalation: outcome ?? "n/a", alerted: alertNeeded });
    return;
  }

  let replyText: string;
  let escalate = false;
  let escalationReason = "human_token";
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  let brainMeta: BrainMeta | undefined;
  let fallback: ReturnType<typeof noModelPlan> | undefined;
  let brainMs = 0;
  if (ports.env.modelKey) {
    try {
      const { generateReply } = await ports.brain();
      // The same description the voice agent is given, from the same reader.
      // One receptionist means one account of who this person is — not a name
      // on the phone and an anonymous stranger over text.
      //
      // Never fatal: an unavailable lead lookup costs recognition, and losing
      // the reply entirely to get it would be a far worse trade.
      let leadNote: string | undefined;
      if (db && tenantId) {
        try {
          const e164 = from.startsWith("+") ? from : `+${from}`;
          const lead = await ports.leads.read(db, tenantId, e164, 1);
          leadNote = describeLead(lead);
          // Their appointments, from the same feed the openings come from:
          // "when is my appointment?" is answered from the calendar, never guessed.
          const visits = rt ? await ports.calendar.visits(rt, { phone: e164, name: lead.name }) : null;
          if (visits) leadNote = `${leadNote}\n${visits}`;
        } catch (e) {
          L.warn("lead_context_unavailable", { error: errField(e) });
        }
      }
      const tBrain = Date.now();
      const r = await generateReply(
        thread.history,
        photo ? photoUserText(n.media?.caption) : bodyText,
        // Composed from the workspace's structured facts when it has them,
        // and its hand-written prompt when it does not. retell-inbound.ts
        // composes the SAME thing for the voice agent, which is the point:
        // two copies of the hours is how two channels start disagreeing
        // about when the business opens.
        resolveSystemPrompt(brainCfg, "whatsapp", rt?.timezone, new Date(), rt?.policy, rt?.known),
        brainCfg.fallbacks.error,
        leadNote,
        // "Are you open?" it could already answer. "Are you open RIGHT NOW?"
        // it was answering too, from nothing — it had a table of hours and no
        // idea what day it was.
        `${describeNow(rt?.timezone, new Date(), brainCfg.profile?.closures)}${openings ? `\n\n${openings}` : ""}`,
        photo ?? undefined,
      );
      replyText = r.text; escalate = r.escalate; usage = r.usage; brainMeta = r.meta;
      brainMs = Date.now() - tBrain;
      if (r.reason) escalationReason = r.reason;
      // Layer-2 policy enforcement (Blueprint §6): prompt text is never the
      // only defense (steps.ts/layerTwo). A price in the draft blocks the send
      // outright; under "ask", a booking or a service/pricing question is a
      // person's to answer whatever the model made of the prompt.
      const two = layerTwo({ replyText, escalate, escalationReason, brainCfg, policy: rt?.policy, intent: brainMeta?.intent ?? null });
      if (two.priceBlocked) L.warn("policy_block_price");
      if (two.askClass) L.info("wa_policy_ask", { class: two.askClass, intent: brainMeta?.intent ?? null, complied: two.complied });
      replyText = two.replyText;
      escalate = two.escalate;
      escalationReason = two.escalationReason;
    } catch (e) {
      L.error("brain_failed", { error: errField(e) });
      replyText = brainCfg.fallbacks.error;
      escalate = true;
      escalationReason = "brain_error";
    }
  } else {
    // No model key: the receptionist cannot answer. The workspace's own
    // greeting still goes, labelled a fallback, the thread is handed to a
    // person, and the platform is paged once per window (noModelPlan says
    // why). A canned greeting passed off as an answer would be the quiet
    // failure this replaces.
    fallback = noModelPlan(brainCfg.fallbacks);
    replyText = fallback.replyText;
    escalate = fallback.escalate;
    escalationReason = fallback.escalationReason;
    L.error("wa_no_model");
    if (db) await ports.page({ db }, NO_MODEL_PAGE.key, NO_MODEL_PAGE.subject, NO_MODEL_PAGE.body);
  }

  // THE VETO WINDOW.
  //
  // Under 'veto' the reply is written as `queued` and an outbound_send job is
  // scheduled instead of going straight to the wire. It travels the same last
  // door a human's reply does — consent re-checked at fire time, the sender
  // registry, the same status transitions — so the delay adds a window, not a
  // second send path.
  //
  // A text channel is not a phone call. Nobody expects a WhatsApp answer in
  // under a second, so the wait costs the customer nothing and buys the
  // business the only thing it could not previously have: a chance to redirect
  // the bot BEFORE the customer reads it, rather than apologising after.
  //
  // Falls back to sending immediately if the job cannot be scheduled. A late
  // reply is a worse outcome than an un-vetoed one, and silence is the worst.
  // replyLimits is the same row read above for the daily cap and the pause.
  // THE CONFIDENCE DIAL rides on the same window: under 'auto' a reply the
  // model is not sure enough about waits where a vetoed one would
  // (steps.ts/holdPlan; limits.min_confidence, 0 or absent is off).
  const plan = holdPlan(replyMode, replyLimits, brainMeta);
  const { delayMs, heldForConfidence } = plan;
  if (heldForConfidence) L.info("wa_held_low_confidence", { confidence: brainMeta?.confidence, min: plan.minConfidence, delay_ms: delayMs });
  const queued = delayMs > 0
    ? await ports.persist.queueReply(db, tenantId, ing, from, wire(replyText), delayMs, L, plan.source, brainMeta, channel)
    : false;
  // The quality signal on this reply's usage event: how sure, how fast,
  // whether it waited, whether it handed off. The diagnostics read the day
  // back from these; a Reports tile can, later.
  const replyQuality = {
    intent: brainMeta?.intent ?? null,
    confidence: brainMeta?.confidence ?? null,
    language: brainMeta?.language ?? null,
    latency_ms: brainMs,
    held: heldForConfidence ? "low_confidence" : delayMs > 0 ? "veto_window" : null,
    escalate,
    photo: !!photo,
  };

  // A veto window that was CONFIGURED and did not happen must not pass in
  // silence. The fallback below is deliberate — an un-vetoed reply beats no
  // reply — but the workspace asked to see its receptionist's words before
  // the customer did, and instead the customer got them first. A log line
  // nobody reads is how a setting quietly becomes a lie.
  //
  // Recorded per tenant on the event stream, so 'my veto window is not
  // working' has an answer that does not require reading lambda logs.
  if (delayMs > 0 && !queued) {
    await sink.vetoFallback(delayMs);
  }
  if (queued) {
    thread.history.push({ role: "user", content: bodyText });
    thread.history.push({ role: "assistant", content: replyText });
    thread.replies.push(Date.now());
    const post: Promise<unknown>[] = [];
    if (usage) post.push(sink.usage({ ...usage, ...replyQuality }));
    if (escalate) {
      // An escalating draft still pauses and alerts — a human should be looking
      // at this one before the timer runs out, not after.
      thread.pausedUntil = Date.now() + pauseMs;
      post.push(sink.pause(new Date(Date.now() + pauseMs).toISOString()));
      post.push(sink.escalate(escalationReason, fallback ? fallback.escalationDetails(bodyText) : brainMeta?.reason ? `${brainMeta.reason} — "${bodyText}"` : bodyText));
      post.push(ports.alertStaff(from, bodyText, replyText, "assistant flagged handoff (reply held for review)", notifyTarget, pauseHours, ing ? `inbox/th-${ing.conversation_id}` : "inbox", n.profileName ?? null, ing ? { type: "conversation", id: ing.conversation_id } : null));
    }
    await Promise.all(post);
    await ports.store.save(ns, from, thread);
    await sink.processed();
    L.info("wa_reply_queued", { delay_ms: delayMs, escalate });
    return;
  }

  const sent = await send(replyText, fallback ? (fallback.meta as Record<string, Json>) : (brainMeta as unknown as Record<string, Json> | undefined));
  const tSent = Date.now();
  if (sent.outcome === "sent") {
    thread.history.push({ role: "user", content: bodyText });
    thread.history.push({ role: "assistant", content: replyText });
    thread.replies.push(Date.now());
    // The door recorded the row; what is left is the usage and the handoff.
    const post: Promise<unknown>[] = [];
    if (usage) post.push(sink.usage({ ...usage, ...replyQuality }));
    if (escalate) {
      thread.pausedUntil = Date.now() + pauseMs;
      post.push(sink.pause(new Date(Date.now() + pauseMs).toISOString()));
      post.push(sink.escalate(escalationReason, fallback ? fallback.escalationDetails(bodyText) : brainMeta?.reason ? `${brainMeta.reason} — "${bodyText}"` : bodyText));
      post.push(ports.alertStaff(from, bodyText, replyText, fallback ? fallback.alertReason : "assistant flagged handoff", notifyTarget, pauseHours, ing ? `inbox/th-${ing.conversation_id}` : "inbox", n.profileName ?? null, ing ? { type: "conversation", id: ing.conversation_id } : null));
    }
    await Promise.all(post);
    await ports.store.save(ns, from, thread);
    await sink.processed();
  } else if (sent.outcome === "refused") {
    // The wire found what the gates above could not see a moment ago: the
    // person asked to stop, a human took the thread, the workspace paused.
    // Each of those already has its person; the message is kept and done.
    await ports.store.save(ns, from, thread);
    L.info("wa_refused_at_wire", { reason: sent.reason });
    await sink.processed();
  } else {
    // The customer got NO reply and Meta already has its 200 — this must be
    // loud, and the message must stay visibly unprocessed for reconciliation.
    // The door wrote the failed row and its event; the people are told here.
    await ports.store.save(ns, from, thread);
    await Promise.all([
      ports.alertStaff(from, bodyText, "(send failed — the customer received no reply)", "wa_send_failed", notifyTarget, pauseHours, ing ? `inbox/th-${ing.conversation_id}` : "inbox", n.profileName ?? null, ing ? { type: "conversation", id: ing.conversation_id } : null),
      sink.escalate("send_failed", sent.reason === "wire_unreadable"
        ? "Auto-reply could not be sent: the thread could not be read at the wire. Customer got no answer."
        : `Auto-reply could not be delivered (HTTP ${sent.status}). Customer got no answer.`),
    ]);
  }
  L.info("wa_replied", {
    escalate, sent: sent.outcome === "sent", store: ports.store.backend(), memory,
    ingest_ms: ingestMs, post_ms: Date.now() - tSent,
  });
}

