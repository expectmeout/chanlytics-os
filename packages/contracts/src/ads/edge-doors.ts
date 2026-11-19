/** The edge's doors for an owner's ad account, as the dashboard knocks on them (decisions 0049 and 0109). */
import { z } from "zod";
import { DOOR_ID, answerFields, edgeDoor } from "../shared/edge/door";

/**
 * POST /api/admin/ads/account: an owner's own ad account at Meta, connected from the code Meta's window handed back
 * (`connect`), the one of two chosen (`choose`), looked at again (`check`), or asked whether it can be connected here
 * (`status`). `on` is whether this deployment offers Ads in the workspace; `outcome` is what an op came to.
 */
export const ADS_ACCOUNT_DOOR = edgeDoor(
  "/api/admin/ads/account",
  z.object({
    op: z.string(),
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    code: z.string().optional(),
    /** `choose`: the platform's id of the account the owner meant. */
    external_id: z.string().optional(),
  }),
  answerFields({
    ready: z.boolean(),
    on: z.boolean(),
    app: z.object({ client_id: z.string(), config_id: z.string(), redirect_uri: z.string() }).partial().nullable(),
    outcome: z.string(),
    account_id: z.string(),
    /** `status`: whether an owner's presses reach the platform from this deployment: off, sandbox or live. */
    writes: z.string(),
  }),
);

/**
 * POST /api/admin/ads/press: an owner pauses an ad (`pause`) or turns one back on (`resume`), carrying the version the
 * press was drawn from. `outcome` says what it came to: told, sent, soon, took_back or same.
 */
export const ADS_PRESS_DOOR = edgeDoor(
  "/api/admin/ads/press",
  z.object({
    op: z.string(),
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    ad_id: DOOR_ID.optional(),
    version: z.number().int().optional(),
  }),
  answerFields({ outcome: z.string(), version: z.number() }),
);
