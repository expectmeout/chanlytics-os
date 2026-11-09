/**
 * POST /api/admin/rehearsal/call: a rehearsal in the browser for one workspace (decision 0069): the web call the
 * owner's browser joins, its token, and what the page says beside it.
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the member and the workspace) and
 * the body (readBody); startRehearsalCall in lib/voice/rehearsal-call.ts is everything after.
 */
import { readBody } from "../../../lib/shared/admin-door.js";
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { startRehearsalCall } from "../../../lib/voice/rehearsal-call.js";
import { REHEARSAL_CALL_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/rehearsal/call");
  if (!auth.ok) return auth.response;
  return startRehearsalCall(auth, await readBody(request, REHEARSAL_CALL_DOOR));
});
