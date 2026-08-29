/**
 * Chanlytics Messaging — WhatsApp Cloud API webhook (app: Chanlytics AI).
 * GET = Meta verification handshake. POST = signature-validated event receiver.
 *
 * Production engine: inbound message -> guardrailed Claude brain -> reply,
 * with per-thread dedupe, history, human-pause (coexistence echoes), rate caps,
 * staleness guard, and escalation alerts via Resend.
 *
 * Contract (frozen during Meta App Review): process-then-200 in-invocation
 * under maxDuration 60; Meta retries + dedupe make replays safe. The HTTP
 * surface is unchanged by Gate 1b — only where memory is read from moves.
 *
 * Postgres dual-write (PG_WRITES=on): additive, fail-safe, batched — the
 * PgSink no-ops when unconfigured so the frozen Blob/send order never depends
 * on PG. wa_replied logs carry ingest_ms/post_ms (blueprint latency budget).
 *
 * GATE 1b (PG_READS=on): Postgres becomes the SOURCE of the bot's memory —
 * history, pause, and rate cap all come from the same rows the dashboard reads
 * and writes, which retires the Blob mirror and the class of drift bugs that
 * came with it. Reversible by an env flip (no redeploy); Blob keeps being
 * written underneath, which is what makes the rollback safe. A Postgres read
 * failure falls back to Blob rather than giving the bot amnesia. PG_READS
 * implies PG dedupe: PG-sourced memory has no `seen` list, and ingest_inbound's
 * atomic is_new claim is a stronger gate than that array ever was.
 *
 * Env: WHATSAPP_VERIFY_TOKEN, META_APP_SECRET, WHATSAPP_ACCESS_TOKEN,
 *      WHATSAPP_PHONE_ID, WHATSAPP_TEST_ALLOWLIST (optional, comma list),
 *      ANTHROPIC_API_KEY, RESEND_API_KEY + LEAD_TO/LEAD_FROM,
 *      BLOB_READ_WRITE_TOKEN, PG_WRITES + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
 *      PG_READS (Gate 1b), PG_DEDUPE (optional, implied by PG_READS).
 */
import crypto from "node:crypto";
import { getThread, isThreadUnknown, saveThread, storeBackend, threadNamespace, type ThreadState } from "../lib/store.js";
import { json, text } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import {
  normalizeInbound,
  sendText as waSendText,
  fetchMediaBytes,
  type WaChangeValue,
  type WaRawMessage,
  type NormalizedInbound,
} from "../lib/workspace/channels.js";
import {
  resolveChannelDetailed,
  ingestInbound,
  markProcessed,
  recordOutbound,
  recordStatusByExternalId,
  recordEchoAndPause,
  pauseConversation,
  emitEvent,
  readThreadState,
  type IngestResult,
} from "../lib/workspace/db.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../lib/workspace/db.js";
import { upsertEscalation } from "../lib/workspace/jobs.js";
import { loadTenantRuntime, waCfgFor, type TenantRuntime } from "../lib/tenant-runtime.js";
import { replyPosture } from "../lib/reply-posture.js";
import { resolveConsent } from "../lib/consent.js";
import { logger, errField } from "../lib/log.js";
import { notify, type NotifyTarget } from "../lib/notify.js";
import { FALLBACK_BRAIN, FALLBACK_NOTIFICATIONS } from "../lib/tenant-fallback.js";
import type { BrainConfig, NotificationsConfig } from "../lib/workspace/contracts.js";
import type { RoutedChannel } from "../lib/workspace/db.js";
import { violatesNoPrices, isOptedOutContact } from "../lib/workspace/contracts.js";

export const config = { maxDuration: 60 };

const PAUSE_MS = 24 * 3600 * 1000;   // human echo pauses the bot for 24h
const MAX_REPLIES_PER_DAY = 20;      // per thread
const STALE_MS = 10 * 60 * 1000;     // ignore messages older than 10 min (webhook replays)

/** Gate 1b: read the bot's memory from Postgres instead of Blob. */
const PG_READS = process.env.PG_READS === "on";

/** Sentinel for "Postgres couldn't answer" — distinct from "empty thread", so
 *  a database blip falls back to Blob instead of giving the bot amnesia and
 *  re-greeting a customer mid-conversation. */
const PG_MISS: ThreadState = { history: [], seen: [], pausedUntil: -1, replies: [] };

/** Postgres-sourced thread state, or PG_MISS if it can't be produced. */
async function pgThread(
  db: ReturnType<typeof pg>,
  tenantId: string | null,
  ing: IngestResult | null,
): Promise<ThreadState> {
  if (!db || !tenantId || !ing) return PG_MISS;
  try {
    const s = await readThreadState(db, tenantId, ing.conversation_id, ing.paused_until);
    return { history: s.history, seen: s.seen, pausedUntil: s.pausedUntil, replies: s.replies };
  } catch (e) {
    console.error("pg_thread_read_failed", e instanceof Error ? e.message : e);
    return PG_MISS;
  }
}

// Credential resolution moved to tenant-runtime (waCfgFor) once a second send
// path needed it; this alias keeps the call sites below unchanged.
const waCfg = waCfgFor;

async function sendText(to: string, body: string, rt?: TenantRuntime | null): Promise<{ ok: boolean; wamid: string | null; status: number }> {
  const r = await waSendText(waCfg(rt), to, body);
  if (!r.ok) console.error("wa_send_failed", r.status, r.errorBody);
  else console.log("wa_sent", JSON.stringify({ to, wamid: r.wamid }));
  return { ok: r.ok, wamid: r.wamid, status: r.status };
}

/**
 * The customer's own words travel in this email, so it goes only to an address
 * we know belongs to THIS tenant. `notify` decides that; a workspace we cannot
 * address gets a redacted platform notice rather than someone else's mailbox.
 */
async function alertStaff(
  threadId: string,
  userText: string,
  botText: string,
  reason: string,
  target: NotifyTarget,
): Promise<void> {
  await notify(target, {
    subject: `WhatsApp handoff needed: +${threadId}`,
    body:
      `The WhatsApp assistant flagged a conversation for a human (${reason}).\n\n` +
      `Customer: +${threadId}\n` +
      `Their message: ${userText}\n` +
      `Bot's reply: ${botText}\n\n` +
      `Reply from the WhatsApp Business app — the bot is paused on this thread for 24h.`,
    redactedBody: `A WhatsApp conversation needed a human (${reason}), and nobody could be told.`,
  });
}

/**
 * Traffic arrived for a channel the control plane will not route. Customers are
 * texting a live number and nobody is answering, so this must reach a human —
 * but one email per inbound message would be its own outage, so it is throttled
 * per phone number id. The window is per lambda instance, which is imprecise in
 * the right direction: a burst across instances sends a few notes, not none.
 */
const UNROUTABLE_ALERT_MS = 15 * 60 * 1000;
const unroutableAlerted = new Map<string, number>();

async function alertUnroutable(phoneNumberId: string | undefined, count: number): Promise<void> {
  const key = phoneNumberId || "unknown";
  const last = unroutableAlerted.get(key) ?? 0;
  if (Date.now() - last < UNROUTABLE_ALERT_MS) return;
  // Genuinely platform-level: by definition there is no tenant to address, so
  // this is the PLATFORM's own mailbox and carries no customer content — only
  // the phone number id and a count.
  const delivered = await notify(
    { tenantId: null, notifications: null, isEnvDefault: true },
    {
      subject: "WhatsApp messages are arriving for a channel that is switched off",
      body:
        `${count} message(s) just arrived for phone_number_id ${key}, which the control plane will not route ` +
        `(the channel row is missing or its status is not 'active').\n\n` +
        `Nobody is answering these customers and nothing is being recorded. ` +
        `Re-enable the channel in tenant_channels, or confirm this number is not ours.\n\n` +
        `Further notices for this number are suppressed for 15 minutes.`,
    },
  );
  // The suppression window was claimed BEFORE the send, so a failed alert used
  // to buy 15 minutes of silence on the only warning that customers are being
  // dropped. Only a delivered notice earns the quiet.
  if (!delivered) unroutableAlerted.delete(key);
}

/** Additive PG ingest — never throws into the handling path. */
async function pgIngest(tenantId: string | null, n: NormalizedInbound): Promise<IngestResult | null> {
  const db = pg();
  if (!db || !tenantId) return null;
  try {
    return await ingestInbound(db, {
      tenantId,
      channel: "whatsapp",
      identityExternalId: n.waId,
      phoneE164: n.phoneDigits ? `+${n.phoneDigits.replace(/^\+/, "")}` : null,
      waProfileName: n.profileName,
      messageExternalId: n.messageId,
      type: n.type,
      body: n.body,
      channelTs: n.channelTsIso,
      media: n.media ? (n.media as unknown as Json) : null,
      meta: { raw_type: n.rawType } as Json,
      optOut: n.optOut,
      optIn: n.optIn,
    });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "ingest_pg_failed", tenant_id: tenantId, error: errField(e) }));
    return null;
  }
}

async function pgSafe(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`pg_${label}_failed`, e instanceof Error ? e.message : e);
  }
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "video/mp4": "mp4", "application/pdf": "pdf",
};

/** All PG bookkeeping for one inbound message; every method no-ops when unconfigured. */
function pgSink(db: SupabaseClient<Database> | null, tenantId: string | null, ing: IngestResult | null) {
  const on = !!(db && tenantId && ing);
  return {
    on,
    processed: () =>
      on ? pgSafe("processed", () => markProcessed(db!, tenantId!, ing!.message_id)) : Promise.resolve(),
    allowlistSkip: () =>
      on
        ? pgSafe("allowlist_evt", () =>
            emitEvent(db!, tenantId!, "ingest.allowlist_skip", "ingest", "message", ing!.message_id))
        : Promise.resolve(),
    pause: (iso: string) =>
      on ? pgSafe("pause", () => pauseConversation(db!, tenantId!, ing!.conversation_id, iso)) : Promise.resolve(),
    outbound: (body: string, wamid: string | null) =>
      on
        ? pgSafe("outbound", () =>
            recordOutbound(db!, {
              tenantId: tenantId!, conversationId: ing!.conversation_id, contactId: ing!.contact_id,
              sender: "ai", body, externalId: wamid,
            }))
        : Promise.resolve(),
    usage: (u: { input_tokens: number; output_tokens: number }) =>
      on
        ? pgSafe("usage", () =>
            emitEvent(db!, tenantId!, "usage.llm_tokens", "usage", "conversation", ing!.conversation_id,
              u as unknown as Json))
        : Promise.resolve(),
    sendFailed: (httpStatus: number) =>
      on
        ? pgSafe("send_failed_evt", () =>
            emitEvent(db!, tenantId!, "message.send_failed", "message", "message", ing!.message_id,
              { http_status: httpStatus } as Json))
        : Promise.resolve(),
    escalate: (reason: string, details: string) =>
      on
        ? pgSafe("escalation", () =>
            upsertEscalation(db!, tenantId!, ing!.conversation_id, reason, details.slice(0, 400)))
        : Promise.resolve(),
    media: (n: NormalizedInbound) =>
      on && n.media
        ? pgSafe("media_fetch", async () => {
            const got = await fetchMediaBytes(waCfg(), n.media!.provider_media_id);
            const mediaOut = { ...n.media } as Record<string, unknown>;
            if (got) {
              const ext = MIME_EXT[got.mime || ""] || "bin";
              const path = `${tenantId}/${ing!.conversation_id}/${ing!.message_id}.${ext}`;
              const { error } = await db!.storage.from("media").upload(path, got.bytes, {
                contentType: got.mime || "application/octet-stream",
                upsert: true,
              });
              if (error) throw new Error(error.message);
              mediaOut.fetch_state = "stored";
              mediaOut.storage_path = path;
              mediaOut.mime_type = got.mime;
            } else {
              mediaOut.fetch_state = "failed";
            }
            await db!.from("messages").update({ media: mediaOut as Json })
              .eq("id", ing!.message_id).eq("tenant_id", tenantId!);
          })
        : Promise.resolve(),
  };
}

async function handleInbound(
  m: WaRawMessage,
  value: WaChangeValue,
  tenantId: string | null,
  routed: RoutedChannel | null,
  isEnvDefault: boolean,
  routingFailed = false,
): Promise<void> {
  const from = m.from;
  const n = normalizeInbound(m, value);
  const db = pg();
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
  const rt = db && routed ? await loadTenantRuntime(db, routed) : null;
  // The posture rules live in ./reply-posture.ts, dependency-free and tested as
  // a truth table — they were four inline booleans, and one of them made
  // `status='disabled'` fail to silence the receptionist.
  const { drFallback, replyMode } = replyPosture({
    isEnvDefault,
    routingConsulted: !!db,
    routingFailed,
    channelResolved: !!routed,
    runtimeUsable: !!rt && !rt.loadFailed,
    policyMode: rt?.policy["reply"]?.mode,
  });
  const brainCfg: BrainConfig | null = rt?.brain ?? (drFallback ? FALLBACK_BRAIN : null);
  const notif: NotificationsConfig | null = rt?.notifications ?? (drFallback ? FALLBACK_NOTIFICATIONS : null);
  // One addressing decision per message, reused by every alert below.
  const notifyTarget: NotifyTarget = { tenantId, notifications: notif, isEnvDefault };
  const replyLimits = rt?.policy["reply"]?.limits ?? {};
  const maxRepliesDay = replyLimits.max_replies_day ?? MAX_REPLIES_PER_DAY;
  const pauseMs = (replyLimits.pause_hours ? replyLimits.pause_hours * 3600 * 1000 : PAUSE_MS);

  const allow = (process.env.WHATSAPP_TEST_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length && !allow.includes(from)) {
    // §4 delta (deliberate): allowlist gates the REPLY, not the persist.
    const ing = await pgIngest(tenantId, n);
    const sink = pgSink(db, tenantId, ing);
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
  if (PG_READS) {
    ing = await pgIngest(tenantId, n);
    thread = await pgThread(db, tenantId, ing);
    memory = thread === PG_MISS ? "blob" : "pg";
    if (memory === "blob") thread = await getThread(ns, from);
  } else {
    // The Blob read is side-effect-free, so it runs alongside the write.
    [ing, thread] = (await Promise.all([pgIngest(tenantId, n), getThread(ns, from)])) as
      [IngestResult | null, ThreadState];
  }
  const ingestMs = Date.now() - t0;
  const sink = pgSink(db, tenantId, ing);

  // Atomic concurrent-redelivery gate. PG_READS implies it: Postgres-sourced
  // memory carries no `seen` list, so is_new IS the dedupe — and it is stronger
  // than the array was (a unique index two concurrent lambdas cannot both miss).
  // A missed auto-reply beats a double text, so processed-state is deliberately
  // not consulted.
  if ((process.env.PG_DEDUPE === "on" || memory === "pg") && ing && !ing.is_new) {
    L.info("wa_skip_pg_dupe");
    return;
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
      alertStaff(from, n.body ?? `[${m.type}]`, "(no reply sent — the receptionist could not read the thread state)", "state unavailable", notifyTarget),
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
    await saveThread(ns, from, thread);
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
        alertStaff(from, n.body ?? `[${m.type}]`, "(no reply sent — the customer opted out)", "opt-out", notifyTarget),
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

  // Routing is on the NORMALIZED type, not the raw one. A quick-reply tap or a
  // list selection arrives as type "button"/"interactive" with the customer's
  // words in a different field; matching on m.type sent every one of them down
  // the "I can't read that" path. normalizeInbound resolves what they chose.
  if (n.type !== "text" || !n.body) {
    // genuinely unreadable (voice note, image, sticker): hand to a human
    await sink.media(n);
    if (Date.now() > thread.pausedUntil) {
      // No persona configured -> no ack goes out (and nothing to pause); the
      // message still escalates so a human sees it.
      if (brainCfg) {
        await sendText(from, brainCfg.fallbacks.non_text, rt);
        thread.pausedUntil = Date.now() + pauseMs;
        await saveThread(ns, from, thread);
      }
      await Promise.all([
        ...(brainCfg ? [sink.pause(new Date(Date.now() + pauseMs).toISOString())] : []),
        sink.escalate("non_text", `Customer sent a ${m.type} message — ${brainCfg ? "auto-acknowledged, bot paused" : "no auto-reply configured"}.`),
        alertStaff(from, `[${m.type} message]`, brainCfg ? "(auto-acknowledged, bot paused)" : "(no auto-reply configured)", "non-text message", notifyTarget),
      ]);
    }
    await sink.processed();
    return;
  }
  // Past the gate above, this is the customer's message as words — typed, or
  // the label of what they tapped. Everything downstream reads it from here so
  // no branch can reach back to m.text and miss the tapped case.
  const text = n.body;

  if (m.timestamp && Date.now() - Number(m.timestamp) * 1000 > STALE_MS) {
    L.info("wa_skip_stale");
    await sink.processed();
    return;
  }

  if (thread.seen.includes(m.id)) { L.info("wa_skip_dupe"); return; }
  thread.seen.push(m.id);

  if (Date.now() < thread.pausedUntil) {
    thread.history.push({ role: "user", content: text });
    await saveThread(ns, from, thread);
    L.info("wa_skip_paused", { paused_until: thread.pausedUntil });
    await sink.processed();
    return;
  }
  if (thread.replies.length >= maxRepliesDay) {
    await saveThread(ns, from, thread);
    L.info("wa_skip_ratecap", { cap: maxRepliesDay, used: thread.replies.length });
    // A customer who hits the cap was being abandoned to a console line: no
    // escalation, no alert, nothing on Today. `rate_cap` has been a declared,
    // CHECK-allowed, LABELLED escalation reason this whole time with no
    // emitter anywhere in the repo. At the shipped default of 20/day this
    // fires on a busy thread, not only when someone lowers the limit.
    await Promise.all([
      sink.escalate("rate_cap", `Thread hit ${maxRepliesDay} automatic replies today — the receptionist stopped and is waiting for a human.`),
      alertStaff(from, text, "(no reply sent — daily automatic-reply limit reached)", "rate cap", notifyTarget),
      sink.processed(),
    ]);
    return;
  }

  // E3: the reply policy is consulted BEFORE generation. 'ask' is the timid
  // mode — everything escalates, a human answers; a tenant with no persona
  // behaves identically. The customer's message is already persisted above.
  if (!brainCfg || replyMode !== "auto") {
    await saveThread(ns, from, thread);
    await Promise.all([
      sink.escalate(
        "policy_block",
        brainCfg
          ? `Reply mode is '${replyMode}' — the receptionist holds everything for a human.`
          : rt?.configBroken
            // A saved-but-unparseable config is a MISTAKE, not an absence, and
            // sending the operator to "fill one in" when a good persona is
            // already there behind one bad field sends them to the wrong place.
            ? "This workspace's settings could not be read, so the receptionist stayed silent. The saved configuration has an invalid field."
            : "No brain profile configured — the receptionist stays silent until Settings fills one in.",
      ),
      alertStaff(
        from,
        text,
        "(held — no auto-reply for this workspace)",
        brainCfg ? `reply mode ${replyMode}` : rt?.configBroken ? "settings could not be read" : "no persona configured",
        notifyTarget,
      ),
      sink.processed(),
    ]);
    L.info("wa_held_by_policy", { mode: replyMode, persona: !!brainCfg, config_broken: !!rt?.configBroken });
    return;
  }

  let replyText: string;
  let escalate = false;
  let escalationReason = "human_token";
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { generateReply } = await import("../lib/brain.js");
      const r = await generateReply(thread.history, text, brainCfg.system_prompt, brainCfg.fallbacks.error);
      replyText = r.text; escalate = r.escalate; usage = r.usage;
      if (r.reason) escalationReason = r.reason;
      // Layer-2 policy enforcement (Blueprint §6): prompt text is never the
      // only defense. A price in the draft blocks the send outright.
      if (violatesNoPrices(replyText)) {
        L.warn("policy_block_price");
        replyText = `Great question! Pricing is quoted at your consult — a member of our team will follow up here shortly. For anything urgent, call ${brainCfg.phone_display}.`;
        escalate = true;
        escalationReason = "policy_block";
      }
    } catch (e) {
      L.error("brain_failed", { error: errField(e) });
      replyText = brainCfg.fallbacks.error;
      escalate = true;
      escalationReason = "brain_error";
    }
  } else {
    replyText = brainCfg.fallbacks.greeting;
  }

  const sent = await sendText(from, replyText, rt);
  const tSent = Date.now();
  if (sent.ok) {
    thread.history.push({ role: "user", content: text });
    thread.history.push({ role: "assistant", content: replyText });
    thread.replies.push(Date.now());
    const post: Promise<unknown>[] = [sink.outbound(replyText, sent.wamid)];
    if (usage) post.push(sink.usage(usage));
    if (escalate) {
      thread.pausedUntil = Date.now() + pauseMs;
      post.push(sink.pause(new Date(Date.now() + pauseMs).toISOString()));
      post.push(sink.escalate(escalationReason, text));
      post.push(alertStaff(from, text, replyText, "assistant flagged handoff", notifyTarget));
    }
    await Promise.all(post);
    await saveThread(ns, from, thread);
    await sink.processed();
  } else {
    // The customer got NO reply and Meta already has its 200 — this must be
    // loud, and the message must stay visibly unprocessed for reconciliation.
    await saveThread(ns, from, thread);
    await Promise.all([
      alertStaff(from, text, "(send failed — the customer received no reply)", "wa_send_failed", notifyTarget),
      sink.sendFailed(sent.status),
      sink.escalate("send_failed", `Auto-reply could not be delivered (HTTP ${sent.status}). Customer got no answer.`),
    ]);
  }
  L.info("wa_replied", {
    escalate, sent: sent.ok, store: storeBackend(), memory,
    ingest_ms: ingestMs, post_ms: Date.now() - tSent,
  });
}

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return text(200, q.get("hub.challenge") || "");
  }
  return text(403, "verification failed");
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();

  // fail-closed: a missing secret is a config error, never a verification skip
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error("wa_missing_app_secret");
    return json(401, { ok: false, error: "bad_signature" });
  }
  const sig = String(request.headers.get("x-hub-signature-256") || "");
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return json(401, { ok: false, error: "bad_signature" });
  }

  interface WebhookBody {
    entry?: Array<{ changes?: Array<{ field?: string; value?: WaChangeValue }> }>;
  }
  let body: WebhookBody = {};
  try { body = JSON.parse(raw) as WebhookBody; } catch { /* ack anyway */ }

  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const v = change.value || {};
        const field = change.field;
        // Multi-tenant routing key (Blueprint §3): phone_number_id -> tenant.
        let tenantId: string | null = null;
        let routedChannel: RoutedChannel | null = null;
        let unroutable = false;
        let routingFailed = false;
        const db = pg();
        const phoneNumberId = v.metadata?.phone_number_id;
        const isEnvDefault = !!phoneNumberId && phoneNumberId === (process.env.WHATSAPP_PHONE_ID || "");
        if (db && phoneNumberId) {
          const { channel: routed, lookupFailed } = await resolveChannelDetailed(db, "whatsapp", phoneNumberId);
          if (routed) { tenantId = routed.tenantId; routedChannel = routed; }
          else if (lookupFailed) {
            // The database did not answer. That is an infra blip, not a
            // decision — the designated tenant rides it out on its baked
            // profile rather than going silent mid-conversation.
            routingFailed = true;
            console.error("wa_routing_lookup_failed", phoneNumberId);
          } else {
            // The database ANSWERED and this channel is not active — disabled,
            // deleted, or never ours. That is a deliberate state, so we neither
            // reply nor persist. A log line disappears; a metric built on
            // messages_in would undercount this traffic invisibly and forever.
            unroutable = true;
            console.error("wa_unroutable", phoneNumberId);
            await emitEvent(
              db, "00000000-0000-0000-0000-000000000000", "ingest.unroutable", "ingest", null, null,
              { channel: "whatsapp", phone_number_id: phoneNumberId } as Json,
            ).catch(() => {});
          }
        }
        if (field === "messages" && v.messages && unroutable) {
          // Customers are texting a line whose channel is switched off. Nobody
          // is answering them and nothing is being recorded, so this has to
          // reach a human — throttled, because the alternative is one email per
          // inbound message for as long as the channel stays off.
          console.error("wa_skip_unroutable", JSON.stringify({
            phone_number_id: phoneNumberId, messages: v.messages.length,
          }));
          await alertUnroutable(phoneNumberId, v.messages.length);
        } else if (field === "messages" && v.messages) {
          for (const m of v.messages) {
            console.log("wa_inbound", JSON.stringify({ from: m.from, type: m.type, id: m.id, text: m.text?.body ?? null }));
            // Per MESSAGE, not per batch. Any throw used to unwind to the one
            // outer catch below, which returns 200 — so a single failure meant
            // Meta never retried AND every remaining message in the batch was
            // never handled at all. The message itself is already persisted by
            // then, so it stays visible for reconciliation.
            try {
              await handleInbound(m, v, tenantId, routedChannel, isEnvDefault, routingFailed);
            } catch (e) {
              console.error("wa_inbound_failed", m.id, e instanceof Error ? e.message : e);
            }
          }
        } else if (field === "messages" && v.statuses) {
          await Promise.all((v.statuses ?? []).map(async (s) => {
            console.log("wa_status", JSON.stringify({ id: s.id, status: s.status, to: s.recipient_id, errors: s.errors }));
            if (db && tenantId && s.id && s.status && ["sent", "delivered", "read", "failed"].includes(s.status)) {
              await pgSafe("status", () =>
                recordStatusByExternalId(db, tenantId!, s.id!, s.status as "sent" | "delivered" | "read" | "failed",
                  s.errors ? ({ errors: s.errors } as unknown as Json) : undefined));
            }
          }));
        } else if (field === "smb_message_echoes") {
          // The owner (or staff) replied from the WhatsApp Business app -> pause the bot on that thread
          try {
            for (const echo of v.message_echoes || []) {
              const to = echo.to;
              if (to) {
                // Same isolation rule: the echo belongs to the tenant whose
                // channel it arrived on, not to a global phone-number bucket.
                const echoNs = threadNamespace(tenantId);
                const t = await getThread(echoNs, to);
                t.pausedUntil = Date.now() + PAUSE_MS;
                // A refused save means the Blob pause did NOT land, so the bot
                // could answer over the human who just replied. Postgres below
                // still records it, which under PG_READS=on is the source of
                // truth — but this must not pass silently.
                if (!(await saveThread(echoNs, to, t))) console.error("echo_pause_not_persisted", to);
                if (db && tenantId) {
                  await pgSafe("echo", () =>
                    recordEchoAndPause(db, {
                      tenantId, customerPhoneDigits: to,
                      body: echo.text?.body ?? null, externalId: echo.id ?? null,
                      pausedUntilIso: new Date(Date.now() + PAUSE_MS).toISOString(),
                    }));
                }
                console.log("wa_paused_by_echo", to);
              }
            }
          } catch (e) { console.error("echo_handling_error", e instanceof Error ? e.message : e); }
        } else if (field === "history") {
          console.log("wa_history_sync_batch");
        } else {
          console.log("wa_event", field);
        }
      }
    }
  } catch (e) {
    console.error("wa_webhook_error", e instanceof Error ? e.message : e);
  }
  return json(200, { ok: true });
}
