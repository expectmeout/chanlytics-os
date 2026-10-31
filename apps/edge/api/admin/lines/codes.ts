/**
 * GET /api/admin/lines/codes: the one-time codes texted to a workspace's own line in the last fifteen minutes, read from the
 * provider's own record. Signed admin token only, for the workspace the token names; the dashboard's GET /api/v1/lines/codes
 * (owners only) is its sole caller.
 *
 * The door is the knock (authorizeAdmin); lineCodes in lib/lines/line-codes.ts is everything after: the line, its account, the
 * provider's list and the one rule that says what a code is.
 */
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { lineCodes } from "../../../lib/lines/line-codes.js";

const AUD = "/api/admin/lines/codes";

export const GET = adminDoor(async function GET(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, AUD);
  if (!auth.ok) return auth.response;
  return lineCodes(auth);
});
