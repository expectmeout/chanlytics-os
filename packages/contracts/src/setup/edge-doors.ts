/** The edge's doors for connecting WhatsApp and Instagram, as the dashboard knocks on them (decision 0109). */
import { z } from "zod";
import { DOOR_ID, answerFields, edgeDoor, NO_BODY } from "../shared/edge/door";

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
  answerFields({
    channel_id: z.string(),
    phone_number_id: z.string(),
    waba_id: z.string(),
    ids_from: z.string(),
    number_e164: z.string().nullable(),
    verified_name: z.string().nullable(),
    quality_rating: z.string().nullable(),
    registration: z.string(),
  }),
);

/** POST /api/admin/whatsapp/standing: the workspace's number, as Meta rates it now. */
export const WHATSAPP_STANDING_DOOR = edgeDoor(
  "/api/admin/whatsapp/standing",
  z.object({ tenant_id: DOOR_ID.optional(), user_id: DOOR_ID.optional() }),
  answerFields({ kept: z.string(), can_send: z.string() }),
);

/** GET /api/admin/whatsapp/signup-config: the public half of Meta's sign-up window, and whether it can open here. */
export const WHATSAPP_SIGNUP_CONFIG_DOOR = edgeDoor(
  "/api/admin/whatsapp/signup-config",
  NO_BODY,
  answerFields({
    app_id: z.string().nullable(),
    config_id: z.string().nullable(),
    graph_version: z.string(),
    ready: z.boolean(),
    reason: z.string().nullable(),
    keep_app: z.boolean(),
  }),
);

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
  answerFields({
    ready: z.boolean(),
    app: z.object({ client_id: z.string(), redirect_uri: z.string() }).partial().nullable(),
  }),
);

/**
 * POST /api/admin/meta/connection: an Instagram account connected through Meta (Instagram API with Unified Login, the Meta
 * link PRD), disconnected, or asked whether it can be here. `on` is the workspace's switch (contracts contentPreviewOf), read
 * by the edge since a member may not read the config.
 */
export const META_CONNECTION_DOOR = edgeDoor(
  "/api/admin/meta/connection",
  z.object({
    op: z.string(),
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    code: z.string().optional(),
    channel_id: DOOR_ID.optional(),
  }),
  answerFields({
    ready: z.boolean(),
    on: z.boolean(),
    app: z.object({ client_id: z.string(), config_id: z.string(), redirect_uri: z.string() }).partial().nullable(),
    channel_id: z.string(),
    account_id: z.string(),
    username: z.string().nullable(),
    accounts: z.array(z.object({ id: z.string(), username: z.string().nullable() })),
  }),
);
