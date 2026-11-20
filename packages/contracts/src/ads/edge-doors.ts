/** The edge's doors for an owner's ad account, as the dashboard knocks on them (decisions 0049 and 0109). */
import { z } from "zod";
import { DAY_KEY } from "../shared/zone/day-keys";
import { DOOR_ID, answerFields, edgeDoor } from "../shared/edge/door";

/**
 * POST /api/admin/ads/account: an owner's own ad account at Meta, connected from the code Meta's window handed back
 * (`connect`), the one of two chosen (`choose`), looked at again (`check`), disconnected (`disconnect`), or asked whether it can be connected here
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
    /** `disconnect`: whether the ads that are running are paused first. */
    pause: z.boolean().optional(),
  }),
  answerFields({
    ready: z.boolean(),
    on: z.boolean(),
    app: z.object({ client_id: z.string(), config_id: z.string(), redirect_uri: z.string() }).partial().nullable(),
    outcome: z.string(),
    account_id: z.string(),
    /** `status`: whether an owner's presses reach the platform from this deployment: off, sandbox or live. */
    writes: z.string(),
    /** `disconnect`: the ads left running, or the ones a pause could not be confirmed for (`not_paused`). */
    names: z.array(z.string()),
  }),
);

/**
 * POST /api/admin/ads/check: the paused-ad check on an owner's own ad account (the Ads plan's step 4, "Checking against
 * Meta without spending"): the draft the owner approved, judged by the dashboard, sent to Meta once as dry runs, then
 * made paused and read back; or, with `remove` in place of a draft, a campaign an earlier check left, removed.
 * `outcome` is what it came to; `steps` says what Meta did at each one, in Meta's own words where it refused; `differs`
 * names what Meta holds that is not what was sent.
 */
export const ADS_CHECK_DOOR = edgeDoor(
  "/api/admin/ads/check",
  z.object({
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    draft: z
      .object({
        /** The service the ad offers: what its name at Meta says. */
        service: z.string().trim().min(1).max(200),
        /** The picture it shows: a file's id. */
        picture: DOOR_ID,
        miles: z.number().int().min(1).max(50),
        total_minor: z.number().int().positive(),
        end_day: z.string().regex(DAY_KEY),
        /** One version of its words. */
        text: z.string().trim().min(1).max(1024),
        headline: z.string().trim().min(1).max(255),
        /** The business's street address, and the number AI answers on WhatsApp. */
        address: z.string().trim().min(1).max(500),
        whatsapp: z.string().trim().min(7).max(32),
      })
      .optional(),
    /** Meta's id for a campaign an earlier check made and left, to remove: the edge checks it is one. */
    remove: z.string().trim().min(5).max(32).optional(),
  }),
  answerFields({
    outcome: z.string(),
    steps: z.array(
      z.object({ at: z.string(), outcome: z.string(), said: z.string().nullable(), id: z.string().nullable() }),
    ),
    differs: z.array(z.string()),
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

/**
 * POST /api/admin/ads/turn-on: an owner turns an ad on (decision 0050, calls 3 and 5; the Ads plan's 4.7). The dashboard
 * judged the workspace's kept draft at the press and hands on what the owner approved, with the press's own key and the
 * moment the draft was kept (`draft_at`): a draft changed since is refused. The edge keeps the ad, setting up, and asks
 * for the account's job, which makes it at Meta paused, reads it back and compares, then switches it on. `outcome` is
 * kept, or same for the same press again; `ad_id` is the ad either way.
 */
export const ADS_TURN_ON_DOOR = edgeDoor(
  "/api/admin/ads/turn-on",
  z.object({
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    /** The press's own key: the same press twice makes one ad. */
    key: DOOR_ID.optional(),
    /** When the kept draft was kept, as the press read it. */
    draft_at: z.string().min(1).max(64).optional(),
    ad: z
      .object({
        /** The service in a few words, as New ad says it: the ad's name here. */
        name: z.string().trim().min(1).max(200),
        service: z.string().trim().min(1).max(200),
        /** The picture it shows: a file's id, and whether it is a photo or a video. */
        picture: DOOR_ID,
        picture_kind: z.enum(["photo", "video"]),
        miles: z.number().int().min(1).max(50),
        total_minor: z.number().int().positive(),
        most_minor: z.number().int().positive(),
        end_day: z.string().regex(DAY_KEY),
        /** The three versions of its words, each a text and a headline. */
        versions: z
          .array(z.object({ text: z.string().trim().min(1).max(1024), headline: z.string().trim().min(1).max(255) }))
          .min(1)
          .max(3),
        /** The business's street address, and the number AI answers on WhatsApp. */
        address: z.string().trim().min(1).max(500),
        whatsapp: z.string().trim().min(7).max(32),
        /** What the press tells Meta of its kind: never a special kind here (the plan's G7). */
        declared: z.literal("none"),
      })
      .optional(),
  }),
  answerFields({ outcome: z.string(), ad_id: z.string() }),
);
