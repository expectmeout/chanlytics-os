/**
 * POST /api/admin/instagram/account: a business's Instagram professional account connected to its workspace, and disconnected
 * (decision 0001, step 8). Signed admin token only; the dashboard's /api/v1/channels/instagram routes call it for an
 * owner or a manager. The app's secret, the tokens and Instagram's wire live on the edge and nowhere else.
 *
 * The door reads the body once as text (the token's body hash is checked over these bytes) and asks authorizeAdmin;
 * instagramOp in lib/instagram/connect.ts is the op table and what each answer means.
 */
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { readBody } from "../../../lib/admin-door.js";
import { adminDoor } from "../../../lib/log.js";
import { instagramOp, type InstagramBody } from "../../../lib/instagram/connect.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const body = await readBody<InstagramBody>(raw);
  const auth = await authorizeAdmin(request, "/api/admin/instagram/account", { body: raw });
  if (!auth.ok) return auth.response;
  return instagramOp(auth, body);
});
