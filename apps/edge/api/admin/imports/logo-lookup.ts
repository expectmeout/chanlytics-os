/**
 * POST /api/admin/imports/logo-lookup: a look for the workspace's logo on the business's own website, asked by the
 * dashboard on the owner's press (00407), since the page is read here, where the reader's key is.
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the member and the workspace) and
 * the body (readBody); lookupLogoFor in lib/imports/logo-lookup.ts is everything after.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { lookupLogoFor } from "../../../lib/imports/logo-lookup.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/imports/logo-lookup");
  if (!auth.ok) return auth.response;
  return lookupLogoFor(auth, await readBody(request));
});
