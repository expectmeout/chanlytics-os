/**
 * Retell call webhook — call_started / transcript_updated / call_ended /
 * call_analyzed.
 *
 * The door is api/retell-webhook.ts: `door(receiveCallEvent)`, which names the request the platform's way (log.ts).
 * Everything a delivery does is here, in the order the door had it: the signature is proved, the delivery read into the
 * shape the row keeps, an erased caller's call refused, the agent routed to its workspace and the ingest run.
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
 * every workspace's agents — an unrouted call is
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
 *
 * Cross-workspace: a provider webhook; the Retell agent id (or call id) names the workspace before anything is written.
 */
import { sendOpsMail, notifyOnceAs, reachesTenant, type NotifyMessage } from "../shared/alerts/notify.js";
import { pageOperator } from "../shared/alerts/page-operator.js";
import { loadTenantNotifications, loadTenantRuntime } from "../shared/tenant-runtime.js";
import { json, refuse } from "../shared/http.js";
import { pg } from "../shared/pg.js";
import { keepDelivery, signatureHeaders } from "../shared/keep-event.js";
import {
  normalizeCall,
  parseTranscriptText,
  updateLiveCall,
  type NormalizedCall,
  type RetellCall,
} from "@chanlytics/channels/voice";
import {
  pauseConversation,
  resolveChannelDetailed,
  type ChannelLookup,
  type RoutedChannel,
} from "@chanlytics/db/channels";
import {
  claimCallNotification,
  claimGuardCorrection,
  findAgentOfCall,
  findCallerName,
  ingestCall,
  linkCallMessage,
  markCallNoticeTold,
  recordCallNote,
  stampCallConfigVersion,
} from "@chanlytics/db/voice";
import { emitEvent } from "@chanlytics/db/events";
import { claimControl, releaseControl, CALL_CONTROL_S } from "@chanlytics/db/conversations";
import { copyRecording, WEBHOOK_COPY_TIMEOUT_MS } from "./call-recording.js";
import { isRehearsalCall, settleRehearsalEvent } from "./rehearsal-call.js";
import { markForwardingVerified } from "./forwarding.js";
import { tellPhonesCallStarted } from "./call-activity.js";
import { apns, apnsKeys } from "./apns.js";
import { wasErasedBeforeCall } from "../shared/erased.js";
import { upsertEscalation } from "@chanlytics/jobs";
import { frameGuardrail, pauseMsOf, MIN_MS, priceAllowance, spokenBreach, recordOrEmpty } from "@chanlytics/contracts";
import { linkOfferedOn } from "../calendar/availability.js";
import { env } from "../shared/env.js";
import { keptUrl, retellSigned } from "../shared/door-auth.js";
import { logger, errField } from "../shared/log.js";
import {
  planCallEvent,
  callNotice,
  isMissedCall,
  missedCallNotice,
  type CallAbout,
  type CallEventPlan,
  type CallStep,
} from "./call-event.js";
import type { TenantId, ContactId } from "@chanlytics/contracts";

type Db = NonNullable<ReturnType<typeof pg>>;

const PLATFORM_TENANT = "00000000-0000-0000-0000-000000000000";

/**
 * When a refused delivery last left an evidence row, per instance. The row is
 * the readback /api/diag offers for "is the signature working"; the throttle is
 * because the door is public and the insert is now awaited.
 */
const REFUSED_AUTH_ROW_MS = MIN_MS;

let lastRefusedAuthRow = 0;

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
  const log = logger();
  try {
    const db = pg();
    if (!db) return;
    await emitEvent(db, PLATFORM_TENANT, "webhook.auth", null, null, {
      provider: "retell",
      sig,
      key,
      sig_raw: forms.raw,
      sig_restringified: forms.restringified,
    });
  } catch (e) {
    log.error("webhook_auth_event_failed", { error: errField(e) });
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
 * the badged key for verification alone; empty, nothing verifies (the API
 * key was tried in its place until 31 October 2026, the RETELL_WEBHOOK_KEY
 * switch: production has held the badged key since).
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
  const log = logger();
  if (!env.RETELL_WEBHOOK_KEY) {
    // Named, every delivery, so the one configuration step that stands between
    // this door and a real signature is not a thing someone has to already
    // know: without it, no delivery verifies.
    log.warn("retell_webhook_key_unset", { fix: "set RETELL_WEBHOOK_KEY to the badged key" });
  }
  // The check itself is shared/door-auth.ts's `retellSigned`, which the other three voice doors use too.
  const { ok: sigOk, raw: sigRaw, restringified: sigRestringified } = retellSigned(raw, signature);
  log.info("retell_webhook_auth", { sig: sigOk });
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
/** A delivery as the door read it: the event, the call as the provider shaped it, and the key names it carried. */
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
  const log = logger();
  let body: { event?: string; call?: RetellCall };
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  const { event, call } = body;
  log.info("retell_event", { retell_event: event, call_id: call?.call_id ?? null });
  if (!call?.call_id) return null;
  if (event === "transcript_updated" && !call.call_status) call.call_status = "ongoing";
  const top = recordOrEmpty(body);
  const bodyKeys = Object.keys(top).filter((k) => k !== "call");
  const callKeys = Object.keys(recordOrEmpty(call));
  if (event === "transcript_updated") {
    if (!call.transcript_with_tool_calls && Array.isArray(top.transcript_with_tool_calls)) {
      call.transcript_with_tool_calls = top.transcript_with_tool_calls;
    }
    if (!call.transcript_object && Array.isArray(top.transcript_object)) {
      call.transcript_object = top.transcript_object;
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
 * sends the delivery back rather than proceeding. The answer is what ends the
 * delivery ("erased", or "unreadable", which is tried again), or null when it
 * may go on.
 */
async function erasureOf(
  db: Db,
  normalizedCall: NormalizedCall,
  routed: RoutedChannel | null,
  event: string | undefined,
): Promise<"erased" | "erasure_unreadable" | null> {
  const log = logger();
  if (!routed || !normalizedCall.fromE164 || !normalizedCall.startedAtIso) return null;
  // A read that FAILED is not "nobody asked to be forgotten". The comment
  // above once promised a late sweep to catch what this let through; there
  // is no such sweep, so the promise was the only thing standing between a
  // failed read and an erased person remade from a call's data. 503 instead:
  // the provider redelivers, and a blip costs a retry rather than a person.
  let erased: boolean;
  try {
    erased = await wasErasedBeforeCall(db, routed.tenantId, normalizedCall.fromE164, normalizedCall.startedAtIso);
  } catch (e) {
    log.error("retell_call_erasure_unreadable", {
      call: normalizedCall.retellCallId,
      tenant_id: routed.tenantId,
      error: errField(e),
    });
    return "erasure_unreadable";
  }
  if (erased) {
    log.info("retell_call_skipped_erased", {
      call: normalizedCall.retellCallId,
      tenant_id: routed.tenantId,
      retell_event: event,
    });
    return "erased";
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
async function routeDelivery(db: Db, input: { agentId: string | null; retellCallId: string }): Promise<ChannelLookup> {
  const log = logger();
  if (input.agentId) return resolveChannelDetailed(db, "voice", input.agentId);
  const { data, error } = await findAgentOfCall(db, input.retellCallId);
  if (error) {
    // The REASON rides the log: an RLS or grant regression on `calls` must
    // read differently from a network blip, and the door's refusal names
    // the call, not the cause.
    log.error("retell_call_row_unreadable", { call_id: input.retellCallId, error: error.message });
    return { channel: null, lookupFailed: true };
  }
  const agentId = data?.agent_id ?? null;
  return agentId ? resolveChannelDetailed(db, "voice", agentId) : { channel: null, lookupFailed: false };
}

/**
 * The call on the phones' Lock Screens (00191, lib/voice/call-activity.ts): once per call, as it starts, to the phones
 * of the people who take calls. Best effort beside the call's own door, and bounded (apns.ts: three seconds a push),
 * since the webhook's answer waits on it.
 */
async function tellPhones(
  db: Db,
  tenantId: TenantId,
  callStep: Extract<CallStep, { kind: "call_activity" }>,
): Promise<void> {
  const log = logger();
  const keys = apnsKeys();
  if (!keys) return;
  const outcome = await tellPhonesCallStarted(db, tenantId, callStep.call, apns(keys)).catch((e: unknown) => {
    log.error("call_activity_failed", { call: callStep.retellCallId, error: errField(e) });
    return null;
  });
  if (outcome) {
    log.info("call_activity_started", {
      call: callStep.retellCallId,
      started: outcome.started,
      refused: outcome.refused.length,
      gone: outcome.gone,
      already: outcome.already,
    });
    for (const r of outcome.refused) log.warn("call_activity_refused", { call: callStep.retellCallId, error: r.error });
  }
}

/**
 * The settings version the call was composed from, as the inbound webhook answered it in the call's metadata, written
 * on the row the ingest made (decision 0069, R6). Never fatal: a call that cannot be stamped is a call reviewed against
 * the settings as they stand, and says so.
 */
async function stampConfigVersion(db: Db, tenantId: TenantId, retellCallId: string, call: RetellCall): Promise<void> {
  const v = call.metadata?.config_version;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) return;
  try {
    await stampCallConfigVersion(db, tenantId, retellCallId, v);
  } catch (e) {
    logger({ tenant_id: tenantId }).error("call_version_stamp_failed", { call_id: retellCallId, error: errField(e) });
  }
}

/** A call nobody's agent owns: dead-lettered under the platform, never guessed into a tenant. */
async function deadLetter(db: Db, n: NormalizedCall): Promise<void> {
  const log = logger();
  log.error("retell_unroutable_agent", { agent_id: n.agentId });
  await emitEvent(db, PLATFORM_TENANT, "ingest.unroutable", null, null, {
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
  tenantId: TenantId,
  callId: string | null,
  data: Record<string, unknown>,
): Promise<void> {
  const log = logger();
  try {
    await emitEvent(db, tenantId, "webhook.delivery", callId ? "call" : null, callId, {
      provider: "retell",
      ...data,
    });
  } catch (e) {
    log.error("webhook_delivery_event_failed", { error: errField(e) });
  }
}

/** The note in the caller's thread, and the call row pointed at it. */
async function landNote(db: Db, tenantId: TenantId, callStep: Extract<CallStep, { kind: "note" }>): Promise<void> {
  const msgId = await recordCallNote(db, {
    tenantId,
    conversationId: callStep.conversationId,
    contactId: callStep.contactId,
    body: callStep.body,
    externalId: callStep.externalId,
    channelTsIso: callStep.channelTsIso,
  });
  if (msgId) await linkCallMessage(db, tenantId, callStep.callId, msgId);
}

/** The call's own hold on the thread, let go when the call is over and renewed while it runs. */
async function holdThread(db: Db, tenantId: TenantId, s: Extract<CallStep, { kind: "hold" }>): Promise<void> {
  const log = logger();
  const holder = { kind: "call" as const, callId: s.retellCallId };
  const thread = { tenantId, conversationId: s.conversationId, holder };
  await (s.over ? releaseControl(db, thread) : claimControl(db, { ...thread, seconds: CALL_CONTROL_S })).catch(
    (e: unknown) => {
      log.error("retell_call_hold_failed", { call: s.retellCallId, over: s.over, error: errField(e) });
    },
  );
}

/** The caller handed to a person: the thread paused for the workspace's own hours, the one escalation with the to-do. */
async function handToPerson(
  db: Db,
  routed: RoutedChannel,
  callStep: Extract<CallStep, { kind: "callback" }>,
): Promise<void> {
  const log = logger();
  // A call the receptionist could not finish steps it aside on the thread for the workspace's pause; a call that reached
  // no answer (missed, or left without a word) leaves it answering what they write.
  if (callStep.pause) {
    const rt = await loadTenantRuntime(db, routed);
    const pauseMs = pauseMsOf(rt.policy["reply"]?.limits);
    // Measured from the call's end, never from this delivery: Retell retries a slow delivery, and a pause measured
    // from each one slid forward with every replay (docs/conversation-flow.md, G9). The same call ended once.
    const from = callStep.endedAtIso ? Date.parse(callStep.endedAtIso) : Date.now();
    await pauseConversation(db, routed.tenantId, callStep.conversationId, new Date(from + pauseMs).toISOString());
  }
  const opened = await upsertEscalation(db, routed.tenantId, callStep.conversationId, "callback", callStep.details);
  log.info("call_callback_needed", { tenant_id: routed.tenantId, call: callStep.callId, escalation: opened });
}

/** The owner told a standing rule was broken out loud. */
async function raiseBreach(db: Db, tenantId: TenantId, s: Extract<CallStep, { kind: "policy_block" }>): Promise<void> {
  const log = logger();
  const sentence = await upsertEscalation(db, tenantId, s.conversationId, s.reason, s.details);
  // The words the agent said are the owner's to read in the Inbox, never the
  // platform's log: the turn number and the outcome are what a search needs.
  log.warn("voice_policy_block_price", { tenant_id: tenantId, call: s.callId, turn: s.turn, escalation: sentence });
}

/**
 * The live call corrected through the provider, once a call: the call's own claim (guard_corrected_at) decides, so a
 * call whose turns land on two instances is corrected once (an in-memory set corrected it on each). The durable half
 * needs no claim: `upsertEscalation` keeps one open escalation per conversation.
 */
async function correctReceptionist(
  db: Db,
  routed: RoutedChannel,
  callStep: Extract<CallStep, { kind: "correct_live_call" }>,
): Promise<void> {
  const log = logger();
  if (!(await claimGuardCorrection(db, routed.tenantId, callStep.callId))) return;
  // What the correction offers is what this receptionist offers on a call: the link where WhatsApp can carry it, or
  // the details (linkOfferedOn).
  const rt = await loadTenantRuntime(db, routed);
  // The plan asks for a correction only while the key is held (canCorrect).
  const put = await updateLiveCall({ apiKey: env.RETELL_API_KEY! }, callStep.retellCallId, {
    additionalContext: frameGuardrail(callStep.rule, { hasBookingLink: linkOfferedOn("call", rt) }),
    // Never by decree. Every whisper this product sends is worked into the
    // next answer rather than spoken on command, and a correction the caller
    // hears being read out is a second mistake on top of the first.
    triggerResponse: false,
  });
  log.info("voice_guardrail_correction", {
    call: callStep.retellCallId,
    rule: callStep.rule,
    ok: put.ok,
    status: put.status,
  });
}

/**
 * The prices the receptionist may say on this call (contracts priceAllowance), read only when the turns name one:
 * a strict check that finds nothing has nothing an allowance could change, and a warm runtime read still costs a stamp
 * round trip on every delivery. A workspace that cannot be read is strict, never a failed delivery (decision 0051).
 * Read at the call's start, where its prompt was composed (call-start.ts): a call that runs past midnight on an offer's
 * last day is judged by what the caller's receptionist was told, the offer's note and its price included.
 */
async function allowedOnCall(db: Db, routed: RoutedChannel, n: NormalizedCall): Promise<ReadonlySet<string> | null> {
  if (!spokenBreach(n.transcriptObject, null)) return null;
  try {
    const rt = await loadTenantRuntime(db, routed);
    const composedAt = n.startedAtIso ? new Date(n.startedAtIso) : new Date();
    return rt.loadFailed ? null : priceAllowance(rt.brain, rt.timezone, composedAt);
  } catch {
    return null;
  }
}

/** One step of the plan, made real. The claim is the door's own (applyPlan), because its answer decides the response. */
async function applyStep(
  db: Db,
  routed: RoutedChannel,
  callStep: Exclude<CallStep, { kind: "claim_notification" }>,
): Promise<void> {
  const log = logger();
  switch (callStep.kind) {
    case "log":
      log.info(callStep.event, callStep.fields);
      return;
    case "forwarding_verified":
      await markForwardingVerified(db, routed.tenantId, callStep.call);
      return;
    case "call_activity":
      await tellPhones(db, routed.tenantId, callStep);
      return;
    case "delivery":
      await recordDelivery(db, routed.tenantId, callStep.callId, callStep.data);
      return;
    case "note":
      await landNote(db, routed.tenantId, callStep);
      return;
    case "hold":
      await holdThread(db, routed.tenantId, callStep);
      return;
    case "callback":
      await handToPerson(db, routed, callStep);
      return;
    case "policy_block":
      await raiseBreach(db, routed.tenantId, callStep);
      return;
    case "correct_live_call":
      await correctReceptionist(db, routed, callStep);
      return;
    case "page_platform":
      // Platform-wide, never the workspace's: the page names the reason and the workspace id, no caller, no words.
      await pageOperator(
        { db },
        `voice_ending:${callStep.reason}`,
        `Calls are ending on our side: ${callStep.words}`,
        `A call to workspace ${routed.tenantId} ended "${callStep.reason}" (${callStep.words}). ${callStep.mend} Every call may end the same way until it is mended.`,
      );
      return;
    case "copy_recording":
      await copyRecording(db, {
        tenantId: routed.tenantId,
        callId: callStep.callId,
        providerUrl: callStep.providerUrl,
        attempts: callStep.attempts,
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
 * The owner told: the bell row, the phones and the mail. Same pipeline as WhatsApp
 * escalations — and addressed the same way. This email carries a caller's
 * number and a full TRANSCRIPT of what they said, and it used to fall back
 * to a hardcoded personal address: with a second tenant, one business's call
 * recording summary delivered to another business's owner. It now goes only
 * to a mailbox we know is this tenant's.
 *
 * TOLD ONCE, BY NAME (notifyOnce, decision 0048): the notice is kept under the call (`call:<id>`), so a retry finds it
 * and sends only what it still owes. The claim on the call (notified_at) said "it went" before the mail had, and a
 * mail that failed was lost behind it: a retry read the claim and answered duplicate. Now a notice whose mail is owed
 * answers the delivery 503, so the provider redelivers and the next try sends the mail alone; once told in full the
 * call says so (notice_told_at), and the calls sweep finishes a notice the provider stopped retrying.
 *
 * A workspace nobody can be mailed at has its bell row, which is its notice, and the platform is told once, on the
 * fresh claim, that it needs notification settings: the redacted note, without the caller or their words.
 */
async function tellOwner(
  db: Db,
  routed: RoutedChannel | null,
  notice: NotifyMessage,
  call: { id: string | null; retellCallId: string; fresh: boolean },
): Promise<"told" | "owed"> {
  if (!routed) return "told";
  const target = { tenantId: routed.tenantId, ...(await loadTenantNotifications(db, routed.tenantId)) };
  const otherNotice = await notifyOnceAs(target, { ...notice, onceKey: `call:${call.retellCallId}` });
  if (otherNotice === "told" && call.fresh && !reachesTenant(target)) await sendOpsMail(target, notice);
  if (otherNotice !== "told") {
    logger({ tenant_id: routed.tenantId }).warn("call_notice_owed", { call: call.retellCallId, outcome: otherNotice });
    return "owed";
  }
  if (call.id) await markCallNoticeTold(db, routed.tenantId, call.id);
  return "told";
}

/**
 * The name the owner saved for the caller, for the notice to lead with (findCallerName: their name, else their WhatsApp
 * name): null for a caller nobody saved, or a call that was no one's. A read that fails is logged and read as none: it is
 * the notice's last step after the claim that makes it once, so a throw here would lose the owner's notice for a name.
 */
async function savedCallerName(
  db: Db,
  routed: RoutedChannel | null,
  contactId: ContactId | null,
  retellCallId: string,
): Promise<string | null> {
  if (!routed || !contactId) return null;
  try {
    return await findCallerName(db, routed.tenantId, contactId);
  } catch (e) {
    logger().warn("call_notice_name_unreadable", {
      tenant_id: routed.tenantId,
      call: retellCallId,
      error: errField(e),
    });
    return null;
  }
}

export async function receiveCallEvent(request: Request): Promise<Response> {
  const log = logger();
  const raw = await request.text();
  if (!(await admitted(raw, request.headers.get("x-retell-signature")))) {
    return refuse(401, "unauthorized");
  }
  const delivery = readDelivery(raw);
  if (!delivery) return json(200, { ok: true });
  const { event, call } = delivery;
  const result = normalizeCall(call);
  const db = pg();
  if (!db) {
    // No control plane: nothing can be checked or written, so the delivery is
    // not acknowledged. The SMS and WhatsApp doors answer the same 503, and a
    // credential-less deployment answers no_database platform-wide (lib/shared/pg.ts).
    log.error("retell_no_database", { call_id: result.retellCallId, retell_event: event });
    return refuse(503, "no_database");
  }
  // A web call is a rehearsal (decision 0069, D4): an owner in the browser, never a customer. It is kept out of the
  // call pipeline -- no row in calls, no note, no hold, no escalation, no email, nothing in People or Reports -- and
  // its words, its end and its seconds are its rehearsal's. Before the routing, which a rehearsal's agent may not have.
  if (isRehearsalCall(call)) {
    const settled = await settleRehearsalEvent(db, event ?? null, call);
    return settled === "unreadable" ? refuse(503, "read_failed") : json(200, { ok: true, rehearsal: settled });
  }
  // Whose call this is, decided ONCE and before anything is written. A read
  // that FAILED is not "nobody's agent": the dead letter below is for a
  // database that ANSWERED, and a blip is a 503 -- nothing is written, and
  // Retell redelivers (a non-2xx is retried, up to three times). Folding the
  // two into one null once dead-lettered a live call under the platform with
  // a 200, which the provider took as delivered and never sent again; and it
  // skipped the erasure guard below on the way, since the guard could not be
  // placed either.
  const lookup = await routeDelivery(db, result);
  const routed = lookup.channel;
  // Kept under the event and the call's id, before the verdict (decision 0032, 00336), a routing that could not be read
  // included: Retell stops after three tries, and the kept delivery is the replay after a fix.
  await keepDelivery(db, {
    provider: "retell",
    id: `${event}:${result.retellCallId}`,
    door: "/api/retell-webhook",
    url: keptUrl(request),
    tenantId: routed?.tenantId ?? null,
    headers: signatureHeaders(request, ["x-retell-signature"]),
    body: raw,
  });
  if (lookup.lookupFailed) {
    log.error("retell_routing_unreadable", {
      call_id: result.retellCallId,
      agent_id: result.agentId,
      retell_event: event,
    });
    return refuse(503, "routing_unreadable");
  }
  const settled = await settleCall(db, routed, delivery);
  if (settled.kind === "erasure_unreadable") return refuse(503, "erasure_unreadable");
  if (settled.kind === "erased") return json(200, { ok: true, skipped: "erased" });
  // A non-2xx is the only thing that earns a retry: see settleCall.
  if (settled.kind === "ingest_failed") return refuse(503, "ingest_failed");
  // The owner's notice is kept and its mail owed: a 503, so the provider redelivers and the next try sends the mail.
  if (settled.kind === "notice_owed") return refuse(503, "could_not_queue", "the owner's notice is owed its mail");
  // A retry or a replay: the row says this call's email and note went out.
  if (settled.kind === "duplicate") return json(200, { ok: true, duplicate: true });
  return json(200, { ok: true });
}

/** What a call event came to once its workspace was known: the door answers by it, and the calls sweep counts it. */
type CallSettled =
  | { kind: "erasure_unreadable" }
  | { kind: "erased" }
  | { kind: "ingest_failed" }
  | { kind: "notice_owed" }
  | { kind: "duplicate" }
  | { kind: "settled"; told: boolean };

/**
 * Everything a call event does once its workspace is known: the erasure guard, the ingest, the plan applied in order, and
 * for an analysed call the claim and the owner's notice. The webhook's second half, callable, since a call whose "call
 * analysed" delivery was lost is settled by the calls sweep through the same steps once the provider has the analysis
 * (calls-sweep.ts; the wiring's second audit, R11 S11-3): a caller who asked to be called back was dropped, with no hold
 * and no notice. The claim on the call (calls.notified_at) keeps the notice to once, whichever settles it first.
 */
export async function settleCall(db: Db, routed: RoutedChannel | null, delivery: Delivery): Promise<CallSettled> {
  const log = logger();
  const { event, call } = delivery;
  const result = normalizeCall(call);
  const erasure = await erasureOf(db, result, routed, event);
  if (erasure) return { kind: erasure };

  // null = the plan made no claim (a dead letter makes none); true = this
  // delivery owns the post-call side effects; false = a retry or replay, they
  // already went out.
  let notifyClaim: boolean | null = null;
  // What the bell row is about: the call, or the thread when it needs a call back.
  let callAbout: CallAbout | null = null;
  // The call's own row, which that notice opens.
  let callId: string | null = null;
  // The person the ingest placed the call on, whose saved name the owner's notice leads with.
  let callerId: string | null = null;

  try {
    if (!routed) await deadLetter(db, result);
    else {
      // The provider's payload is kept as the call ends and is analysed (scrub_call_raw's allowlist, 00530): a live turn
      // carries none, so the row keeps what it has instead of rewriting it on every turn.
      const keepsPayload = event === "call_ended" || event === "call_analyzed";
      const res = await ingestCall(db, routed.tenantId, result, keepsPayload ? call : undefined);
      await stampConfigVersion(db, routed.tenantId, result.retellCallId, call);
      const plan = planCallEvent(
        { ...delivery, n: result },
        {
          ingest: res,
          alreadyCorrected: false,
          canCorrect: !!env.RETELL_API_KEY,
          allowed: await allowedOnCall(db, routed, result),
        },
      );
      callAbout = plan.about;
      callId = plan.callId;
      callerId = res.contact_id;
      notifyClaim = await applyPlan(db, routed, plan);
    }
  } catch (error) {
    // A non-2xx is the only thing that earns a retry. Swallowing this with
    // a 200 forfeited the three deliveries Retell offers, and an ended call
    // whose analysis failed to land read "No summary" forever — while the
    // email below still went out. The side effects are idempotent (the
    // upsert on the call, the note's unique key, the notification claim, a
    // stored recording is terminal), so a retry is safe -- and the answer is
    // a 503, as the WhatsApp and SMS doors give a write the database
    // refused: try again.
    log.error("ingest_call_failed", { error: errField(error) });
    return { kind: "ingest_failed" };
  }

  // The owner is told once per call, by the claim: of its analysis, or of a customer's call that never connected, which
  // may never be analysed (R11 S6-8). A missed call the plan made no claim for (a stale delivery, a dead letter) tells
  // nobody.
  const missed = event !== "call_analyzed" && isMissedCall(result);
  if (event !== "call_analyzed" && !(missed && notifyClaim !== null)) return { kind: "settled", told: false };
  // A retry or a replay finds the claim taken: the notice is asked again under its name, and sends only a mail still
  // owed (notifyOnce); told already, it sends nothing and the delivery is a duplicate.
  const saved = await savedCallerName(db, routed, callerId, result.retellCallId);
  const notice = await tellOwner(
    db,
    routed,
    missed ? missedCallNotice(result, saved, callId) : callNotice(result, call, callAbout, saved, callId),
    { id: callId, retellCallId: result.retellCallId, fresh: notifyClaim === true },
  );
  if (notice === "owed") return { kind: "notice_owed" };
  if (notifyClaim === false) {
    log.info("retell_analyzed_duplicate", { call_id: result.retellCallId });
    return { kind: "duplicate" };
  }
  return { kind: "settled", told: true };
}
