/**
 * A new ad's draft as it crosses between New ad's screen and its two routes (POST ads/draft, POST ads/words; the Ads
 * plan's 4.6): what the screen sends, and what every answer says. The draft is the screen's to hold until Turn on: the
 * server keeps none, and judges whatever it is sent afresh from the business as it stands now, so nothing a browser
 * sends is trusted for more than what the owner chose.
 *
 * Pure: the shapes and the input's schema, read by the routes, their handlers and the tests.
 */
import { z } from "zod";
import { UUID } from "@chanlytics/contracts";
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

/** The draft as the screen holds it. Money is whole minor units of the ad account's currency. */
export const AdDraftStateSchema = z.object({
  /** The service the ad offers, by its name in Services. */
  service: z.string().trim().min(1).max(200),
  /** The picture it shows: a file's id. */
  picture: z.string().regex(UUID),
  miles: z.number().int().min(0).max(10_000),
  total_minor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  end_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The ad writer's words: none while they are being written, else three. */
  versions: z
    .array(z.object({ text: z.string().max(VERSION_MAX.text), headline: z.string().max(VERSION_MAX.headline) }))
    .max(3),
  /** What the owner answered where the draft asked whether this is one of Meta's special kinds of ad. */
  answers: z.partialRecord(z.enum(SPECIAL_KINDS), z.enum(["no", "yes"])).default({}),
});
export type AdDraftState = z.infer<typeof AdDraftStateSchema>;

/** POST ads/draft: no draft asks for a fresh one; a draft is judged as it stands, after an act where one is named. */
export const AdDraftBodySchema = z.object({
  draft: AdDraftStateSchema.optional(),
  /** The one act a check offers that the server does: the next picture that is fine in ads. */
  act: z.enum(["next_picture"]).optional(),
});

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

/** Why a draft cannot be written yet: the plan's four (G13), an ad account not ready to draft for, or AI stopped. */
export type AdCantDraft = AdDraftMissing | "account" | "account_reading" | "stopped";

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
export interface AdDraftDto {
  service: string;
  picture: { id: string; kind: "photo" | "video"; name: string; made: boolean };
  miles: number;
  total_minor: number;
  end_day: string;
  versions: AdVersion[];
  answers: Partial<Record<AdSpecialKind, "no" | "yes">>;
}

/** How Turn on stands on this deployment: the job that makes an ad at Meta is not built yet. */
export type AdTurnOn = "not_yet";

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
      /** Why this amount: Meta's least for the run, and whether ads have a history here to say more. */
      amount: { starting: boolean; least_minor: number; history: boolean };
      /** Why this service, where the draft's own rule picked it. */
      picked: "most_booked" | "first" | null;
      checks: AdCheckDto[];
      /** The special kind the draft asks the owner about; null where nothing reads as one, or all are answered. */
      question: AdSpecialKind | null;
      /** What the press would tell Meta: no special kind, a kind the owner said yes to, or not known until they answer. */
      declared: "none" | "waiting" | AdSpecialKind;
      turn_on: AdTurnOn;
      /** Whether this member is the owner: only the owner turns an ad on. */
      owner: boolean;
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
