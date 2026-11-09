/**
 * POST /api/admin/email/alert-test: emails a workspace's alert addresses once, when a member asks Settings › Notifications to
 * send a test (decision 0040).
 *
 * The door is the knock (authorizeAdmin: a signed admin token for this door) and the body (readBody); sendAlertTest in
 * lib/ops/you-are-live.ts, beside the first run's other mail to the same addresses, is everything after.
 */
import { readBody } from "../../../lib/shared/admin-door.js";
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { sendAlertTest } from "../../../lib/ops/you-are-live.js";
import { ALERT_TEST_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/email/alert-test");
  if (!auth.ok) return auth.response;
  return sendAlertTest(auth, await readBody(request, ALERT_TEST_DOOR));
});
