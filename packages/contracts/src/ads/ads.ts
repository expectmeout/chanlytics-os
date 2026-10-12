/**
 * What an owner's ads are, as a reader will return them (the Ads page's DTO): the data of Campaigns › Ads, in the words the
 * rest of the product keeps. Money is an integer in the minor units of the account's currency, never a float and never
 * converted; a day is an ISO day (`2026-10-11`) and a moment an ISO timestamp with its offset; an id is Chanlytics' own (a
 * uuid) beside the platform's, and a person or a thread carries the id its own page opens by.
 *
 * Two shapes: `AdsRead`, what is true of this workspace now (its ads, accounts and people, read at one moment), and
 * `AdsConfig`, what the platforms return as choices and estimates (fixed per account, not per ad). A page draws a model of
 * both (page.ts, drawer.ts, new-ad.ts); nothing a page says is typed here as a total. The sample the mockup draws is a
 * fixture of these shapes in the dashboard (surfaces/campaigns/ads/sample.ts), and a reader will return the same.
 *
 * A root module of the package, for the server and Reports to read: types, the day arithmetic every Ads module shares, and
 * the one rule of how much an ad spends a day once its amount or end moves. Its words are words.ts's.
 */
import type { AppointmentWord } from "../journey/appointment-word";
import { DAY_MS } from "../shared/time";

/** The three platforms an owner's own ad accounts live on. */
export type AdPlatform = "meta" | "google" | "tiktok";

/** What an ad asks a person to do: message you on WhatsApp, call you, leave their number. */
export type AdDoor = "whatsapp" | "call" | "form";

/**
 * What an ad is doing, in platform-free words. `too-early` is NOT stored: the page's fold reads it from an `on` ad that
 * started fewer than TOO_EARLY_DAYS ago. `setting-up`: Turn on was pressed and Chanlytics is creating it, paused, on the
 * platform; `couldnt-finish`: that failed part way, and what was made stays paused there (named in the drawer).
 */
export type AdState = "setting-up" | "couldnt-finish" | "review" | "on" | "paused" | "needs-you" | "ended" | "finished";

/** Why an ad needs the owner. */
export type AdNeedsCode =
  | "rejected"
  | "payment"
  | "paused-in-platform"
  | "price-changed"
  | "permission-lapsing"
  | "number-check"
  | "verification"
  | "lead-terms"
  | "identity"
  | "out-of-budget";

export interface AdNeeds {
  code: AdNeedsCode;
  /** The platform's own words, verbatim, where it gave some (a rejection's policy line). */
  platformWords: string | null;
  /** price-changed: the price the ad says, and the one Services says now. */
  was: string | null;
  now: string | null;
}

/** What the platform enforces: a total for the whole run, or a daily amount until stopped. Minor units of the account's currency. */
export type AdBudget = { mode: "total"; amountMinor: number } | { mode: "daily"; amountMinor: number };

/** Where it shows: a circle (Meta, Google) or ZIP codes (TikTok). */
export type AdArea = { kind: "radius"; miles: number } | { kind: "zips"; zips: string[] };

/** What the ad shows: a post as it is, a photo, a video (vertical for Reels and TikTok), or nothing (Google Search). */
export type AdMedia =
  | { kind: "post"; postId: string }
  | { kind: "photo"; label: string }
  | { kind: "video"; label: string; vertical: boolean }
  | { kind: "none" };

/** When it runs: all hours, or only while the business is open (Meta: only with a total). */
export type AdSchedule = "always" | "open-hours";

/** Who the ad is shown as: the Facebook Page and Instagram handle, Google's business name, TikTok's display name. */
export interface AdShownAs {
  name: string;
  handle: string | null;
}

/** One day of one ad (the account's time zone for spend, the workspace's for people; the fold never mixes them up). */
export interface AdDay {
  day: string;
  spendMinor: number;
  inTouch: number;
  booked: number;
}

/** The platform's own numbers, kept off the page's face, never summed across platforms. Null is not read. */
export type AdTheirs =
  | {
      platform: "meta";
      impressions: number | null;
      reach: number | null;
      taps: number | null;
      chats: number | null;
      leads: number | null;
    }
  | {
      platform: "google";
      impressions: number | null;
      clicks: number | null;
      calls: number | null;
      longCalls: number | null;
    }
  | {
      platform: "tiktok";
      impressions: number | null;
      reach: number | null;
      clicks: number | null;
      leads: number | null;
    };

/** The words an ad is made of (every one a sentence the owner can read and change). */
export interface AdCopy {
  headline: string;
  text: string;
  headlines: string[];
  lines: string[];
  path: string;
  greeting: string;
  ready: string;
  questions: string[];
  startWith: "ready" | "questions";
  reply: string;
  thanks: string;
}

export interface AdRead {
  /** Chanlytics' own id (a uuid). The address uses it. */
  id: string;
  /** The platform's id for it once made there (Meta's ad id, Google's campaign id, TikTok's ad id); null before. */
  externalId: string | null;
  /** Bumped on every change; a press carries the version it was drawn from and a stale one is refused. */
  version: number;
  name: string;
  offer: string;
  serviceId: string;
  platform: AdPlatform;
  door: AdDoor;
  state: AdState;
  needs: AdNeeds | null;
  /** False for an ad the owner made on the platform itself, adopted read-only: only Pause and Resume here. */
  madeHere: boolean;
  startDay: string;
  endDay: string;
  /** `11:59 pm` where the platform says when the last day ends, else null. */
  endsAt: string | null;
  budget: AdBudget;
  /**
   * TikTok: the last day its amount was changed there (an ISO day), or null where it never was; it takes no second change
   * for BUDGET_RULES.tiktok.waitDays after it. Absent where the platform's reader does not say, which draws no wait.
   */
  budgetChangedDay?: string | null;
  /** The account's currency, ISO 4217 (`USD`). Never converted. */
  currency: string;
  aboutADayMinor: number;
  area: AdArea;
  schedule: AdSchedule;
  shownAs: AdShownAs;
  media: AdMedia;
  /** Google: the page the ad opens (its final URL); null on Meta and TikTok. */
  opensUrl: string | null;
  /** Google: what people search, as Google grouped it (read-only). */
  searchThemes: string[];
  /** Google: searches left out for the owner (negative keywords). */
  leftOut: string[];
  approvedDay: string | null;
  /** When it was sent to the platform to check (ISO timestamp), while in review. */
  sentAt: string | null;
  theirs: AdTheirs;
  /** Chanlytics' first reply to those who wrote: the median in seconds, and how many. */
  reply: { medianSeconds: number; n: number } | null;
  todaySoFar: number;
  /** When the last person (or number) arrived (ISO timestamp); the reach line says it, derived, never typed. */
  lastArrivalAt: string | null;
  copy: AdCopy;
  days: AdDay[];
}

/** One person an ad brought, with where they live in the app. */
export interface AdPersonRead {
  /** The person's id in People: their page is `clients/<personId>` (see People's route words). */
  personId: string;
  /** Their conversation, where there is one: `inbox/<threadId>`. */
  threadId: string | null;
  adId: string;
  name: string;
  how: "wrote" | "number";
  day: string;
  /** ISO timestamp, where it is today. */
  at: string | null;
  said: string | null;
  /** `waiting` and `call` are on the owner; `talking` is the receptionist's. */
  talk: "waiting" | "call" | "talking" | "quiet";
  quietSince: string | null;
  /** What the calendar says of them since. */
  cal:
    | { kind: "none" }
    | { kind: "ahead"; day: string; time: string }
    | { kind: "kept"; day: string }
    | { kind: "missed"; day: string }
    | { kind: "past"; day: string };
}

export type AdAccountStatus = "connected" | "not-connected" | "choose" | "lapsed";

/** What one platform's account stands on, by id; the words for each id are words.ts's (never typed in data). */
export type AdCheckId =
  | "account-active"
  | "payment"
  | "page-linked"
  | "whatsapp-linked"
  | "instagram-linked"
  | "chanlytics-whatsapp"
  | "number-on-page"
  | "call-reporting"
  | "verification"
  | "tiktok-linked"
  | "privacy-link"
  | "yes-line"
  | "lead-terms"
  | "identity"
  | "post-permission"
  | "manager-link";

export interface AdCheck {
  id: AdCheckId;
  ok: boolean;
}

export interface AdAccountRead {
  platform: AdPlatform;
  status: AdAccountStatus;
  /** The account's name on the platform, null until one is chosen. */
  name: string | null;
  externalId: string | null;
  currency: string;
  /** The account's time zone (IANA): spend days are the account's. */
  timezone: string;
  checks: AdCheck[];
  /** TikTok's post permission, Meta's token: the day it lapses, or null. */
  permissionEnd: string | null;
  /** The accounts to choose from, when there are several (status `choose`). */
  choices: { externalId: string; name: string; currency: string }[];
  /** When it was last read (ISO timestamp), or null. */
  readAt: string | null;
  /** How the last read went. */
  read: "ok" | "reading" | "failed";
}

export interface AdsRead {
  business: {
    name: string;
    /** `12 Harbor St`. */
    address: string;
    /** `Harbor St`. */
    street: string;
    /** The receptionist's line. */
    line: string;
    site: string;
    /** The hosted page Google ads can open: `chanlytics.com/b/<slug>`. */
    page: string;
    /** The receptionist's hours, as words: `Mon to Sat`, `Mon to Sat, 9 AM to 6 PM`. */
    hours: string;
  };
  /** The workspace's today (ISO day) and when this was read (ISO timestamp), in the workspace's time zone. */
  today: string;
  readAt: string;
  timezone: string;
  /** The window the page counts: 30 days ending yesterday. */
  window: { from: string; to: string };
  appointmentWord: AppointmentWord;
  /** Whether a calendar link is set; without one nobody can be counted as booked. */
  calendar: { linked: boolean; readAt: string | null };
  accounts: AdAccountRead[];
  ads: AdRead[];
  people: AdPersonRead[];
  /** What came back of those who booked, and the appointments no person was found for. */
  cameBack: { ahead: number; kept: number; missed: number; past: number; unmatched: number };
  /** The price note of each is verbatim from Services (`from $45`), never parsed. */
  services: {
    id: string;
    name: string;
    note: string;
    /** Whether it is a cosmetic service, which TikTok shows to people 25 and over; the name says so where this is not set. */
    cosmetic?: boolean;
  }[];
  posts: {
    id: string;
    platform: "meta" | "tiktok";
    kind: "photo" | "video";
    label: string;
    day: string;
    caption: string;
  }[];
  /** The rating line: `4.9 on Google`; null where it cannot be read. */
  rating: { stars: string; reviews: number; asOf: string } | null;
  /** Whether the receptionist is set to never quote prices. */
  neverQuotePrices: boolean;
  /** Before any ad: how new people first reached the business (People's first touch), or null. */
  firstTouch: { since: string; rows: { label: string; n: number; own: boolean }[] } | null;
}

/** What the platforms return as choices and estimates; fixed per account, not per ad. */
export interface AdsConfig {
  presets: {
    id: "try" | "steady" | "more";
    label: string;
    perDayMinor: number;
    days: number;
    /** The platform's estimate of chats over the run, or null where it returns none. */
    estimate: readonly [number, number] | null;
  }[];
  areas: {
    miles: number;
    /** The platform's estimate of people in the circle, or null where it returns none. */
    people: readonly [number, number] | null;
  }[];
  /** Google's estimate at a daily amount: clicks a month, and what a click usually costs (low, high). */
  googleEstimate: { clicks: readonly [number, number]; perClickMinor: readonly [number, number] };
  /** What a platform reads as its floor per day, from the ad account; null where it says none. */
  minPerDayMinor: Record<AdPlatform, number | null>;
}

/** A currency's minor units in one unit (cents in a dollar): the exponent every amount here is read by. */
export const MINOR_PER_UNIT = 100;

// ---------------------------------------------------------------------------------------------------------------------
// Calendar arithmetic on ISO days (UTC noon, so no zone or daylight saving moves a day).

const atNoon = (iso: string): number => Date.parse(`${iso}T12:00:00Z`);

/** The ISO day `n` days after `iso` (before, where n is negative). */
export function addDays(iso: string, n: number): string {
  return new Date(atNoon(iso) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (positive where b is later). */
export const daysBetween = (a: string, b: string): number => Math.round((atNoon(b) - atNoon(a)) / DAY_MS);

/**
 * About how much a day an ad spends once its amount or end moves: the amount itself for a daily budget; for a total, what is
 * left of it over the days left to its end (today included), in whole units, so "about $15 a day" follows a raise or a later
 * end.
 */
export function aboutADayAfter(o: { ad: AdRead; amountMinor: number; endDay: string; today: string }): number {
  const { ad, amountMinor, endDay, today } = o;
  if (ad.budget.mode === "daily") return amountMinor;
  const spent = ad.days.reduce((all, d) => all + d.spendMinor, 0);
  const daysLeft = Math.max(1, daysBetween(today, endDay) + 1);
  const units = Math.max(0, Math.round((amountMinor - spent) / daysLeft / MINOR_PER_UNIT));
  return units * MINOR_PER_UNIT;
}

/** What Edit changes in one press of Save: only the fields it moved. */
export interface AdPatch {
  serviceId?: string;
  area?: AdArea;
  endDay?: string;
  amountMinor?: number;
  copy?: AdCopy;
  /** A new photo was chosen (the sample has none to pick). */
  photo?: boolean;
}

/** Whether two areas are the same: the same circle, or the same ZIP codes. */
export function sameArea(a: AdArea, b: AdArea): boolean {
  if (a.kind === "radius" && b.kind === "radius") return a.miles === b.miles;
  return a.kind === "zips" && b.kind === "zips" && a.zips.join(",") === b.zips.join(",");
}

const saidWords = (c: AdCopy): string => JSON.stringify([c.headline, c.text, c.headlines, c.lines]);

/**
 * Whether a change sends the ad back to its platform for checking: the offer, the photo, the words or the area do, an amount
 * or an end date does not, and an ad the platform turned down is checked again whatever else moved.
 */
export function patchRestarts(ad: AdRead, patch: AdPatch): boolean {
  const offer = patch.serviceId !== undefined && patch.serviceId !== ad.serviceId;
  const area = patch.area !== undefined && !sameArea(patch.area, ad.area);
  const words = patch.copy !== undefined && saidWords(patch.copy) !== saidWords(ad.copy);
  return offer || area || words || patch.photo === true || ad.needs?.code === "rejected";
}

/** The ad with a patch in it: the offer follows its Service, and the amount a day follows an amount or an end that moved. */
export function adWith(ad: AdRead, read: AdsRead, patch: AdPatch): AdRead {
  const service = patch.serviceId === undefined ? undefined : read.services.find((s) => s.id === patch.serviceId);
  let next: AdRead = service ? { ...ad, offer: service.name, serviceId: service.id } : ad;
  if (patch.area) next = { ...next, area: patch.area };
  if (patch.copy) next = { ...next, copy: patch.copy };
  if (patch.amountMinor === undefined && patch.endDay === undefined) return next;
  const amountMinor = patch.amountMinor ?? ad.budget.amountMinor;
  const endDay = patch.endDay ?? ad.endDay;
  const aboutADayMinor = aboutADayAfter({ ad, amountMinor, endDay, today: read.today });
  return { ...next, endDay, budget: { ...ad.budget, amountMinor }, aboutADayMinor };
}
