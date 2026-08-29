/**
 * Retell post-call webhook — call_started / call_ended / call_analyzed.
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
  fetchRecording,
  verifyRetellSignature,
  type RetellCall,
} from "../lib/workspace/channels.js";
import {
  resolveChannel,
  ingestCall,
  recordCallNote,
  linkCallMessage,
  setCallRecording,
  emitEvent,
} from "../lib/workspace/db.js";

export const config = { maxDuration: 60 };

const REC_EXT: Record<string, string> = {
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3",
  "audio/mp4": "m4a", "application/octet-stream": "wav",
};

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const sigOk = verifyRetellSignature(raw, request.headers.get("x-retell-signature"), process.env.RETELL_API_KEY);
  const keyOk = new URL(request.url).searchParams.get("key") === process.env.RETELL_FN_SECRET;
  if (!sigOk && !keyOk) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  let body: { event?: string; call?: RetellCall } = {};
  try { body = JSON.parse(raw); } catch { return json(200, { ok: true }); }
  const { event, call } = body;
  console.log("retell_event", event, call && call.call_id);
  if (!call?.call_id) return json(200, { ok: true });

  const n = normalizeCall(call);
  const db = pg();

  // ---- canonical calls row (additive; never breaks the legacy path) ----
  if (db && n.agentId) {
    try {
      const routed = await resolveChannel(db, "voice", n.agentId);
      if (!routed) {
        console.error("retell_unroutable_agent", n.agentId);
        await emitEvent(db, "00000000-0000-0000-0000-000000000000", "ingest.unroutable", "ingest", null, null,
          { channel: "voice", agent_id: n.agentId }).catch(() => {});
      } else {
        const res = await ingestCall(db, routed.tenantId, n, call);

        // the call belongs in the customer's one thread, not a silo
        if (res.conversation_id && (event === "call_analyzed" || n.status === "ended")) {
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

        // Retell serves recordings from an UNSIGNED public CDN URL — copy the
        // audio into the private bucket so a customer's call isn't one guessed
        // link away, and so it survives provider retention.
        if (n.recordingUrl && res.recording_state !== "stored" && (event === "call_analyzed" || n.status === "ended")) {
          try {
            const got = await fetchRecording(n.recordingUrl);
            if (got) {
              const ext = REC_EXT[got.mime || ""] || "wav";
              const path = `${routed.tenantId}/calls/${res.call_id}.${ext}`;
              const { error } = await db.storage.from("media").upload(path, got.bytes, {
                contentType: got.mime || "audio/wav",
                upsert: true,
              });
              if (error) throw new Error(error.message);
              await setCallRecording(db, routed.tenantId, res.call_id, {
                provider_url: n.recordingUrl,
                storage_path: path,
                fetch_state: "stored",
                mime: got.mime,
                bytes: got.bytes.byteLength,
              });
            } else {
              await setCallRecording(db, routed.tenantId, res.call_id, {
                provider_url: n.recordingUrl, fetch_state: "failed",
              });
            }
          } catch (e) {
            console.error("call_recording_copy_failed", e instanceof Error ? e.message : e);
          }
        }
      }
    } catch (e) {
      console.error("ingest_call_failed", e instanceof Error ? e.message : e);
    }
  }

  if (event === "call_analyzed") {
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
