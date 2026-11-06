/**
 * POST /api/admin/support/report: mails a member's Report a problem to the support inbox, its Reply-To their address.
 *
 * The door is the knock (authorizeAdmin: a signed admin token for this door) and the body (readBody); mailSupportReport
 * in lib/support/support.ts is everything after.
 */
import { readBody } from "../../../lib/shared/admin-door.js";
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { mailSupportReport } from "../../../lib/support/support.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/support/report");
  if (!auth.ok) return auth.response;
  return mailSupportReport(auth, await readBody(request));
});
