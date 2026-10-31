/**
 * POST /api/admin/previews/make: a member's press of Make their preview on a lead (decision 0079), asked by the
 * dashboard's lead route. Signed admin token only.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); makePreviewFor in lib/previews/make.ts is the one way a
 * preview is made, the sender's too (askPreview).
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { makePreviewFor } from "../../../lib/previews/make.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/previews/make");
  if (!auth.ok) return auth.response;
  return makePreviewFor(auth, await readBody(request));
});
