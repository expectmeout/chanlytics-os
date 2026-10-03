/**
 * POST /api/admin/signup-notify: tells the platform mailbox somebody made a workspace.
 *
 * The door is the knock (authorizeAdmin: a signed admin token for this door) and the body (readBody); notifySignup in
 * lib/ops/signup-notify.ts is everything after.
 */
import { readBody } from "../../lib/admin-door.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { adminDoor } from "../../lib/log.js";
import { notifySignup } from "../../lib/ops/signup-notify.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/signup-notify");
  if (!auth.ok) return auth.response;
  return notifySignup(auth, await readBody(request));
});
