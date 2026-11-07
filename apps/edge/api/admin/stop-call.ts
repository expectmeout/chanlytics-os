/**
 * POST /api/admin/stop-call: ends a live call from the dashboard, POST /v2/stop-call at the provider: the one way a
 * hosted agent's call is ended from outside it.
 *
 * The door is the knock (authorizeAdmin: the per-call token, for this door's audience) and the body (readBody);
 * stopLiveCall in lib/voice/call-controls.ts is everything after: the provider key, the call's workspace (findRefusedCall)
 * and the provider.
 */
import { authorizeAdmin } from "../../lib/shared/admin-auth.js";
import { readBody } from "../../lib/shared/admin-door.js";
import { adminDoor } from "../../lib/shared/log.js";
import { stopLiveCall } from "../../lib/voice/call-controls.js";
import { STOP_CALL_DOOR } from "@chanlytics/contracts";

const AUD = "/api/admin/stop-call";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, AUD);
  if (!auth.ok) return auth.response;
  return stopLiveCall(auth, AUD, await readBody(request, STOP_CALL_DOOR));
});
