/**
 * POST /api/admin/billing: a workspace's way to pay. Signed admin token only; the dashboard's /api/v1/billing verbs
 * call it for an owner.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); runBillingOp in lib/billing/admin.ts is the
 * workspace's row and slug and the dispatch, over the routines of lib/billing/billing.ts and the words of
 * lib/billing/ops.ts, and the header of that module lists the ops.
 */
import { authorizeAdmin } from "../../lib/shared/admin-auth.js";
import { readBody } from "../../lib/shared/admin-door.js";
import { adminDoor } from "../../lib/shared/log.js";
import { runBillingOp } from "../../lib/billing/admin.js";
import { BILLING_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/billing");
  if (!auth.ok) return auth.response;
  return runBillingOp(auth, await readBody(request, BILLING_DOOR));
});
