/**
 * POST /api/admin/files/listen: Ask's question about a stretch of a business's video (decision 0099, stage B, D19), put to the
 * ear with the sound kept in the file's folder, for the dashboard, which holds no ear's key.
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the member and the workspace);
 * listenToVideo in lib/files/video-doors.ts is everything after.
 */
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { readBody } from "../../../lib/shared/admin-door.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { listenToVideo } from "../../../lib/files/video-doors.js";
import { FILE_LISTEN_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/files/listen");
  if (!auth.ok) return auth.response;
  return listenToVideo(auth, await readBody(request, FILE_LISTEN_DOOR));
});
