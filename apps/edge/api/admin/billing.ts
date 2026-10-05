/**
 * POST /api/admin/billing: a workspace's way to pay. Signed admin token only; the dashboard's /api/v1/billing verbs
 * call it for an owner.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); billingOp in lib/billing/billing-admin.ts is the
 * workspace's row and slug and the dispatch, over the routines of lib/billing/billing.ts and the words of
 * lib/billing/billing-ops.ts, and the header of that module lists the ops.
 */
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { readBody } from "../../lib/admin-door.js";
import { adminDoor } from "../../lib/log.js";
import { billingOp } from "../../lib/billing/billing-admin.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/billing");
  if (!auth.ok) return auth.response;
  return billingOp(auth, await readBody(request));
});
