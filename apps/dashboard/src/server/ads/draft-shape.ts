/**
 * A new ad's draft as it crosses between New ad's screen and its two routes (POST ads/draft, POST ads/words; the Ads
 * plan's 4.6): what the screen sends, and what every answer says. The workspace keeps its one draft (ad_drafts, 00659),
 * and each answer is that draft judged afresh from the business as it stands now, so nothing a browser sent, or a
 * member kept, is trusted for more than what was chosen.
 *
 * Pure: the shapes and the input's schema, read by the routes, their handlers and the tests.
 */
import { z } from "zod";
import { DAY_KEY, UUID } from "@chanlytics/contracts";
import type { AdCardCheckId, AdDraftMissing, AdPictureIssue, AdSpecialKind, AdVersion } from "@chanlytics/contracts";

const SPECIAL_KINDS = [
  "employment",
  "housing",
  "financial",
  "politics",
  "gambling",
] as const satisfies readonly AdSpecialKind[];

/** The most of a version's words a draft is sent with: well past what reads whole, so a long one is judged, not cut. */
const VERSION_MAX = { text: 600, headline: 200 } as const;

/**
 * A place wider than the circle around the business, where the draft shows across one (the Ads plan's 4.6 and G8, as
 * Ruben settled them on 20 November 2026): a city with Meta's least ring around it, a state or region, or the whole
 * country. By Meta's own key, which the edge's place search found (server/ads/area.ts), and the name it is said by.
 */
const AdWideAreaSchema = z.object({
  kind: z.enum(["city", "region", "country"]),
  key: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  /** Its country's ISO 3166 code. */
  country: z.string().regex(/^[A-Z]{2}$/),
});
export type AdWideArea = z.infer<typeof AdWideAreaSchema>;

/** The draft as the screen holds it. Money is whole minor units of the ad account's currency. */
export const AdDraftStateSchema = z.object({
  /** The service the ad offers, by its name in Services. */
  service: z.string().trim().min(1).max(200),
  /** The picture it shows: a file's id. */
  picture: z.string().regex(UUID),
  miles: z.number().int().min(0).max(10_000),
  /** Shown across a wider place in place of the circle of `miles` around the business; none for the circle. */
  area: AdWideAreaSchema.optional(),
  total_minor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  end_day: z.string().regex(DAY_KEY),
  /** The ad writer's words: none while they are being written, else three. */
  versions: z
    .array(z.object({ text: z.string().max(VERSION_MAX.text), headline: z.string().max(VERSION_MAX.headline) }))
    .max(3),
  /** What the owner answered where the draft asked whether this is one of Meta's special kinds of ad. */
  answers: z.partialRecord(z.enum(SPECIAL_KINDS), z.enum(["no", "yes"])).default({}),
  /**
   * The service in a few words, as the ad writer named it with the words (words.ts): what New ad's title and sentence
   * say. None until the words are written, and none once the service changes.
   */
  label: z.string().trim().min(1).max(60).optional(),
});
export type AdDraftState = z.infer<typeof AdDraftStateSchema>;

/**
 * POST ads/draft: no draft asks for the kept one, or a fresh one where none is kept; a draft is judged as it stands,
 * after an act where one is named, and kept. A service or a picture asks for a fresh one started from it.
 */
export const AdDraftBodySchema = z.object({
  draft: AdDraftStateSchema.optional(),
  /** The one act a check offers that the server does: the next picture that is fine in ads. */
  act: z.enum(["next_picture"]).optional(),
  /**
   * A fresh draft for this service, by its name in Services, in place of the kept one: what AI's card asks for (the
   * plan's 6.3). One Services does not list is the draft's own pick.
   */
  service: z.string().trim().min(1).max(200).optional(),
  /**
   * A fresh draft around this picture, by its file's id, in place of the kept one: what "Run as an ad" on a made piece in
   * Content asks for (the plan's 6.8, join 3). One that may not run as an ad is the one thing missing, never another.
   */
  picture: z.string().regex(UUID).optional(),
  /**
   * The most any ad may cost, as the owner said it to AI in a sentence (the plan's G6), in whole units of the ad
   * account's currency: kept on the account before the draft is judged. The owner's alone.
   */
  most: z.number().int().positive().max(100_000_000).optional(),
});

/** Meta's id for something it made: digits alone. */
const MetaObjectId = z
  .string()
  .trim()
  .regex(/^\d{5,32}$/);

/**
 * POST ads/check: the draft New ad holds, sent to Meta once, made paused and read back; or, in its place, Meta's id for
 * a campaign an earlier check left, to remove, or for an ad a check made whose campaign is gone, to tidy. One alone.
 */
export const AdPausedCheckBodySchema = z
  .object({ draft: AdDraftStateSchema.optional(), remove: MetaObjectId.optional(), tidy: MetaObjectId.optional() })
  .refine(
    (body) => [body.draft, body.remove, body.tidy].filter((part) => part !== undefined).length === 1,
    "A draft, a campaign to remove, or an ad to tidy.",
  );

/** POST ads/words: the writer's two jobs on a draft. */
export const AdWordsBodySchema = z.discriminatedUnion("job", [
  z.object({
    job: z.literal("write"),
    draft: AdDraftStateSchema,
    /** Leave the price out of the words ("Take the price out"). */
    no_price: z.boolean().optional(),
  }),
  z.object({
    job: z.literal("change"),
    draft: AdDraftStateSchema,
    /** What the owner told AI to change, in their own words. */
    asked: z.string().trim().min(1).max(600),
  }),
]);

/**
 * Why a draft cannot be written yet: the plan's four (G13), an ad account not ready to draft for, or AI stopped. A
 * picture missing says which, so its line says what to do: there is none at all (picture_none); each shows someone,
 * or nobody has said who is in it (picture_person); each video has music, or was not heard yet (picture_music); none
 * is a size or shape an ad takes (picture); or the piece "Run as an ad" chose is no longer kept (picture_gone).
 */
export type AdCantDraft =
  | AdDraftMissing
  | "picture_none"
  | "picture_person"
  | "picture_music"
  | "picture_gone"
  | "account"
  | "account_reading"
  | "stopped";

/** What is wrong with an ad's words, as a draft's line says it: Meta's rules by name, and everything else as one. */
export type AdWordsFault = "about_reader" | "feel_bad" | "sure_result" | "before_after" | "pressure" | "other";

/** One thing that stops Turn on, each a line with its one act (the plan's 5.1). */
export type AdCheckDto =
  | { code: "words"; fault: AdWordsFault }
  | { code: "price"; fault: "never" | "differs" }
  | { code: "picture"; fault: AdPictureIssue | "gone" }
  | { code: "amount"; fault: "under_least" | "over_most" | "not_whole"; nearest_minor: number }
  | { code: "end"; nearest_day: string }
  | { code: "area"; nearest_miles: number }
  | { code: "account"; check: AdCardCheckId };

/** A draft, with everything its screen says of it. */
interface AdDraftDto {
  service: string;
  picture: { id: string; kind: "photo" | "video"; name: string; made: boolean };
  miles: number;
  area?: AdWideArea | undefined;
  total_minor: number;
  end_day: string;
  versions: AdVersion[];
  answers: Partial<Record<AdSpecialKind, "no" | "yes">>;
  label?: string | undefined;
}

/** How Turn on stands on this deployment: the job that makes an ad at Meta is not built yet. */
export type AdTurnOn = "not_yet";

/**
 * Why the draft's own rule proposes its amount (contracts ads/draft.ts): a starting amount, and why it is one; or the
 * open times over the run, times what a booking from an ad has cost, and where that was held. Never a number of
 * bookings.
 */
export type AdAmountBasisDto =
  | { kind: "starting"; why: "few_booked" | "no_calendar" | "full" }
  | {
      kind: "booked";
      open_times: number;
      cost_minor: number;
      held_to: "owner_most" | "largest_turned_on" | "nothing_turned_on" | "meta_least" | null;
    };

export type AdDraftAnswer =
  | { can: false; missing: AdCantDraft }
  | {
      can: true;
      draft: AdDraftDto;
      /** Today in the ad account's zone, and the days the draft runs. */
      today: string;
      days: number;
      /** Who Meta charges, and who the ad runs as. */
      account: { name: string; currency: string; page: string | null; min_daily_minor: number };
      /**
       * Meta's least for the draft's run; what the draft's own rule proposes for a run of its own days, and why; and
       * the most the owner said any ad may cost, null until they say one.
       */
      amount: {
        least_minor: number;
        proposed: { total_minor: number; days: number; basis: AdAmountBasisDto };
        most_minor: number | null;
      };
      /** Why this service, where the draft's own rule picked it. */
      picked: "most_booked" | "first" | null;
      /**
       * Why the area is a wider place: Google says the business goes to its customers, so it is shown across the
       * place it serves rather than around its address. Null for the circle.
       */
      area_why: "goes_to_customers" | null;
      checks: AdCheckDto[];
      /** The special kind the draft asks the owner about; null where nothing reads as one, or all are answered. */
      question: AdSpecialKind | null;
      /** What the press would tell Meta: no special kind, a kind the owner said yes to, or not known until they answer. */
      declared: "none" | "waiting" | AdSpecialKind;
      turn_on: AdTurnOn;
      /** Whether this member is the owner: only the owner turns an ad on. */
      owner: boolean;
      /** Who left this draft, where it was someone else and it is as they left it; null where it is this member's. */
      left_by: string | null;
    };

/** Why the writer has no words to show, as the screen says it: with when AI can write again where a day's limit is why. */
export type AdNoWords = "limit" | "paused" | "checks" | "other";

/** What POST ads/words answers: the draft as it now stands, and what the writer came to. */
export type AdWordsAnswer = AdDraftAnswer & {
  /** `write`: whether the words were written. */
  wrote?: { ok: true } | { ok: false; why: AdNoWords };
  /**
   * `change`: the one change made, by its kind; or none, with the check its words would have tripped where that is why.
   * A change of service leaves the draft without words: the screen asks for them next.
   */
  changed?:
    | { kind: "words" | "service" | "picture" | "area" | "amount" | "end" }
    | { kind: "none"; fault: AdWordsFault | null };
};
