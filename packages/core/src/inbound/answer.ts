/**
 * The message path: one inbound customer message, from the tenant's runtime
 * to a reply, a hold or a handoff. WhatsApp and text both, and the verb the
 * doors' adapters call (apps/edge/lib/whatsapp/inbound.ts).
 *
 * Persist first, then read the memory (Postgres, the only one there is), then
 * the gates in order: unknown state, dedupe, consent, what kind of message it
 * is, its age, the pause and
 * the day's cap, the token budget, the mode in force. Past the gates the
 * brain composes, layer two checks the words (steps.ts), and the reply goes
 * out now or waits in the hold window. Every branch reports through the sink
 * and tells a person where one is needed, both of them ports (./ports.ts).
 *
 * The decisions with no side effects live in steps.ts as truth tables; this
 * file is the order they happen in, and the ORDER IS THE PRODUCT
 * (docs/conversation-flow.md §5.1).
 */
import { isThreadUnknown, type ThreadState } from "./thread";
import { shortCode, optInConfirmation, phoneTail, addressInMessage } from "@chanlytics/contracts";
import type { BrainConfig, BrainMeta, NotificationsConfig, SendPurpose } from "@chanlytics/contracts";
import { isOptedOutContact, resolveSystemPrompt, describeNow, fallbackMessages } from "@chanlytics/contracts";
// TYPES ONLY: the normalised message is the channels package's shape and this
// verb speaks it. A VALUE from channels would be a provider inside a verb —
// that is a port, not a widening (hygiene.test.mjs).
import type { CarrierConsent, NormalizedInbound } from "@chanlytics/channels";
import type { IngestResult, Json, RoutedChannel } from "@chanlytics/db";
import { isVisionMime, photoUserText, toBase64, VISION_MAX_BYTES } from "./vision";
import { replyPosture, effectiveReplyMode } from "./reply-posture";
import { resolveConsent } from "./consent";
import { IngestFailed, type InboundHandoff, type InboundPorts } from "./ports";
import type { Wire } from "../deliver";
import {
  MAX_REPLIES_PER_DAY,
  PAUSE_MS,
  ageVerdict,
  threadVerdict,
  holdPlan,
  layerTwo,
  holdCopy,
  noModelPlan,
  NO_MODEL_PAGE,
} from "./steps";

/**
 * An error rendered for a log field: name and message, never a stack blob.
 * The edge's lib/log.ts has the same two lines; this is the verb's, because a
 * verb may not import the edge.
 */
function errField(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

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

/** One inbound message, as the door's adapter hands it over. */
export interface InboundInput {
  /** withCarrierConsent(normalizeInbound(m, value), carrier?.consent ?? null), done by the adapter. */
  message: NormalizedInbound;
  /**
   * The raw fields this body still reads off the provider's own shape: the
   * message id and the sender for the log envelope and the wire, the raw type
   * for the words an owner reads ("Customer sent a sticker message"), and the
   * provider's timestamp for the staleness check. Everything else is read from
   * the normalised record above.
   */
  raw: { id: string; from: string; type: string; timestamp: string | number | null };
  tenantId: string | null;
  routed: RoutedChannel | null;
  isEnvDefault: boolean;
  carrier: InboundCarrier | null;
}

export async function answerInbound(input: InboundInput, ports: InboundPorts): Promise<void> {
  const { message: n, raw, tenantId, routed, isEnvDefault, carrier } = input;
  const from = raw.from;
  const channel: "whatsapp" | "sms" = carrier?.channel ?? "whatsapp";
  const db = ports.db();
  const t0 = Date.now();
  // Bound once, here, where the tenant becomes known. Every line below carries
  // it, which is the only way that stays true as this function changes.
  const L = ports.log({ tenant_id: tenantId, wamid: raw.id, from_tail: phoneTail(from), type: raw.type });
  // The control plane, through its one door (PRD §03). A tenant with no brain
  // profile never auto-replies, and a control plane that cannot be READ holds
  // the thread for a person: silence over someone else's voice, and no second
  // copy of anyone's profile to answer from.
  const rt = db && routed ? await ports.runtime(db, routed) : null;
  // The posture rules live in ./reply-posture.ts, dependency-free and tested as
  // a truth table — they were four inline booleans, and one of them made
  // `status='disabled'` fail to silence the receptionist.
  const posture = replyPosture({
    runtimeUsable: !!rt && !rt.loadFailed,
    policyMode: rt?.policy["reply"]?.mode,
  });
  // Reassigned once THIS person's own setting is known, just before the
  // policy is consulted below.
  let replyMode = posture.replyMode;
  let personMode: string | null = null;
  const brainCfg: BrainConfig | null = rt?.brain ?? null;
  // What goes out in the business's name when the receptionist cannot answer, with its details as they are now (S5).
  const fallbacks = brainCfg ? fallbackMessages(brainCfg, rt?.known) : null;
  const notif: NotificationsConfig | null = rt?.notifications ?? null;
  // One addressing decision per message, reused by every alert below.
  const notifyTarget: InboundHandoff["target"] = { tenantId, notifications: notif, isEnvDefault };
  const replyLimits = rt?.policy["reply"]?.limits ?? {};
  const maxRepliesDay = replyLimits.max_replies_day ?? MAX_REPLIES_PER_DAY;
  const pauseMs = replyLimits.pause_hours ? replyLimits.pause_hours * 3600 * 1000 : PAUSE_MS;
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
          await ports.alertStaff(
            from,
            n.body ?? `[${raw.type} message]`,
            "(NOT recorded: the database did not accept the message; the provider will retry)",
            "message not recorded",
            { target: notifyTarget, channel, who: n.profileName ?? null },
          );
        } catch (alertErr) {
          L.error("wa_unrecorded_alert_failed", { error: errField(alertErr) });
        }
      }
      throw e;
    }
  };
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

  // Compared as DIGITS on both sides. Meta delivers `from` as bare digits, and
  // the natural way to write this env var is the E.164 spelling with its "+" —
  // so a raw string compare matched nothing, including the tester the list was
  // written for: every message on the pilot line was persisted, skipped and
  // never answered, with one event per message to show for it. Exactly the
  // silent muzzle the note above exists to prevent.
  const digits = (s: string) => s.replace(/\D/g, "");
  const allow = ports.env.allowlist.split(",").map(digits).filter(Boolean);
  if (isEnvDefault && allow.length && !allow.includes(digits(from))) {
    // §4 delta (deliberate): allowlist gates the REPLY, not the persist.
    const ing = await recordOrSay();
    const sink = ports.persist.sink(db, tenantId, ing, rt, channel);
    await sink.allowlistSkip();
    await sink.processed();
    return;
  }

  // Persist first (P3/§4): the customer's message is never lost to a later
  // failure. Then the memory, which is the same rows the dashboard reads and
  // writes; a read that cannot be made comes back UNKNOWN and is handed to a
  // person below.
  const ing: IngestResult | null = await recordOrSay();
  // Bound once, and never rebound. The closures below hold this memory and
  // read it after awaits, which is only sound while the binding itself cannot
  // change under them.
  const thread: ThreadState = await ports.persist.thread(db, tenantId, ing);
  const ingestMs = Date.now() - t0;
  // This message's wires: WhatsApp on the tenant's credentials (the
  // environment's pair only for the environment's own number), or the
  // carrier that brought the text in. Bound here, where the credentials
  // are; the door refuses when the wire for this channel is missing.
  const wires: Wire = {
    whatsapp: ports.sender(ports.waCfg(rt, isEnvDefault)),
    ...(carrier ? { sms: (to: string, p: { body: string }) => carrier.send(to, p.body) } : {}),
  };
  const sink = ports.persist.sink(db, tenantId, ing, rt, channel, wires);
  // An address a customer gives in their own words is kept, the way YES OFFERS is read from their words: the message
  // that is an address and nothing else, or a few words with one address that is theirs (contracts addressInMessage).
  // Their words are the typed or tapped ones (kind), never a caption, a location or a card that happens to carry one.
  // Only where none is on file; the sink says nothing when it is taken (Part 0 of the campaigns-on-every-channel spec).
  if (ing && n.kind === "text") {
    const given = addressInMessage(n.body);
    if (given) await sink.noteEmail(given);
  }
  // One door out: the carrier shapes the words for its wire (the footer on
  // the first reply to a person), and the sink's door sends them -- re-reading
  // consent, the pause and the workspace's status the moment before.
  // Whether anything of ours has ever reached this person — which on a text
  // decides the rates/STOP/HELP footer the campaign filing promises on a first
  // reply. Postgres answers it outright, and the history could not: a voice
  // call note is an inbound row whose sender is "system", assembleHistory maps
  // that to an assistant turn, and a customer who phoned and then texted for
  // the first time had their first reply sent without the disclosure.
  const repliedBefore = thread.repliedBefore ?? thread.history.some((h) => h.role === "assistant");
  const firstReply = thread.replies.length === 0 && !repliedBefore;
  const wire = (text: string) => (carrier ? carrier.body(text, firstReply) : text);
  const send = (text: string, meta?: Record<string, Json>, purpose?: SendPurpose, kind?: "system") =>
    sink.deliver(from, wire(text), meta, purpose, kind);
  /**
   * The owner's handoff email. Every fact about the conversation other than
   * the words is fixed for this whole invocation, and it was retyped at each
   * of a dozen call sites -- which is how `channel` came to be known here and
   * stated at none of them, and how four of the reasons reached the subject
   * line as raw internal tokens.
   *
   * `pausedHours` is the honest one: only a branch that actually takes the
   * receptionist out of the thread passes it, because the email states the
   * pause, and an owner who believes in one that did not happen answers at
   * their leisure and is talked over by the bot's next reply.
   */
  const tell = (userText: string, botText: string, reason: string, pausedHours: number | null = null) =>
    ports.alertStaff(from, userText, botText, reason, {
      target: notifyTarget,
      channel,
      pausedHours,
      route: ing ? `inbox/th-${ing.conversation_id}` : "inbox",
      who: n.profileName ?? null,
      about: ing ? { type: "conversation", id: ing.conversation_id } : null,
    });

  // Atomic concurrent-redelivery gate. ingest_inbound's is_new claim IS the
  // dedupe, and it is stronger than the `seen` array the retired store kept (a
  // unique index two concurrent lambdas cannot both miss).
  // A missed auto-reply beats a double text, so processed-state is deliberately
  // not consulted.
  if (ing && !ing.is_new) {
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
  if (db && tenantId && ing?.contact_id) {
    try {
      personMode = await ports.leads.personReplyMode(db, tenantId, ing.contact_id);
      replyMode = effectiveReplyMode(posture, personMode);
    } catch (e) {
      L.warn("wa_person_mode_lookup_failed", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // The memory could not be read, and there is no second copy to ask. We do
  // not know whether a human has taken this thread over, what was already
  // said, or how many replies have gone out today — so every gate below would
  // be answering from an invented empty history. Hand to a human instead of
  // guessing; the customer's message is already persisted above.
  if (isThreadUnknown(thread)) {
    L.error("wa_state_unavailable");
    await Promise.all([
      sink.escalate(
        "state_unavailable",
        "The receptionist could not read this thread's history, so it did not reply. Please answer this one.",
      ),
      tell(
        n.body ?? `[${raw.type}]`,
        "(no reply sent — the receptionist could not read the thread state)",
        "state unavailable",
      ),
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
  //
  // Nothing is sent back — not even a confirmation. A tenant-authored opt-out
  // acknowledgement is a config item, and inventing copy in the salon's voice
  // is exactly what the brain profile exists to prevent.
  const consent = resolveConsent({
    optOutNow: n.optOut,
    optInNow: n.optIn,
    // Absence is not an answer. `consent` and `dnc` are optional on the ingest
    // result (packages/db ingest.ts) — "readers must treat absence as 'nothing
    // on record', never as a block" — and a row carrying neither read as
    // `false`, an affirmative "they are opted in".
    recorded: ing && (ing.consent !== undefined || ing.dnc !== undefined) ? isOptedOutContact(ing) : null,
  });
  const optedOut = consent.optedOut;

  if (optedOut) {
    const post: Promise<unknown>[] = [sink.processed()];
    if (n.optOut) {
      // Only on the opt-out message itself. upsertEscalation keeps ONE open
      // escalation per conversation, so a repeated STOP updates rather than
      // piles up — but a customer leaving is a business event the owner should
      // see once, not a log line.
      post.push(
        sink.escalate(
          "opt_out",
          "Customer asked to stop receiving messages. Automatic replies are off for this contact until they text START.",
        ),
        tell(n.body ?? `[${raw.type}]`, "(no reply sent — the customer opted out)", "opt-out"),
      );
    }
    await Promise.all(post);
    // `decided_by` matters after the fact: which of the two sources held them out.
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
      tell(
        n.body ?? `[${raw.type}]`,
        "(no reply sent — the carriers have not approved this line for texting yet)",
        "carriers",
      ),
      sink.processed(),
    ]);
    L.info("sms_held_for_carriers");
    return;
  }

  // Routing is on the NORMALIZED type, not the raw one. A quick-reply tap or a
  // list selection arrives as type "button"/"interactive" with the customer's
  // words in a different field; matching on raw.type sent every one of them down
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
      tell(n.body ?? `[${raw.type}]`, "(no reply sent — passed to a human)", n.kind),
      sink.processed(),
    ]);
    L.info("wa_escalate_readable_nontext", { kind: n.kind });
    return;
  }

  // WILL the receptionist look at this photo (features.vision, off by
  // default)? Decided from the message, the workspace and the mode in force —
  // no bytes needed — so the routing below can be decided here while the
  // download itself waits until the gates have agreed there will be a reply at
  // all. The fetch used to run on this line: an 8s metadata call, up to 25MB
  // with a 15s timeout, a storage upload and a base64 of the whole buffer,
  // paid in full and then thrown away by a workspace at its reply cap, over
  // its token budget, or paused for billing.
  const maySee =
    n.type === "media" &&
    !!n.media &&
    !!rt?.features?.vision &&
    isVisionMime(n.media.mime_type) &&
    !!brainCfg &&
    (replyMode === "auto" || replyMode === "veto") &&
    Date.now() > thread.pausedUntil;

  /**
   * Say the unreadable thing: a voice note, a sticker, a photo nobody may look
   * at — or one the receptionist meant to look at and could not fetch.
   * Acknowledge it where the mode in force allows, and hand the thread over.
   *
   * A closure because there are two ways in now: the routing decision above,
   * and a vision fetch that fails below the gates. While the fetch sat above
   * them the second case fell into the first by accident, through `!photo`;
   * once the fetch moved it needed saying out loud, because a photo that
   * cannot be read must not quietly become a question answered without it.
   *
   * Resolves to the moment the receptionist is out of the thread until, or 0
   * when it never spoke — the pause itself is written to Postgres by
   * sink.pause below, and a courtesy that did not reach the customer earns no
   * pause.
   */
  const sayUnreadable = async (pausedUntilNow: number): Promise<number> => {
    if (Date.now() <= pausedUntilNow) return 0;
    // The acknowledgement is the receptionist speaking, so it obeys the
    // same rule as every reply: only when the mode in force lets it speak.
    // A workspace on Ask, or a person set to Never, gets no canned text —
    // the message still escalates so a human sees it. No persona -> no ack.
    const mayAck = !!brainCfg && (replyMode === "auto" || replyMode === "veto");
    // WHETHER IT LANDED decides everything after it. The outcome used to be
    // discarded, so expired credentials or a refusal at the wire still paused
    // the thread for a day and still told the owner "(auto-acknowledged, bot
    // paused)": the customer had heard nothing, the receptionist was muted
    // until tomorrow, and the one person who could fix it had been told the
    // opposite. Every other send in this file branches on this.
    const acked = mayAck
      ? // A courtesy, not an answer: marked so it does not spend the daily cap.
        (await send(fallbacks!.non_text, { ack: true })).outcome === "sent"
      : false;
    const pausedUntil = acked ? Date.now() + pauseMs : 0;
    const why = acked
      ? "auto-acknowledged, bot paused"
      : mayAck
        ? "the acknowledgement could not be sent — the customer has heard nothing back"
        : !brainCfg
          ? "no auto-reply configured"
          : personMode
            ? `no acknowledgement — this person is set to '${replyMode}'`
            : `no acknowledgement — reply mode is '${replyMode}'`;
    await Promise.all([
      ...(pausedUntil ? [sink.pause(new Date(pausedUntil).toISOString())] : []),
      sink.escalate("non_text", `Customer sent a ${raw.type} message — ${why}.`),
      tell(`[${raw.type} message]`, `(${why})`, "non-text message", pausedUntil ? pauseHours : null),
    ]);
    L.info("wa_nontext", { acked, may_ack: mayAck, mode: replyMode, person_mode: personMode });
    return pausedUntil;
  };

  if (!maySee && (n.type !== "text" || !n.body)) {
    // sink.media() downloads the attachment from Meta and uploads it to
    // storage. That ran above the acknowledgement — so someone who sent a voice
    // note waited through two Graph round trips and a multi-megabyte upload, as
    // much as ~23s of pure timeout, before being told we had seen it. Nothing
    // in the ack depends on those bytes, so it joins the work at the end.
    const media = sink.media(n);
    await sayUnreadable(thread.pausedUntil);
    await Promise.all([media, sink.processed()]);
    return;
  }
  // Past the gate above, this is the customer's message as words — typed, or
  // the label of what they tapped. Everything downstream reads it from here so
  // no branch can reach back to raw.text and miss the tapped case.
  //
  // Named bodyText, not text: `text` is the HTTP helper imported at the top of
  // this file, and shadowing it here would make a later `return text(200, …)`
  // inside this function fail in a thoroughly confusing way.
  //
  // For a photo the receptionist looks at, the words on record are the
  // caption, or the fact of the photo; what the MODEL is told is built beside
  // the image, in vision.ts, and never lands in an alert or the memory.
  const bodyText: string = maySee ? n.media?.caption?.trim() || "[photo]" : (n.body ?? "");

  // Late, but somebody is still waiting.
  //
  // This used to stamp anything over ten minutes old as processed and return —
  // no reply, no escalation, nobody told. Meta redelivers undelivered webhooks
  // with backoff for days, so a fifteen-minute outage turned its entire
  // redelivery backlog into customers who wrote and were never answered, and
  // the only trace was one log line per message. The guard was written against
  // webhook REPLAYS, and replays are already stopped by the dedupe gate
  // above, so this only ever catches late FIRST deliveries.
  //
  // Two ages, because the right answer changes with the delay. Inside the
  // reply horizon the customer is still in the conversation they started, and
  // answering late beats not answering. Beyond it an automated reply would
  // arrive out of nowhere, so a person picks it up — but a person is told.
  const { ageMs, verdict: age } = ageVerdict(raw.timestamp ?? undefined);
  if (age === "stale") {
    await Promise.all([
      sink.escalate(
        "stale",
        `Message arrived ${Math.round(ageMs / 60000)} minutes late — too old to answer automatically.`,
      ),
      tell(n.body ?? `[${raw.type}]`, "(no reply sent — arrived too late to answer automatically)", "late message"),
      sink.processed(),
    ]);
    L.info("wa_stale_escalated", { age_ms: ageMs });
    return;
  }
  if (age === "late") L.info("wa_late_but_answering", { age_ms: ageMs });

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
    // Sent FIRST, and what happened is reported from the outcome. The send's
    // outcome used to be dropped on the floor — so a confirmation the wire
    // refused or could not deliver left nobody aware that the one message the
    // carriers refused this campaign three times for missing had not reached
    // the person who just said yes.
    // A system message, so a thread a person holds does not hold it back: the
    // yes is owed its confirmation whoever holds the thread.
    const confirmed = await send(words, { ack: true, confirmation: purpose }, purpose, "system");
    if (confirmed.outcome !== "sent") {
      // A yes nobody confirmed is the carriers' complaint, whether the wire
      // failed or the door refused. A refusal is NOT quietly logged here the
      // way it is on the reply path below: the reasons that can arrive at this
      // send are all ones a person has to act on, and `no_marketing_consent` is
      // the one to expect — the OFFERS answer is recorded best-effort a moment
      // earlier and the door fails closed without it, so a consent write that
      // did not land would otherwise leave a customer subscribed to nothing,
      // told nothing, with a log line as the only trace.
      const why = confirmed.outcome === "failed" ? `${confirmed.reason}, HTTP ${confirmed.status}` : confirmed.reason;
      await Promise.all([
        sink.escalate(
          "send_failed",
          `The customer said yes and their confirmation did not go out (${why}), so they have no record of what they signed up for, how often, or how to stop. Send it from the Inbox.`,
        ),
        tell(bodyText, `(the confirmation of their yes was not delivered — ${why})`, "opt-in not confirmed"),
      ]);
    }
    await sink.processed();
    L.info("wa_opt_in_confirmed", {
      purpose,
      channel,
      sent: confirmed.outcome === "sent",
      why: confirmed.outcome === "sent" ? null : confirmed.reason,
    });
    return;
  }

  const gate = threadVerdict(thread, maxRepliesDay);
  if (gate === "paused") {
    L.info("wa_skip_paused", { paused_until: thread.pausedUntil });
    await sink.processed();
    return;
  }
  if (gate === "ratecap") {
    L.info("wa_skip_ratecap", { cap: maxRepliesDay, used: thread.replies.length });
    // A customer who hits the cap was being abandoned to a console line: no
    // escalation, no alert, nothing on Today. `rate_cap` has been a declared,
    // CHECK-allowed, LABELLED escalation reason this whole time with no
    // emitter anywhere in the repo. At the shipped default of 20/day this
    // fires on a busy thread, not only when someone lowers the limit.
    await Promise.all([
      sink.escalate(
        "rate_cap",
        `Thread hit ${maxRepliesDay} automatic replies today — the receptionist stopped and is waiting for a human.`,
      ),
      tell(bodyText, "(no reply sent — daily automatic-reply limit reached)", "rate cap"),
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
    const used = await ports.budget.tokensLast24h(db, tenantId, tokenCap);
    if (used >= tokenCap) {
      L.info("wa_skip_budget", { cap: tokenCap, used });
      await Promise.all([
        sink.escalate(
          "budget",
          `The workspace used ${used.toLocaleString("en-US")} of its ${tokenCap.toLocaleString("en-US")} model tokens in the last 24 hours — the receptionist stopped and is waiting for a human.`,
        ),
        tell(bodyText, "(no reply sent — the day's model budget is used up)", "budget"),
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
    // Its own name. This logged `wa_skip_paused`, the same event the THREAD
    // pause above logs, so nothing reading the stream could tell a human
    // taking one conversation over from a workspace-wide billing stop.
    L.info("wa_skip_workspace_paused");
    await Promise.all([
      sink.escalate(
        "paused",
        "The workspace is paused because billing stopped, so the receptionist did not answer. Resume from Settings › Billing, or answer this one yourself.",
      ),
      tell(bodyText, "(no reply sent — the workspace is paused until billing resumes)", "paused"),
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
    // A hold the owner chose for THIS person is its own reason: it is not a
    // workspace setting, and the Inbox should say "you handle this person",
    // not "held by policy". It also alerts ONCE per open hold rather than
    // once per message — the owner asked to handle this person themselves,
    // and a thread already in their Inbox does not need a second email.
    const hold = holdCopy({
      brainCfg,
      personMode,
      replyMode,
      configBroken: !!rt?.configBroken,
      loadFailed: !!rt?.loadFailed,
    });
    const outcome = await sink.escalate(hold.reason, hold.details);
    const alertNeeded = !hold.personHold || outcome !== "refreshed";
    await Promise.all([...(alertNeeded ? [tell(bodyText, hold.botText, hold.why)] : []), sink.processed()]);
    L.info("wa_held_by_policy", {
      mode: replyMode,
      person_mode: personMode,
      persona: !!brainCfg,
      config_broken: !!rt?.configBroken,
      load_failed: !!rt?.loadFailed,
      escalation: outcome ?? "n/a",
      alerted: alertNeeded,
    });
    return;
  }

  // THE BYTES, now that everything above has agreed there will be a reply.
  // Every gate between here and the routing decision — the daily cap, the
  // token budget, the billing pause, the mode in force — discards whatever the
  // model would have been shown, so none of them should have paid for it.
  let photo: { mime: string; base64: string } | null = null;
  if (maySee) {
    const got = await sink.media(n);
    if (got && isVisionMime(got.mime) && got.bytes.byteLength <= VISION_MAX_BYTES) {
      photo = { mime: got.mime, base64: toBase64(got.bytes) };
      L.info("wa_photo_seen", { bytes: got.bytes.byteLength, mime: got.mime });
    } else {
      // Nothing to look at after all, and a caption is not an answer to a
      // picture nobody saw: the same handoff the routing above would have given
      // it, rather than a confident reply composed from the words alone.
      L.info("wa_photo_not_seen", { fetched: !!got, bytes: got?.bytes.byteLength ?? null, mime: got?.mime ?? null });
      await sayUnreadable(thread.pausedUntil);
      await sink.processed();
      return;
    }
  }

  let replyText: string;
  let escalate: boolean;
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
          leadNote = ports.leads.describe(lead, new Date(), rt?.timezone ?? "UTC");
          // Their appointments, from the same feed the openings come from:
          // "when is my appointment?" is answered from the calendar, never guessed.
          const visits = rt ? await ports.calendar.visits(rt, { phone: e164, name: lead.name }) : null;
          if (visits) leadNote = `${leadNote}\n${visits}`;
        } catch (e) {
          L.warn("lead_context_unavailable", { error: errField(e) });
        }
      }
      // What is open, from the calendar feed, when the workspace has one.
      // Cached for five minutes on the edge; a feed that cannot be read says
      // nothing. Read HERE, beside the visits above and the one line below that
      // consumes it — it used to be awaited at the top of the handler, so a
      // short code, an off-allowlist sender, a STOP, a thumbs-up, a duplicate
      // and a rate-capped message each paid an HTTP fetch and an ICS parse for
      // a value none of them ever reads, and the ingest write that must never
      // wait waited behind it.
      const openings = rt ? await ports.calendar.openings(rt) : null;
      const tBrain = Date.now();
      const r = await generateReply(
        thread.history,
        photo ? photoUserText(n.media?.caption) : bodyText,
        // Composed from the workspace's structured facts when it has them,
        // and its hand-written prompt when it does not. lib/call-start.ts
        // composes the SAME thing for the voice agent, which is the point:
        // two copies of the hours is how two channels start disagreeing
        // about when the business opens.
        resolveSystemPrompt(brainCfg, "whatsapp", rt?.timezone, new Date(), rt?.policy, rt?.known),
        fallbacks!.error,
        leadNote,
        // "Are you open?" it could already answer. "Are you open RIGHT NOW?"
        // it was answering too, from nothing — it had a table of hours and no
        // idea what day it was.
        `${describeNow(rt?.timezone, new Date(), brainCfg.profile?.closures)}${openings ? `\n\n${openings}` : ""}`,
        photo ?? undefined,
      );
      replyText = r.text;
      escalate = r.escalate;
      usage = r.usage;
      brainMeta = r.meta;
      brainMs = Date.now() - tBrain;
      if (r.reason) escalationReason = r.reason;
      // Layer-2 policy enforcement (Blueprint §6): prompt text is never the
      // only defense (steps.ts/layerTwo). A price in the draft blocks the send
      // outright; under "ask", a booking or a service/pricing question is a
      // person's to answer whatever the model made of the prompt.
      const two = layerTwo({
        replyText,
        escalate,
        escalationReason,
        brainCfg,
        policy: rt?.policy,
        intent: brainMeta?.intent ?? null,
        known: rt?.known,
      });
      if (two.priceBlocked) L.warn("policy_block_price");
      if (two.askClass)
        L.info("wa_policy_ask", { class: two.askClass, intent: brainMeta?.intent ?? null, complied: two.complied });
      replyText = two.replyText;
      escalate = two.escalate;
      escalationReason = two.escalationReason;
    } catch (e) {
      L.error("brain_failed", { error: errField(e) });
      replyText = fallbacks!.error;
      escalate = true;
      escalationReason = "brain_error";
    }
  } else {
    // No model key: the receptionist cannot answer. The workspace's own
    // greeting still goes, labelled a fallback, the thread is handed to a
    // person, and the platform is paged once per window (noModelPlan says
    // why). A canned greeting passed off as an answer would be the quiet
    // failure this replaces.
    fallback = noModelPlan(fallbacks!);
    replyText = fallback.replyText;
    escalate = fallback.escalate;
    escalationReason = fallback.escalationReason;
    L.error("wa_no_model");
    // Guarded, like every other external call on this path. pageOperator's own
    // Supabase reads are not wrapped, so a fetch-level failure threw straight
    // out of handleInbound: the workspace's greeting never went, nothing was
    // marked processed, no escalation opened, and the route logged one line and
    // answered 200 — so Meta never retried either. A PLATFORM notice must never
    // be what costs a customer their reply.
    if (db) {
      try {
        await ports.page({ db }, NO_MODEL_PAGE.key, NO_MODEL_PAGE.subject, NO_MODEL_PAGE.body);
      } catch (e) {
        L.error("wa_no_model_page_failed", { error: errField(e) });
      }
    }
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
  // A VETO WINDOW that cannot be scheduled falls back to sending immediately:
  // the owner chose to auto-send with a chance to undo, a late reply is a
  // worse outcome than an un-vetoed one, and the fallback is recorded below.
  // A LOW-CONFIDENCE HOLD that cannot be scheduled sends nothing: the owner
  // said a reply the model is not sure of does not send itself, and a
  // database that is having a bad minute is not permission. That branch is
  // a few lines below the fallback event.
  // replyLimits is the same row read above for the daily cap and the pause.
  // THE CONFIDENCE DIAL rides on the same window: under 'auto' a reply the
  // model is not sure enough about waits where a vetoed one would
  // (steps.ts/holdPlan; limits.min_confidence, 0 or absent is off).
  const plan = holdPlan(replyMode, replyLimits, brainMeta);
  const { delayMs, heldForConfidence } = plan;
  if (heldForConfidence)
    L.info("wa_held_low_confidence", { confidence: brainMeta?.confidence, min: plan.minConfidence, delay_ms: delayMs });
  const queued =
    delayMs > 0
      ? await ports.persist.queueReply(
          db,
          tenantId,
          ing,
          from,
          wire(replyText),
          delayMs,
          L,
          plan.source,
          brainMeta,
          channel,
        )
      : false;
  // The quality signal on this reply's usage event: how sure, how fast,
  // whether it waited, whether it handed off. The diagnostics read the day
  // back from these; a Reports tile can, later.
  const replyQuality = {
    intent: brainMeta?.intent ?? null,
    confidence: brainMeta?.confidence ?? null,
    language: brainMeta?.language ?? null,
    latency_ms: brainMs,
    // What the reply actually did. This read `delayMs > 0` alone, so a reply
    // whose hold could not be scheduled — sent to the customer immediately, a
    // few lines below — was recorded as having waited, and the diagnostics that
    // "read the day back from these" reported holds that never happened.
    held: queued ? (heldForConfidence ? "low_confidence" : "veto_window") : null,
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
    // Named, because the confidence dial rides this same window: an owner with
    // no veto window configured was shown `policy.veto_window_skipped` events
    // for one and sent looking for a setting they had never turned on.
    await sink.vetoFallback(delayMs, plan.source);
  }
  // THE HOLD THAT IS A POLICY. Under 'auto' with a confidence floor the owner
  // said: a reply the model is not sure of waits for a person. The hold could
  // not be written, so the words stay unsent, the thread is a person's for
  // the pause window, the owner is told what the customer said and why
  // nothing answered, and the message is marked handled so the redelivery
  // gate holds. An infrastructure failure never widens what the receptionist
  // may say on its own.
  if (delayMs > 0 && !queued && heldForConfidence) {
    const post: Promise<unknown>[] = [];
    if (usage) post.push(sink.usage({ ...usage, ...replyQuality, escalate: true }));
    post.push(sink.pause(new Date(Date.now() + pauseMs).toISOString()));
    post.push(
      sink.escalate(
        "policy_block",
        `the receptionist was not sure enough to answer on its own (confidence ${brainMeta?.confidence ?? "unknown"}, floor ${plan.minConfidence}) and the hold for a person could not be written, so nothing was sent — "${bodyText}"`,
      ),
    );
    post.push(
      tell(
        bodyText,
        replyText,
        "held for low confidence; the hold could not be scheduled, so nothing was sent",
        pauseHours,
      ),
    );
    await Promise.all(post);
    await sink.processed();
    L.warn("wa_hold_unscheduled_kept", { confidence: brainMeta?.confidence, min: plan.minConfidence });
    return;
  }
  if (queued) {
    const post: Promise<unknown>[] = [];
    if (usage) post.push(sink.usage({ ...usage, ...replyQuality }));
    if (escalate) {
      // An escalating draft still pauses and alerts — a human should be looking
      // at this one before the timer runs out, not after. The pause withdraws
      // the thread's older drafts; this one, the holding message, is kept.
      post.push(
        sink.pause(new Date(Date.now() + pauseMs).toISOString(), typeof queued === "string" ? queued : undefined),
      );
      post.push(
        sink.escalate(
          escalationReason,
          fallback
            ? fallback.escalationDetails(bodyText)
            : brainMeta?.reason
              ? `${brainMeta.reason} — "${bodyText}"`
              : bodyText,
        ),
      );
      post.push(tell(bodyText, replyText, "assistant flagged handoff (reply held for review)", pauseHours));
    }
    await Promise.all(post);
    await sink.processed();
    L.info("wa_reply_queued", { delay_ms: delayMs, escalate });
    return;
  }

  const sent = await send(
    replyText,
    fallback ? (fallback.meta as Record<string, Json>) : (brainMeta as unknown as Record<string, Json> | undefined),
  );
  const tSent = Date.now();
  if (sent.outcome === "sent") {
    // The door recorded the row; what is left is the usage and the handoff.
    const post: Promise<unknown>[] = [];
    if (usage) post.push(sink.usage({ ...usage, ...replyQuality }));
    if (escalate) {
      post.push(sink.pause(new Date(Date.now() + pauseMs).toISOString()));
      post.push(
        sink.escalate(
          escalationReason,
          fallback
            ? fallback.escalationDetails(bodyText)
            : brainMeta?.reason
              ? `${brainMeta.reason} — "${bodyText}"`
              : bodyText,
        ),
      );
      post.push(tell(bodyText, replyText, fallback ? fallback.alertReason : "assistant flagged handoff", pauseHours));
    }
    await Promise.all(post);
    await sink.processed();
  } else if (sent.outcome === "refused") {
    // The wire found what the gates above could not see a moment ago: the
    // person asked to stop, a human took the thread, the workspace paused.
    // Each of those already has its person; the message is kept and done.
    L.info("wa_refused_at_wire", { reason: sent.reason });
    await sink.processed();
  } else {
    // The customer got NO reply and Meta already has its 200 — this must be
    // loud, and the message must stay visibly unprocessed for reconciliation.
    // The door wrote the failed row and its event; the people are told here.
    await Promise.all([
      tell(bodyText, "(send failed — the customer received no reply)", "wa_send_failed"),
      sink.escalate(
        "send_failed",
        sent.reason === "wire_unreadable"
          ? "Auto-reply could not be sent: the thread could not be read at the wire. Customer got no answer."
          : `Auto-reply could not be delivered (HTTP ${sent.status}). Customer got no answer.`,
      ),
    ]);
  }
  L.info("wa_replied", {
    escalate,
    sent: sent.outcome === "sent",
    ingest_ms: ingestMs,
    post_ms: Date.now() - tSent,
  });
}
