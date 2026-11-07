/**
 * POST /api/admin/previews/make: a member's press of Make their preview on a lead (decision 0079), asked by the
 * dashboard's lead route. Signed admin token only.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); makePreviewFor in lib/previews/make.ts is the one way a
 * preview is made, the sender's too (askPreview).
 */
import { readBody } from "../../../lib/shared/admin-door.js";
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { makePreviewFor } from "../../../lib/previews/make.js";
import { PREVIEW_MAKE_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/previews/make");
  if (!auth.ok) return auth.response;
  return makePreviewFor(auth, await readBody(request, PREVIEW_MAKE_DOOR));
});
