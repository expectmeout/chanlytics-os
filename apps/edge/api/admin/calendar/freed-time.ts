/**
 * POST /api/admin/calendar/freed-time: an hour a cancellation freed, offered now because a member pressed Offer it on
 * Today's day (Today in three zones, 2 Nov 2026; decision 0082). The offer the edge makes when a cancellation arrives,
 * asked by hand.
 *
 * The door is the knock (authorizeAdmin: a signed admin token for this door) and the body (readBody); offerFreedTimeNow
 * in lib/calendar/freed-time-now.ts is everything after.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { offerFreedTimeNow } from "../../../lib/calendar/freed-time-now.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/calendar/freed-time");
  if (!auth.ok) return auth.response;
  return offerFreedTimeNow(auth, await readBody(request));
});
