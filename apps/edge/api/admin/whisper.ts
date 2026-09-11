/**
 * Whisper to the phone receptionist mid-call.
 *
 * The one control the phone provider offers over a hosted agent's live call:
 * a sentence injected into the agent's context that only the agent hears and
 * works into its next answer (Retell update-live-call). No listen-in, no
 * take-over, no hang-up exist for hosted agents, which is why the Live page
 * offers exactly this and nothing else.
 *
 * Internal endpoint — x-diag-key, called by the dashboard's whisper route
 * AFTER RLS has proved the call belongs to the operator's workspace and the
 * role door has been checked there. The provider key lives here, so this is
 * where the provider is spoken to. Body: { call_id, text, trigger }.
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { updateLiveCall } from "../../lib/workspace/channels.js";
import { frameWhisper } from "../../lib/workspace/contracts.js";

/** One answer's worth. A whisper is worked into the next thing said. */
const MAX_CHARS = 500;

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/whisper");
  if (!auth.ok) return auth.response;
  if (!process.env.RETELL_API_KEY) return json(503, { ok: false, error: "no_provider_key" });

  let body: { call_id?: string; text?: string; trigger?: boolean } = {};
  try { body = JSON.parse(await request.text()); } catch { /* below */ }
  const callId = String(body.call_id || "");
  const text = String(body.text || "").trim();
  if (!/^call_[A-Za-z0-9]{8,}$/.test(callId) || !text || text.length > MAX_CHARS) {
    return json(400, { ok: false, error: "call_id + text (1-500 chars) required" });
  }

  const r = await updateLiveCall(
    { apiKey: process.env.RETELL_API_KEY },
    callId,
    // Framed as the owner's instruction, not loose context — see contracts/whisper.ts.
    { additionalContext: frameWhisper(text), triggerResponse: body.trigger === true },
  );
  // The words are the operator's and stay out of the log; the length and the
  // outcome are what a search needs.
  console.log("admin_whisper", JSON.stringify({ call_id: callId, chars: text.length, ok: r.ok, status: r.status }));
  if (!r.ok) return json(502, { ok: false, error: "provider_refused", status: r.status });
  return json(200, { ok: true });
}
