/**
 * POST /api/admin/files/play: the player's address for one of a business's videos (decision 0099, stage B), under an hour's
 * token signed here, for the dashboard, which holds no signing key. One knock per sheet opened, none per tile.
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the member and the workspace);
 * signVideoPlay in lib/files/video-doors.ts is everything after.
 */
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { signVideoPlay } from "../../../lib/files/video-doors.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/files/play");
  if (!auth.ok) return auth.response;
  return signVideoPlay(auth, request);
});
