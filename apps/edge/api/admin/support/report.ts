/**
 * POST /api/admin/support/report: mails a member's Report a problem to the support inbox, its Reply-To their address.
 *
 * The door is the knock (authorizeAdmin: a signed admin token for this door) and the body (readBody); mailSupportReport
 * in lib/support.ts is everything after.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { mailSupportReport } from "../../../lib/support.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/support/report");
  if (!auth.ok) return auth.response;
  return mailSupportReport(auth, await readBody(request));
});
