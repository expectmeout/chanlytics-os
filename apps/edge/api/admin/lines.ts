/**
 * POST /api/admin/lines: a workspace's phone line, searched, bought, retried, released, recorded and registered with
 * the carriers. Signed admin token only; the dashboard's lines verbs call it.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); lineOp in lib/lines/line-admin.ts is the table of ops
 * over lib/lines/line-ops.ts's plans, and the header of that module lists them.
 */
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { readBody } from "../../lib/admin-door.js";
import { adminDoor } from "../../lib/log.js";
import { lineOp } from "../../lib/lines/line-admin.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/lines");
  if (!auth.ok) return auth.response;
  return lineOp(auth, await readBody(request));
});
