/**
 * An ad's badge and an ad account's, each worked out once (decision 0049, call 1): no page works its own out.
 *
 * Three words are kept of an ad, side by side: what the owner asked of it, where Chanlytics is with making it on the
 * platform, and the platform's own word for it, as the platform gave it. The badge is read from the three here, with
 * the two facts that end a run (its last day, its total). It says On only once the platform does (decision 0050), so an
 * ad Chanlytics has made and the platform has not yet spoken of is In review.
 *
 * "Too early to judge" is a reading from counts and age, and an ad left behind by a disconnected account is a reading of
 * its account: neither is a state, and neither is here. What else an ad may need of its owner (a price that changed in
 * Services) is a line on an ad that stays On, never a badge.
 */
import type { AdAccountStatus, AdPlatform, AdState } from "./ads";

/** What a platform says of an ad, in the one set of words every platform's own word is read into. */
type AdPlatformSays = "checking" | "running" | "paused" | "refused" | "unpaid" | "troubled" | "removed";

/**
 * Meta's words for an ad, each read into ours: its `effective_status`, every value Meta's reference lists for the Ad
 * object (Marketing API v27.0, read on Meta's page 18 November 2026; states.type-test.ts holds the list).
 */
const META_SAYS = {
  ACTIVE: "running",
  PAUSED: "paused",
  // Its ad set or its campaign is paused: the ad is not running, whichever of the three was paused.
  ADSET_PAUSED: "paused",
  CAMPAIGN_PAUSED: "paused",
  PENDING_REVIEW: "checking",
  // Meta's page gives these two no meaning. Neither says the ad runs, so neither is read as On.
  IN_PROCESS: "checking",
  PREAPPROVED: "checking",
  DISAPPROVED: "refused",
  PENDING_BILLING_INFO: "unpaid",
  WITH_ISSUES: "troubled",
  ARCHIVED: "removed",
  DELETED: "removed",
} as const satisfies Record<string, AdPlatformSays>;

/** A word Meta has for an ad. */
export type MetaAdWord = keyof typeof META_SAYS;

/**
 * Each platform's own words. Google's and TikTok's join with the steps that read their ads (decision 0050, P3 and P4),
 * from their own pages; until then every word of theirs is one Chanlytics does not know.
 */
const PLATFORM_SAYS: Record<AdPlatform, ReadonlyMap<string, AdPlatformSays>> = {
  meta: new Map(Object.entries(META_SAYS)),
  google: new Map(),
  tiktok: new Map(),
};

/** What is kept of an ad that its badge is read from. */
interface AdKept {
  /**
   * Where Chanlytics is with making it on the platform: written and never sent; being made, paused (Turn on was
   * pressed); stopped part way, with what was made left paused there; or there. An ad the owner made on the platform
   * itself is `made` from its first read.
   */
  status: "draft" | "sending" | "failed" | "made";
  /** What the owner last asked of it. */
  intent: "on" | "paused" | "ended";
  platform: AdPlatform;
  /** The platform's own word for it, as the platform gave it; null until the platform has been read. */
  platformWord: string | null;
  /** Its last day (an ISO day), or null where it has no end. */
  endDay: string | null;
  /** The total it may spend in all, in minor units, or null where its amount is a daily one. */
  totalMinor: number | null;
  /** What it has spent in all, in minor units. */
  spentMinor: number;
  /**
   * For an ad made here whose last switch was sent and never answered, and that no read has spoken of since: `lately`
   * while it is still being followed, `long` once that has taken longer than a few minutes. Null otherwise.
   */
  unanswered: "lately" | "long" | null;
}

/**
 * An ad's badge, at `today` (an ISO day in the account's zone). In order: what Chanlytics is still doing; a run that is
 * over (its total spent, then ended by its owner, its platform or its last day); a last switch not yet confirmed; what
 * the platform will not run until the owner acts; and then what the platform says against what the owner asked. A word
 * Chanlytics does not know is never read as On.
 */
export function adStateOf(ad: AdKept, today: string): AdState | "draft" {
  if (ad.status === "draft") return "draft";
  if (ad.status === "sending") return "setting-up";
  if (ad.status === "failed") return "couldnt-finish";
  const says = ad.platformWord === null ? null : (PLATFORM_SAYS[ad.platform].get(ad.platformWord) ?? null);
  if (ad.totalMinor !== null && ad.spentMinor >= ad.totalMinor) return "finished";
  if (ad.intent === "ended" || says === "removed" || (ad.endDay !== null && ad.endDay < today)) return "ended";
  // Its last switch went unanswered: followed until a read says, and past a few minutes said as not confirmed.
  if (ad.unanswered === "long") return "unconfirmed";
  if (ad.unanswered === "lately") return "setting-up";
  if (says === "refused" || says === "unpaid" || says === "troubled") return "needs-you";
  // The platform's word on whether it runs wins over what was asked: an ad resumed there is spending.
  if (says === "running") return "on";
  if (ad.intent === "paused") return "paused";
  // Asked for on, and paused on the platform: someone paused it there, and only the owner can say which is meant.
  return says === "paused" ? "needs-you" : "review";
}

/**
 * An ad account's badge at `nowMs`, from what is kept of it; null where the workspace has none on the platform. An
 * account whose access the platform took back, or whose token has run out, needs connecting again.
 */
export function adAccountStateOf(
  account: { status: "choosing" | "connected" | "revoked" | "disconnected"; tokenExpiresAt: string | null } | null,
  nowMs: number,
): AdAccountStatus {
  if (account === null || account.status === "disconnected") return "not-connected";
  if (account.status === "choosing") return "choose";
  if (account.status === "revoked") return "lapsed";
  const expiresMs = account.tokenExpiresAt === null ? null : Date.parse(account.tokenExpiresAt);
  return expiresMs !== null && expiresMs <= nowMs ? "lapsed" : "connected";
}
