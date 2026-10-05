/**
 * POST /api/admin/whatsapp/templates-create: a template written in Chanlytics, submitted to Meta for review, kept as a
 * row. Signed admin token only.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); createWhatsappTemplate in
 * lib/whatsapp/template-admin.ts is everything after: the channel row, the number's own credentials and Meta.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { createWhatsappTemplate } from "../../../lib/whatsapp/template-admin.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/whatsapp/templates-create");
  if (!auth.ok) return auth.response;
  return createWhatsappTemplate(auth, await readBody(request));
});
