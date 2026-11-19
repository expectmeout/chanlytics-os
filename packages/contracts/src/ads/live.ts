/**
 * The Ads page once an account is connected, as its reads answer it (decision 0049, readers adsPage and adPeople;
 * the Ads plan's 4.4 and 4.5): the account as the page needs it, each ad Chanlytics holds with the platform's half
 * (what it spent, what it says of the ad, the budget it sits under) and Chanlytics' half (who it brought, who of them
 * booked), and the people from an ad Chanlytics cannot name as one count. The two halves are joined when read and
 * kept as two: every figure says whose it is (0049, call 3).
 *
 * And the one rule that says whether an ad found in the owner's account may be turned back on from here (the plan's
 * C1): asked by the page that draws the press, by the route that takes it and by the edge before Meta is told.
 */
import type { AdState } from "./ads";

/** What a tap on an ad opens, as its row keeps it (ads.door). */
export type AdOpens = "whatsapp" | "instagram" | "messenger" | "call" | "form" | "website" | "other";

/** The doors whose people Chanlytics counts: the tap ends in a message it receives. */
export const AD_DOORS_COUNTED: readonly AdOpens[] = ["whatsapp", "instagram"];

/** The budget an ad sits under, as the platform holds it. Money in minor units of the account's currency. */
export interface AdBudgetLive {
  kind: "total" | "daily";
  minor: number;
  /** What is left of a total; null for an amount a day, or where the platform gave none. */
  left_minor: number | null;
  /** Whether other ads spend from it: what is left is then not this ad's alone. */
  shared: boolean;
}

/** Why an ad needs its owner. */
export type AdNeedsLive = "refused" | "unpaid" | "troubled" | "paused_at_platform";

/** One ad on the page. */
export interface AdLiveDto {
  /** Chanlytics' own id (a uuid): the address uses it. */
  id: string;
  name: string;
  /** Whether the owner made it at the platform itself (adopted: read, paused and, where C1 allows, resumed). */
  made_in_platform: boolean;
  opens: AdOpens;
  /** Its badge, worked out once (adStateOf). */
  state: AdState | "draft";
  /**
   * Why it needs its owner, where it does: the platform refused it, could not charge for it, found something wrong
   * with it, or it was paused at the platform while the owner has it on here. Null for an ad that needs nothing.
   */
  needs: AdNeedsLive | null;
  /** Why the platform will not run it, in the platform's own words; null where it gave none. */
  issue: string | null;
  /** Its last moment (ISO), or null where it has no end. */
  ends_at: string | null;
  budget: AdBudgetLive | null;
  /** A press of the owner's that the platform has not been told yet: what was asked. */
  pending: "pausing" | "resuming" | null;
  /** Bumped on every change of the owner's: a press carries it, and a stale one is refused. */
  version: number;
  /** Whether it may be turned back on from here (adResumeRule). */
  resume: AdResume;
  /** Chanlytics' half, in the page's window: who first got in touch through it, and who of them has booked since. */
  people: number;
  booked: number;
  /** The platform's half, in the same days: what it spent, and whether any of those days is still moving. */
  spend_minor: number;
  settling: boolean;
  /** The platform's own counts, labelled as theirs: never added to Chanlytics' people. */
  theirs: { impressions: number; clicks: number; results: number | null };
}

/** The Ads page's read. */
export interface AdsLiveDto {
  account: {
    status: "connected" | "revoked" | "disconnected";
    name: string | null;
    /** ISO 4217; null only for an account that never finished connecting. */
    currency: string | null;
    timezone: string | null;
    read_at: string | null;
    read_failed: boolean;
    revoked_at: string | null;
    disconnected_at: string | null;
  };
  /** The days the page counts, in the workspace's zone (ISO days), and today in the account's. */
  window: { from: string; to: string };
  today: string;
  ads: AdLiveDto[];
  /** The people from an ad Chanlytics cannot name: one quiet line, so the page's total reconciles with Reports. */
  unnamed: { people: number; booked: number };
  /**
   * The people from an ad Chanlytics holds for another ad account of this workspace (one connected before this one):
   * its ads are not this page's to list, and its money may be in another currency, so only its people are said, on a
   * quiet line of their own. With `ads` and `unnamed` they are everyone Reports counts under "An ad".
   */
  elsewhere: { people: number; booked: number };
  /** Whether this member may pause and resume here: the owner, on a connected account whose sign-in may change ads. */
  can_press: boolean;
}

/** One person an ad brought. */
export interface AdPersonLiveDto {
  /** Their id in People: their page is `clients/<id>`. */
  id: string;
  name: string;
  /** When they first got in touch (ISO). */
  first_at: string;
  booked: boolean;
}

/** An ad's people, a page of them. */
export interface AdPeopleLiveDto {
  people: AdPersonLiveDto[];
  /** Whether there are more after these. */
  more: boolean;
}

/** Whether an ad may be turned back on from here, and what the press may then cost at most. */
export type AdResume =
  | { ok: true; left_minor: number; ends_at: string }
  | { ok: false; why: "made_here" | "not_paused" | "no_total" | "no_end" | "shared" | "nothing_left" | "ended" };

/** What the rule reads of an ad's row. */
interface AdResumeFacts {
  origin: string;
  platform_state: string | null;
  budget_kind: string | null;
  budget_left_minor: number | null;
  budget_shared: boolean | null;
  ends_at: string | null;
}

/**
 * Whether an ad the owner made at the platform may be turned back on from here (the plan's C1): only where the
 * platform holds a total with an end date for it, the ad has that budget to itself, something is left of it and its
 * end has not passed. The press then names the most it can cost, which the platform enforces itself. Anything else is
 * turned back on at the platform, where its amount is set. An ad paused by its ad set or its campaign is not paused
 * by its own switch, so turning the ad on here would start nothing: it is `not_paused`.
 */
export function adResumeRule(ad: AdResumeFacts, nowMs: number): AdResume {
  if (ad.origin !== "platform") return { ok: false, why: "made_here" };
  if (ad.platform_state !== "PAUSED") return { ok: false, why: "not_paused" };
  if (ad.budget_kind !== "total") return { ok: false, why: "no_total" };
  if (ad.ends_at === null) return { ok: false, why: "no_end" };
  if (ad.budget_shared !== false) return { ok: false, why: "shared" };
  if (Date.parse(ad.ends_at) <= nowMs) return { ok: false, why: "ended" };
  if (ad.budget_left_minor === null || ad.budget_left_minor <= 0) return { ok: false, why: "nothing_left" };
  return { ok: true, left_minor: ad.budget_left_minor, ends_at: ad.ends_at };
}
