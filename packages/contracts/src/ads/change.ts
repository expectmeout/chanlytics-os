/**
 * Changing a running ad made here (the Ads plan's step 4, item 6, 4.5 and 5.2; decision 0050, calls 3, 4 and 10, and
 * its Routes): its total, its last day, the miles it is shown across, or ending it for good. The rules, with tests and
 * no model, asked by the drawer that draws a press, the route that takes it and the edge before Meta is told, so the
 * three cannot differ.
 *
 * What Meta's own pages say (read 21 November 2026; docs/plans/2026-11-18-ads-meta-checks.md): a total can be changed,
 * never to less than a tenth over what it has spent; an ad set's amount is changed at most four times an hour; one
 * change to a thing every thirty seconds; and an archived ad is never turned on again, its numbers kept.
 *
 * What Meta holds is what the page says: every change is judged against Meta's own total and last day, as the
 * account's read last kept them, so a press never puts back what the owner changed in Meta.
 *
 * Money is whole minor units of the account's own currency (money.ts), never converted.
 */
import { zoneDayKey } from "../shared/clock";
import { HOUR_MS } from "../shared/time";
import { recordOrEmpty } from "../shared/unknown";
import { addDays, daysBetween } from "./ads";
import { AD_MILES, adEndIssue, adLeastTotal, adMostOf, wholeUnitsUp } from "./draft";

/** What an owner changes of a running ad made here. */
export type AdChangeWhat = "total" | "end_day" | "miles" | "end";

/** One change, as a press asks it. */
export type AdChangeAsk =
  | { what: "total"; total_minor: number }
  | { what: "end_day"; end_day: string }
  | { what: "miles"; miles: number }
  | { what: "end" };

/** What a change is judged against: the ad as Meta holds it, and its account. */
export interface AdChangeFacts {
  currency: string;
  /** Meta's least for a day, for this account. */
  minDailyMinor: number;
  /** The most the owner said any ad may cost; null until they say one (the plan's G6). */
  ownerMostMinor: number | null;
  /** The total Meta holds, and what it has spent of it. */
  totalMinor: number;
  spentMinor: number;
  /** The run's first day and its last, and today, each in the account's zone. */
  startDay: string;
  endDay: string;
  today: string;
  /** The circle's miles; null where the ad is shown across a wider place, which is changed in Meta. */
  miles: number | null;
}

/** Why a change can't be sent as asked, and the nearest that can. */
export type AdChangeIssue =
  | { code: "same" }
  | { code: "under_least" | "under_spent" | "over_most" | "not_whole"; nearest_minor: number }
  | { code: "too_soon"; nearest_day: string }
  /** A later last day than the total covers at Meta's least a day: the latest day it covers, and the total that would. */
  | { code: "too_long"; nearest_day: string; least_minor: number }
  | { code: "miles"; nearest_miles: number }
  | { code: "wide" };

/** Meta keeps a total at least a tenth over what it has spent (its ad set reference, read 21 November 2026). */
const OVER_SPENT = 1.1;

/** The least a run of these days takes at Meta, as a whole amount: its least a day for each calendar day touched. */
const leastFor = (facts: AdChangeFacts, endDay: string): number =>
  adLeastTotal({ currency: facts.currency, minDailyMinor: facts.minDailyMinor }, daysBetween(facts.startDay, endDay));

/**
 * The least total Meta takes for the ad now, and why: its least a day for every calendar day of the run, counted from
 * its first day (the dry run says Meta's own word), or a tenth over what it has spent, whichever is more.
 */
export function adChangeLeast(facts: AdChangeFacts): { minor: number; why: "least" | "spent" } {
  const least = leastFor(facts, facts.endDay);
  const spent = wholeUnitsUp(Math.ceil(facts.spentMinor * OVER_SPENT), facts.currency);
  return spent > least ? { minor: spent, why: "spent" } : { minor: least, why: "least" };
}

/** The latest last day a total covers at Meta's least a day, from the run's first day. */
function latestDayFor(facts: AdChangeFacts): string {
  let days = Math.max(0, Math.floor(facts.totalMinor / Math.max(1, facts.minDailyMinor)) - 1);
  while (days > 0 && leastFor(facts, addDays(facts.startDay, days)) > facts.totalMinor) days -= 1;
  return addDays(facts.startDay, days);
}

function totalIssue(total: number, facts: AdChangeFacts): AdChangeIssue | null {
  if (total === facts.totalMinor) return { code: "same" };
  const raise = total > facts.totalMinor;
  if (raise && facts.ownerMostMinor !== null && total > facts.ownerMostMinor)
    return { code: "over_most", nearest_minor: Math.max(facts.totalMinor, facts.ownerMostMinor) };
  const least = adChangeLeast(facts);
  if (!Number.isSafeInteger(total) || total < least.minor)
    return { code: least.why === "spent" ? "under_spent" : "under_least", nearest_minor: least.minor };
  const whole = wholeUnitsUp(total, facts.currency);
  return whole === total ? null : { code: "not_whole", nearest_minor: whole };
}

function endDayIssue(day: string, facts: AdChangeFacts): AdChangeIssue | null {
  if (day === facts.endDay) return { code: "same" };
  const soon = adEndIssue(facts.today, day);
  if (soon) return { code: "too_soon", nearest_day: soon.nearestDay };
  const least = leastFor(facts, day);
  return facts.totalMinor >= least ? null : { code: "too_long", nearest_day: latestDayFor(facts), least_minor: least };
}

function milesIssue(miles: number, facts: AdChangeFacts): AdChangeIssue | null {
  if (facts.miles === null) return { code: "wide" };
  if (miles === facts.miles) return { code: "same" };
  const whole = Math.min(AD_MILES.most, Math.max(AD_MILES.least, Math.round(miles)));
  return whole === miles ? null : { code: "miles", nearest_miles: whole };
}

/** What stops a change from being sent as asked; null where it may be. Ending an ad is always the owner's. */
export function adChangeIssue(ask: AdChangeAsk, facts: AdChangeFacts): AdChangeIssue | null {
  if (ask.what === "total") return totalIssue(ask.total_minor, facts);
  if (ask.what === "end_day") return endDayIssue(ask.end_day, facts);
  if (ask.what === "miles") return milesIssue(ask.miles, facts);
  return null;
}

/**
 * The most a change can cost, which its press names and carries (decision 0050, call 3): only a raise names one, its
 * new total, which Meta holds with the end. Lowering, a new last day, the miles and ending it are free: null.
 */
export function adChangeMostOf(ask: AdChangeAsk, facts: Pick<AdChangeFacts, "totalMinor">): number | null {
  return ask.what === "total" && ask.total_minor > facts.totalMinor ? adMostOf({ total_minor: ask.total_minor }) : null;
}

/**
 * Whether a change can have the ad spend where it would not have: a raise, or a later last day, which runs on what is
 * left. While AI is stopped neither is sent (decision 0050, call 11): nobody would answer the people it brings.
 */
export const adChangeSpendsMore = (ask: AdChangeAsk, facts: Pick<AdChangeFacts, "totalMinor" | "endDay">): boolean =>
  (ask.what === "total" && ask.total_minor > facts.totalMinor) ||
  (ask.what === "end_day" && ask.end_day > facts.endDay);

/** Meta changes an ad set's amount at most four times an hour (its page on rate limits, read 21 November 2026). */
const AMOUNTS_AN_HOUR = 4;

/** When the amount can next be changed, from when it was lately changed at Meta; null where it can be now. */
export function adAmountAfter(changedAt: readonly string[], nowMs: number): string | null {
  const lately = changedAt
    .map((at) => Date.parse(at))
    .filter((ms) => Number.isFinite(ms) && nowMs - ms < HOUR_MS)
    .sort((one, other) => one - other);
  const oldest = lately.at(-AMOUNTS_AN_HOUR);
  return lately.length < AMOUNTS_AN_HOUR || oldest === undefined ? null : new Date(oldest + HOUR_MS).toISOString();
}

/** A change of the owner's on its way to Meta, as ads.change keeps it: what was asked, and whether Meta never answered. */
export type AdChangeOnWay = AdChangeAsk & { unsure: boolean };

const wholeAt = (row: Record<string, unknown>, key: string): number | null => {
  const value = row[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
};

/** The change on its way, read from ads.change; null where none is, or what is kept is not one. */
export function adChangeOnWayOf(json: unknown): AdChangeOnWay | null {
  const row = recordOrEmpty(json);
  const unsure = typeof row.sent_at === "string";
  const total = wholeAt(row, "total_minor");
  const miles = wholeAt(row, "miles");
  if (row.what === "total" && total !== null) return { what: "total", total_minor: total, unsure };
  if (row.what === "end_day" && typeof row.end_day === "string")
    return { what: "end_day", end_day: row.end_day, unsure };
  if (row.what === "miles" && miles !== null) return { what: "miles", miles, unsure };
  return row.what === "end" ? { what: "end", unsure } : null;
}

/** What the facts are read from: an ad's row, as every tree holds it. */
interface AdChangeRow {
  origin: string;
  budget_kind: string | null;
  budget_minor: number | null;
  budget_left_minor: number | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  approved: unknown;
}

/** The circle's miles the owner approved; null where a wider place is, or nothing whole is kept. */
export function adApprovedMiles(approved: unknown): number | null {
  const kept = recordOrEmpty(approved);
  if (Object.keys(recordOrEmpty(kept.area)).length > 0) return null;
  const miles = wholeAt(kept, "miles");
  return miles !== null && miles > 0 ? miles : null;
}

/**
 * What a change of an ad is judged against, from its row and its account, at a moment: Meta's own total and last day,
 * and the miles approved. Null for an ad that is not one made here, or whose total and end Meta has not said.
 */
export function adChangeFactsOf(
  row: AdChangeRow,
  account: { currency: string; minDailyMinor: number; ownerMostMinor: number | null; timezone: string },
  nowMs: number,
): AdChangeFacts | null {
  if (row.origin !== "chanlytics" || row.budget_kind !== "total" || row.budget_minor === null || row.ends_at === null)
    return null;
  const dayOf = (iso: string): string => zoneDayKey(Date.parse(iso), account.timezone);
  const left = row.budget_left_minor ?? row.budget_minor;
  return {
    currency: account.currency,
    minDailyMinor: account.minDailyMinor,
    ownerMostMinor: account.ownerMostMinor,
    totalMinor: row.budget_minor,
    spentMinor: Math.max(0, row.budget_minor - left),
    startDay: dayOf(row.starts_at ?? row.created_at),
    endDay: dayOf(row.ends_at),
    today: zoneDayKey(nowMs, account.timezone),
    miles: adApprovedMiles(row.approved),
  };
}
