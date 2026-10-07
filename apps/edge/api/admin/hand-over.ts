/**
 * POST /api/admin/hand-over: hands a live call to the business: the receptionist is told the owner is picking up and
 * transfers the caller to the business's own line (transfer_to_staff, a warm transfer to the workspace's handoff
 * number).
 *
 * The door is the knock (authorizeAdmin: the per-call token, for this door's audience) and the body (readBody);
 * handOverCall in lib/voice/call-controls.ts is everything after: the provider key, the call's workspace (refusedCall)
 * and the provider.
 */
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { readBody } from "../../lib/admin-door.js";
import { adminDoor } from "../../lib/log.js";
import { handOverCall } from "../../lib/voice/call-controls.js";

const AUD = "/api/admin/hand-over";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, AUD);
  if (!auth.ok) return auth.response;
  return handOverCall(auth, AUD, await readBody(request));
});
