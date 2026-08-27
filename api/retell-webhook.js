/**
 * Retell post-call webhook — call_started / call_ended / call_analyzed.
 * On call_analyzed: email a summary via Resend (same lead pipeline as WhatsApp)
 * and note the call on the caller's Blob thread (cross-channel memory).
 */
import { verifyRetellSignature, readRaw } from "../lib/retell.js";
import { getThread, saveThread } from "../lib/store.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const raw = await readRaw(req);
  const sigOk = verifyRetellSignature(raw, req.headers["x-retell-signature"], process.env.RETELL_API_KEY);
  const keyOk = (req.query || {}).key === process.env.RETELL_FN_SECRET;
  if (!sigOk && !keyOk) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  let body = {};
  try { body = JSON.parse(raw); } catch { return res.status(200).json({ ok: true }); }
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
      } catch (e) { console.error("call_note_failed", e && e.message); }
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
      } catch (e) { console.error("call_email_failed", e && e.message); }
    }
  }
  return res.status(200).json({ ok: true });
}
