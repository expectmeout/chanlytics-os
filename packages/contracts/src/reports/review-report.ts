/**
 * Reports › Reviews — what customers say in public, drawn from the reviews on record.
 *
 * Google's rating and count are the listing's, read once a day. Everything else here is counted over the reviews the
 * owner's Business Profile handed over and the database kept (google_reviews, origin "profile"): how many were written in
 * the period and in the one before it, the mix of their stars, how many have a reply and whose, how long a reply took, and
 * which still wait for one (review-record.ts counts them). Those need the whole set, and the five reviews Google shows of a
 * public listing are its relevance sort, a sample of nothing: with the listing alone the report says what Google counts and
 * what its daily readings gained, and says the rest needs the profile.
 *
 * A review is on the day Google dates it, in the workspace's zone. A count over the profile's reviews is exact only where
 * the history on record reaches the period's first day; where it does not, the figure is a dash and the words say where the
 * history starts, never a zero. The sentence at the head of the lens, the lines under its cards and the figures are made
 * once, here, from one read (the database's reviews_ledger, which bounds it): the page, the head and Ask say what this
 * says, and the page makes no sentence of its own. Pure: the reader feeds it rows, the tests feed it fixtures.
 */
import { sumOf } from "../shared/numbers";
import { capitalize, plural } from "../shared/words";
import {
  checkedWords,
  googleReviewsTable,
  toGoogleReviewVM,
  toGoogleVM,
  type GoogleListingDto,
  type GoogleReadDto,
  type GoogleReviewVM,
  type GoogleVM,
} from "../google/google";
import { reviewHeldWords } from "../google/review-reply";
import { lensEmpty } from "./lenses";
import { periodSince } from "./report-periods";
import { compareWords, fmtSeconds, type ReportMetric, type ReportTileVM } from "./report-tiles";
import { rangeLabelOf, withinWords } from "./reports";
import {
  REVIEW_REPLY_TIME_MIN,
  historyWords,
  reviewsAreOnRecord,
  reviewsHistoryOf,
  reviewsPeriodOf,
  type ReviewsLedgerDto,
  type ReviewsPeriod,
  type ReviewsStarMix,
  type ReviewsWeekVM,
} from "./review-record";

/** The most reviews waiting for a reply the report lists, the oldest first. */
export const REVIEWS_WAITING_SHOWN = 5;

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

/**
 * Every sentence the lens, its head and Ask say, null where there is nothing to say. The sentences the cards make are
 * here too, so the page composes none: each is null where its card does not need it (no card to draw, or rows to draw instead).
 */
interface ReviewsLinesVM {
  /** The sentence at the head of the lens, one, built from the tiles' own numbers. */
  head: string | null;
  /** Under the mix: how many of the rated reviews are four or five stars, or that none was written. */
  mix: string | null;
  /** Under the weeks: what they add up to, or that none was written; null where the weeks drawn hold none. */
  weekly: string | null;
  /** Where the history on record starts, to run into other words: "history on record starts Aug 20"; null where it is whole. */
  history: string | null;
  /** …the same as a sentence, for a card's title: "History on record starts Aug 20." */
  historyTitle: string | null;
  /** From the five public reviews with no profile connected: what the profile would add. */
  connect: string | null;
  /** Nothing is linked: what the lens says in place of figures, and, where this deployment cannot look up or connect, that it cannot. */
  empty: string | null;
  /** Under the ratings gained, day by day (the five public reviews): why there are no days to draw yet. */
  gained: string | null;
  /** …and in the card in place of the days. */
  gainedEmpty: string | null;
  /** Under the reviews that wait: "Showing the oldest 5." where more wait than are listed. */
  waiting: string | null;
  /** In the waiting card where none waits. */
  waitingEmpty: string | null;
  /** In the latest card where it lists nothing: every review it has is waiting above, or Google showed none. */
  latestEmpty: string | null;
}

export interface ReviewsReportVM {
  days: number;
  /** "unavailable": nothing is linked and this deployment can neither look up a listing nor connect a profile; "unlinked": nothing is linked; "linked": a listing is. */
  state: "unavailable" | "unlinked" | "linked";
  /** Nothing is linked (`state` is not "linked"): the lens draws its empty state, and the head is its name alone. */
  empty: boolean;
  /** Whose reviews the counts are: every one the Business Profile holds, or the five Google shows (which count nothing). */
  source: "profile" | "places";
  /** The listing as the Google surface says it, made once; the figures below are built from it, never again. */
  google: Pick<GoogleVM, "listing" | "connection" | "canReply" | "reply" | "gained" | "source">;
  /** The figures the lens draws, in order: five from the profile, the listing's four without it. */
  tiles: ReportTileVM[];
  /** The mix of the period's stars, five down to one; null with none to count or no history to count them in. */
  stars: Omit<ReviewsStarMix, "good"> | null;
  /** The reviews written week by week, only the weeks the history on record covers; null with none written in them. */
  weekly: { points: ReviewsWeekVM[] } | null;
  /** The reviews with no reply: how many, and the oldest few with the reply the receptionist held, if any. */
  waiting: { total: number; rows: ReviewWaitingVM[] };
  /** The newest reviews; from the profile, those already in `waiting` are left out, so a review is drawn once. */
  latest: GoogleReviewVM[];
  /** `latest` as a table, its rows exactly those the card lists: the waiting reviews drawn above it are not in it. */
  latestTable: GoogleVM["table"];
  lines: ReviewsLinesVM;
}

/** What the profile would add, said under the five public reviews where no profile is connected. */
const CONNECT_WORDS = "Connect your Business Profile to see every review, who answered, and how fast.";

/** Where nothing is linked and this deployment can neither look up a listing nor connect a profile. */
const UNAVAILABLE_WORDS = "Google reviews are not available here yet.";

const NOTHING_WRITTEN = "No review written in this period.";
const GAINED_EMPTY_WORDS = "The count is read once a day; the first difference shows after the second read.";
const WAITING_EMPTY_WORDS = "Nothing is waiting for a reply.";
const LATEST_ALL_WAIT_WORDS = "The latest reviews are the ones waiting for a reply, above.";
const LATEST_NONE_WORDS = "Google shows no written reviews for this listing yet.";

/** A fresh set of lines with nothing to say; a builder fills the ones its state has. */
const noLines = (): ReviewsLinesVM => ({
  head: null,
  mix: null,
  weekly: null,
  history: null,
  historyTitle: null,
  connect: null,
  empty: null,
  gained: null,
  gainedEmpty: null,
  waiting: null,
  waitingEmpty: null,
  latestEmpty: null,
});

/** The fields of the listing's own figures the lens reads; nothing else of the Google surface is carried. */
const googleSaid = (g: GoogleVM): ReviewsReportVM["google"] => ({
  listing: g.listing,
  connection: g.connection,
  canReply: g.canReply,
  reply: g.reply,
  gained: g.gained,
  source: g.source,
});

/** A figure of the lens: the three the history can take away are dashes, and say why in their line. */
const figureOf = (
  id: string,
  metric: ReportMetric,
  label: string,
  said: Pick<ReportTileVM, "value" | "meta"> & Partial<Pick<ReportTileVM, "spark" | "compare">>,
): ReportTileVM => ({ id, metric, label, delta: null, spark: [], compare: null, ...said });

/** Who answered, in the Answered figure's line: "3 by the receptionist, 2 by you". */
function whoAnsweredWords(answered: number, receptionist: number): string {
  if (!answered) return "none answered yet";
  const you = answered - receptionist;
  return [receptionist ? `${receptionist} by the receptionist` : null, you ? `${you} by you` : null]
    .filter((w): w is string => !!w)
    .join(", ");
}

/** The Time to reply figure's line: the replies it stands on, and why there is no middle yet. */
function replyTimeMeta(p: Extract<ReviewsPeriod, { exact: true }>): string {
  if (p.replySeconds !== null) return `the middle of ${plural(p.timed, "reply", "replies")}`;
  if (p.timed > 0) return `${plural(p.timed, "reply", "replies")} so far; the middle needs ${REVIEW_REPLY_TIME_MIN}`;
  return p.answered ? "no reply has a time on record" : "no replies yet";
}

/** The five figures of the profile's period: the listing's rating and count, then what the reviews on record say. */
function reviewsProfileTiles(google: GoogleVM, p: ReviewsPeriod): ReportTileVM[] {
  const own = google.tiles.filter((t) => t.metric === "rating" || t.metric === "reviews");
  const label = `New in ${plural(p.days, "day")}`;
  if (!p.exact) {
    const meta = historyWords(p.history) ?? "";
    return [
      ...own,
      figureOf("written", "reviews_written", label, { value: "—", meta }),
      figureOf("answered", "reviews_answered", "Answered", { value: "—", meta }),
      figureOf("reply_time", "review_reply_time", "Time to reply", { value: "—", meta }),
    ];
  }
  const counted = p.written > 0;
  return [
    ...own,
    figureOf("written", "reviews_written", label, {
      value: String(p.written),
      meta: p.written ? "with words or without" : "none in this period",
      spark: p.daily,
      compare: p.prior === null ? null : compareWords(p.written, p.prior, rangeLabelOf(p.days), true),
    }),
    figureOf("answered", "reviews_answered", "Answered", {
      value: counted ? `${p.answered} of ${p.written}` : "—",
      meta: counted ? whoAnsweredWords(p.answered, p.receptionist) : "nothing to answer",
    }),
    figureOf("reply_time", "review_reply_time", "Time to reply", {
      value: counted ? fmtSeconds(p.replySeconds) : "—",
      meta: counted ? replyTimeMeta(p) : "nothing to answer",
    }),
  ];
}

/** The opening of the head: what Google holds now, "4.8 on Google from 213 reviews". A count Google left out is unknown, not none. */
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
  const within = withinWords(p.days);
  if (!p.written) return `none new ${within}`;
  const answered =
    p.answered === p.written ? "all answered" : p.answered ? `${p.answered} answered` : "none answered yet";
  return `${p.written} new ${within}, ${answered}`;
}

/** The mix under its card: how many of the period's rated reviews are four or five stars. */
function reviewsMixLine(p: ReviewsPeriod): string | null {
  if (!p.exact) return null;
  if (!p.written) return NOTHING_WRITTEN;
  const within = withinWords(p.days);
  if (!p.rated) return `No star rating among the reviews written ${within}.`;
  const of = p.rated === p.written ? plural(p.rated, "review") : plural(p.rated, "rated review");
  return `${p.good} of the ${of} written ${within} ${p.rated === 1 ? "is" : "are"} 4 or 5 stars.`;
}

/**
 * The weekly card's line: what the weeks drawn add up to, over the days they cover (the period, or from the first week the
 * record reaches), or that nothing was written where the period is known and holds none. Null where the weeks drawn hold
 * none: a card with no weeks to draw says where the history starts, not "0 written".
 */
function reviewsWeeklyLine(p: ReviewsPeriod, weeks: readonly ReviewsWeekVM[], since: string): string | null {
  const total = sumOf(weeks.map((w) => w.written));
  if (total) {
    const first = weeks.at(0);
    const over = first && first.day > since ? `since ${first.label}` : withinWords(p.days);
    return `${total} written ${over}`;
  }
  return p.exact && !p.written ? NOTHING_WRITTEN : null;
}

/** The oldest reviews with no reply, each with the reason a reply written for it was held, where one was. */
function reviewsWaitingOf(
  ledger: ReviewsLedgerDto,
  linkedAt: string,
  tz: string,
  nowMs: number,
): ReviewsReportVM["waiting"] {
  const rows = ledger.waiting.slice(0, REVIEWS_WAITING_SHOWN).map((r): ReviewWaitingVM => {
    const why = reviewHeldWords(r.held);
    return {
      ...toGoogleReviewVM(r, linkedAt, tz, nowMs),
      held: why ? `The receptionist wrote a reply and held it: ${why}.` : null,
    };
  });
  return { total: ledger.waiting_total, rows };
}

/** What the latest card says where it lists nothing: every review it has is waiting above, or Google gave none. */
const latestEmptyWords = (google: GoogleVM, latest: readonly GoogleReviewVM[]): string | null =>
  latest.length ? null : google.latest.length ? LATEST_ALL_WAIT_WORDS : LATEST_NONE_WORDS;

/** What the report is made from once a listing is linked. */
interface ReviewsBuild {
  dto: ReviewsReportDto;
  google: GoogleVM;
  l: GoogleListingDto;
  nowMs: number;
}

/** The report from the profile's reviews on record: counts over the period, the mix, the speed, what waits. */
function reviewsFromLedger({ dto, google, l, nowMs }: ReviewsBuild, ledger: ReviewsLedgerDto): ReviewsReportVM {
  const { days, today, timezone } = dto;
  const history = reviewsHistoryOf(ledger, dto.google.connection, timezone);
  const { period: p, weeks } = reviewsPeriodOf(ledger, history, today, days);
  const weekly = sumOf(weeks.map((w) => w.written)) ? { points: weeks } : null;
  const waiting = reviewsWaitingOf(ledger, l.linked_at, timezone, nowMs);
  const waitingIds = new Set(waiting.rows.map((r) => r.id));
  const latest = google.latest.filter((r) => !waitingIds.has(r.id));
  const onRecord = ledger.on_record.profile + ledger.on_record.places;
  const startsAt = p.exact && p.prior !== null ? null : historyWords(history);
  return {
    days,
    state: "linked",
    empty: false,
    source: "profile",
    google: googleSaid(google),
    tiles: reviewsProfileTiles(google, p),
    stars: p.exact && p.mix.rated ? { rated: p.mix.rated, rows: p.mix.rows, table: p.mix.table } : null,
    weekly,
    waiting,
    latest,
    latestTable: googleReviewsTable(latest),
    lines: {
      ...noLines(),
      head: reviewsNoneHead(l, onRecord, nowMs) ?? `${reviewsStandingWords(l)}; ${profileHeadTail(p)}.`,
      mix: reviewsMixLine(p),
      weekly: reviewsWeeklyLine(p, weeks, periodSince(today, days)),
      history: startsAt,
      historyTitle: startsAt ? `${capitalize(startsAt)}.` : null,
      waiting: waiting.total > waiting.rows.length ? `Showing the oldest ${waiting.rows.length}.` : null,
      waitingEmpty: waiting.rows.length ? null : WAITING_EMPTY_WORDS,
      latestEmpty: latestEmptyWords(google, latest),
    },
  };
}

/** The report from the five public reviews: the listing's four figures, what its readings gained, and what the profile would add. */
function reviewsFromPlaces({ dto, google, l, nowMs }: ReviewsBuild): ReviewsReportVM {
  const onRecord = dto.ledger ? dto.ledger.on_record.profile + dto.ledger.on_record.places : dto.google.reviews.length;
  const noDays = google.gained.total === null;
  return {
    days: dto.days,
    state: "linked",
    empty: false,
    source: "places",
    google: googleSaid(google),
    tiles: google.tiles,
    stars: null,
    weekly: null,
    waiting: { total: 0, rows: [] },
    latest: google.latest,
    latestTable: googleReviewsTable(google.latest),
    lines: {
      ...noLines(),
      head: reviewsNoneHead(l, onRecord, nowMs) ?? `${reviewsStandingWords(l)}; ${google.gained.words.head}.`,
      connect: dto.google.connection ? null : CONNECT_WORDS,
      gained: noDays ? `${capitalize(google.gained.words.meta)}.` : null,
      gainedEmpty: noDays ? GAINED_EMPTY_WORDS : null,
      latestEmpty: latestEmptyWords(google, google.latest),
    },
  };
}

/** Nothing is linked: no figures, no head, and the words for why, with the door the registry gives where one can be opened. */
function reviewsNotLinked(dto: ReviewsReportDto, google: GoogleVM): ReviewsReportVM {
  const found = lensEmpty("reviews", { since: periodSince(dto.today, dto.days), until: dto.today }).title;
  return {
    days: dto.days,
    state: dto.readable ? "unlinked" : "unavailable",
    empty: true,
    source: "places",
    google: googleSaid(google),
    tiles: [],
    stars: null,
    weekly: null,
    waiting: { total: 0, rows: [] },
    latest: [],
    latestTable: googleReviewsTable([]),
    lines: { ...noLines(), empty: dto.readable ? found : UNAVAILABLE_WORDS },
  };
}

/**
 * Reviews, drawn from what is stored: the listing's own figures from `toGoogleVM`, and, where the owner's Business Profile
 * has synced, the counts of the period over the reviews on record. The period is `dto.days`, the one the ledger was read
 * for: a fold of another would count the reviews the read left out as none. `nowMs` is the moment it is said at, given and
 * never read here, so the same rows say the same words. Every sentence is made here; the page, the head and Ask say these.
 */
export function toReviewsReportVM(dto: ReviewsReportDto, opts: { nowMs: number }): ReviewsReportVM {
  const { nowMs } = opts;
  const google = toGoogleVM(dto.google, dto.days, nowMs, dto.timezone);
  const l = dto.google.listing;
  if (!l) return reviewsNotLinked(dto, google);
  const build: ReviewsBuild = { dto, google, l, nowMs };
  return dto.ledger && reviewsAreOnRecord(dto.google) ? reviewsFromLedger(build, dto.ledger) : reviewsFromPlaces(build);
}
