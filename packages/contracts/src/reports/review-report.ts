/**
 * Reports › Reviews — what customers say in public, drawn from the reviews on record.
 *
 * Google's rating and count are the listing's, read once a day. Everything else here is counted over the reviews the
 * owner's Business Profile handed over and the database kept (google_reviews, origin "profile"): how many were written in
 * the period and in the one before it, the mix of their stars, how many have a reply and whose, how long a reply took, and
 * which still wait for one. Those need the whole set, and the five reviews Google shows of a public listing are its
 * relevance sort, a sample of nothing: with the listing alone the report says what Google counts and what its daily
 * readings gained, and says the rest needs the profile.
 *
 * A review is on the day Google dates it, in the workspace's zone. A count over the profile's reviews is exact only where
 * the history on record reaches the period's first day; where it does not, the figure is a dash and the words say where the
 * history starts, never a zero. The sentence at the head of the lens, the lines under its cards and the figures are made
 * once, here, from one read (the database's reviews_ledger, which bounds it): the page, the head and Ask say what this
 * says. Pure: the reader feeds it rows, the tests feed it fixtures.
 */
import { mondayOf, shiftKey } from "../calendar/day-keys";
import { zoneDayKey } from "../shared/clock";
import { sumOf } from "../shared/numbers";
import { plural } from "../shared/words";
import {
  checkedWords,
  googleReviewsTable,
  reviewsFromProfile,
  toGoogleReviewVM,
  toGoogleVM,
  type GoogleListingDto,
  type GoogleReadDto,
  type GoogleReviewDto,
  type GoogleReviewVM,
  type GoogleVM,
} from "../google/google";
import { reviewHeldWords } from "../google/review-reply";
import { compareWords, fmtSeconds, type ReportTileVM } from "./report-tiles";
import { dayDate, fmtDay, quantile, rangeLabelOf } from "./reports";

/** The most reviews waiting for a reply the report lists, the oldest first. */
export const REVIEWS_WAITING_SHOWN = 5;

/** A middle time needs this many replies to be said: two are an anecdote. */
const REVIEW_REPLY_TIME_MIN = 3;

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
  /** "receptionist" where the last reply Chanlytics recorded under it was the automatic mode's and is the one on Google; no one else is recorded. */
  by: "receptionist" | null;
}

/** A review that waits for a reply as the database lists it: the Google read's own columns, and why a reply written for it was held. */
interface ReviewWaitingDto extends GoogleReviewDto {
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
  on_record: {
    /** How many profile reviews and how many of the public listing's the workspace holds. */
    profile: number;
    places: number;
    /** The day the oldest dated profile review was written, in the zone; null with none dated. */
    oldest_day: string | null;
    /** Whether the profile's last sync read the whole of Google's list, so the record is every review (google_connections.reviews_complete). */
    complete: boolean;
  };
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

/** What `GET /api/v1/reports/reviews` returns: Google's own read, and the ledger beside it when the Business Profile has synced. */
export interface ReviewsReportDto {
  timezone: string;
  /** The workspace's day in that zone when the read was made: "2026-10-06". */
  today: string;
  /** The period the report is of. */
  days: number;
  google: GoogleReadDto;
  /** Whether the lens has anything to draw: a listing is kept, or this deployment can look one up or connect a profile. */
  readable: boolean;
  /** Null without a listing linked and a Business Profile synced: the reviews on record are then the five Google shows. */
  ledger: ReviewsLedgerDto | null;
}

/** A review waiting for a reply, as the page draws a review, and why a reply written for it was not posted. */
export interface ReviewWaitingVM extends GoogleReviewVM {
  /** "The receptionist wrote a reply and held it: it named a price."; null where none was held. */
  held: string | null;
}

/** One star count of the period: a row of the mix. */
interface ReviewsStarVM {
  id: string;
  label: string;
  value: number;
  /** What its bar says beside it: the count and its share of the rated reviews. */
  display: string;
}

/** One week of the period, the Monday or the period's first day, whichever is later. */
interface ReviewsWeekVM {
  day: string;
  label: string;
  short: string;
  written: number;
}

/** The profile's counts of the period; a figure the history on record cannot support is null, never zero. */
export interface ReviewsFiguresVM {
  /** Written in the period, by the day Google dates them. */
  written: number | null;
  /** …and in the period before. */
  prior: number | null;
  /** Of `written`, the ones with a reply. */
  answered: number | null;
  /** Of `answered`, the receptionist's, by the last reply Chanlytics recorded under each; the rest are the owner's. */
  receptionist: number | null;
  /** The replies that have a time to say (the review's and the reply's both dated), and their middle in seconds, from three. */
  timed: number | null;
  replySeconds: number | null;
}

export interface ReviewsReportVM {
  days: number;
  /** No listing is linked: the lens draws its empty state, and the head is its name alone. */
  empty: boolean;
  /** Whose reviews the counts are: every one the Business Profile holds, or the five Google shows (which count nothing). */
  source: "profile" | "places";
  /** The listing as the Google surface says it, made once; the figures below are built from it, never again. */
  google: GoogleVM;
  /** The figures the lens draws, in order: five from the profile, the listing's four without it. */
  tiles: ReportTileVM[];
  /** Null from the five public reviews. */
  figures: ReviewsFiguresVM | null;
  /** The mix of the period's stars, five down to one; null with none to count or no history to count them in. */
  stars: { rated: number; rows: ReviewsStarVM[]; table: { columns: string[]; rows: (string | number)[][] } } | null;
  /** The reviews written week by week, only the weeks the history on record covers; null with none written. */
  weekly: { points: ReviewsWeekVM[]; max: number; total: number } | null;
  /** The reviews with no reply: how many, and the oldest few with the reply the receptionist held, if any. */
  waiting: { total: number; rows: ReviewWaitingVM[] };
  /** The newest reviews; from the profile, those already in `waiting` are left out, so a review is drawn once. */
  latest: GoogleReviewVM[];
  /** `latest` as a table, its rows exactly those the card lists: the waiting reviews drawn above it are not in it. */
  latestTable: GoogleVM["table"];
  /**
   * Every sentence the lens, its head and Ask say, null where there is nothing to say: the head (one sentence, built from
   * the tiles' own numbers), under the cards (the mix, the weeks), where the history on record starts, and,
   * from the five public reviews with no profile connected, what the profile would add.
   */
  lines: {
    head: string | null;
    mix: string | null;
    weekly: string | null;
    history: string | null;
    connect: string | null;
  };
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
  const since = shiftKey(today, -(days - 1));
  return { since, priorSince: shiftKey(since, -days) };
}

/** What the profile's reviews on record cover: all of them back to the first, or those written from `from` on. */
interface ReviewsHistory {
  complete: boolean;
  /** The day of the oldest dated review on record, when the record is not complete; null with none. */
  from: string | null;
}

/**
 * The record is complete when the sync read the whole of Google's list; else it reaches from the day the connection began,
 * for the sync reads the newest reviews from then on (neither Google's count, which two writers keep on different bases, nor
 * the oldest review's date, which the newest-first read leaves with gaps, says where a record begins).
 */
function reviewsHistoryOf(dto: ReviewsReportDto, ledger: ReviewsLedgerDto): ReviewsHistory {
  if (ledger.on_record.complete) return { complete: true, from: null };
  const began = dto.google.connection ? Date.parse(dto.google.connection.connected_at) : NaN;
  return { complete: false, from: Number.isNaN(began) ? null : zoneDayKey(began, dto.timezone) };
}

const historyReaches = (h: ReviewsHistory, day: string): boolean => h.complete || (h.from !== null && h.from <= day);

const historyWords = (h: ReviewsHistory): string | null =>
  h.complete ? null : h.from ? `history on record starts ${fmtDay(h.from)}` : "no review history on record yet";

/** A review written on a day of the workspace's calendar. */
interface DatedReview {
  id: string;
  rating: number | null;
  day: string;
  hasReply: boolean;
  /** From the review being written to its reply, in seconds; null where either time is missing or the reply is dated first. */
  replySeconds: number | null;
  /** Who wrote the reply on Google, where Chanlytics recorded it: the receptionist, or no one. */
  by: "receptionist" | null;
}

/** The reviews the database dated, each on its business day (a review with no date is in no period, and not among them). */
function reviewsDatedOf(rows: readonly ReviewWrittenDto[]): DatedReview[] {
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    day: r.d,
    hasReply: r.replied,
    replySeconds: r.secs,
    by: r.by,
  }));
}

/** The counts of a period's reviews that say who answered and how fast. */
function reviewsAnswersOf(current: readonly DatedReview[]) {
  const answered = current.filter((r) => r.hasReply);
  const waits = answered.flatMap((r) => (r.replySeconds === null ? [] : [r.replySeconds])).sort((a, b) => a - b);
  return {
    answered: answered.length,
    receptionist: answered.filter((r) => r.by === "receptionist").length,
    timed: waits.length,
    replySeconds: waits.length >= REVIEW_REPLY_TIME_MIN ? quantile(waits, 0.5) : null,
  };
}

/** The mix: a row per star, five down to one, over the rated reviews; a rating that is none of those stars is unrated. */
function reviewsStarMixOf(current: readonly DatedReview[]) {
  const counts = [5, 4, 3, 2, 1].map((n) => ({ n, value: current.filter((r) => r.rating === n).length }));
  const rated = sumOf(counts.map((c) => c.value));
  const share = (value: number): string => `${rated ? Math.round((value / rated) * 100) : 0}%`;
  const rows: ReviewsStarVM[] = counts.map(({ n, value }) => ({
    id: String(n),
    label: plural(n, "star"),
    value,
    display: `${value} · ${share(value)}`,
  }));
  const good = sumOf(counts.filter((c) => c.n >= 4).map((c) => c.value));
  const table = {
    columns: ["Stars", "Reviews", "Share"],
    rows: counts.map((c) => [plural(c.n, "star"), c.value, share(c.value)]),
  };
  return { rated, good, rows, table };
}

/** Reviews written per week of the period, clipped to it, and only the weeks the history on record covers from their first day. */
function reviewsWeeksOf(
  current: readonly DatedReview[],
  since: string,
  today: string,
  h: ReviewsHistory,
): ReviewsWeekVM[] {
  const weeks: ReviewsWeekVM[] = [];
  for (let monday = mondayOf(since); monday <= today; monday = shiftKey(monday, 7)) {
    const first = monday < since ? since : monday;
    const sunday = shiftKey(monday, 6);
    const last = sunday > today ? today : sunday;
    if (!historyReaches(h, first)) continue;
    weeks.push({
      day: first,
      label: fmtDay(first),
      short: String(dayDate(first).getDate()),
      written: current.filter((r) => r.day >= first && r.day <= last).length,
    });
  }
  return weeks;
}

/** Reviews written on each day of the period, oldest first: the New figure's spark. */
function reviewsDailyOf(current: readonly DatedReview[], since: string, days: number): number[] {
  return Array.from({ length: days }, (_, i) => {
    const day = shiftKey(since, i);
    return current.filter((r) => r.day === day).length;
  });
}

/** "in the last 30 days", or "today" where the period is the one day. */
const withinWords = (days: number): string => (days === 1 ? "today" : `in the last ${rangeLabelOf(days)}`);

const NOTHING_WRITTEN = "No review written in this period.";

/** Who answered, in the Answered figure's line: "3 by the receptionist, 2 by you". */
function whoAnsweredWords(answered: number, receptionist: number): string {
  if (!answered) return "none answered yet";
  const you = answered - receptionist;
  return [receptionist ? `${receptionist} by the receptionist` : null, you ? `${you} by you` : null]
    .filter((w): w is string => !!w)
    .join(", ");
}

/** What the period holds of the profile's reviews, counted once for the figures, the head and the lines. */
interface ReviewsPeriod {
  days: number;
  exact: boolean;
  priorExact: boolean;
  written: number;
  prior: number;
  answered: number;
  receptionist: number;
  timed: number;
  replySeconds: number | null;
  rated: number;
  good: number;
  history: ReviewsHistory;
}

/** The Time to reply figure's line: the replies it stands on, and why there is no middle yet. */
function replyTimeMeta(p: ReviewsPeriod): string {
  if (p.replySeconds !== null) return `the middle of ${plural(p.timed, "reply", "replies")}`;
  if (p.timed > 0) return `${plural(p.timed, "reply", "replies")} so far; the middle needs ${REVIEW_REPLY_TIME_MIN}`;
  return p.answered ? "no reply has a time on record" : "no replies yet";
}

/** The five figures of the profile's period: the listing's rating and count, then what the reviews on record say. */
function reviewsProfileTiles(google: GoogleVM, p: ReviewsPeriod, daily: number[]): ReportTileVM[] {
  const rangeLabel = rangeLabelOf(p.days);
  const lost = historyWords(p.history) ?? "";
  const counted = p.exact && p.written > 0;
  return [
    ...google.tiles.filter((t) => t.metric === "rating" || t.metric === "reviews"),
    {
      id: "written",
      metric: "reviews_written",
      label: `New in ${plural(p.days, "day")}`,
      value: p.exact ? String(p.written) : "—",
      meta: !p.exact ? lost : p.written ? "with words or without" : "none in this period",
      delta: null,
      spark: daily,
      compare: p.exact && p.priorExact ? compareWords(p.written, p.prior, rangeLabel, true) : null,
    },
    {
      id: "answered",
      metric: "reviews_answered",
      label: "Answered",
      value: counted ? `${p.answered} of ${p.written}` : "—",
      meta: !p.exact ? lost : p.written ? whoAnsweredWords(p.answered, p.receptionist) : "nothing to answer",
      delta: null,
      spark: [],
      compare: null,
    },
    {
      id: "reply_time",
      metric: "review_reply_time",
      label: "Time to reply",
      value: counted ? fmtSeconds(p.replySeconds) : "—",
      meta: !p.exact ? lost : p.written ? replyTimeMeta(p) : "nothing to answer",
      delta: null,
      spark: [],
      compare: null,
    },
  ];
}

/** The opening of the head: what Google holds now, "4.8 on Google from 213 reviews". */
function reviewsStandingWords(l: GoogleListingDto): string {
  const rating = typeof l.rating === "number" ? `${l.rating.toFixed(1)} on Google` : null;
  const count = typeof l.review_count === "number" ? plural(l.review_count, "review") : null;
  if (rating) return count ? `${rating} from ${count}` : rating;
  return `${count ?? "Reviews"} on Google`;
}

/** The head where the listing holds no review, or has not been read to say so; null where there are reviews. */
function reviewsNoneHead(l: GoogleListingDto, onRecord: number, nowMs: number): string | null {
  if (l.review_count || onRecord > 0) return null;
  return l.review_count === null && l.checked_at === null ? `${checkedWords(l, nowMs)}.` : "No reviews on Google yet.";
}

/** The profile's head after the standing: how many are new, and how many of those are answered. */
function profileHeadTail(p: ReviewsPeriod): string {
  if (!p.exact) return historyWords(p.history) ?? "";
  if (!p.written) return `none new ${withinWords(p.days)}`;
  const answered =
    p.answered === p.written ? "all answered" : p.answered ? `${p.answered} answered` : "none answered yet";
  return `${p.written} new ${withinWords(p.days)}, ${answered}`;
}

/** The listing's head after the standing: what Google's daily counts gained, or lost, once there are two days of them. */
function placesHeadTail(google: GoogleVM, days: number): string {
  const gained = google.gained.total;
  if (gained === null) return "what changed needs a second day of reading";
  if (gained < 0) return `down ${plural(-gained, "rating")} ${withinWords(days)}`;
  return `${gained ? `${plural(gained, "rating")} gained` : "none gained"} ${withinWords(days)}`;
}

/** The mix under its card: how many of the period's rated reviews are four or five stars. */
function reviewsMixLine(p: ReviewsPeriod): string | null {
  if (!p.exact) return null;
  if (!p.written) return NOTHING_WRITTEN;
  if (!p.rated) return `No star rating among the reviews written ${withinWords(p.days)}.`;
  const of = p.rated === p.written ? plural(p.rated, "review") : plural(p.rated, "rated review");
  return `${p.good} of the ${of} written ${withinWords(p.days)} ${p.rated === 1 ? "is" : "are"} 4 or 5 stars.`;
}

/** The weekly card's line: what the weeks drawn add up to, or that nothing was written. */
function reviewsWeeklyLine(p: ReviewsPeriod, weeks: readonly ReviewsWeekVM[]): string | null {
  if (p.exact && !p.written) return NOTHING_WRITTEN;
  if (!weeks.length) return null;
  return `${sumOf(weeks.map((w) => w.written))} written over ${plural(weeks.length, "week")}`;
}

/** What the profile would add, said under the five public reviews where no profile is connected. */
const CONNECT_WORDS = "Connect your Business Profile to see every review, who answered, and how fast.";

const NO_LINES: ReviewsReportVM["lines"] = {
  head: null,
  mix: null,
  weekly: null,
  history: null,
  connect: null,
};

/** What the period holds of the profile's reviews on record, counted once. */
function reviewsPeriodOf(dto: ReviewsReportDto, ledger: ReviewsLedgerDto, days: number) {
  const { since, priorSince } = reviewsWindowOf(dto.today, days);
  const dated = reviewsDatedOf(ledger.written);
  const current = dated.filter((r) => r.day >= since && r.day <= dto.today);
  const history = reviewsHistoryOf(dto, ledger);
  const mix = reviewsStarMixOf(current);
  const period: ReviewsPeriod = {
    days,
    exact: historyReaches(history, since),
    priorExact: historyReaches(history, priorSince),
    written: current.length,
    prior: dated.filter((r) => r.day >= priorSince && r.day < since).length,
    ...reviewsAnswersOf(current),
    rated: mix.rated,
    good: mix.good,
    history,
  };
  return { period, current, mix, since };
}

/** The oldest reviews with no reply, each with the reason a reply written for it was held, where one was. */
function reviewsWaitingOf(ledger: ReviewsLedgerDto, linkedAt: string, nowMs: number): ReviewsReportVM["waiting"] {
  const rows = ledger.waiting.slice(0, REVIEWS_WAITING_SHOWN).map((r): ReviewWaitingVM => {
    const why = reviewHeldWords(r.held);
    return {
      ...toGoogleReviewVM(r, linkedAt, nowMs),
      held: why ? `The receptionist wrote a reply and held it: ${why}.` : null,
    };
  });
  return { total: ledger.waiting_total, rows };
}

/** What the report is made from once a listing is linked and the profile's reviews are on record. */
interface ReviewsBuild {
  dto: ReviewsReportDto;
  ledger: ReviewsLedgerDto;
  google: GoogleVM;
  l: GoogleListingDto;
  days: number;
  nowMs: number;
}

/** The report from the profile's reviews on record: counts over the period, the mix, the speed, what waits. */
function reviewsFromLedger({ dto, ledger, google, l, days, nowMs }: ReviewsBuild): ReviewsReportVM {
  const { period: p, current, mix, since } = reviewsPeriodOf(dto, ledger, days);
  const points = reviewsWeeksOf(current, since, dto.today, p.history);
  const total = sumOf(points.map((w) => w.written));
  const waiting = reviewsWaitingOf(ledger, l.linked_at, nowMs);
  const waitingIds = new Set(waiting.rows.map((r) => r.id));
  const latest = google.latest.filter((r) => !waitingIds.has(r.id));
  const onRecord = ledger.on_record.profile + ledger.on_record.places;
  return {
    days,
    empty: false,
    source: "profile",
    google,
    tiles: reviewsProfileTiles(google, p, p.exact ? reviewsDailyOf(current, since, days) : []),
    figures: {
      written: p.exact ? p.written : null,
      prior: p.exact && p.priorExact ? p.prior : null,
      answered: p.exact ? p.answered : null,
      receptionist: p.exact ? p.receptionist : null,
      timed: p.exact ? p.timed : null,
      replySeconds: p.exact ? p.replySeconds : null,
    },
    stars: p.exact && mix.rated ? { rated: mix.rated, rows: mix.rows, table: mix.table } : null,
    weekly: total ? { points, max: Math.max(1, ...points.map((w) => w.written)), total } : null,
    waiting,
    latest,
    latestTable: googleReviewsTable(latest),
    lines: {
      head: reviewsNoneHead(l, onRecord, nowMs) ?? `${reviewsStandingWords(l)}; ${profileHeadTail(p)}.`,
      mix: reviewsMixLine(p),
      weekly: reviewsWeeklyLine(p, points),
      history: p.exact && p.priorExact ? null : historyWords(p.history),
      connect: null,
    },
  };
}

/**
 * Reviews, drawn from what is stored: the listing's own figures from `toGoogleVM`, and, where the owner's Business Profile
 * has synced, the counts of the period over the reviews on record. The period is `dto.days`, the one the ledger was read
 * for: a fold of another would count the reviews the read left out as none. Every sentence is made here; the page, the head
 * and Ask say these.
 */
export function toReviewsReportVM(dto: ReviewsReportDto, opts: { nowMs?: number }): ReviewsReportVM {
  const { days } = dto;
  const nowMs = opts.nowMs ?? Date.now();
  const google = toGoogleVM(dto.google, days, nowMs);
  const l = dto.google.listing;
  const ledger = dto.ledger;
  const base = { days, google, figures: null, stars: null, weekly: null, waiting: { total: 0, rows: [] } };
  if (!l)
    return {
      ...base,
      empty: true,
      source: "places",
      tiles: [],
      latest: [],
      latestTable: googleReviewsTable([]),
      lines: NO_LINES,
    };
  if (ledger && reviewsAreOnRecord(dto.google)) return reviewsFromLedger({ dto, ledger, google, l, days, nowMs });
  const onRecord = ledger ? ledger.on_record.profile + ledger.on_record.places : dto.google.reviews.length;
  return {
    ...base,
    empty: false,
    source: "places",
    tiles: google.tiles,
    latest: google.latest,
    latestTable: googleReviewsTable(google.latest),
    lines: {
      ...NO_LINES,
      head: reviewsNoneHead(l, onRecord, nowMs) ?? `${reviewsStandingWords(l)}; ${placesHeadTail(google, days)}.`,
      connect: dto.google.connection ? null : CONNECT_WORDS,
    },
  };
}
