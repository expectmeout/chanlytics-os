/** The edge's doors for an owner's ad account, as the dashboard knocks on them (decisions 0049 and 0109). */
import { z } from "zod";
import { DAY_KEY } from "../shared/zone/day-keys";
import { DOOR_ID, answerFields, edgeDoor } from "../shared/edge/door";

/**
 * POST /api/admin/ads/account: an owner's own ad account at Meta, connected from the code Meta's window handed back
 * (`connect`), the one of two chosen (`choose`), looked at again (`check`), disconnected (`disconnect`), asked whether it can be connected here
 * (`status`), or asked the places Meta keys by a name (`place`), for an ad shown wider than the circle around a business. `on` is whether this deployment offers Ads in the workspace; `outcome` is what an op came to.
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
    /** `place`: the kind of place and the name looked for at Meta. */
    place: z
      .object({ kind: z.enum(["city", "region", "country"]), query: z.string().trim().min(1).max(120) })
      .optional(),
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
    /** `place`: Meta's places by that name, best first, each with its key and where it is. */
    places: z.array(
      z.object({
        kind: z.enum(["city", "region", "country"]),
        key: z.string(),
        name: z.string(),
        region: z.string().nullable(),
        country: z.string(),
        country_name: z.string(),
      }),
    ),
  }),
);

/**
 * POST /api/admin/ads/check: the paused-ad check on an owner's own ad account (the Ads plan's step 4, "Checking against
 * Meta without spending"): the draft the owner approved, judged by the dashboard, sent to Meta once as dry runs, then
 * made paused and read back; or, with `remove` in place of a draft, a campaign an earlier check left, removed; or, with
 * `tidy`, what an ad a check made left once its campaign is gone.
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
        /** A place wider than the circle, by Meta's key, where the owner chose one: shown across it in its place. */
        area: z
          .object({ kind: z.enum(["city", "region", "country"]), key: z.string().trim().min(1).max(40) })
          .optional(),
        total_minor: z.number().int().positive(),
        end_day: z.string().regex(DAY_KEY),
        /** One version of its words. */
        text: z.string().trim().min(1).max(1024),
        headline: z.string().trim().min(1).max(255),
        /** The business's street address (none where a wider place is chosen), and the number AI answers on WhatsApp. */
        address: z.string().trim().min(1).max(500).optional(),
        whatsapp: z.string().trim().min(7).max(32),
      })
      .optional(),
    /** Meta's id for a campaign an earlier check made and left, to remove: the edge checks it is one. */
    remove: z.string().trim().min(5).max(32).optional(),
    /** Meta's id for an ad a check made whose campaign is gone: its creative and picture are removed. */
    tidy: z.string().trim().min(5).max(32).optional(),
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
