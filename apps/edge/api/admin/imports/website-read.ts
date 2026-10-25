/**
 * POST /api/admin/imports/website-read: a read of the workspace's website for the first run's Check (decision 0073, R10), asked
 * by the dashboard as its receptionist is set up or its website saved.
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the member and the workspace) and
 * the body (readBody); askWebsiteRead in lib/imports/website-read.ts is everything after.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { askWebsiteRead } from "../../../lib/imports/website-read.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/imports/website-read");
  if (!auth.ok) return auth.response;
  return askWebsiteRead(auth, await readBody(request));
});
