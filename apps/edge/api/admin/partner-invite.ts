/**
 * POST /api/admin/partner-invite: tells the partner a workspace's owner asked to join it, by email, which workspace and
 * where to answer: the address is the partner's own account's, read here, never one the call carries.
 *
 * The door is the knock (authorizeAdmin: a signed admin token for this door) and the body (readBody); sendPartnerInvite
 * in lib/partners/partner-invite.ts is everything after.
 */
import { authorizeAdmin } from "../../lib/shared/admin-auth.js";
import { readBody } from "../../lib/shared/admin-door.js";
import { adminDoor } from "../../lib/shared/log.js";
import { sendPartnerInvite } from "../../lib/partners/partner-invite.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/partner-invite");
  if (!auth.ok) return auth.response;
  return sendPartnerInvite(auth, await readBody(request));
});
