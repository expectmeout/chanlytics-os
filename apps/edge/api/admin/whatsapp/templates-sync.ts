/**
 * POST /api/admin/whatsapp/templates-sync: one workspace's templates, as Meta holds them, into the templates table.
 * Signed admin token only.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); syncWhatsappTemplates in
 * lib/whatsapp/template-admin.ts is everything after: the channel row, the number's own credentials and Meta.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { syncWhatsappTemplates } from "../../../lib/whatsapp/template-admin.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/whatsapp/templates-sync");
  if (!auth.ok) return auth.response;
  return syncWhatsappTemplates(auth, await readBody(request));
});
