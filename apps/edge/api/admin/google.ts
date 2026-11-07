/**
 * POST /api/admin/google: a workspace's listing on Google Maps, found and read; its Business Profile, connected and
 * answered from. Signed admin token only; the dashboard's /api/v1/google verbs call it for an owner or an operator.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); runGoogleOp in lib/google/admin.ts is the table
 * of ops over lib/google/ops.ts's plans, and the header of that module lists them.
 */
import { authorizeAdmin } from "../../lib/shared/admin-auth.js";
import { readBody } from "../../lib/shared/admin-door.js";
import { adminDoor } from "../../lib/shared/log.js";
import { runGoogleOp } from "../../lib/google/admin.js";
import { GOOGLE_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/google");
  if (!auth.ok) return auth.response;
  return runGoogleOp(auth, await readBody(request, GOOGLE_DOOR));
});
