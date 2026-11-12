/**
 * POST /api/admin/whatsapp/templates-edit: a template's words changed and sent back to Meta. Signed admin token only.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); editWhatsappTemplate in lib/whatsapp/template-admin.ts
 * is everything after: the row, the number's own credentials and Meta.
 */
import { readBody } from "../../../lib/shared/admin-door.js";
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { editWhatsappTemplate } from "../../../lib/whatsapp/template-admin.js";
import { WHATSAPP_TEMPLATES_EDIT_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/whatsapp/templates-edit");
  if (!auth.ok) return auth.response;
  return editWhatsappTemplate(auth, await readBody(request, WHATSAPP_TEMPLATES_EDIT_DOOR));
});
