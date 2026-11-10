/**
 * POST /api/admin/meta/connection: a business's Instagram account connected through Meta (decision 0117, Instagram API
 * with Unified Login), disconnected, or asked whether it can be. Signed admin token only; the dashboard's
 * /api/v1/channels/meta routes call it for an owner or a manager. The Meta app's secret, the tokens and Meta's wire live on
 * the edge and nowhere else.
 *
 * The door reads the body once as text (the token's body hash is checked over these bytes) and asks authorizeAdmin;
 * runMetaOp in lib/instagram/meta-connect.ts is the op table and what each answer means.
 */
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { readBody } from "../../../lib/shared/admin-door.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { runMetaOp } from "../../../lib/instagram/meta-connect.js";
import { META_CONNECTION_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const body = await readBody(raw, META_CONNECTION_DOOR);
  const auth = await authorizeAdmin(request, "/api/admin/meta/connection", { body: raw });
  if (!auth.ok) return auth.response;
  return runMetaOp(auth, body);
});
