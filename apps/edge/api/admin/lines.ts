/**
 * POST /api/admin/lines: a workspace's phone line, searched, bought, retried, released, recorded and registered with
 * the carriers. Signed admin token only; the dashboard's lines verbs call it.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); runLineOp in lib/lines/admin.ts is the table of ops
 * over lib/lines/ops/filing.ts's plans, and the header of that module lists them.
 */
import { authorizeAdmin } from "../../lib/shared/admin-auth.js";
import { readBody } from "../../lib/shared/admin-door.js";
import { adminDoor } from "../../lib/shared/log.js";
import { runLineOp } from "../../lib/lines/admin.js";
import { LINES_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/lines");
  if (!auth.ok) return auth.response;
  return runLineOp(auth, await readBody(request, LINES_DOOR));
});
