/** The edge's doors for connecting WhatsApp and Instagram, as the dashboard knocks on them (decision 0109). */
import { z } from "zod";
import { DOOR_ID, NO_BODY, edgeDoor } from "../shared/edge/door";

/** POST /api/admin/whatsapp/connect: the owner's number made a channel, from the code Meta's sign-up window handed back. */
export const WHATSAPP_CONNECT_DOOR = edgeDoor(
  "/api/admin/whatsapp/connect",
  z.object({
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    code: z.string().optional(),
    phone_number_id: z.string().optional(),
    waba_id: z.string().optional(),
    /** Keeping the WhatsApp Business app (coexistence, decision 0073). */
    keep_app: z.boolean().optional(),
  }),
);

/** POST /api/admin/whatsapp/standing: the workspace's number, as Meta rates it now. */
export const WHATSAPP_STANDING_DOOR = edgeDoor(
  "/api/admin/whatsapp/standing",
  z.object({ tenant_id: DOOR_ID.optional(), user_id: DOOR_ID.optional() }),
);

/** GET /api/admin/whatsapp/signup-config: the public half of Meta's sign-up window, and whether it can open here. */
export const WHATSAPP_SIGNUP_CONFIG_DOOR = edgeDoor("/api/admin/whatsapp/signup-config", NO_BODY);

/** POST /api/admin/instagram/account: an Instagram account connected, disconnected, or asked whether it can be. */
export const INSTAGRAM_ACCOUNT_DOOR = edgeDoor(
  "/api/admin/instagram/account",
  z.object({
    op: z.string(),
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    code: z.string().optional(),
    channel_id: DOOR_ID.optional(),
  }),
);
