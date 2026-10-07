/**
 * Reports › Reviews — what the reviews on record say, counted once.
 *
 * The database hands over the profile's reviews in one answer (reviews_ledger, 00346): each review of the period and the one
 * before it on its day in the workspace's zone, with whether it has a reply, how long the reply took and who wrote it, and
 * the counts the record holds. This is the counting of it: the window, how far back the record reaches, and what a period
 * holds, in one pass over those rows. review-report.ts puts the counts in words. A count over the profile's reviews is exact
 * only where the record reaches the period's first day; where it does not, there is no count here, never a zero. Pure.
 */
import { mondayOf, shiftKey } from "../calendar/day-keys";
import { zoneDayKey } from "../shared/clock";
import { pct, sumOf } from "../shared/numbers";
import { isoMs } from "../shared/time";
import { plural } from "../shared/words";
import {
  reviewsFromProfile,
  type GoogleConnectionDto,
  type GoogleReadDto,
  type GoogleReviewDto,
} from "../google/google";
import { periodSince } from "./report-periods";
import { dayPointOf, fmtDay, quantile } from "./reports";

/** A middle time needs this many replies to be said: two are an anecdote. */
export const REVIEW_REPLY_TIME_MIN = 3;

/** One profile review as the period's counts read it, the day and the writer already said by the database. */
interface ReviewWrittenDto {
  /** The google_reviews row's id: the subject the reply events are filed under, not Google's own review id. */
  id: string;
  /** The day Google dates it, in the workspace's zone: "2026-10-06". */
  d: string;
  rating: number | null;
  /** Whether it holds a reply. */
  replied: boolean;
  /** From the review being written to its reply, in seconds; null where the reply is not there or is dated before the review. */
  secs: number | null;
  /**
   * "receptionist" where the last reply Chanlytics recorded under it was the automatic mode's and is the one on Google; null
   * for every other: a person's reply through Chanlytics is recorded with no writer, and one written on Google is not recorded.
   */
  by: "receptionist" | null;
}

/** A review that waits for a reply as the database lists it: the Google read's own columns, and why a reply written for it was held. */
export interface ReviewWaitingDto extends GoogleReviewDto {
  /** google.reply_held's `why` ("price" or "money") of the last reply written for it and not posted; null where none was held. */
  held: string | null;
}

/**
 * What the profile's reviews hold, read once by the database in the workspace's own zone (reviews_ledger, 00346): the
 * window it is of, the counts the record holds, the reviews of the period and the one before it, and the ones that wait.
 */
export interface ReviewsLedgerDto {
  timezone: string;
  /** The workspace's day in that zone when the read was made: "2026-10-06". */
  today: string;
  /** The period the ledger was read for, as the database clamped it. */
  days: number;
  /**
   * How many profile reviews and how many of the public listing's the workspace holds, and whether the profile's last sync
   * read the whole of Google's list, so the record is every review (google_connections.reviews_complete). The oldest review's
   * day is not here: the sync reads the newest reviews first, so the record has gaps and that day says nothing of where it starts.
   */
  on_record: { profile: number; places: number; complete: boolean };
  /** The profile reviews dated from the period before's first day to now, oldest first. */
  written: ReviewWrittenDto[];
  /** The profile reviews with no reply, however old. */
  waiting_total: number;
  /** The oldest of them first, at most REVIEWS_WAITING_SHOWN, the ones with no date last. */
  waiting: ReviewWaitingDto[];
}

/** Whether the database answered a Reviews ledger (reviews_ledger): the window and the reviews, and not its own `{ error }`. */
export function isReviewsLedgerDto(answer: unknown): answer is ReviewsLedgerDto {
  return (
    typeof answer === "object" &&
    answer !== null &&
    "timezone" in answer &&
    typeof answer.timezone === "string" &&
    "today" in answer &&
    typeof answer.today === "string" &&
    "days" in answer &&
    typeof answer.days === "number" &&
    "on_record" in answer &&
    typeof answer.on_record === "object" &&
    "written" in answer &&
    Array.isArray(answer.written) &&
    "waiting" in answer &&
    Array.isArray(answer.waiting)
  );
}

/**
 * Whether the report is made from the reviews on record: a listing is linked and the owner's Business Profile has synced.
 * The one test, for the reader that asks the database for the ledger and for the fold that counts it.
 */
export function reviewsAreOnRecord(google: Pick<GoogleReadDto, "listing" | "connection">): boolean {
  return google.listing !== null && reviewsFromProfile(google.connection);
}

/** The days of a period at a business day, and of the one before it. */
export function reviewsWindowOf(today: string, days: number): { since: string; priorSince: string } {
  const since = periodSince(today, days);
  return { since, priorSince: periodSince(shiftKey(since, -1), days) };
}

/** What the profile's reviews on record cover: all of them back to the first, or those written from `from` on. */
export interface ReviewsHistory {
  complete: boolean;
  /** The day the record is known to reach back to, when it is not complete; null where even that is not known. */
  from: string | null;
}

/**
 * The record is complete when the sync read the whole of Google's list; else it reaches from the day the connection began,
 * for the sync reads the newest reviews from then on (neither Google's count, which two writers keep on different bases, nor
 * the oldest review's date, which the newest-first read leaves with gaps, says where a record begins).
 */
export function reviewsHistoryOf(
  ledger: Pick<ReviewsLedgerDto, "on_record">,
  connection: Pick<GoogleConnectionDto, "connected_at"> | null,
  tz: string,
): ReviewsHistory {
  if (ledger.on_record.complete) return { complete: true, from: null };
  const began = isoMs(connection?.connected_at);
  return { complete: false, from: began === null ? null : zoneDayKey(began, tz) };
}

const historyReaches = (h: ReviewsHistory, day: string): boolean => h.complete || (h.from !== null && h.from <= day);

/** Where the record starts, run into other words ("history on record starts Aug 20"); null for a complete one. */
export const historyWords = (h: ReviewsHistory): string | null =>
  h.complete ? null : h.from ? `history on record starts ${fmtDay(h.from)}` : "no review history on record yet";

/** One star count of the period: a row of the mix. */
interface ReviewsStarVM {
  id: string;
  label: string;
  value: number;
  /** What its bar says beside it: the count and its share of the rated reviews. */
  display: string;
}

/** One week of the period, the Monday or the period's first day, whichever is later. */
export interface ReviewsWeekVM {
  day: string;
  label: string;
  short: string;
  written: number;
}

/** The mix: a row per star, five down to one, over the rated reviews. */
export interface ReviewsStarMix {
  rated: number;
  /** How many of the rated ones are four or five stars. */
  good: number;
  rows: ReviewsStarVM[];
  table: { columns: string[]; rows: (string | number)[][] };
}

/** What a period holds of the profile's reviews, counted once for the figures, the head and the lines. */
export type ReviewsPeriod =
  | { exact: false; days: number; history: ReviewsHistory }
  | {
      exact: true;
      days: number;
      history: ReviewsHistory;
      written: number;
      /** Written in the period before; null where the record does not reach back to its first day. */
      prior: number | null;
      answered: number;
      /** Of `answered`, the receptionist's, by the last reply Chanlytics recorded under each; the rest are the owner's. */
      receptionist: number;
      /** The replies that have a time to say (the review's and the reply's both dated), and their middle in seconds, from three. */
      timed: number;
      replySeconds: number | null;
      rated: number;
      good: number;
      mix: ReviewsStarMix;
      /** Written on each day of the period, oldest first: the New figure's spark. */
      daily: number[];
    };

/** The five stars, best first. */
const STARS = [5, 4, 3, 2, 1];

/** The mix of a period's reviews; one whose rating is none of the five stars is unrated, and in no row. */
function reviewsStarMixOf(current: readonly ReviewWrittenDto[]): ReviewsStarMix {
  const counts = STARS.map((n) => ({ n, value: current.filter((r) => r.rating === n).length }));
  const rated = sumOf(counts.map((c) => c.value));
  const share = (value: number): string => `${pct(value, rated) ?? 0}%`;
  return {
    rated,
    good: sumOf(counts.filter((c) => c.n >= 4).map((c) => c.value)),
    rows: counts.map(({ n, value }) => ({
      id: String(n),
      label: plural(n, "star"),
      value,
      display: `${value} · ${share(value)}`,
    })),
    table: {
      columns: ["Stars", "Reviews", "Share"],
      rows: counts.map((c) => [plural(c.n, "star"), c.value, share(c.value)]),
    },
  };
}

/**
 * Reviews written per week of the period, clipped to it, and only the weeks the history on record covers from their first
 * day. From the period's per-day count, which also feeds the New figure's spark (the shared weekOf averages a series into
 * weekdays; this is a count of each calendar week).
 */
function reviewsWeeksOf(
  perDay: ReadonlyMap<string, number>,
  since: string,
  today: string,
  h: ReviewsHistory,
): ReviewsWeekVM[] {
  const weeks: ReviewsWeekVM[] = [];
  for (let monday = mondayOf(since); monday <= today; monday = shiftKey(monday, 7)) {
    const first = monday < since ? since : monday;
    if (!historyReaches(h, first)) continue;
    const sunday = shiftKey(monday, 6);
    const last = sunday > today ? today : sunday;
    let written = 0;
    for (let day = first; day <= last; day = shiftKey(day, 1)) written += perDay.get(day) ?? 0;
    weeks.push({ ...dayPointOf(first), written });
  }
  return weeks;
}

/**
 * What the period holds of the profile's reviews on record, counted once: the period's figures where the history reaches
 * its first day (and the period before's where it reaches that), and the weeks the history covers. The middle reply time
 * is `quantile` over the seconds, not deals' medianWait, which rounds to whole days: a reply takes hours.
 */
export function reviewsPeriodOf(
  ledger: Pick<ReviewsLedgerDto, "written">,
  history: ReviewsHistory,
  today: string,
  days: number,
): { period: ReviewsPeriod; weeks: ReviewsWeekVM[] } {
  const { since, priorSince } = reviewsWindowOf(today, days);
  const current = ledger.written.filter((r) => r.d >= since && r.d <= today);
  const perDay = new Map<string, number>();
  for (const r of current) perDay.set(r.d, (perDay.get(r.d) ?? 0) + 1);
  const weeks = reviewsWeeksOf(perDay, since, today, history);
  if (!historyReaches(history, since)) return { period: { exact: false, days, history }, weeks };
  const answered = current.filter((r) => r.replied);
  const waits = answered.flatMap((r) => (r.secs === null ? [] : [r.secs])).sort((a, b) => a - b);
  const mix = reviewsStarMixOf(current);
  return {
    period: {
      exact: true,
      days,
      history,
      written: current.length,
      prior: historyReaches(history, priorSince)
        ? ledger.written.filter((r) => r.d >= priorSince && r.d < since).length
        : null,
      answered: answered.length,
      receptionist: answered.filter((r) => r.by === "receptionist").length,
      timed: waits.length,
      replySeconds: waits.length >= REVIEW_REPLY_TIME_MIN ? quantile(waits, 0.5) : null,
      rated: mix.rated,
      good: mix.good,
      mix,
      daily: Array.from({ length: days }, (_, i) => perDay.get(shiftKey(since, i)) ?? 0),
    },
    weeks,
  };
}
