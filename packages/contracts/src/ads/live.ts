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
import { zoneDayKey } from "../shared/clock";
import { recordOrEmpty } from "../shared/unknown";
import { MIN_MS } from "../shared/time";
import type { AdState } from "./ads";
import type { AdChangeOnWay } from "./change";
import { adStateOf } from "./states";

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

/**
 * Why the launch of an ad made here stopped part way: Meta refused a step (in its own words); what Meta held was not
 * what was approved; a make whose answer never came was never found; AI was stopped; the account was disconnected or
 * signed out; the picture could not be sent (a video, or one Files no longer holds); what was approved could not be
 * read whole; or turning ads on from here was switched off on this deployment before it finished.
 */
export type AdStopped =
  "refused" | "differs" | "unanswered" | "ai_stopped" | "disconnected" | "signed_out" | "picture" | "business" | "off";

/** A part of an ad made here that is still at the platform after its launch stopped, named and paused there. */
export type AdPartLeft = "campaign" | "set" | "picture" | "ad";

/** What an ad made here says of its launch: why it stopped, Meta's own words, and what was left at the platform. */
export interface AdLaunchLive {
  stopped: AdStopped | null;
  said: string | null;
  left: AdPartLeft[];
}

/**
 * An ad made here, as its drawer's sentence says it and its owner changes it (the Ads plan's 4.5): where it is shown,
 * its first day, a change of the owner's still on its way to Meta, when Meta takes the next change of its amount, and
 * whether Meta holds a total or a last day other than the one approved here (changed in Meta, and never put back).
 */
export interface AdMadeHereLive {
  /** The circle's miles; null where it is shown across a wider place, named by `place`. */
  miles: number | null;
  place: { kind: "city" | "region" | "country"; name: string } | null;
  /** The run's first day in the account's zone: Meta's least is counted from it. */
  start_day: string;
  change: AdChangeOnWay | null;
  /** When its amount can next be changed, where Meta's four an hour are used; null where it can be now. */
  amount_after: string | null;
  changed_in_meta: boolean;
}

/** One ad on the page. */
export interface AdLiveDto {
  /** Chanlytics' own id (a uuid): the address uses it. */
  id: string;
  name: string;
  /** Whether the owner made it at the platform itself (adopted: read, paused and, where C1 allows, resumed). */
  made_in_platform: boolean;
  /** Where it shows, by the platform's own names (facebook, instagram, ...); null where that is not known. */
  shown_on: string[] | null;
  /** An ad made here: how its launch went. Null for an ad made at the platform. */
  launch: AdLaunchLive | null;
  /** An ad made here: what its owner changes from its drawer. Null for an ad made at the platform. */
  made_here: AdMadeHereLive | null;
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
    /** Every check the account's card counts passes (adCardChecksOf, as the card reads them): an ad may be made on it. */
    ready: boolean;
    /** Meta's least a day for the account, and the most the owner said any ad may cost; null where neither is known. */
    min_daily_minor: number | null;
    most_minor: number | null;
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
  /**
   * When AI was stopped (Stop everything), as the workspace's settings keep it; null while AI runs. While it is, no ad
   * is turned on from here, and the page says how many are still on, with the press that pauses them all (the Ads
   * plan's G17).
   */
  stopped_at: string | null;
  /**
   * The people an ad brought who need you now, longest waiting first (the Ads plan's 4.4): each judged by the one
   * standing rule over their latest conversation (contracts standingOfThread), so they are people the Inbox's Needs you
   * and Today hold, found from the holds that wait as they read them (the newest of them, as many as they read).
   * Whoever first came through an ad, whenever, since what they wait for is now. The longest waits by name, and how many
   * in all; none where the read of them failed, which the page then says nothing of.
   */
  needs_you: {
    count: number;
    /**
     * Each: their id in People, their name, the conversation they wait in (it opens in the Inbox), and when their wait
     * began (ISO): the hold's moment, else their conversation's last message; null where neither is.
     */
    people: Array<{ id: string; name: string; conversation_id: string; since: string | null }>;
  };
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

/** What an ad's badge reads of its row. */
interface AdStateFacts {
  platform: string;
  status: string;
  intent: string;
  platform_state: string | null;
  ends_at: string | null;
  budget_kind: string | null;
  budget_minor: number | null;
  budget_left_minor: number | null;
  /** An ad made here: where its launch stands (ads.launch); absent or null for one made at the platform. */
  launch?: unknown;
}

/** How long a last switch that went unanswered is followed before the page says it couldn't confirm it (the plan's 4.7). */
const UNCONFIRMED_AFTER_MS = 5 * MIN_MS;

/** When a launch's last write went unanswered, as ads.launch keeps it; null where none did, or a read settled it. */
function unansweredOf(row: AdStateFacts, nowMs: number): "lately" | "long" | null {
  const at = recordOrEmpty(row.launch).unknown_at;
  const sinceMs = typeof at === "string" ? Date.parse(at) : NaN;
  if (row.status !== "made" || !Number.isFinite(sinceMs)) return null;
  return nowMs - sinceMs >= UNCONFIRMED_AFTER_MS ? "long" : "lately";
}

/**
 * An ad's badge from its row, at a moment in its account's zone: the one reading of a row into what adStateOf asks.
 * The page that draws an ad and the edge that acts on one both ask here, so they cannot call one ad two things.
 */
export function adStateOfRow(row: AdStateFacts, at: { nowMs: number; timezone: string }): AdState | "draft" {
  const total = row.budget_kind === "total" ? row.budget_minor : null;
  return adStateOf(
    {
      status: row.status === "draft" || row.status === "sending" || row.status === "failed" ? row.status : "made",
      intent: row.intent === "on" || row.intent === "ended" ? row.intent : "paused",
      platform: row.platform === "google" || row.platform === "tiktok" ? row.platform : "meta",
      platformWord: row.platform_state,
      endDay: row.ends_at === null ? null : zoneDayKey(Date.parse(row.ends_at), at.timezone),
      totalMinor: total,
      // What a total has spent is what the platform says is no longer left of it.
      spentMinor: total !== null && row.budget_left_minor !== null ? total - row.budget_left_minor : 0,
      unanswered: unansweredOf(row, at.nowMs),
    },
    zoneDayKey(at.nowMs, at.timezone),
  );
}

/**
 * Whether an ad is left on: running, or its own switch on while its platform still checks it, so it starts by itself
 * the moment it is approved, or switched on with no answer heard yet, so it may be either. What a disconnect offers to
 * pause first, and what it says stays on (the plan's 4.9).
 */
export const adLeftOn = (state: AdState | "draft"): boolean =>
  state === "on" || state === "review" || state === "unconfirmed";

/** Whether an ad may be turned back on from here, and what the press may then cost at most. */
export type AdResume =
  | { ok: true; left_minor: number; ends_at: string }
  | { ok: false; why: "not_paused" | "no_total" | "no_end" | "shared" | "nothing_left" | "ended" };

/** What the rule reads of an ad's row. */
interface AdResumeFacts {
  origin: string;
  intent: string;
  platform_state: string | null;
  budget_kind: string | null;
  budget_left_minor: number | null;
  budget_shared: boolean | null;
  ends_at: string | null;
}

/**
 * Whether an ad may be turned back on from here (the plan's C1): only where the platform holds a total with an end
 * date for it, the ad has that budget to itself, something is left of it and its end has not passed. The press then
 * names the most it can cost, which the platform enforces itself. Anything else is turned back on at the platform,
 * where its amount is set. An ad the owner made at the platform and paused by its ad set or its campaign is not paused
 * by its own switch, so turning the ad on here would start nothing: it is `not_paused`. An ad made here is paused and
 * turned back on by its own campaign (decision 0050, call 9 holds for it the same way: a total, with an end, its own).
 */
export function adResumeRule(ad: AdResumeFacts, nowMs: number): AdResume {
  // An ad made here is paused by its own campaign, which holds nothing else: what the owner asked is what stands.
  const paused = ad.origin === "chanlytics" ? ad.intent === "paused" : ad.platform_state === "PAUSED";
  if (!paused) return { ok: false, why: "not_paused" };
  if (ad.budget_kind !== "total") return { ok: false, why: "no_total" };
  if (ad.ends_at === null) return { ok: false, why: "no_end" };
  if (ad.budget_shared !== false) return { ok: false, why: "shared" };
  if (Date.parse(ad.ends_at) <= nowMs) return { ok: false, why: "ended" };
  if (ad.budget_left_minor === null || ad.budget_left_minor <= 0) return { ok: false, why: "nothing_left" };
  return { ok: true, left_minor: ad.budget_left_minor, ends_at: ad.ends_at };
}
