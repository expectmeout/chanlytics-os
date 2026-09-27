/**
 * Retell call webhook — call_started / transcript_updated / call_ended /
 * call_analyzed.
 *
 * Every event carrying a call is ingested (ingest_call is forward-only: an
 * event older than the row is a no-op it reports as `skipped`). The recording
 * copy and the summary email wait for the end of the call.
 * transcript_updated is opt-in on the agent; when it is on, each turn
 * refreshes the row's transcript and heartbeat, which is what makes a live
 * transcript possible on the dashboard.
 *
 * Every stage writes the canonical `calls` row (idempotent on
 * retell_call_id, so started -> ended -> analyzed enrich ONE row), lands the
 * call on the caller's cross-channel thread as one `call_summary` message —
 * which is how the WhatsApp receptionist knows they phoned — and copies the
 * recording into private Storage.
 *
 * Routing: agent_id -> tenant_channels(kind='voice'). One Retell account hosts
 * many agents (432 calls across 8 in the live account) — an unrouted call is
 * dead-lettered, never guessed into a tenant. A routing read the database
 * could not make is a 503, never a dead letter: nothing is written, and the
 * provider redelivers.
 *
 * THIS FILE IS THE WIRE, NOT THE JUDGEMENT. It proves the signature, reads
 * the delivery into the shape the row keeps, refuses a call that belongs to
 * an erasure, routes the agent to its workspace and runs the ingest. What
 * the delivery then does -- the note, the hold, the callback, the guardrail,
 * the claim, the copy -- is decided by planCallEvent (lib/voice/call-event.ts)
 * over the ingest's answer, and applied here step by step in the order it
 * lists them. The same split the texting door and the inbound-call door use.
 */
import { notify } from "../lib/ops/notify.js";
import type { NotifyMessage } from "../lib/ops/notify.js";
import { loadTenantNotifications, loadTenantRuntime } from "../lib/tenant-runtime.js";
import { json } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import {
  normalizeCall,
  parseTranscriptText,
  updateLiveCall,
  type NormalizedCall,
  type RetellCall,
} from "../lib/packages/channels.js";
import {
  pauseConversation,
  resolveChannelDetailed,
  ingestCall,
  recordCallNote,
  linkCallMessage,
  claimCallNotification,
  emitEvent,
  claimControl,
  releaseControl,
  CALL_CONTROL_S,
} from "../lib/packages/db.js";
import { copyRecording, WEBHOOK_COPY_TIMEOUT_MS } from "../lib/voice/call-recording.js";
import { markForwardingVerified } from "../lib/voice/forwarding.js";
import { tellPhonesCallStarted } from "../lib/voice/call-activity.js";
import { apns, apnsKeys } from "../lib/ops/apns.js";
import { erasedBeforeCall } from "../lib/erased.js";
import { upsertEscalation } from "../lib/packages/jobs.js";
import { frameGuardrail, offersBookingLink, MIN_MS, HOUR_MS } from "../lib/packages/contracts.js";
import type { ChannelLookup, RoutedChannel } from "../lib/packages/db.js";
import { env } from "../lib/env.js";
import { retellSigned } from "../lib/voice/voice-door-auth.js";
import { logger, errField } from "../lib/log.js";
import { planCallEvent, callNotice } from "../lib/voice/call-event.js";
import type { CallAbout, CallEventPlan, CallStep } from "../lib/voice/call-event.js";

const L = logger();

type Db = NonNullable<ReturnType<typeof pg>>;

const PLATFORM_TENANT = "00000000-0000-0000-0000-000000000000";

/**
 * Calls this instance has already corrected, so a receptionist is told once
 * rather than on every remaining turn.
 *
 * Per lambda instance, and imprecise in the right direction, exactly as the
 * unroutable alert's window is: a call whose turns land on two instances is
 * corrected twice, never never. The durable half needs no memory at all —
 * `upsertEscalation` keeps one open escalation per conversation, so a repeat
 * refreshes what the owner reads instead of stacking.
 */
const corrected = new Set<string>();

/**
 * When a refused delivery last left an evidence row, per instance. The row is
 * the readback /api/diag offers for "is the signature working"; the throttle is
 * because the door is public and the insert is now awaited.
 */
const REFUSED_AUTH_ROW_MS = MIN_MS;
let lastRefusedAuthRow = 0;
/** A long-lived instance must not accumulate call ids for ever. */
const CORRECTED_MAX = 500;

/**
 * Which credential a delivery passed, as a row.
 *
 * The log line beside the check lives in Vercel's logs, which nothing here
 * can read back — and the `?key=` fallback retires on exactly this evidence:
 * a real delivery whose signature verified against the key this deployment
 * holds. Platform-scoped, no call content, best-effort; /api/diag lists the
 * last few.
 */
async function recordWebhookAuth(
  sig: boolean,
  key: boolean,
  forms: { raw: boolean; restringified: boolean },
): Promise<void> {
  try {
    const db = pg();
    if (!db) return;
    await emitEvent(db, PLATFORM_TENANT, "webhook.auth", "ingest", null, null, {
      provider: "retell",
      sig,
      key,
      sig_raw: forms.raw,
      sig_restringified: forms.restringified,
    });
  } catch (e) {
    L.error("webhook_auth_event_failed", { error: errField(e) });
  }
}

/**
 * The knock: may this delivery come in.
 *
 * THE KEY. Retell signs with the API key that carries the webhook badge in
 * its dashboard, and only that one: "Only the API key that has a webhook
 * badge next to it can be used to verify the webhook." The key the edge
 * CALLS Retell with need not be that key, and in production it was not:
 * 127 deliveries on 2026-09-05 verified in neither form while the ?key=
 * opened every one (events, kind webhook.auth). RETELL_WEBHOOK_KEY holds
 * the badged key for verification alone; empty, the API key is tried, as
 * before, so nothing moves until it is set.
 *
 * Two forms of the body are tried, because the provider's own example
 * verifies `JSON.stringify(req.body)` — the parsed body re-serialised — not
 * the raw bytes. The two differ whenever an encoder escapes non-ASCII (the
 * greeting carries an em dash on every delivery), so a signature made over
 * one form fails over the other with the RIGHT key. Which one verified is
 * recorded, so the key question settles itself on the next delivery instead
 * of on a guess.
 *
 * The signature is the only credential. The `?key=` that once opened this
 * door beside it was a secret in Retell's dashboard and in access logs, and
 * anyone holding it could forge a call_analyzed — a fabricated transcript
 * emailed to the owner and a poisoned note in a customer's bot memory. It
 * was retired once a real delivery verified against RETELL_WEBHOOK_KEY (the
 * badged key) and the agents were converged onto a URL with no query
 * string; a key that still rides on an old URL is ignored, never read. The
 * auth row keeps its `key` field, always false now, for the diagnostic's
 * shape.
 */
async function admitted(raw: string, signature: string | null): Promise<boolean> {
  if (!env.RETELL_WEBHOOK_KEY) {
    // Named, every delivery, so the one configuration step that stands between
    // this door and a real signature is not a thing someone has to already
    // know. The API key is tried underneath, as before.
    L.warn("retell_webhook_key_unset", { trying: "RETELL_API_KEY", fix: "set RETELL_WEBHOOK_KEY to the badged key" });
  }
  // The check itself is voice-door-auth.ts's `retellSigned`, which the other three voice doors use too.
  const { ok: sigOk, raw: sigRaw, restringified: sigRestringified } = retellSigned(raw, signature);
  L.info("retell_webhook_auth", { sig: sigOk });
  // AWAITED, not fired and forgotten. A serverless invocation is frozen when it
  // answers and nothing in this app registers a waitUntil, so an un-awaited
  // insert only lands if another delivery happens to thaw the instance in
  // time. On the 401 there is nothing after it at all, which is how the
  // rejected deliveries — the ones that would say "Retell cannot get in" —
  // left no evidence whatsoever. It is one insert, and it never throws.
  //
  // A REFUSED delivery is recorded at most once a minute per instance. This is
  // a public URL, and awaiting the insert on the way to a 401 turned "usually
  // no row, because the freeze ate it" into "a row for every POST anyone
  // sends" — an unauthenticated write amplifier that would also bury the
  // evidence under itself. Once a minute is enough to answer the only question
  // the row is for ("is Retell being turned away?") and cannot be driven.
  const refused = !sigOk;
  if (!refused || Date.now() - lastRefusedAuthRow >= REFUSED_AUTH_ROW_MS) {
    if (refused) lastRefusedAuthRow = Date.now();
    await recordWebhookAuth(sigOk, false, { raw: sigRaw, restringified: sigRestringified });
  }
  return sigOk;
}

/** A delivery with a call in it, read into the shape the row keeps. */
interface Delivery {
  event: string | undefined;
  call: RetellCall;
  bodyKeys: string[];
  callKeys: string[];
}

/**
 * The body, read: null when it is not JSON or carries no call, which the
 * door acknowledges and forgets.
 *
 * A transcript update is proof the call is IN PROGRESS. The per-turn payload
 * is not guaranteed to carry call_status, and an absent status normalises to
 * "ended" — which would mark a live call ended on its first turn or,
 * forward-only, make every later turn a no-op.
 *
 * Where the live transcript actually rides. The documentation puts the
 * per-turn fields "in the payload"; the first real calls proved they are NOT
 * inside `call` on transcript_updated — every turn arrived with none of
 * transcript / transcript_object / transcript_with_tool_calls there, while
 * call_ended carried all three — so the row never held a word until the call
 * was over. Read them from either place; fall back to the spoken text; and
 * keep the KEY NAMES (never the words) so the next delivery says which.
 */
function readDelivery(raw: string): Delivery | null {
  let body: { event?: string; call?: RetellCall };
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  const { event, call } = body;
  L.info("retell_event", { retell_event: event, call_id: call?.call_id ?? null });
  if (!call?.call_id) return null;
  if (event === "transcript_updated" && !call.call_status) call.call_status = "ongoing";
  const top = body as unknown as Record<string, unknown>;
  const bodyKeys = Object.keys(top).filter((k) => k !== "call");
  const callKeys = Object.keys(call as unknown as Record<string, unknown>);
  if (event === "transcript_updated") {
    if (!call.transcript_with_tool_calls && Array.isArray(top.transcript_with_tool_calls)) {
      call.transcript_with_tool_calls = top.transcript_with_tool_calls as RetellCall["transcript_with_tool_calls"];
    }
    if (!call.transcript_object && Array.isArray(top.transcript_object)) {
      call.transcript_object = top.transcript_object as RetellCall["transcript_object"];
    }
    if (!call.transcript && typeof top.transcript === "string") call.transcript = top.transcript;
    if (!call.transcript_object && !call.transcript_with_tool_calls && call.transcript) {
      call.transcript_object = parseTranscriptText(call.transcript) ?? undefined;
    }
  }
  return { event, call, bodyKeys, callKeys };
}

/**
 * A call that began before its caller asked to be erased belongs to the
 * erasure: its events must not make the person again with the call's data,
 * nor mail the owner about them. A call begun after the request is the
 * person calling back, and is theirs to make. A check that cannot be MADE
 * sends the delivery back rather than proceeding. The answer is the
 * response that ends the delivery, or null when it may go on.
 */
async function erasureRefusal(
  db: Db,
  n: NormalizedCall,
  routed: RoutedChannel | null,
  event: string | undefined,
): Promise<Response | null> {
  if (!routed || !n.fromE164 || !n.startedAtIso) return null;
  // A read that FAILED is not "nobody asked to be forgotten". The comment
  // above once promised a late sweep to catch what this let through; there
  // is no such sweep, so the promise was the only thing standing between a
  // failed read and an erased person remade from a call's data. 503 instead:
  // the provider redelivers, and a blip costs a retry rather than a person.
  let erased: boolean;
  try {
    erased = await erasedBeforeCall(db, routed.tenantId, n.fromE164, n.startedAtIso);
  } catch (e) {
    L.error("retell_call_erasure_unreadable", {
      call: n.retellCallId,
      tenant: routed.tenantId,
      error: errField(e),
    });
    return json(503, { ok: false, error: "erasure_unreadable" });
  }
  if (erased) {
    L.info("retell_call_skipped_erased", {
      call: n.retellCallId,
      tenant: routed.tenantId,
      retell_event: event,
    });
    return json(200, { ok: true, skipped: "erased" });
  }
  return null;
}

/**
 * Whose call a delivery is: by the agent it names, or -- for one that names
 * no agent -- through the call it belongs to.
 *
 * The canonical row was only ever written when the payload carried
 * agent_id. The provider documents call_started as "basic information" and
 * transcript_updated as "also includes transcript_with_tool_calls" — neither
 * promises the agent id on every event — and a per-turn delivery without it
 * used to be dropped before ingest, silently, leaving a live transcript
 * frozen on the dashboard while the provider streamed turns.
 *
 * A read that FAILED is a lookup that failed, never "no such call": the two
 * earn different answers at the door, and this read once dropped its error
 * on the floor.
 */
async function routeDelivery(db: Db, n: { agentId: string | null; retellCallId: string }): Promise<ChannelLookup> {
  if (n.agentId) return resolveChannelDetailed(db, "voice", n.agentId);
  const { data, error } = await db
    .from("calls")
    .select("agent_id")
    .eq("retell_call_id", n.retellCallId)
    .limit(1)
    .maybeSingle();
  if (error) {
    // The REASON rides the log: an RLS or grant regression on `calls` must
    // read differently from a network blip, and the door's refusal names
    // the call, not the cause.
    L.error("retell_call_row_unreadable", { call_id: n.retellCallId, error: error.message });
    return { channel: null, lookupFailed: true };
  }
  const agentId = (data as { agent_id?: string | null } | null)?.agent_id ?? null;
  return agentId ? resolveChannelDetailed(db, "voice", agentId) : { channel: null, lookupFailed: false };
}

/**
 * The call on the phones' Lock Screens (00191, lib/voice/call-activity.ts): once, as it starts, to every phone that
 * handed the site its push-to-start token. Best effort beside the call's own door.
 */
async function tellPhones(db: Db, tenantId: string, s: Extract<CallStep, { kind: "call_activity" }>): Promise<void> {
  const keys = apnsKeys();
  if (!keys) return;
  const outcome = await tellPhonesCallStarted(db, tenantId, s.call, apns(keys)).catch((e: unknown) => {
    L.error("call_activity_failed", { call: s.retellCallId, error: errField(e) });
    return null;
  });
  if (outcome) {
    L.info("call_activity_started", {
      call: s.retellCallId,
      started: outcome.started,
      refused: outcome.refused.length,
    });
    for (const r of outcome.refused) L.warn("call_activity_refused", { call: s.retellCallId, error: r.error });
  }
}

/** A call nobody's agent owns: dead-lettered under the platform, never guessed into a tenant. */
async function deadLetter(db: Db, n: NormalizedCall): Promise<void> {
  L.error("retell_unroutable_agent", { agent_id: n.agentId });
  await emitEvent(db, PLATFORM_TENANT, "ingest.unroutable", "ingest", null, null, {
    channel: "voice",
    agent_id: n.agentId,
  }).catch(() => {});
}

/**
 * What each delivery DID, as a row: the event, the status the payload
 * carried and the one it normalised to, how many turns it brought, whether
 * the ingest declined it. The log line beside the ingest lives in Vercel's
 * logs; this is the version that can be read back, per call, from /api/diag.
 * No content — counts and flags only.
 */
async function recordDelivery(
  db: Db,
  tenantId: string,
  callId: string | null,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await emitEvent(db, tenantId, "webhook.delivery", "ingest", callId ? "call" : null, callId, {
      provider: "retell",
      ...data,
    });
  } catch (e) {
    L.error("webhook_delivery_event_failed", { error: errField(e) });
  }
}

/** The note in the caller's thread, and the call row pointed at it. */
async function landNote(db: Db, tenantId: string, s: Extract<CallStep, { kind: "note" }>): Promise<void> {
  const msgId = await recordCallNote(db, {
    tenantId,
    conversationId: s.conversationId,
    contactId: s.contactId,
    body: s.body,
    externalId: s.externalId,
    channelTsIso: s.channelTsIso,
  });
  if (msgId) await linkCallMessage(db, tenantId, s.callId, msgId);
}

/** The call's own hold on the thread, let go when the call is over and renewed while it runs. */
async function holdThread(db: Db, tenantId: string, s: Extract<CallStep, { kind: "hold" }>): Promise<void> {
  const holder = { kind: "call" as const, callId: s.retellCallId };
  const thread = { tenantId, conversationId: s.conversationId, holder };
  await (s.over ? releaseControl(db, thread) : claimControl(db, { ...thread, seconds: CALL_CONTROL_S })).catch(
    (e: unknown) => {
      L.error("retell_call_hold_failed", { call: s.retellCallId, over: s.over, error: errField(e) });
    },
  );
}

/** The caller handed to a person: the thread paused for the workspace's own hours, the one escalation with the to-do. */
async function handToPerson(db: Db, routed: RoutedChannel, s: Extract<CallStep, { kind: "callback" }>): Promise<void> {
  const rt = await loadTenantRuntime(db, routed);
  const pauseHours = rt.policy["reply"]?.limits.pause_hours ?? 24;
  await pauseConversation(
    db,
    routed.tenantId,
    s.conversationId,
    new Date(Date.now() + pauseHours * HOUR_MS).toISOString(),
  );
  const opened = await upsertEscalation(db, routed.tenantId, s.conversationId, "callback", s.details);
  L.info("call_callback_needed", { tenant: routed.tenantId, call: s.callId, escalation: opened });
}

/** The owner told a standing rule was broken out loud. */
async function raiseBreach(db: Db, tenantId: string, s: Extract<CallStep, { kind: "policy_block" }>): Promise<void> {
  const said = await upsertEscalation(db, tenantId, s.conversationId, s.reason, s.details);
  // The words the agent said are the owner's to read in the Inbox, never the
  // platform's log: the turn number and the outcome are what a search needs.
  L.warn("voice_policy_block_price", { tenant: tenantId, call: s.callId, turn: s.turn, escalation: said });
}

/** The live call corrected through the provider, once per instance. */
async function correctReceptionist(
  db: Db,
  routed: RoutedChannel,
  s: Extract<CallStep, { kind: "correct_live_call" }>,
): Promise<void> {
  if (corrected.size >= CORRECTED_MAX) corrected.clear();
  corrected.add(s.retellCallId);
  // What the correction offers is what this receptionist offers: the link, or the details for a business with none.
  const { brain } = await loadTenantRuntime(db, routed);
  // The plan asks for a correction only while the key is held (canCorrect).
  const put = await updateLiveCall({ apiKey: env.RETELL_API_KEY! }, s.retellCallId, {
    additionalContext: frameGuardrail(s.rule, { hasBookingLink: offersBookingLink(brain) }),
    // Never by decree. Every whisper this product sends is worked into the
    // next answer rather than spoken on command, and a correction the caller
    // hears being read out is a second mistake on top of the first.
    triggerResponse: false,
  });
  L.info("voice_guardrail_correction", { call: s.retellCallId, rule: s.rule, ok: put.ok, status: put.status });
}

/** One step of the plan, made real. The claim is the door's own (applyPlan), because its answer decides the response. */
async function applyStep(
  db: Db,
  routed: RoutedChannel,
  s: Exclude<CallStep, { kind: "claim_notification" }>,
): Promise<void> {
  switch (s.kind) {
    case "log":
      L.info(s.event, s.fields);
      return;
    case "forwarding_verified":
      await markForwardingVerified(db, routed.tenantId, s.call);
      return;
    case "call_activity":
      await tellPhones(db, routed.tenantId, s);
      return;
    case "delivery":
      await recordDelivery(db, routed.tenantId, s.callId, s.data);
      return;
    case "note":
      await landNote(db, routed.tenantId, s);
      return;
    case "hold":
      await holdThread(db, routed.tenantId, s);
      return;
    case "callback":
      await handToPerson(db, routed, s);
      return;
    case "policy_block":
      await raiseBreach(db, routed.tenantId, s);
      return;
    case "correct_live_call":
      await correctReceptionist(db, routed, s);
      return;
    case "copy_recording":
      await copyRecording(db, {
        tenantId: routed.tenantId,
        callId: s.callId,
        providerUrl: s.providerUrl,
        attempts: s.attempts,
        timeoutMs: WEBHOOK_COPY_TIMEOUT_MS,
      });
      return;
  }
}

/**
 * The plan applied in order, stopping at the first throw. The answer is the
 * notification claim: null when the plan made none, true when this delivery
 * owns the post-call side effects, false when a retry or replay found them
 * already gone out.
 */
async function applyPlan(db: Db, routed: RoutedChannel, plan: CallEventPlan): Promise<boolean | null> {
  let claim: boolean | null = null;
  for (const step of plan.steps) {
    if (step.kind === "claim_notification") claim = await claimCallNotification(db, routed.tenantId, step.callId);
    else await applyStep(db, routed, step);
  }
  return claim;
}

/**
 * The owner told: the bell row and the mail. Same pipeline as WhatsApp
 * escalations — and addressed the same way. This email carries a caller's
 * number and a full TRANSCRIPT of what they said, and it used to fall back
 * to a hardcoded personal address: with a second tenant, one business's call
 * recording summary delivered to another business's owner. It now goes only
 * to a mailbox we know is this tenant's.
 */
async function tellOwner(db: Db, routed: RoutedChannel | null, notice: NotifyMessage): Promise<void> {
  // The tenant was decided ONCE, above, before anything was written: the
  // summary email is tenant-scoped, and resolving it twice invites two
  // answers.
  const addressing = routed
    ? await loadTenantNotifications(db, routed.tenantId)
    : { notifications: null, isEnvDefault: false };
  await notify({ tenantId: routed?.tenantId ?? null, ...addressing }, notice);
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  if (!(await admitted(raw, request.headers.get("x-retell-signature")))) {
    return json(401, { ok: false, error: "unauthorized" });
  }
  const delivery = readDelivery(raw);
  if (!delivery) return json(200, { ok: true });
  const { event, call } = delivery;
  const n = normalizeCall(call);
  const db = pg();
  if (!db) {
    // No control plane: nothing can be checked or written, so the delivery is
    // not acknowledged. The SMS and WhatsApp doors answer the same 503, and a
    // credential-less deployment answers no_database platform-wide (lib/pg.ts).
    L.error("retell_no_database", { call_id: n.retellCallId, retell_event: event });
    return json(503, { ok: false, error: "no_database" });
  }
  // Whose call this is, decided ONCE and before anything is written. A read
  // that FAILED is not "nobody's agent": the dead letter below is for a
  // database that ANSWERED, and a blip is a 503 -- nothing is written, and
  // Retell redelivers (a non-2xx is retried, up to three times). Folding the
  // two into one null once dead-lettered a live call under the platform with
  // a 200, which the provider took as delivered and never sent again; and it
  // skipped the erasure guard below on the way, since the guard could not be
  // placed either.
  const lookup = await routeDelivery(db, n);
  if (lookup.lookupFailed) {
    L.error("retell_routing_unreadable", { call_id: n.retellCallId, agent_id: n.agentId, retell_event: event });
    return json(503, { ok: false, error: "routing_unreadable" });
  }
  const routed = lookup.channel;
  const refusal = await erasureRefusal(db, n, routed, event);
  if (refusal) return refusal;

  // null = the plan made no claim (a dead letter makes none); true = this
  // delivery owns the post-call side effects; false = a retry or replay, they
  // already went out.
  let notifyClaim: boolean | null = null;
  // What the bell row is about: the call, or the thread when it needs a call back.
  let callAbout: CallAbout | null = null;

  try {
    if (!routed) await deadLetter(db, n);
    else {
      const res = await ingestCall(db, routed.tenantId, n, call);
      const plan = planCallEvent(
        { ...delivery, n },
        { ingest: res, alreadyCorrected: corrected.has(n.retellCallId), canCorrect: !!env.RETELL_API_KEY },
      );
      callAbout = plan.about;
      notifyClaim = await applyPlan(db, routed, plan);
    }
  } catch (e) {
    // A non-2xx is the only thing that earns a retry. Swallowing this with
    // a 200 forfeited the three deliveries Retell offers, and an ended call
    // whose analysis failed to land read "No summary" forever — while the
    // email below still went out. The side effects are idempotent (the
    // upsert on the call, the note's unique key, the notification claim, a
    // stored recording is terminal), so a retry is safe -- and the answer is
    // a 503, as the WhatsApp and SMS doors give a write the database
    // refused: try again.
    L.error("ingest_call_failed", { error: errField(e) });
    return json(503, { ok: false, error: "ingest_failed" });
  }

  if (event === "call_analyzed") {
    if (notifyClaim === false) {
      // A retry or a replay: the row says this call's email and note went out.
      L.info("retell_analyzed_duplicate", { call_id: n.retellCallId });
      return json(200, { ok: true, duplicate: true });
    }
    await tellOwner(db, routed, callNotice(n, call, callAbout));
  }
  return json(200, { ok: true });
}
