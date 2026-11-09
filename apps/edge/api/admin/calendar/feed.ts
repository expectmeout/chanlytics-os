/**
 * POST /api/admin/calendar/feed: the calendar a workspace reads through its mailbox's grant, as iCal (decision 0073,
 * R20), for the dashboard's readers, which hold no grant.
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the member and the workspace) and
 * the body (readBody); grantFeedFor in lib/calendar/mailbox-calendar.ts is everything after.
 */
import { readBody } from "../../../lib/shared/admin-door.js";
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { grantFeedFor } from "../../../lib/calendar/mailbox-calendar.js";
import { CALENDAR_FEED_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/calendar/feed");
  if (!auth.ok) return auth.response;
  return grantFeedFor(auth, await readBody(request, CALENDAR_FEED_DOOR));
});
