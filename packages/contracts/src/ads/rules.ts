/**
 * Every number the Ads page judges by and every rule a platform enforces, in one place (the platforms' docs, October 2026).
 * Page-only, like the models that read them: the Ads page imports them from `@chanlytics/contracts/ads-page`. A cost is
 * said only of REPORT_MIN_N or more booked (Reports' minimum, reports/report-tiles.ts), never a number of its own.
 *
 * The data the feature lanes read is here too: how an amount may change on each platform, whether "Only while you're open"
 * can be set, and which checks a door needs before Turn on. Nothing here is a word.
 */
import type { AdCheckId, AdDoor, AdNeedsCode, AdPlatform } from "./ads";

/** The window the page counts: this many days, ending yesterday. */
export const ADS_WINDOW_DAYS = 30;
/** The newest days that are still counting: drawn lighter. */
export const ADS_FRESH_DAYS = 3;
/** Whether the last two weeks are still settling in what an ad has: a cost is `so far` until they are not. */
export const ADS_SETTLE_DAYS = 14;
/** An `on` ad that started fewer days ago than this is read as too early to judge (never stored). */
export const TOO_EARLY_DAYS = 7;

/** An ad has brought enough people to be worth extending: this many booked, or for a call ad this many calls Google counted. */
export const ADS_ASK_MIN = 10;
export const ADS_ASK_MIN_CALLS = 20;
/** The Ask line offers to extend an ad that ends within this many days. */
export const ADS_ASK_SOON_DAYS = 3;
/** The most days an extension runs for. */
export const ADS_EXTEND_MAX_DAYS = 30;
/** An ad has run long enough to compare its cost with another's. */
export const ADS_MOVE_DAYS = 14;
/** What the Ask line moves between two ads, a day, in minor units. */
export const ADS_MOVE_STEP_MINOR = 500;
/** The gap in cost between two ads that chance alone would not give: the z of a 95% interval. */
export const ADS_CHANCE_Z = 1.96;
/** A custom daily amount runs this many days. */
export const ADS_OWN_DAYS = 14;
/** The amount a custom daily amount starts at, in minor units, and the miles New ad opens on. */
export const ADS_OWN_START_MINOR = 1000;
export const ADS_DEFAULT_MILES = 5;

/** The totals an amount's list offers, as shares of the one now; a daily amount's, in minor units. */
export const ADS_TOTAL_STEPS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const ADS_DAILY_CHOICES_MINOR: readonly number[] = [500, 1000, 1500, 2500, 4000];
/** The end dates offered, in days from the one it has. */
export const ADS_END_SHIFTS: readonly number[] = [-7, 7, 14, 30];
/** An area a special category (a job, a loan, a home) is limited to on Meta, in miles. */
export const ADS_SPECIAL_MILES = 15;
/** TikTok's display name counts to this many characters. */
export const ADS_DISPLAY_NAME_MAX = 20;
/** A ZIP code is this many digits (TikTok's area is a list of them). */
export const ADS_ZIP_DIGITS = 5;

/** The soft limits Meta states for the words, shown only near the limit (`near` is the share of the limit): Meta's, not ours. */
export const ADS_COPY_LIMITS = { headlineFacebook: 27, headlineInstagram: 40, textInstagram: 125, near: 0.8 } as const;

/** Per platform, how an amount may change. */
export interface BudgetRule {
  /** The most an amount may change in one step, as a share of it; null where there is no such limit. */
  maxStep: number | null;
  /** Days to wait between two changes. */
  waitDays: number;
  /** The longest a total may run, in days; null where there is no such limit. */
  totalMaxDays: number | null;
  /** The platform spends a daily amount as an average: some days more, never above a week's worth. */
  dailyIsAverage: boolean;
  /** A change of amount starts the platform's learning again. */
  changeRelearns: boolean;
}

export const BUDGET_RULES: Record<AdPlatform, BudgetRule> = {
  meta: { maxStep: null, waitDays: 0, totalMaxDays: null, dailyIsAverage: true, changeRelearns: true },
  google: { maxStep: null, waitDays: 0, totalMaxDays: 90, dailyIsAverage: true, changeRelearns: true },
  tiktok: { maxStep: 0.3, waitDays: 2, totalMaxDays: null, dailyIsAverage: false, changeRelearns: true },
};

/** Whether "Only while you're open" can be set: Meta only with a total. */
export const SCHEDULE_NEEDS_TOTAL: Record<AdPlatform, boolean> = { meta: true, google: false, tiktok: false };

/** Which checks a door needs before Turn on (ids into AdCheckId), per platform, in the order they are listed. */
export const DOOR_NEEDS: Record<AdDoor, Partial<Record<AdPlatform, AdCheckId[]>>> = {
  whatsapp: { meta: ["page-linked", "whatsapp-linked", "payment", "chanlytics-whatsapp"] },
  call: { google: ["account-active", "payment", "number-on-page", "call-reporting", "verification"] },
  form: {
    meta: ["page-linked", "payment", "lead-terms", "privacy-link", "yes-line"],
    tiktok: ["tiktok-linked", "payment", "identity", "privacy-link", "yes-line"],
  },
};

/** The checks the account's own standing lists (the dot rows of its popover and of an ad's reach line), in order. */
export const STANDING_CHECKS: Record<AdPlatform, AdCheckId[]> = {
  meta: ["account-active", "payment", "page-linked", "whatsapp-linked", "instagram-linked", "chanlytics-whatsapp"],
  google: ["account-active", "payment", "number-on-page", "call-reporting"],
  tiktok: ["tiktok-linked", "payment", "privacy-link"],
};

/** The days before a post permission lapses that it turns amber. */
export const ADS_PERMISSION_WARN_DAYS = 7;

/** What an ad needs that does not stop it: it keeps running (`on`) while the owner sees it. */
export const ADS_SOFT_NEEDS: readonly AdNeedsCode[] = ["price-changed", "permission-lapsing"];

/** Whether Chanlytics can count an ad's people: a Google call is Google's count, not matched to anyone. */
export const countedDoor = (door: AdDoor): boolean => door !== "call";

/** The ledger offers a choice of how to group its ads (by what they ask, by platform) from this many ads. */
export const ADS_GROUP_FROM = 7;

// ---------------------------------------------------------------------------------------------------------------------
// New ad: what each platform lets the words and the people be

/** The youngest a person an ad reaches may be, and TikTok's floor for a cosmetic service. */
export const ADS_AGE_FLOOR = 18;
export const ADS_AGE_FLOOR_COSMETIC = 25;
/** Google's words: a headline to this many characters, a description to this many, the business name to this many. */
export const ADS_GOOGLE_HEADLINE_MAX = 30;
export const ADS_GOOGLE_DESCRIPTION_MAX = 90;
export const ADS_GOOGLE_NAME_MAX = 25;
/** Google spends a daily amount as an average: up to this many times it in a day, never above this many in a month. */
export const ADS_GOOGLE_DAILY = { day: 2, month: 30.4 } as const;
/** A call counts past this many seconds (Google), and a lead counts within this many days of a tap (TikTok). */
export const ADS_CALL_SECONDS = 60;
export const ADS_LEAD_DAYS = 7;
