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
import { getThread, saveThread } from "../lib/store.js";
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

    // cross-channel memory for the pre-Gate-1b bot (Blob is still its context)
    if (from) {
      try {
        const t = await getThread(from);
        t.history.push({
          role: "assistant",
          content: `[voice call note ${new Date().toISOString().slice(0, 16)}] Caller phoned the salon line. Summary: ${String(summary).slice(0, 400)}`,
        });
        await saveThread(from, t);
      } catch (e) { console.error("call_note_failed", e instanceof Error ? e.message : e); }
    }

    // same lead pipeline as WhatsApp escalations
    if (process.env.RESEND_API_KEY) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.LEAD_FROM || "Melany's Website <onboarding@resend.dev>",
            to: [process.env.LEAD_TO || "ruben@rjcapital.io"],
            subject: `Voice call: ${call.from_number || "unknown"} (${durationS}s, ${sentiment})`,
            text:
              `AI phone agent handled a call on ${call.to_number || "the salon ads line"}.\n\n` +
              `From: ${call.from_number || "unknown"}\nDuration: ${durationS}s\nSentiment: ${sentiment}\n` +
              `Disconnection: ${n.disconnectionReason || "n/a"}\n\n` +
              `Summary:\n${summary}\n\n` +
              `Transcript:\n${String(n.transcript || "(none)").slice(0, 3000)}`,
          }),
        });
      } catch (e) { console.error("call_email_failed", e instanceof Error ? e.message : e); }
    }
  }
  return json(200, { ok: true });
}
