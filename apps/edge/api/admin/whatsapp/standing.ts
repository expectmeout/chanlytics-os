/**
 * POST /api/admin/whatsapp/standing: an owner asks what Meta holds about the workspace's WhatsApp number now: whether it may
 * send, what stands in the way, its display name's review, the business's verification and tier. Signed admin token only; the
 * dashboard's POST /api/v1/channels/whatsapp/standing (owners only) is its sole caller.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); checkNumberStanding in lib/whatsapp/number-standing.ts is
 * everything after: the workspace's number and its own credentials, the one reading, the keeping and the telling.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { checkNumberStanding } from "../../../lib/whatsapp/number-standing.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/whatsapp/standing");
  if (!auth.ok) return auth.response;
  return checkNumberStanding(auth, await readBody(request));
});
