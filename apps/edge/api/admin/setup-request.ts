/**
 * POST /api/admin/setup-request: tells the platform mailbox a workspace asked a person at Chanlytics for something the
 * product cannot provision yet.
 *
 * The door is the knock (authorizeAdmin: a signed admin token for this door) and the body (readBody);
 * notifySetupRequest in lib/ops/setup-request.ts is everything after.
 */
import { readBody } from "../../lib/admin-door.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { adminDoor } from "../../lib/log.js";
import { notifySetupRequest } from "../../lib/ops/setup-request.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/setup-request");
  if (!auth.ok) return auth.response;
  return notifySetupRequest(auth, await readBody(request));
});
