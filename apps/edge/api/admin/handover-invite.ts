/**
 * POST /api/admin/handover-invite: writes to the owner a partner set a workspace up for, to say the handover is
 * waiting: the address is the one the handover holds, read here, never one the call carries.
 *
 * The door is the knock (authorizeAdmin: a signed admin token for this door) and the body (readBody);
 * sendHandoverInvite in lib/partners/handover-invite.ts is everything after.
 */
import { readBody } from "../../lib/admin-door.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { adminDoor } from "../../lib/log.js";
import { sendHandoverInvite } from "../../lib/partners/handover-invite.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/handover-invite");
  if (!auth.ok) return auth.response;
  return sendHandoverInvite(auth, await readBody(request));
});
