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
 * once, here, from one read (reviewsReadSince bounds it): the page, the head and Ask say what this says. Pure: the reader
 * feeds it rows, the tests feed it fixtures.
 */
import { mondayOf, shiftKey } from "../calendar/day-keys";
import { zoneDayKey } from "../shared/clock";
import { sumOf } from "../shared/numbers";
import { plural } from "../shared/words";
import {
  checkedWords,
  reviewsFromProfile,
  toGoogleReviewVM,
  toGoogleVM,
  type GoogleDto,
  type GoogleListingDto,
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

/** One profile review as the period's counts read it. */
interface ReviewWrittenDto {
  /** The google_reviews row's id: the subject the reply events are filed under, not Google's own review id. */
  id: string;
  rating: number | null;
  published_at: string | null;
  has_reply: boolean;
  /** When the reply was written, or last changed (Google's updateTime on it). */
  replied_at: string | null;
}

/** One `google.replied` event: the review row it was filed under, who wrote the reply, and when. */
interface ReviewReplyEventDto {
  review_id: string;
  /** "receptionist" where the automatic mode wrote it; a reply written through Chanlytics by a person files none. */
  by: "receptionist" | null;
  at: string;
}

/** One `google.reply_held` event: the review row it was filed under and why the reply was not posted ("price" or "money"). */
interface ReviewHeldDto {
  review_id: string;
  why: string;
}

/** What the profile's reviews hold, read once and bounded (reviewsReadSince). */
export interface ReviewsLedgerDto {
  /** The profile reviews dated since `reviewsReadSince`, as the counts read them. */
  written: ReviewWrittenDto[];
  /** How many reviews of each origin the workspace holds, and when the oldest dated profile review was written. */
  on_record: { profile: number; places: number; oldest_at: string | null };
  /** The profile reviews with no reply, however old. */
  waiting_total: number;
  /** The oldest of them first, at most REVIEWS_WAITING_SHOWN. */
  waiting: GoogleReviewDto[];
  /** The `google.replied` events of the reviews in `written`. */
  replies: ReviewReplyEventDto[];
  /** The `google.reply_held` events of the reviews in `waiting`. */
  held: ReviewHeldDto[];
}

/** What `GET /api/v1/reports/reviews` returns: Google's own read, and the ledger beside it when a listing is linked. */
export interface ReviewsReportDto {
  timezone: string;
  /** The workspace's day in that zone when the read was made: "2026-10-06". */
  today: string;
  /** The period the ledger was read for. */
  days: number;
  google: GoogleDto;
  /** Null with no listing. */
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
  /**
   * Every sentence the lens, its head and Ask say, null where there is nothing to say: the head (one sentence, built from
   * the tiles' own numbers), under the cards (the mix, the speed, the weeks), where the history on record starts, and,
   * from the five public reviews with no profile connected, what the profile would add.
   */
  lines: {
    head: string | null;
    mix: string | null;
    speed: string | null;
    weekly: string | null;
    history: string | null;
    connect: string | null;
  };
}

/** The days of a period at a business day, and of the one before it. */
export function reviewsWindowOf(today: string, days: number): { since: string; priorSince: string } {
  const since = shiftKey(today, -(days - 1));
  return { since, priorSince: shiftKey(since, -days) };
}

/**
 * How far back the one read goes, as an instant: UTC midnight, a day before the period before begins, so the zone the
 * workspace keeps (up to fourteen hours either side of UTC) decides where a day starts, here, and not in the read.
 */
export function reviewsReadSince(today: string, days: number): string {
  return `${shiftKey(reviewsWindowOf(today, days).priorSince, -1)}T00:00:00.000Z`;
}

/** What the profile's reviews on record cover: all of them back to the first, or those written from `from` on. */
interface ReviewsHistory {
  complete: boolean;
  /** The day of the oldest dated review on record, when the record is not complete; null with none. */
  from: string | null;
}

/** The record is complete when the workspace holds as many profile reviews as Google counts; else it starts at the oldest. */
function reviewsHistoryOf(dto: ReviewsReportDto, ledger: ReviewsLedgerDto): ReviewsHistory {
  if (ledger.on_record.profile >= (dto.google.listing?.review_count ?? 0)) return { complete: true, from: null };
  const oldest = ledger.on_record.oldest_at ? Date.parse(ledger.on_record.oldest_at) : NaN;
  return { complete: false, from: Number.isNaN(oldest) ? null : zoneDayKey(oldest, dto.timezone) };
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
}

/** The reviews that have a date, each on its business day; a review with none is in no period. */
function reviewsDatedOf(rows: readonly ReviewWrittenDto[], timezone: string): DatedReview[] {
  return rows.flatMap((r): DatedReview[] => {
    const wrote = r.published_at ? Date.parse(r.published_at) : NaN;
    if (Number.isNaN(wrote)) return [];
    const replied = r.replied_at ? Date.parse(r.replied_at) : NaN;
    const timed = r.has_reply && !Number.isNaN(replied) && replied >= wrote;
    return [
      {
        id: r.id,
        rating: r.rating,
        day: zoneDayKey(wrote, timezone),
        hasReply: r.has_reply,
        replySeconds: timed ? (replied - wrote) / 1000 : null,
      },
    ];
  });
}

/** The latest `google.replied` event of each review: its writer, where the event names one. */
function reviewsWritersOf(events: readonly ReviewReplyEventDto[]): Map<string, "receptionist" | null> {
  const last = new Map<string, { at: number; by: "receptionist" | null }>();
  for (const e of events) {
    const parsed = Date.parse(e.at);
    const at = Number.isNaN(parsed) ? -Infinity : parsed;
    const seen = last.get(e.review_id);
    if (!seen || at >= seen.at) last.set(e.review_id, { at, by: e.by });
  }
  return new Map([...last].map(([id, v]) => [id, v.by]));
}

/** The counts of a period's reviews that say who answered and how fast. */
function reviewsAnswersOf(current: readonly DatedReview[], writers: Map<string, "receptionist" | null>) {
  const answered = current.filter((r) => r.hasReply);
  const waits = answered.flatMap((r) => (r.replySeconds === null ? [] : [r.replySeconds])).sort((a, b) => a - b);
  return {
    answered: answered.length,
    receptionist: answered.filter((r) => writers.get(r.id) === "receptionist").length,
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

/** The listing's head after the standing: what Google's daily counts gained, once there are two days of them. */
function placesHeadTail(google: GoogleVM, days: number): string {
  const gained = google.gained.total;
  if (gained === null) return "what changed needs a second day of reading";
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

/** How fast and how often the period's reviews were answered; the middle from three replies, the count before. */
function reviewsSpeedLine(p: ReviewsPeriod): string | null {
  if (!p.exact || !p.written) return null;
  if (p.replySeconds !== null)
    return `${p.answered} of ${p.written} answered; the middle reply took ${fmtSeconds(p.replySeconds)}.`;
  if (p.timed > 0) return `${plural(p.timed, "reply", "replies")} so far.`;
  return p.answered ? "No reply has a time on record." : "No replies yet.";
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
  speed: null,
  weekly: null,
  history: null,
  connect: null,
};

/** What the period holds of the profile's reviews on record, counted once. */
function reviewsPeriodOf(dto: ReviewsReportDto, ledger: ReviewsLedgerDto, days: number) {
  const { since, priorSince } = reviewsWindowOf(dto.today, days);
  const dated = reviewsDatedOf(ledger.written, dto.timezone);
  const current = dated.filter((r) => r.day >= since && r.day <= dto.today);
  const history = reviewsHistoryOf(dto, ledger);
  const mix = reviewsStarMixOf(current);
  const period: ReviewsPeriod = {
    days,
    exact: historyReaches(history, since),
    priorExact: historyReaches(history, priorSince),
    written: current.length,
    prior: dated.filter((r) => r.day >= priorSince && r.day < since).length,
    ...reviewsAnswersOf(current, reviewsWritersOf(ledger.replies)),
    rated: mix.rated,
    good: mix.good,
    history,
  };
  return { period, current, mix, since };
}

/** The oldest reviews with no reply, each with the reason a reply written for it was held, where one was. */
function reviewsWaitingOf(ledger: ReviewsLedgerDto, linkedAt: string, nowMs: number): ReviewsReportVM["waiting"] {
  const whyHeld = new Map(ledger.held.map((h) => [h.review_id, h.why]));
  const rows = ledger.waiting.slice(0, REVIEWS_WAITING_SHOWN).map((r): ReviewWaitingVM => {
    const why = reviewHeldWords(whyHeld.get(r.id));
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
    latest: google.latest.filter((r) => !waitingIds.has(r.id)),
    lines: {
      head: reviewsNoneHead(l, onRecord, nowMs) ?? `${reviewsStandingWords(l)}; ${profileHeadTail(p)}.`,
      mix: reviewsMixLine(p),
      speed: reviewsSpeedLine(p),
      weekly: reviewsWeeklyLine(p, points),
      history: p.exact && p.priorExact ? null : historyWords(p.history),
      connect: null,
    },
  };
}

/**
 * Reviews, drawn from what is stored: the listing's own figures from `toGoogleVM`, and, where the owner's Business Profile
 * has synced, the counts of the period over the reviews on record. `days` is the period asked for, the one `dto.days` was
 * read for. Every sentence is made here; the page, the head and Ask say these.
 */
export function toReviewsReportVM(dto: ReviewsReportDto, opts: { days: number; nowMs?: number }): ReviewsReportVM {
  const { days } = opts;
  const nowMs = opts.nowMs ?? Date.now();
  const google = toGoogleVM(dto.google, days, nowMs);
  const l = dto.google.listing;
  const ledger = dto.ledger;
  const base = { days, google, figures: null, stars: null, weekly: null, waiting: { total: 0, rows: [] } };
  if (!l) return { ...base, empty: true, source: "places", tiles: [], latest: [], lines: NO_LINES };
  if (ledger && reviewsFromProfile(dto.google.connection))
    return reviewsFromLedger({ dto, ledger, google, l, days, nowMs });
  const onRecord = ledger ? ledger.on_record.profile + ledger.on_record.places : dto.google.reviews.length;
  return {
    ...base,
    empty: false,
    source: "places",
    tiles: google.tiles,
    latest: google.latest,
    lines: {
      ...NO_LINES,
      head: reviewsNoneHead(l, onRecord, nowMs) ?? `${reviewsStandingWords(l)}; ${placesHeadTail(google, days)}.`,
      connect: dto.google.connection ? null : CONNECT_WORDS,
    },
  };
}
