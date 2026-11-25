/**
 * POST /api/admin/files/bring-in: a link the owner's card brought in (a website, an Instagram account), for the dashboard,
 * which holds neither the reader nor the scraping platform's key.
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the member and the workspace);
 * bringInLink in lib/imports/bring-in.ts is everything after.
 */
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { readBody } from "../../../lib/shared/admin-door.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { bringInLink } from "../../../lib/imports/bring-in.js";
import { FILE_BRING_IN_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/files/bring-in");
  if (!auth.ok) return auth.response;
  const read = await readBody(request, FILE_BRING_IN_DOOR);
  if (!read.ok) return read.response;
  return bringInLink(auth, read.body);
});
