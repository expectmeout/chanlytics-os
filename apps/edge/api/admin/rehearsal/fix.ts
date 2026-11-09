/**
 * POST /api/admin/rehearsal/fix: Where a fix goes: the owner's correction routed to one settings change, nothing written (decision 0069).
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the member and the workspace) and
 * the body (readBody); routeCorrection in lib/receptionist/review.ts is everything after.
 */
import { readBody } from "../../../lib/shared/admin-door.js";
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { routeCorrection } from "../../../lib/receptionist/review.js";
import { REHEARSAL_FIX_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/rehearsal/fix");
  if (!auth.ok) return auth.response;
  return routeCorrection(auth, await readBody(request, REHEARSAL_FIX_DOOR));
});
