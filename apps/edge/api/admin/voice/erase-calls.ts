/**
 * POST /api/admin/voice/erase-calls: an erased person's calls taken off the voice provider (decision 0036's provider leg,
 * decision 0092). The dashboard's erasure asks it with the call ids it read off the person's rows, before the rows go.
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the workspace and the member) and
 * the body (readBody); eraseCallsDoor in lib/voice/erase-calls.ts proves each call the workspace's and does the rest.
 */
import { readBody } from "../../../lib/shared/admin-door.js";
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { eraseCallsDoor } from "../../../lib/voice/erase-calls.js";
import { ERASE_CALLS_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/voice/erase-calls");
  if (!auth.ok) return auth.response;
  return eraseCallsDoor(auth, await readBody(request, ERASE_CALLS_DOOR));
});
