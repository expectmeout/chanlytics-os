/** The edge's doors for a workspace's WhatsApp templates at Meta, as the dashboard knocks on them (decision 0109). */
import { z } from "zod";
import { DOOR_ID, answerFields, edgeDoor } from "../../shared/edge/door";

/** POST /api/admin/whatsapp/templates-create: a template filed with Meta for review. */
export const WHATSAPP_TEMPLATES_CREATE_DOOR = edgeDoor(
  "/api/admin/whatsapp/templates-create",
  z.object({
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    name: z.string().optional(),
    language: z.string().optional(),
    category: z.string().optional(),
    /** Meta's components, as the template is filed. */
    components: z.array(z.unknown()).optional(),
    body: z.string().optional(),
    examples: z.array(z.string()).optional(),
    labels: z.array(z.string()).optional(),
  }),
  answerFields({ id: z.string(), meta_status: z.string() }),
);

/** POST /api/admin/whatsapp/templates-delete: a template withdrawn at Meta. */
export const WHATSAPP_TEMPLATES_DELETE_DOOR = edgeDoor(
  "/api/admin/whatsapp/templates-delete",
  z.object({ tenant_id: DOOR_ID.optional(), template_id: z.string().optional() }),
  answerFields({ at_meta: z.boolean() }),
);

/** POST /api/admin/whatsapp/templates-sync: the templates' standing, read again from Meta. */
export const WHATSAPP_TEMPLATES_SYNC_DOOR = edgeDoor(
  "/api/admin/whatsapp/templates-sync",
  z.object({ tenant_id: DOOR_ID.optional() }),
  answerFields({ seen: z.number(), approved: z.number(), marketing: z.number(), synced_at: z.string() }),
);
