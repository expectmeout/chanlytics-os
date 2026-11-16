/**
 * GET /api/admin/previews/standing: whether a lead's preview is made at all just now (decision 0079's switch), asked by
 * the dashboard's lead route before it says one is made when an email goes. Signed admin token only.
 *
 * The door is the knock (authorizeAdmin); previewsStanding in lib/previews/make.ts is the answer.
 */
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { previewsStanding } from "../../../lib/previews/make.js";

const AUD = "/api/admin/previews/standing";

export const GET = adminDoor(async function GET(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, AUD);
  if (!auth.ok) return auth.response;
  return previewsStanding();
});
