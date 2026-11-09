/**
 * POST /api/admin/setup-request: tells the platform mailbox a workspace asked a person at Chanlytics for something the
 * product cannot provision yet.
 *
 * The door is the knock (authorizeAdmin: a signed admin token for this door) and the body (readBody);
 * notifySetupRequest in lib/ops/setup-request.ts is everything after.
 */
import { readBody } from "../../lib/shared/admin-door.js";
import { authorizeAdmin } from "../../lib/shared/admin-auth.js";
import { adminDoor } from "../../lib/shared/log.js";
import { notifySetupRequest } from "../../lib/ops/setup-request.js";
import { SETUP_REQUEST_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/setup-request");
  if (!auth.ok) return auth.response;
  return notifySetupRequest(auth, await readBody(request, SETUP_REQUEST_DOOR));
});
