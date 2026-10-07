/**
 * POST /api/admin/whatsapp/connect: a business's WhatsApp number becomes a channel of its workspace, from what Embedded
 * Signup gave the dashboard's browser. Signed admin token only.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); connectWhatsAppNumber in
 * lib/whatsapp/connect-number.ts turns the code into the business's own token, proves the number is the WABA's,
 * subscribes and registers it, writes the channel and puts the token in Vault.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { connectWhatsAppNumber } from "../../../lib/whatsapp/connect-number.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/whatsapp/connect");
  if (!auth.ok) return auth.response;
  return connectWhatsAppNumber(auth, await readBody(request));
});
