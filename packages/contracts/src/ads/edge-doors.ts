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
    /** `copy`: the video a draft came to show, whose copy at the video platform is asked back. */
    file_id: DOOR_ID.optional(),
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
    /** `copy`: where the video's copy stands once asked for (contracts files/copy.ts), and why where it can't come back. */
    copy: z.string(),
    why: z.string().nullable(),
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
 * POST /api/admin/ads/preview: Meta's own preview of one version of New ad's draft (the Ads plan's 4.6, "The ad as Meta
 * draws it"), in each place the ad shows. A read: it makes nothing at Meta and spends nothing, so any member who may
 * draft asks it. `outcome` is what it came to: drawn, partly, or why Meta drew none; `places` holds Meta's frame for
 * each place it drew, and for the others what stood in the way.
 */
export const ADS_PREVIEW_DOOR = edgeDoor(
  "/api/admin/ads/preview",
  z.object({
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    preview: z
      .object({
        /** The picture it shows: a file's id. */
        picture: DOOR_ID,
        /** One version of its words. */
        text: z.string().trim().min(1).max(1024),
        headline: z.string().trim().min(1).max(255),
      })
      .optional(),
  }),
  answerFields({
    outcome: z.string(),
    places: z.array(
      z.object({
        place: z.enum(["feed", "story", "reel"]),
        /** Meta's own preview page for it, and the size Meta drew it at; null where Meta drew none. */
        src: z.string().nullable(),
        width: z.number().nullable(),
        height: z.number().nullable(),
        /** What stood in the way where Meta drew none; null where it drew one. */
        fault: z.string().nullable(),
      }),
    ),
  }),
);

/**
 * The most ads one press pauses at once (`pause_all`): what the database's door takes (ad_pause_all, 00671), far past
 * the ads a business runs, and the most a page lists.
 */
export const AD_PAUSE_ALL_MAX = 200;

/**
 * POST /api/admin/ads/press: an owner pauses an ad (`pause`), turns one back on (`resume`) or asks Meta what stands of one
 * (`check`), carrying the version the press was drawn from; or pauses every ad of a set at once (`pause_all`, `ads`), each
 * with its own version, kept together before the door answers; or changes a running ad made here (`change`, the Ads
 * plan's step 4, item 6): its total, its last day, its miles, or ending it, with what Meta held when the press was drawn
 * and the most a raise names. `outcome` says what it came to: told, sent, soon, took_back or same, and for `pause_all`
 * kept, with what each ad came to in `ads`; `next_at`, where Meta's four changes of an amount an hour are used, when
 * the next is taken.

 */
export const ADS_PRESS_DOOR = edgeDoor(
  "/api/admin/ads/press",
  z.object({
    op: z.string(),
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    ad_id: DOOR_ID.optional(),
    version: z.number().int().optional(),
    change: z
      .object({
        what: z.enum(["total", "end_day", "miles", "end"]),
        total_minor: z.number().int().positive().optional(),
        end_day: z.string().regex(DAY_KEY).optional(),
        miles: z.number().int().min(1).max(50).optional(),
        /** What Meta held when the press was drawn: its total, and its last moment. */
        from_minor: z.number().int().min(0).optional(),
        from_ends_at: z.string().min(1).max(64).optional(),
        /** The most a raise names; none for anything else. */
        expect_max_minor: z.number().int().positive().optional(),
      })
      .optional(),
    ads: z
      .array(z.object({ ad_id: DOOR_ID, version: z.number().int() }))
      .max(AD_PAUSE_ALL_MAX)
      .optional(),
  }),
  answerFields({
    outcome: z.string(),
    version: z.number(),
    next_at: z.string(),
    ads: z.array(z.object({ ad_id: z.string(), outcome: z.string(), version: z.number().nullable() })),
  }),
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
        /**
         * A place wider than the circle, by Meta's key, where the owner chose one: shown across it in its place. Its name
         * and country ride with it, so the ad's drawer says the place and Fix it can draft it again.
         */
        area: z
          .object({
            kind: z.enum(["city", "region", "country"]),
            key: z.string().trim().min(1).max(40),
            name: z.string().trim().min(1).max(200).optional(),
            country: z
              .string()
              .regex(/^[A-Z]{2}$/)
              .optional(),
          })
          .optional(),
        total_minor: z.number().int().positive(),
        most_minor: z.number().int().positive(),
        end_day: z.string().regex(DAY_KEY),
        /** The three versions of its words, each a text and a headline. */
        versions: z
          .array(z.object({ text: z.string().trim().min(1).max(1024), headline: z.string().trim().min(1).max(255) }))
          .min(1)
          .max(3),
        /** The business's street address (none where a wider place is chosen), and the number AI answers on WhatsApp. */
        address: z.string().trim().min(1).max(500).optional(),
        whatsapp: z.string().trim().min(7).max(32),
        /** What the press tells Meta of its kind: never a special kind here (the plan's G7). */
        declared: z.literal("none"),
      })
      .optional(),
    /** The ad Meta turned down that this one is Fix it's draft of: ended once this one is turned on. */
    fixes: DOOR_ID.optional(),
  }),
  answerFields({ outcome: z.string(), ad_id: z.string() }),
);
