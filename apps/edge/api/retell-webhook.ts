/**
 * Retell call webhook — call_started / transcript_updated / call_ended /
 * call_analyzed.
 *
 * Every event carrying a call is ingested (ingest_call is forward-only: an
 * event older than the row is a no-op it reports as `skipped`). The note,
 * the recording copy and the summary email wait for the end of the call.
 * transcript_updated is opt-in on the agent; when it is on, each turn
 * refreshes the row's transcript and heartbeat, which is what makes a live
 * transcript possible on the dashboard.
 *
 * Slice 3: every stage dual-writes the canonical `calls` row (idempotent on
 * retell_call_id, so started -> ended -> analyzed enrich ONE row), attaches the
 * call as a note on the caller's cross-channel thread, and copies the recording
 * into private Storage. The Resend summary email and the Blob thread note are
 * unchanged so the pre-Gate-1b bot keeps its voice context.
 *
 * Routing: agent_id -> tenant_channels(kind='voice'). One Retell account hosts
 * many agents (432 calls across 8 in the live account) — an unrouted call is
 * dead-lettered, never guessed into a tenant.
 */
import { getThread, saveThread, threadNamespace } from "../lib/store.js";
import { notify } from "../lib/notify.js";
import { loadTenantNotifications } from "../lib/tenant-runtime.js";
import { json } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import {
  normalizeCall,
  callSummaryLine,
  verifyRetellSignature,
  parseTranscriptText,
  type RetellCall,
} from "../lib/workspace/channels.js";
import {
  resolveChannel,
  ingestCall,
  recordCallNote,
  linkCallMessage,
  claimCallNotification,
  emitEvent,
} from "../lib/workspace/db.js";
import { copyRecording, WEBHOOK_COPY_TIMEOUT_MS } from "../lib/call-recording.js";
import type { RoutedChannel } from "../lib/workspace/db.js";

export const config = { maxDuration: 60 };

const PLATFORM_TENANT = "00000000-0000-0000-0000-000000000000";

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
  const signature = request.headers.get("x-retell-signature");
  const sigRaw = verifyRetellSignature(raw, signature, process.env.RETELL_API_KEY);
  let restringified: string | null = null;
  try { restringified = JSON.stringify(JSON.parse(raw)); } catch { /* not JSON: nothing to re-serialise */ }
  const sigRestringified = !sigRaw && restringified !== null && restringified !== raw
    ? verifyRetellSignature(restringified, signature, process.env.RETELL_API_KEY)
    : sigRaw;
  const sigOk = sigRaw || sigRestringified;
  // The `?key=` in the URL is a secret that rides in Retell's dashboard and
  // in access logs; anyone holding it could forge a call_analyzed — a
  // fabricated transcript emailed to the owner and a poisoned note in a
  // customer's bot memory. Retell signs every delivery, and the signature
  // should be the only credential. Which one passed is logged on every
  // event so the key can be retired once a real delivery proves the
  // signature verifies against the key this deployment holds.
  const keyOk = new URL(request.url).searchParams.get("key") === process.env.RETELL_FN_SECRET;
  console.log("retell_webhook_auth", JSON.stringify({ sig: sigOk, key: keyOk }));
  void recordWebhookAuth(sigOk, keyOk, { raw: sigRaw, restringified: sigRestringified });
  if (!sigOk && !keyOk) {
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
  // null = no control plane to ask; true = this delivery owns the post-call
  // side effects; false = a retry or replay, they already went out.
  let notifyClaim: boolean | null = null;

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
        if (res.skipped) {
          // Older than the row: a retried call_started after call_ended, or a
          // partial transcript after the final one. Nothing was written.
          console.log("retell_event_stale", event, n.retellCallId);
        }
        void recordDelivery(db, routed.tenantId, res.call_id ?? null, {
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
        // a copy that does not finish is retried by the reconcile sweep.
        if (
          n.recordingUrl &&
          res.recording_state !== "stored" && res.recording_state !== "failed" &&
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
    const from = (call.from_number || "").replace(/^\+/, "");
    const summary = n.summary || "(no summary)";
    const sentiment = n.sentiment || "n/a";
    const durationS = n.durationMs ? Math.round(n.durationMs / 1000) : 0;

    // Resolve the tenant ONCE for this block. Both the thread note and the
    // summary email are tenant-scoped, and resolving it twice invites the two
    // to disagree.
    const db2 = pg();
    const routedForCall = db2 && n.agentId ? await resolveChannel(db2, "voice", n.agentId) : null;

    // cross-channel memory for the pre-Gate-1b bot (Blob is still its context)
    if (from) {
      try {
        // Resolved from the SAME agent routing the call row used, so a voice
        // note lands in the right business's thread rather than a shared one.
        const noteNs = threadNamespace(routedForCall?.tenantId ?? null);
        const t = await getThread(noteNs, from);
        t.history.push({
          role: "assistant",
          content: `[voice call note ${new Date().toISOString().slice(0, 16)}] Caller phoned the salon line. Summary: ${String(summary).slice(0, 400)}`,
        });
        await saveThread(noteNs, from, t);
      } catch (e) { console.error("call_note_failed", e instanceof Error ? e.message : e); }
    }

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
        subject: `Voice call: ${call.from_number || "unknown"} (${durationS}s, ${sentiment})`,
        body:
          `AI phone agent handled a call on ${call.to_number || "the business line"}.\n\n` +
          `From: ${call.from_number || "unknown"}\nDuration: ${durationS}s\nSentiment: ${sentiment}\n` +
          `Disconnection: ${n.disconnectionReason || "n/a"}\n\n` +
          `Summary:\n${summary}\n\n` +
          `Transcript:\n${String(n.transcript || "(none)").slice(0, 3000)}`,
        redactedBody: `A voice call was handled for a workspace (${durationS}s). The summary and transcript were withheld.`,
      },
    );
  }
  return json(200, { ok: true });
}
