/**
 * Hand a live call to the business.
 *
 * The receptionist is told the owner is picking up, and transfers the caller
 * to the business's own line with the tool it already has -- transfer_to_staff,
 * a warm transfer to the workspace's handoff number. The same hand-off a
 * caller gets when they ask for a person, asked for by the owner instead. The
 * provider's dashboard can put a person on the line from a browser microphone;
 * its API cannot, so this is the take-over a hosted agent allows.
 *
 * Two things ride in one update. The line, as an override of the call's
 * handoff_number variable: the tool dials the variable, which was filled at
 * call start from the profile, and a line added since -- or a call that began
 * before there was one -- would otherwise dial nothing. And the directive,
 * composed HERE from contracts and never taken from the body: the dashboard
 * cannot send platform-voiced text of its own into a call. It is triggered,
 * unlike a whisper, because a hand-over is an instruction to act now, not a
 * thought to keep in mind.
 *
 * Internal endpoint -- the per-call token, called by the dashboard's hand-over
 * route AFTER RLS has proved the call belongs to the operator's workspace and
 * the role door has been checked there. Body: { call_id, line }.
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { updateLiveCall } from "../../lib/workspace/channels.js";
import { frameHandOver } from "../../lib/workspace/contracts.js";

const E164 = /^\+[1-9]\d{6,14}$/;

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/hand-over");
  if (!auth.ok) return auth.response;
  if (!process.env.RETELL_API_KEY) return json(503, { ok: false, error: "no_provider_key" });

  let body: { call_id?: string; line?: string } = {};
  try { body = JSON.parse(await request.text()); } catch { /* below */ }
  const callId = String(body.call_id || "");
  const line = String(body.line || "").trim();
  if (!/^call_[A-Za-z0-9]{8,}$/.test(callId) || !E164.test(line)) {
    return json(400, { ok: false, error: "call_id + line (E.164) required" });
  }

  const r = await updateLiveCall(
    { apiKey: process.env.RETELL_API_KEY },
    callId,
    { additionalContext: frameHandOver(), triggerResponse: true, variables: { handoff_number: line } },
  );
  // The line is the business's own and stays out of the log; the outcome is
  // what a search needs.
  console.log("admin_hand_over", JSON.stringify({ call_id: callId, ok: r.ok, status: r.status }));
  if (!r.ok) return json(502, { ok: false, error: "provider_refused", status: r.status });
  return json(200, { ok: true });
}
