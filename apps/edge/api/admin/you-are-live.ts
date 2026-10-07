/**
 * POST /api/admin/you-are-live: emails a workspace's owner that the receptionist is answering, after the first run's
 * Finish recorded its first activation.
 *
 * The door is the knock (authorizeAdmin: a signed admin token for this door) and the body (readBody); sendYouAreLive in
 * lib/ops/you-are-live.ts is everything after.
 */
import { readBody } from "../../lib/admin-door.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { adminDoor } from "../../lib/log.js";
import { sendYouAreLive } from "../../lib/ops/you-are-live.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/you-are-live");
  if (!auth.ok) return auth.response;
  return sendYouAreLive(auth, await readBody(request));
});
