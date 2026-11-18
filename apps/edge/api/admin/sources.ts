/**
 * POST /api/admin/sources: a business's footage sources (the footage sources plan): its Google Drive connected and
 * disconnected, the folder chooser's read, a folder watched, checked or stopped. The dashboard's server calls it for a
 * member who may change the workspace's settings; the OAuth client, the tokens and Google's wire live on the edge and
 * nowhere else.
 *
 * The door is the knock (authorizeAdmin, which holds the token to the body it was minted for) and the body
 * (readBody); runSourcesOp in lib/files/sources/ops.ts is the op table and what each answer means.
 */
import { SOURCES_DOOR } from "@chanlytics/contracts";
import { authorizeAdmin } from "../../lib/shared/admin-auth.js";
import { readBody } from "../../lib/shared/admin-door.js";
import { adminDoor } from "../../lib/shared/log.js";
import { runSourcesOp } from "../../lib/files/sources/ops.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/sources");
  if (!auth.ok) return auth.response;
  return runSourcesOp(auth, await readBody(request, SOURCES_DOOR));
});
