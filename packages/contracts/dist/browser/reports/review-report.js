import { sumOf } from "../shared/numbers.js";
import { capitalize, plural } from "../shared/words.js";
import {
  checkedWords,
  googleReviewsTable,
  toGoogleReviewVM,
  toGoogleVM
} from "../google/google.js";
import { reviewHeldWords } from "../google/review-reply.js";
import { lensEmpty } from "./lenses.js";
import { periodSince } from "./report-periods.js";
import { compareWords, fmtSeconds } from "./report-tiles.js";
import { endedOn, rangeLabelOf, withinWords } from "./reports.js";
import {
  REVIEW_REPLY_TIME_MIN,
  historyWords,
  reviewsAreOnRecord,
  reviewsHistoryOf,
  reviewsPeriodOf
} from "./review-record.js";
export const REVIEWS_WAITING_SHOWN = 5;
const CONNECT_WORDS = "Connect your Business Profile to see every review, who answered, and how fast.";
const UNAVAILABLE_WORDS = "Google reviews are not available here yet.";
const NOTHING_WRITTEN = "No review written in this period.";
const GAINED_EMPTY_WORDS = "The count is read once a day; the first difference shows after the second read.";
const WAITING_EMPTY_WORDS = "Nothing is waiting for a reply.";
const LATEST_ALL_WAIT_WORDS = "The latest reviews are the ones waiting for a reply, above.";
const LATEST_NONE_WORDS = "Google shows no written reviews for this listing yet.";
const noLines = () => ({
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
  latestEmpty: null
});
const googleSaid = (g) => ({
  listing: g.listing,
  connection: g.connection,
  canReply: g.canReply,
  reply: g.reply,
  gained: g.gained,
  source: g.source
});
const figureOf = (id, metric, label, said) => ({ id, metric, label, delta: null, spark: [], compare: null, ...said });
function whoAnsweredWords(answered, receptionist) {
  if (!answered) return "none answered yet";
  const you = answered - receptionist;
  return [receptionist ? `${receptionist} by the receptionist` : null, you ? `${you} by you` : null].filter((w) => !!w).join(", ");
}
function replyTimeMeta(p) {
  if (p.replySeconds !== null) return `the middle of ${plural(p.timed, "reply", "replies")}`;
  if (p.timed > 0) return `${plural(p.timed, "reply", "replies")} so far; the middle needs ${REVIEW_REPLY_TIME_MIN}`;
  return p.answered ? "no reply has a time on record" : "no replies yet";
}
function reviewsProfileTiles(google, p) {
  const own = google.tiles.filter((t) => t.metric === "rating" || t.metric === "reviews");
  const label = `New in ${plural(p.days, "day")}`;
  if (!p.exact) {
    const meta = historyWords(p.history) ?? "";
    return [
      ...own,
      figureOf("written", "reviews_written", label, { value: "\u2014", meta }),
      figureOf("answered", "reviews_answered", "Answered", { value: "\u2014", meta }),
      figureOf("reply_time", "review_reply_time", "Time to reply", { value: "\u2014", meta })
    ];
  }
  const counted = p.written > 0;
  return [
    ...own,
    figureOf("written", "reviews_written", label, {
      value: String(p.written),
      meta: p.written ? "with words or without" : "none in this period",
      spark: p.daily,
      compare: p.prior === null ? null : compareWords(p.written, p.prior, rangeLabelOf(p.days), true)
    }),
    figureOf("answered", "reviews_answered", "Answered", {
      value: counted ? `${p.answered} of ${p.written}` : "\u2014",
      meta: counted ? whoAnsweredWords(p.answered, p.receptionist) : "nothing to answer"
    }),
    figureOf("reply_time", "review_reply_time", "Time to reply", {
      value: counted ? fmtSeconds(p.replySeconds) : "\u2014",
      meta: counted ? replyTimeMeta(p) : "nothing to answer"
    })
  ];
}
function reviewsStandingWords(l) {
  const rating = typeof l.rating === "number" ? `${l.rating.toFixed(1)} on Google` : null;
  const count = typeof l.review_count === "number" ? plural(l.review_count, "review") : null;
  if (rating) return count ? `${rating} from ${count}` : rating;
  return `${count ?? "Reviews"} on Google`;
}
function reviewsNoneHead(l, onRecord, nowMs) {
  if (l.review_count || onRecord > 0) return null;
  return l.review_count === null && l.checked_at === null ? `${checkedWords(l, nowMs)}.` : "No reviews on Google yet.";
}
function profileHeadTail(p) {
  if (!p.exact) return historyWords(p.history) ?? "";
  const within = withinWords(p.days, p.until);
  if (!p.written) return `none new ${within}`;
  const answered = p.answered === p.written ? "all answered" : p.answered ? `${p.answered} answered` : "none answered yet";
  return `${p.written} new ${within}, ${answered}`;
}
function reviewsMixLine(p) {
  if (!p.exact) return null;
  if (!p.written) return NOTHING_WRITTEN;
  const within = withinWords(p.days, p.until);
  if (!p.rated) return `No star rating among the reviews written ${within}.`;
  const of = p.rated === p.written ? plural(p.rated, "review") : plural(p.rated, "rated review");
  return `${p.good} of the ${of} written ${within} ${p.rated === 1 ? "is" : "are"} 4 or 5 stars.`;
}
function reviewsWeeklyLine(p, weeks, since) {
  const total = sumOf(weeks.map((w) => w.written));
  if (total) {
    const first = weeks.at(0);
    const over = first && first.day > since ? `since ${first.label}` : withinWords(p.days, p.until);
    return `${total} written ${over}`;
  }
  return p.exact && !p.written ? NOTHING_WRITTEN : null;
}
function reviewsWaitingOf(ledger, linkedAt, tz, nowMs) {
  const rows = ledger.waiting.slice(0, REVIEWS_WAITING_SHOWN).map((r) => {
    const why = reviewHeldWords(r.held);
    return {
      ...toGoogleReviewVM(r, linkedAt, tz, nowMs),
      held: why ? `The receptionist wrote a reply and held it: ${why}.` : null
    };
  });
  return { total: ledger.waiting_total, rows };
}
const latestEmptyWords = (google, latest) => latest.length ? null : google.latest.length ? LATEST_ALL_WAIT_WORDS : LATEST_NONE_WORDS;
function reviewsFromLedger({ dto, google, l, nowMs }, ledger) {
  const { days, timezone } = dto;
  const last = dto.end ?? dto.today;
  const history = reviewsHistoryOf(ledger, dto.google.connection, timezone);
  const { period: p, weeks } = reviewsPeriodOf(ledger, history, { last, days, until: endedOn(dto) });
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
      weekly: reviewsWeeklyLine(p, weeks, periodSince(last, days)),
      history: startsAt,
      historyTitle: startsAt ? `${capitalize(startsAt)}.` : null,
      waiting: waiting.total > waiting.rows.length ? `Showing the oldest ${waiting.rows.length}.` : null,
      waitingEmpty: waiting.rows.length ? null : WAITING_EMPTY_WORDS,
      latestEmpty: latestEmptyWords(google, latest)
    }
  };
}
function reviewsFromPlaces({ dto, google, l, nowMs }) {
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
      latestEmpty: latestEmptyWords(google, google.latest)
    }
  };
}
function reviewsNotLinked(dto, google) {
  const last = dto.end ?? dto.today;
  const found = lensEmpty("reviews", { since: periodSince(last, dto.days), until: last }).title;
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
    lines: { ...noLines(), empty: dto.readable ? found : UNAVAILABLE_WORDS }
  };
}
export function toReviewsReportVM(dto, opts) {
  const { nowMs } = opts;
  const google = toGoogleVM(dto.google, { days: dto.days, until: endedOn(dto) }, nowMs, dto.timezone);
  const l = dto.google.listing;
  if (!l) return reviewsNotLinked(dto, google);
  const build = { dto, google, l, nowMs };
  return dto.ledger && reviewsAreOnRecord(dto.google) ? reviewsFromLedger(build, dto.ledger) : reviewsFromPlaces(build);
}
