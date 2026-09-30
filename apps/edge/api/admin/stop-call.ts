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
 * and the role door has been checked there. The token names that workspace,
 * and the call must be its (lib/voice/live-call-door.ts). The provider key
 * lives here, so this is where the provider is spoken to. Body: { call_id }.
 */
import { json, refuse } from "../../lib/http.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { readBody } from "../../lib/admin-door.js";
import { refusedCall } from "../../lib/voice/live-call-door.js";
import { stopCall } from "../../lib/packages/channels.js";
import { env } from "../../lib/env.js";
import { logger, adminDoor } from "../../lib/log.js";

const L = logger();

const AUD = "/api/admin/stop-call";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, AUD);
  if (!auth.ok) return auth.response;
  if (!env.RETELL_API_KEY) return refuse(503, "no_provider_key");

  const body = await readBody<{ call_id?: string }>(request);
  const callId = String(body.call_id || "");
  if (!/^call_[A-Za-z0-9]{8,}$/.test(callId)) return refuse(400, "bad_request", "call_id required");
  const notYours = await refusedCall(auth, AUD, callId);
  if (notYours) return notYours;

  const r = await stopCall({ apiKey: env.RETELL_API_KEY }, callId);
  L.info("admin_stop_call", { call_id: callId, ok: r.ok, status: r.status });
  if (!r.ok) return json(502, { ok: false, error: "provider_refused", status: r.status });
  return json(200, { ok: true });
});
