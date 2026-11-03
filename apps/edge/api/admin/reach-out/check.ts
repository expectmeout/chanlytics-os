/**
 * POST /api/admin/reach-out/check: the check of the emails a person pressed Rewrite the opening on, now (00505), so the
 * new opening is back while they look; the clock checks any it does not.
 *
 * The door is the knock (authorizeAdmin: the per-call token, whose workspace checkPressedSends reads with
 * tokenWorkspace) and the body (readBody); checkPressedSends in lib/reach-out/check-sweep.ts is everything after.
 */
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { readBody } from "../../../lib/admin-door.js";
import { adminDoor } from "../../../lib/log.js";
import { checkPressedSends } from "../../../lib/reach-out/check-sweep.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/reach-out/check");
  if (!auth.ok) return auth.response;
  return checkPressedSends(auth, await readBody(request));
});
