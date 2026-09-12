/**
 * End a live call from the dashboard.
 *
 * POST /v2/stop-call at the provider: the one way a hosted agent's call is
 * ended from outside it. The provider's own dashboard can also end a call,
 * and can listen to its audio and put a person on the line from a browser
 * microphone; neither of those two is offered by its API, which is why the
 * Live page offers what is -- a sentence into the call, a hand-over to the
 * business's own line, and this.
 *
 * Internal endpoint -- the per-call token, called by the dashboard's end
 * route AFTER RLS has proved the call belongs to the operator's workspace
 * and the role door has been checked there. The provider key lives here, so
 * this is where the provider is spoken to. Body: { call_id }.
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { stopCall } from "../../lib/workspace/channels.js";

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/stop-call");
  if (!auth.ok) return auth.response;
  if (!process.env.RETELL_API_KEY) return json(503, { ok: false, error: "no_provider_key" });

  let body: { call_id?: string } = {};
  try { body = JSON.parse(await request.text()); } catch { /* below */ }
  const callId = String(body.call_id || "");
  if (!/^call_[A-Za-z0-9]{8,}$/.test(callId)) return json(400, { ok: false, error: "call_id required" });

  const r = await stopCall({ apiKey: process.env.RETELL_API_KEY }, callId);
  console.log("admin_stop_call", JSON.stringify({ call_id: callId, ok: r.ok, status: r.status }));
  if (!r.ok) return json(502, { ok: false, error: "provider_refused", status: r.status });
  return json(200, { ok: true });
}
