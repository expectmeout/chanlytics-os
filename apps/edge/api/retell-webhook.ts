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
 * dead-lettered, never guessed into a tenant.
 */
import { notify } from "../lib/notify.js";
import { loadTenantNotifications, loadTenantRuntime } from "../lib/tenant-runtime.js";
import { json } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import {
  normalizeCall,
  callSummaryLine,
  verifyRetellSignature,
  parseTranscriptText,
  updateLiveCall,
  type RetellCall,
} from "../lib/packages/channels.js";
import {
  pauseConversation,
  resolveChannel,
  ingestCall,
  recordCallNote,
  linkCallMessage,
  claimCallNotification,
  emitEvent,
  claimControl,
  releaseControl,
  CALL_CONTROL_S,
} from "../lib/packages/db.js";
import { copyRecording, WEBHOOK_COPY_TIMEOUT_MS } from "../lib/call-recording.js";
import { markForwardingVerified } from "../lib/forwarding.js";
import { erasedBeforeCall } from "../lib/erased.js";
import { upsertEscalation } from "../lib/packages/jobs.js";
import { callOutcomeWords, formatPhoneDisplay, guardSpokenTurns, frameGuardrail } from "../lib/packages/contracts.js";
import type { RoutedChannel } from "../lib/packages/db.js";

export const config = { maxDuration: 60 };

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
const REFUSED_AUTH_ROW_MS = 60_000;
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
async function recordWebhookAuth(sig: boolean, key: boolean, forms: { raw: boolean; restringified: boolean }): Promise<void> {
  try {
    const db = pg();
    if (!db) return;
    await emitEvent(db, PLATFORM_TENANT, "webhook.auth", "ingest", null, null, {
      provider: "retell", sig, key, sig_raw: forms.raw, sig_restringified: forms.restringified,
    });
  } catch (e) {
    console.error("webhook_auth_event_failed", e instanceof Error ? e.message : e);
  }
}

/**
 * A delivery that names no agent, routed through the call it belongs to.
 *
 * The canonical row was only ever written when the payload carried
 * agent_id. The provider documents call_started as "basic information" and
 * transcript_updated as "also includes transcript_with_tool_calls" — neither
 * promises the agent id on every event — and a per-turn delivery without it
 * used to be dropped before ingest, silently, leaving a live transcript
 * frozen on the dashboard while the provider streamed turns.
 */
async function routeByKnownCall(db: NonNullable<ReturnType<typeof pg>>, retellCallId: string): Promise<RoutedChannel | null> {
  const { data } = await db.from("calls").select("agent_id").eq("retell_call_id", retellCallId).limit(1).maybeSingle();
  const agentId = (data as { agent_id?: string | null } | null)?.agent_id ?? null;
  return agentId ? resolveChannel(db, "voice", agentId) : null;
}

/**
 * What each delivery DID, as a row: the event, the status the payload
 * carried and the one it normalised to, how many turns it brought, whether
 * the ingest declined it. The log line beside the ingest lives in Vercel's
 * logs; this is the version that can be read back, per call, from /api/diag.
 * No content — counts and flags only.
 */
async function recordDelivery(
  db: NonNullable<ReturnType<typeof pg>>,
  tenantId: string,
  callId: string | null,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await emitEvent(db, tenantId, "webhook.delivery", "ingest", callId ? "call" : null, callId, { provider: "retell", ...data });
  } catch (e) {
    console.error("webhook_delivery_event_failed", e instanceof Error ? e.message : e);
  }
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  // Two forms of the body, because the provider's own example verifies
  // `JSON.stringify(req.body)` — the parsed body re-serialised — not the raw
  // bytes. The two differ whenever an encoder escapes non-ASCII (the greeting
  // carries an em dash on every delivery), so a signature made over one form
  // fails over the other with the RIGHT key. Both are tried; which one
  // verified is recorded, so the key question settles itself on the next
  // delivery instead of on a guess.
  //
  // THE KEY. Retell signs with the API key that carries the webhook badge in
  // its dashboard, and only that one: "Only the API key that has a webhook
  // badge next to it can be used to verify the webhook." The key the edge
  // CALLS Retell with need not be that key, and in production it was not:
  // 127 deliveries on 2026-09-05 verified in neither form while the ?key=
  // opened every one (events, kind webhook.auth). RETELL_WEBHOOK_KEY holds
  // the badged key for verification alone; empty, the API key is tried, as
  // before, so nothing moves until it is set.
  const signature = request.headers.get("x-retell-signature");
  const webhookKey = process.env.RETELL_WEBHOOK_KEY || process.env.RETELL_API_KEY;
  if (!process.env.RETELL_WEBHOOK_KEY) {
    // Named, every delivery, so the one configuration step that stands between
    // this door and a real signature is not a thing someone has to already
    // know. The API key is tried underneath, as before.
    console.warn("retell_webhook_key_unset", JSON.stringify({ trying: "RETELL_API_KEY", fix: "set RETELL_WEBHOOK_KEY to the badged key" }));
  }
  const sigRaw = verifyRetellSignature(raw, signature, webhookKey);
  let restringified: string | null = null;
  try { restringified = JSON.stringify(JSON.parse(raw)); } catch { /* not JSON: nothing to re-serialise */ }
  const sigRestringified = !sigRaw && restringified !== null && restringified !== raw
    ? verifyRetellSignature(restringified, signature, webhookKey)
    : sigRaw;
  const sigOk = sigRaw || sigRestringified;
  // The signature is the only credential. The `?key=` that once opened this
  // door beside it was a secret in Retell's dashboard and in access logs, and
  // anyone holding it could forge a call_analyzed — a fabricated transcript
  // emailed to the owner and a poisoned note in a customer's bot memory. It
  // was retired once a real delivery verified against RETELL_WEBHOOK_KEY (the
  // badged key) and the agents were converged onto a URL with no query
  // string; a key that still rides on an old URL is ignored, never read. The
  // auth row keeps its `key` field, always false now, for the diagnostic's
  // shape.
  console.log("retell_webhook_auth", JSON.stringify({ sig: sigOk }));
  // AWAITED, not fired and forgotten. A serverless invocation is frozen when it
  // answers and nothing in this app registers a waitUntil, so an un-awaited
  // insert only lands if another delivery happens to thaw the instance in
  // time. On the 401 below there is nothing after it at all, which is how the
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
  if (refused) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  let body: { event?: string; call?: RetellCall } = {};
  try { body = JSON.parse(raw); } catch { return json(200, { ok: true }); }
  const { event, call } = body;
  console.log("retell_event", event, call && call.call_id);
  if (!call?.call_id) return json(200, { ok: true });

  // A transcript update is proof the call is IN PROGRESS. The per-turn
  // payload is not guaranteed to carry call_status, and an absent status
  // normalises to "ended" — which would mark a live call ended on its first
  // turn or, forward-only, make every later turn a no-op.
  if (event === "transcript_updated" && !call.call_status) call.call_status = "ongoing";

  // Where the live transcript actually rides. The documentation puts the
  // per-turn fields "in the payload"; the first real calls proved they are
  // NOT inside `call` on transcript_updated — every turn arrived with none of
  // transcript / transcript_object / transcript_with_tool_calls there, while
  // call_ended carried all three — so the row never held a word until the
  // call was over. Read them from either place; fall back to the spoken text;
  // and keep the KEY NAMES (never the words) so the next delivery says which.
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

  const n = normalizeCall(call);
  const db = pg();
  // A call that began before its caller asked to be erased belongs to the
  // erasure: its events must not make the person again with the call's data,
  // nor mail the owner about them. A call begun after the request is the
  // person calling back, and is theirs to make. A check that cannot be MADE
  // sends the delivery back rather than proceeding: see below.
  if (db && n.agentId && n.fromE164 && n.startedAtIso) {
    const routedEarly = await resolveChannel(db, "voice", n.agentId).catch(() => null);
    if (routedEarly) {
      // A read that FAILED is not "nobody asked to be forgotten". The comment
      // above once promised a late sweep to catch what this let through; there
      // is no such sweep, so the promise was the only thing standing between a
      // failed read and an erased person remade from a call's data. 503 instead:
      // the provider redelivers, and a blip costs a retry rather than a person.
      let erased: boolean;
      try {
        erased = await erasedBeforeCall(db, routedEarly.tenantId, n.fromE164, n.startedAtIso);
      } catch (e) {
        console.error("retell_call_erasure_unreadable", JSON.stringify({ call: n.retellCallId, tenant: routedEarly.tenantId, error: e instanceof Error ? e.message : String(e) }));
        return json(503, { ok: false, error: "erasure_unreadable" });
      }
      if (erased) {
        console.log("retell_call_skipped_erased", JSON.stringify({ call: n.retellCallId, tenant: routedEarly.tenantId, event }));
        return json(200, { ok: true, skipped: "erased" });
      }
    }
  }
  // null = no control plane to ask; true = this delivery owns the post-call
  // side effects; false = a retry or replay, they already went out.
  let notifyClaim: boolean | null = null;
  // What the bell row is about: the call, or the thread when it needs a call back.
  let callAbout: { type: string; id: string } | null = null;

  // ---- canonical calls row (additive; never breaks the legacy path) ----
  if (db) {
    try {
      const routed = n.agentId ? await resolveChannel(db, "voice", n.agentId) : await routeByKnownCall(db, n.retellCallId);
      if (!routed) {
        console.error("retell_unroutable_agent", n.agentId);
        await emitEvent(db, "00000000-0000-0000-0000-000000000000", "ingest.unroutable", "ingest", null, null,
          { channel: "voice", agent_id: n.agentId }).catch(() => {});
      } else {
        const res = await ingestCall(db, routed.tenantId, n, call);
        if (res.call_id) callAbout = { type: "call", id: res.call_id };
        // Keep my number, proven: an inbound call inside a forwarded line's
        // test window. Idempotent, and never in the way of the delivery.
        // Awaited for the same reason as the auth row: a call_started that
        // reaches the answer with nothing else to do is frozen before this
        // lands, and the owner's Setup page then says "Testing —" through the
        // whole call it was waiting for. Outside an open test window it is one
        // select that returns nothing.
        if (res.call_id && n.direction === "inbound") await markForwardingVerified(db, routed.tenantId, { fromE164: n.fromE164, toE164: n.toE164, startedAtIso: n.startedAtIso, callId: res.call_id });
        if (res.skipped) {
          // Older than the row: a retried call_started after call_ended, or a
          // partial transcript after the final one. Nothing was written.
          console.log("retell_event_stale", event, n.retellCallId);
        }
        // Awaited: this row IS /api/diag's answer to "what did the provider
        // actually send", and the deliveries it was written for — call_started
        // and the per-turn transcript updates — are exactly the ones with no
        // awaited work after them, so they were the ones it never recorded.
        await recordDelivery(db, routed.tenantId, res.call_id ?? null, {
          event: event ?? null,
          call_status: call.call_status ?? null,
          status: n.status,
          agent_id_present: !!call.agent_id,
          turns: n.transcriptObject?.length ?? null,
          tool_turns: call.transcript_with_tool_calls?.length ?? null,
          transcript_chars: n.transcript?.length ?? null,
          skipped: !!res.skipped,
          body_keys: bodyKeys,
          call_keys: callKeys,
        });

        // The call belongs in the customer's one thread, not a silo — written
        // once the SUMMARY exists. Message bodies are immutable (P3), and a
        // note written on call_ended read "No summary available." forever:
        // in the thread, in the WhatsApp bot's memory, and read aloud as the
        // caller's context on their next call. A call the provider never
        // analyses gets its line from the reconcile sweep instead.
        if (res.conversation_id && (event === "call_analyzed" || n.summary !== null || n.inVoicemail === true)) {
          const msgId = await recordCallNote(db, {
            tenantId: routed.tenantId,
            conversationId: res.conversation_id,
            contactId: res.contact_id,
            body: callSummaryLine(n),
            externalId: `call:${n.retellCallId}`,
            channelTsIso: n.startedAtIso,
          });
          if (msgId) await linkCallMessage(db, routed.tenantId, res.call_id, msgId);
        }

        // The hold this call has on the caller's thread (00132), taken at the
        // inbound door so the text receptionist does not answer the same person
        // while they are on the phone. A call that is over lets it go; a call
        // still running renews it, which is what keeps a long one from lapsing
        // mid-sentence. Only ever its OWN hold: a person who took the thread
        // over during the call keeps it, because release names the holder.
        if (res.conversation_id) {
          const over = n.status === "ended" || n.status === "error" || event === "call_analyzed";
          const holder = { kind: "call" as const, callId: n.retellCallId };
          await (over
            ? releaseControl(db, { tenantId: routed.tenantId, conversationId: res.conversation_id, holder })
            : claimControl(db, { tenantId: routed.tenantId, conversationId: res.conversation_id, holder, seconds: CALL_CONTROL_S })
          ).catch((e: unknown) => {
            console.error("retell_call_hold_failed", JSON.stringify({ call: n.retellCallId, over, error: e instanceof Error ? e.message : String(e) }));
          });
        }

        // The analysis says a person must call them back: the thread lands on
        // Needs you with what to do, and the receptionist steps aside on it for
        // the workspace's pause, exactly as a WhatsApp handoff does. A replay
        // refreshes the one open escalation rather than opening a second.
        if (event === "call_analyzed" && res.conversation_id && n.analysis?.outcome === "callback_needed") {
          const say = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
          const todo = say(n.analysis.follow_up) || say(n.analysis.caller_wanted) || "The caller needs a call back.";
          const rt = await loadTenantRuntime(db, routed);
          const pauseHours = rt.policy["reply"]?.limits.pause_hours ?? 24;
          await pauseConversation(db, routed.tenantId, res.conversation_id, new Date(Date.now() + pauseHours * 3_600_000).toISOString());
          const opened = await upsertEscalation(db, routed.tenantId, res.conversation_id, "callback", todo.slice(0, 400));
          callAbout = { type: "conversation", id: res.conversation_id };
          console.log("call_callback_needed", JSON.stringify({ tenant: routed.tenantId, call: res.call_id, escalation: opened }));
        }

        // A STANDING RULE BROKEN OUT LOUD.
        //
        // On text, layerTwo swaps the words before the customer sees them.
        // A call has already been heard by the time its turns reach us, so
        // the only thing left to change is what the agent says NEXT — and the
        // owner is told either way, which is the half that does not depend on
        // the provider's per-turn delivery being switched on.
        const guard = guardSpokenTurns({
          turns: n.transcriptObject,
          live: n.status === "ongoing",
          alreadyCorrected: corrected.has(n.retellCallId),
        });
        if (guard.escalate && guard.breach && res.conversation_id) {
          const said = await upsertEscalation(db, routed.tenantId, res.conversation_id, guard.escalate.reason, guard.escalate.details);
          // The words the agent said are the owner's to read in the Inbox,
          // never the platform's log: the turn number and the outcome are
          // what a search needs.
          console.warn("voice_policy_block_price", JSON.stringify({ tenant: routed.tenantId, call: res.call_id, turn: guard.breach.turn, escalation: said }));
        }
        if (guard.correct && guard.breach && process.env.RETELL_API_KEY) {
          if (corrected.size >= CORRECTED_MAX) corrected.clear();
          corrected.add(n.retellCallId);
          const put = await updateLiveCall({ apiKey: process.env.RETELL_API_KEY }, n.retellCallId, {
            additionalContext: frameGuardrail(guard.breach.rule),
            // Never by decree. Every whisper this product sends is worked
            // into the next answer rather than spoken on command, and a
            // correction the caller hears being read out is a second mistake
            // on top of the first.
            triggerResponse: false,
          });
          console.log("voice_guardrail_correction", JSON.stringify({ call: n.retellCallId, rule: guard.breach.rule, ok: put.ok, status: put.status }));
        }

        // The email and the memory note below happen ONCE per call. Retell
        // retries a slow delivery and replays inside the signature window; the
        // claim is what makes the second delivery a no-op.
        if (event === "call_analyzed") {
          notifyClaim = await claimCallNotification(db, routed.tenantId, res.call_id);
        }

        // Retell serves recordings from an UNSIGNED public CDN URL — copy the
        // audio into the private bucket so a customer's call isn't one guessed
        // link away, and so it survives provider retention. On a short budget:
        // this handler has the agent's 20 s delivery timeout over its head, and
        // a copy that does not finish is retried by the reconcile sweep. Never
        // again once stored, given up on, or removed on schedule: a purged
        // call's audio was taken out after its retention and must stay out.
        if (
          n.recordingUrl &&
          res.recording_state !== "stored" && res.recording_state !== "failed" && res.recording_state !== "purged" &&
          (event === "call_analyzed" || n.status === "ended")
        ) {
          await copyRecording(db, {
            tenantId: routed.tenantId,
            callId: res.call_id,
            providerUrl: n.recordingUrl,
            attempts: res.recording_attempts ?? 0,
            timeoutMs: WEBHOOK_COPY_TIMEOUT_MS,
          });
        }
      }
    } catch (e) {
      // A non-2xx is the only thing that earns a retry. Swallowing this with
      // a 200 forfeited the three deliveries Retell offers, and an ended call
      // whose analysis failed to land read "No summary" forever — while the
      // email below still went out. The side effects are idempotent now (the
      // notification claim), so a retry is safe.
      console.error("ingest_call_failed", e instanceof Error ? e.message : e);
      return json(500, { ok: false, error: "ingest_failed" });
    }
  }

  if (event === "call_analyzed") {
    if (notifyClaim === false) {
      // A retry or a replay: the row says this call's email and note went out.
      console.log("retell_analyzed_duplicate", n.retellCallId);
      return json(200, { ok: true, duplicate: true });
    }
    const summary = n.summary || "(no summary)";
    const sentiment = n.sentiment || "n/a";
    // What the analysis said, for the email: the request, the outcome, the to-do.
    const said = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
    const wanted = said(n.analysis?.caller_wanted);
    const outcomeWords = callOutcomeWords(n.analysis?.outcome);
    const followUp = said(n.analysis?.follow_up);
    const callback = n.analysis?.outcome === "callback_needed";
    const durationS = n.durationMs ? Math.round(n.durationMs / 1000) : 0;

    // Resolve the tenant ONCE for this block: the summary email is
    // tenant-scoped, and resolving it twice invites two answers.
    const db2 = pg();
    const routedForCall = db2 && n.agentId ? await resolveChannel(db2, "voice", n.agentId) : null;

    // Same pipeline as WhatsApp escalations — and addressed the same way. This
    // email carries a caller's number and a full TRANSCRIPT of what they said,
    // and it used to fall back to a hardcoded personal address: with a second
    // tenant, one business's call recording summary delivered to another
    // business's owner. It now goes only to a mailbox we know is this tenant's.
    const addressing = db2 && routedForCall
      ? await loadTenantNotifications(db2, routedForCall.tenantId)
      : { notifications: null, isEnvDefault: false };
    await notify(
      { tenantId: routedForCall?.tenantId ?? null, ...addressing },
      {
        kind: "call",
        route: "conversations/phone",
        about: callAbout,
        // In the owner's words, name first: "Emily phoned · 3 min · needs a call back".
        subject: `${said(n.analysis?.caller_name) || formatPhoneDisplay(call.from_number) || "Unknown caller"} phoned · ${durationS >= 60 ? `${Math.round(durationS / 60)} min` : `${durationS} s`}${callback ? " · needs a call back" : ""}`,
        body:
          (wanted ? `They wanted: ${wanted}.\n` : `${summary}\n`) +
          (outcomeWords ? `Outcome: ${outcomeWords}.\n` : "") +
          (followUp ? `To do: ${followUp}\n` : "") +
          `\nFrom ${call.from_number || "unknown"} · ${durationS}s · sentiment ${sentiment} · ended: ${n.disconnectionReason || "n/a"}\n` +
          `\nSummary:\n${summary}\n\n` +
          `Transcript:\n${String(n.transcript || "(none)").slice(0, 3000)}`,
        redactedBody: `A voice call was handled for a workspace (${durationS}s). The summary and transcript were withheld.`,
      },
    );
  }
  return json(200, { ok: true });
}
