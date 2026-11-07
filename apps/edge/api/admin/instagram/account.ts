/**
 * POST /api/admin/instagram/account: a business's Instagram professional account connected to its workspace, and disconnected
 * (decision 0001, step 8). Signed admin token only; the dashboard's /api/v1/channels/instagram routes call it for an
 * owner or a manager. The app's secret, the tokens and Instagram's wire live on the edge and nowhere else.
 *
 * The door reads the body once as text (the token's body hash is checked over these bytes) and asks authorizeAdmin;
 * runInstagramOp in lib/instagram/connect.ts is the op table and what each answer means.
 */
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { readBody } from "../../../lib/shared/admin-door.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { runInstagramOp } from "../../../lib/instagram/connect.js";
import { INSTAGRAM_ACCOUNT_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const body = await readBody(raw, INSTAGRAM_ACCOUNT_DOOR);
  const auth = await authorizeAdmin(request, "/api/admin/instagram/account", { body: raw });
  if (!auth.ok) return auth.response;
  return runInstagramOp(auth, body);
});
