/**
 * A new ad's draft, the parts code picks (the Ads plan's 4.6 and 5.1; decision 0050): which service it offers, which
 * picture it shows, the area, the amount and the day it ends, and what would stop any of them before Turn on. Rules
 * with tests and no model: the words alone are the ad writer's (ask/skills/ad), and it decides none of this.
 *
 * Every rule here leans on what Meta's own pages showed on 19 November 2026
 * (docs/plans/2026-11-18-ads-meta-checks.md):
 *
 *  - Meta's least is set for a day and holds for a total too, so a total is never under the account's least for a day
 *    times every calendar day the run touches (seen on the paused-ad check, 20 November 2026). No page names a
 *    shortest run for a total: here it is one whole day.
 *  - One picture is shown in every place, so it is the feed's shape (4:5 through square to 1.91:1, at least 600 pixels
 *    wide), which stories and Reels show whole. A video runs 3 to 60 seconds, inside every place's own limits.
 *  - A video with music runs as an ad only with a licence of the advertiser's own, and a person shown must have said
 *    yes to ads. Until Content answers both (its step L4), a draft offers only what shows nobody and has no music
 *    (the plan's G15).
 *  - An ad about a job, housing, financial products, politics or gambling is declared to Meta, which then fixes the
 *    ages and refuses a small area. It is not run here in the first version (the plan's G7).
 *
 * Money is whole minor units of the account's own currency (money.ts), never converted.
 */
import { addDays, daysBetween } from "./ads";
import { minorPerUnit } from "./money";

/* ------------------------------------------------------------ special kinds */

/** The kinds of ad Meta asks an advertiser to declare (its special ad categories), in Chanlytics' words. */
export type AdSpecialKind = "employment" | "housing" | "financial" | "politics" | "gambling";
const SPECIAL_KINDS: readonly AdSpecialKind[] = ["employment", "housing", "financial", "politics", "gambling"];

const SPECIAL_KIND_WORDS: Record<AdSpecialKind, RegExp> = {
  employment:
    /\b(?:now hiring|we(?:'re| are) hiring|job (?:opening|offer|vacanc)\w*|join our team|vacantes?|empleos?|estamos contratando|se busca personal|oferta de trabajo)\b/i,
  // A place offered to live in or to buy, never a service done in one: cleaning an apartment is no housing ad.
  housing:
    /\b(?:for (?:rent|sale|lease)|mortgages?|real estate|home loans?|se renta|se alquila|se vende|en (?:renta|venta|alquiler)|hipotecas?|bienes ra[ií]ces)\b/i,
  // A product that is money itself. Taking a card, or an insurer's plan, at the till is not one.
  financial:
    /\b(?:loans?|credit (?:cards?|scores?|repair)|refinanc\w+|insurance (?:quotes?|polic(?:y|ies))|invest(?:ment|ing) (?:plans?|accounts?|advice)|pr[eé]stamos?|tarjetas? de cr[eé]dito|p[oó]lizas? de seguro|seguros? de (?:vida|auto|salud)|planes? de inversi[oó]n)\b/i,
  politics:
    /\b(?:vote for|voting|elections?|candidates?|ballots?|vota por|votaci[oó]n|elecci[oó]n(?:es)?|candidat[oa]s?|campaña pol[ií]tica)\b/i,
  gambling: /\b(?:casinos?|betting|sportsbook|gambl\w+|lotter(?:y|ies)|apuestas?|loter[ií]as?)\b/i,
};

/**
 * The special kinds some words read as, in Meta's order; none for most. A floor, not Meta's own answer: where it finds
 * one the draft asks the owner (the plan's G7), and an ad of that kind is not run here.
 */
export function adSpecialKinds(text: string): AdSpecialKind[] {
  return SPECIAL_KINDS.filter((kind) => SPECIAL_KIND_WORDS[kind].test(text));
}

/* -------------------------------------------------------------- the picture */

/** A picture or video a draft could show, as much of it as the rules read. */
export interface AdPicture {
  id: string;
  /** The service it is about; null where it is about none in particular. */
  serviceId: string | null;
  kind: "photo" | "video";
  width: number;
  height: number;
  /** A video's length in seconds; null for a photo, or where it is not known. */
  seconds: number | null;
  /** Whether anyone is shown, and whether it has music. Null is not noted yet, which is read as yes. */
  people: boolean | null;
  music: boolean | null;
  /** Whether it sets a before beside an after. */
  beforeAfter: boolean;
  /** Whether AI made it: offered before one the business only kept. */
  made: boolean;
}

/**
 * A before set beside an after, said in words (English and Spanish): what Meta's rules on appearance turn down, of a
 * picture as its look describes it and of an ad's own words alike (the server's ask/skills/ad/checks.ts reads this one).
 */
export const AD_BEFORE_AFTER = /\bbefore[\s-]*(?:and|&|\/)[\s-]*after\b|\bantes y despu[eé]s\b/i;

/** The shapes Meta's feeds take, as width over height, with the leeway its Ads Guide gives (3%). */
const FEED_SHAPE = { tallest: (4 / 5) * 0.97, widest: 1.91 * 1.03 } as const;
const PICTURE_MIN_WIDTH = 600;
const VIDEO_SECONDS = { least: 3, most: 60 } as const;

/** Why a picture is not offered for an ad. */
export type AdPictureIssue = "person" | "music" | "before_after" | "small" | "shape" | "length";

/** What stops a picture from being offered for an ad; null where it is fine in ads. */
export function adPictureIssue(adPicture: AdPicture): AdPictureIssue | null {
  if (adPicture.people !== false) return "person";
  if (adPicture.kind === "video" && adPicture.music !== false) return "music";
  if (adPicture.beforeAfter) return "before_after";
  if (!(adPicture.width >= PICTURE_MIN_WIDTH)) return "small";
  const shape = adPicture.width / adPicture.height;
  if (!(shape >= FEED_SHAPE.tallest && shape <= FEED_SHAPE.widest)) return "shape";
  if (adPicture.kind !== "video") return null;
  const { seconds } = adPicture;
  return seconds !== null && seconds >= VIDEO_SECONDS.least && seconds <= VIDEO_SECONDS.most ? null : "length";
}

/* ----------------------------------------------------- the amount, the end */

/** How long a draft runs to begin with, and the shortest run a draft takes, in days. */
export const AD_RUN_DAYS = { draft: 14, least: 1 } as const;
/**
 * The miles an ad runs over: what a draft begins with, and the fewest and the most it may be set to, whole miles
 * inside the circle Meta takes (0.63 to 50).
 */
export const AD_MILES = { draft: 5, least: 1, most: 50 } as const;
/** Under this many people booked from ads, a draft promises no number of bookings and proposes a starting amount. */
export const AD_BOOKED_TO_FORECAST = 5;

const wholeUnitsUp = (minor: number, currency: string): number => {
  const unit = minorPerUnit(currency);
  return Math.ceil(minor / unit) * unit;
};

/**
 * Meta's least for a total: the account's least for a day times every calendar day the run touches, today and its last
 * day both counted, as a whole amount of the currency. Meta counts a run to the hour, from the moment it starts to the
 * end of its last day, and wants more than its least a day for each part of a day: on the paused-ad check (20 November
 * 2026) a run from midday to the end of a day fourteen days on was refused at $14.00 and asked for more than $14.48.
 * `days` is whole days from today to the last day: 0 for a run that ends today.
 */
export function adLeastTotal(account: { currency: string; minDailyMinor: number }, days: number): number {
  return wholeUnitsUp(account.minDailyMinor * (Math.max(0, days) + 1), account.currency);
}

/** What is wrong with an amount, and the nearest amount that is right. */
export interface AdAmountIssue {
  code: "under_least" | "over_most" | "not_whole";
  nearestMinor: number;
}

/**
 * What stops an amount before Turn on: under Meta's least for the run, over the most the owner said, or not a whole
 * amount of the currency (which is what an owner approves, and what Meta holds exact in every currency). Null where it
 * may be sent. An owner's most under Meta's least leaves no amount: the least is said, as over their most.
 */
export function adAmountIssue(amount: {
  totalMinor: number;
  days: number;
  account: { currency: string; minDailyMinor: number };
  ownerMostMinor: number | null;
}): AdAmountIssue | null {
  const { totalMinor, account, ownerMostMinor } = amount;
  const least = adLeastTotal(account, amount.days);
  if (ownerMostMinor !== null && totalMinor > ownerMostMinor)
    return { code: "over_most", nearestMinor: Math.max(least, ownerMostMinor) };
  if (!Number.isSafeInteger(totalMinor) || totalMinor < least) return { code: "under_least", nearestMinor: least };
  const whole = wholeUnitsUp(totalMinor, account.currency);
  return whole === totalMinor ? null : { code: "not_whole", nearestMinor: whole };
}

/** What stops an end date before Turn on: one that leaves no whole day to run. Null where it may be sent. */
export function adEndIssue(today: string, endDay: string): { code: "too_soon"; nearestDay: string } | null {
  return daysBetween(today, endDay) >= AD_RUN_DAYS.least
    ? null
    : { code: "too_soon", nearestDay: addDays(today, AD_RUN_DAYS.least) };
}

/* ---------------------------------------------------------------- the draft */

/** A service a draft could offer, as Services lists it. */
export interface AdServiceFacts {
  id: string;
  name: string;
  /** Whether an ad already runs for it. */
  advertised: boolean;
  /** How many times it was booked in the last 90 days. */
  booked: number;
}

/** What a draft is picked from. */
export interface AdDraftInputs {
  /** Today in the business's zone. */
  today: string;
  /** In Services' own order. */
  services: readonly AdServiceFacts[];
  /** In the order Files offers them. */
  pictures: readonly AdPicture[];
  address: string | null;
  /** Whether AI answers a WhatsApp number the ad can open. */
  whatsapp: boolean;
  account: { currency: string; minDailyMinor: number };
  /** What ads have brought this business so far, and the largest total it has turned on; nulls before any. */
  history: { booked: number; costPerBookedMinor: number | null; largestTotalMinor: number | null };
  /** The most the owner said an ad may cost, once, in a sentence; null until they do (the plan's G6). */
  ownerMostMinor: number | null;
  /** The Calendar's open times over the run; null with no calendar link. */
  openTimes: number | null;
}

/** The one thing a draft waits for, where it cannot be written yet (the plan's G13). */
export type AdDraftMissing = "service" | "address" | "whatsapp" | "picture";

/**
 * Why a draft proposes its amount (the plan's 4.6 and G6), which the draft says in a line. Never a number of bookings.
 *
 *  - starting: Meta's least, "A starting amount.": fewer than five booked from ads or no cost known yet (few_booked),
 *    no calendar link (no_calendar), or no open time over the run (full).
 *  - booked: the open times over the run, times what a booking from an ad has cost, and where that was moved: down to
 *    the owner's most (owner_most), down to the largest total turned on (largest_turned_on), down to Meta's least with
 *    neither yet (nothing_turned_on), or up to Meta's least (meta_least).
 */
type AdAmountBasis =
  | { kind: "starting"; why: "few_booked" | "no_calendar" | "full" }
  | {
      kind: "booked";
      openTimes: number;
      costPerBookedMinor: number;
      heldTo: "owner_most" | "largest_turned_on" | "nothing_turned_on" | "meta_least" | null;
    };

/** The parts of a draft code picks. The words are the ad writer's. */
export interface AdDraftParts {
  serviceId: string;
  pictureId: string;
  miles: number;
  totalMinor: number;
  /** Why that amount: a starting amount, with no number of bookings promised, or the bookings it was worked out from. */
  basis: AdAmountBasis;
  days: number;
  endDay: string;
}

/** The picture a service's ad shows: one about it before one about nothing in particular, a video before a photo. */
function pictureFor(serviceId: string, pictures: readonly AdPicture[]): AdPicture | null {
  const rank = (adPicture: AdPicture): number =>
    (adPicture.serviceId === serviceId ? 0 : 4) + (adPicture.kind === "video" ? 0 : 2) + (adPicture.made ? 0 : 1);
  const fine = pictures.filter(
    (adPicture) =>
      (adPicture.serviceId === serviceId || adPicture.serviceId === null) && adPictureIssue(adPicture) === null,
  );
  // A stable sort: two of the same rank stay in the order Files offers them.
  return [...fine].sort((first, second) => rank(first) - rank(second))[0] ?? null;
}

/** Where an amount worked out from bookings was moved to stay inside its ceiling and Meta's least; null where it was not. */
function heldTo(
  wanted: number,
  least: number,
  ceiling: { ownerMostMinor: number | null; largestTotalMinor: number | null; most: number },
): Extract<AdAmountBasis, { kind: "booked" }>["heldTo"] {
  if (wanted < least) return "meta_least";
  if (wanted <= ceiling.most) return null;
  if (ceiling.ownerMostMinor !== null) return "owner_most";
  return ceiling.largestTotalMinor !== null ? "largest_turned_on" : "nothing_turned_on";
}

/**
 * The amount a draft proposes, and why (the plan's 4.6 and G6). With five people booked from ads, a cost for each, and
 * a calendar with an open time over the run: the open times, times what a booking from an ad has cost. Otherwise Meta's
 * least, a starting amount. Never under Meta's least; never above the owner's most, or before they said one the
 * largest total they have turned on, or before any, Meta's least. The one place a draft's amount is worked out.
 */
function amountFor(inputs: AdDraftInputs, days: number): { totalMinor: number; basis: AdAmountBasis } {
  const { account, history, openTimes, ownerMostMinor } = inputs;
  const least = adLeastTotal(account, days);
  const cost = history.costPerBookedMinor;
  const starting = (reason: Extract<AdAmountBasis, { kind: "starting" }>["why"]) => ({
    totalMinor: least,
    basis: { kind: "starting" as const, why: reason },
  });
  if (history.booked < AD_BOOKED_TO_FORECAST || cost === null || !(cost > 0)) return starting("few_booked");
  if (openTimes === null) return starting("no_calendar");
  if (!(openTimes > 0)) return starting("full");
  const { largestTotalMinor } = history;
  const most = Math.max(least, ownerMostMinor ?? largestTotalMinor ?? least);
  const wanted = wholeUnitsUp(openTimes * cost, account.currency);
  return {
    totalMinor: Math.min(most, Math.max(least, wanted)),
    basis: {
      kind: "booked",
      openTimes,
      costPerBookedMinor: cost,
      heldTo: heldTo(wanted, least, { ownerMostMinor, largestTotalMinor, most }),
    },
  };
}

/**
 * A draft's parts, or the one thing missing. The service, in this order (the plan's G5): never one an ad already runs
 * for; never one with no picture that is fine in ads; then the one booked most in the last 90 days; else the first in
 * Services. Prices are free text, so nothing here ranks by value.
 */
export function adDraftOf(
  inputs: AdDraftInputs,
): { ok: true; parts: AdDraftParts } | { ok: false; missing: AdDraftMissing } {
  const open = inputs.services.filter((service) => !service.advertised);
  if (open.length === 0) return { ok: false, missing: "service" };
  if (!inputs.address?.trim()) return { ok: false, missing: "address" };
  if (!inputs.whatsapp) return { ok: false, missing: "whatsapp" };
  const shown = open.flatMap((service) => {
    const picture = pictureFor(service.id, inputs.pictures);
    return picture ? [{ service, picture }] : [];
  });
  // The most booked first; a tie, and nobody booked at all, keep Services' own order.
  const [picked] = [...shown].sort((first, second) => second.service.booked - first.service.booked);
  if (!picked) return { ok: false, missing: "picture" };
  const days = AD_RUN_DAYS.draft;
  return {
    ok: true,
    parts: {
      serviceId: picked.service.id,
      pictureId: picked.picture.id,
      miles: AD_MILES.draft,
      ...amountFor(inputs, days),
      days,
      endDay: addDays(inputs.today, days),
    },
  };
}
