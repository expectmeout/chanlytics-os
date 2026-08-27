/**
 * Retell post-call webhook — call_started / call_ended / call_analyzed.
 * On call_analyzed: email a summary via Resend (same lead pipeline as WhatsApp)
 * and note the call on the caller's Blob thread (cross-channel memory).
 */
import { verifyRetellSignature } from "../lib/retell.js";
import { getThread, saveThread } from "../lib/store.js";
import { json } from "../lib/http.js";

interface RetellCall {
  call_id?: string;
  from_number?: string;
  to_number?: string;
  duration_ms?: number;
  transcript?: string;
  disconnection_reason?: string;
  call_analysis?: { call_summary?: string; user_sentiment?: string };
}

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

  if (event === "call_analyzed" && call) {
    const from = (call.from_number || "").replace(/^\+/, "");
    const analysis = call.call_analysis || {};
    const summary = analysis.call_summary || "(no summary)";
    const sentiment = analysis.user_sentiment || "n/a";
    const durationS = call.duration_ms ? Math.round(call.duration_ms / 1000) : 0;

    // cross-channel memory: note the call on the caller's thread
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
              `Disconnection: ${call.disconnection_reason || "n/a"}\n\n` +
              `Summary:\n${summary}\n\n` +
              `Transcript:\n${String(call.transcript || "(none)").slice(0, 3000)}`,
          }),
        });
      } catch (e) { console.error("call_email_failed", e instanceof Error ? e.message : e); }
    }
  }
  return json(200, { ok: true });
}
