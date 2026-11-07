/**
 * POST /api/admin/files/video-start: a member's video about to be sent (decision 0099, stage B), for the dashboard, which holds
 * no Stream token: a reservation at Stream for the browser's own upload, and the row with every fact the browser gave.
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the member and the workspace);
 * startVideoUpload in lib/files/video-doors.ts is everything after.
 */
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { readBody } from "../../../lib/shared/admin-door.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { startVideoUpload } from "../../../lib/files/video-doors.js";
import { FILE_VIDEO_START_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/files/video-start");
  if (!auth.ok) return auth.response;
  return startVideoUpload(auth, await readBody(request, FILE_VIDEO_START_DOOR));
});
