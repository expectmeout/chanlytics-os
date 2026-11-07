/** Google: google. */

import { clockDate, zoneDayKey } from "../shared/clock";
import { agoWords, isoMs, WEEK_MS } from "../shared/time";
import { plural } from "../shared/words";
import { heldReviewReplyOf, reviewReplyWords, type HeldReviewReply, type ReviewReplyMode } from "./review-reply";
import { reviewRoute } from "../reports/lenses";
import { dayPointOf, fmtDay } from "../reports/dtos";
import { rangeLabelOf, withinWords } from "../reports/reports";
import { beforeWords, compareWords, type ReportTileVM } from "../reports/tiles";
import { shiftKey } from "../shared/zone/day-keys";
import {
  BOOTSTRAP_MS,
  NEW_REVIEW_NEWS,
  REVIEW_NEWS_MAX_AGE_MS,
  REVIEW_NEWS_MS,
  checkedWords,
  connectionWords,
  ratingWords,
  reviewsWords,
  starsOf,
  type GoogleConnectionDto,
  type GoogleDayDto,
  type GoogleReadDto,
  type GoogleReviewDto,
} from "./listing";

/**
 * Whether the reviews on record are the owner's Business Profile's: a location is chosen and a sync has finished. A sync
 * stores every review it read before it stamps itself (the edge's syncProfile), so before the stamp the rows are still the
 * five Google shows, though the connection is there. The one test, for the source's words here and for the reviews report.
 */
export function reviewsFromProfile(
  googleConnection: Pick<GoogleConnectionDto, "location_name" | "last_synced_at"> | null | undefined,
): boolean {
  return !!googleConnection && !!googleConnection.location_name && !!googleConnection.last_synced_at;
}

/** A review's words, cut for a line: the first sentence or so. */
export function reviewSnippet(body: string | null | undefined, max = 90): string {
  const t = (body ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export interface GoogleReviewVM {
  /** The review's row (google_reviews.id): what its address, the reply door and the ledger name it by. */
  id: string;
  /** Google's own id for the review: what the first notices of a new review were kept about (reviewNoticeIsAbout). */
  reviewId: string;
  stars: string;
  rating: number | null;
  author: string;
  /** "3d ago" or the date. */
  when: string;
  text: string;
  replied: boolean;
  replyText: string;
  mapsUri: string | null;
  /** First seen recently, written recently, and not part of the first read. */
  isNew: boolean;
  /** Read through the owner's profile: every review, and it can be answered. */
  fromProfile: boolean;
  /** The reply the receptionist wrote and holds for it (decision 0064, step 6); null where none is held. */
  heldReply: HeldReviewReply | null;
}

export interface GoogleGainedPointVM {
  day: string;
  label: string;
  short: string;
  gained: number;
}

export interface GoogleVM {
  listing: {
    name: string;
    address: string | null;
    ratingLabel: string;
    count: number | null;
    /** "Checked 3h ago" · "Google could not be read since 2d ago — …" */
    checked: string;
    mapsUri: string | null;
    /** The last read failed. */
    trouble: boolean;
  } | null;
  /** The owner's profile, when connected: whose account, the location, when it synced. */
  connection: {
    email: string | null;
    location: string | null;
    words: string;
    pending: boolean;
    trouble: boolean;
  } | null;
  /** Reviews can be answered from here: the profile is connected and complete. */
  canReply: boolean;
  /** What the receptionist does under a new review, and the words for it beside the source; empty until replies can go out from here. */
  reply: { mode: ReviewReplyMode; words: string };
  /** Rating now · reviews on Google · gained in the period · newest review. */
  tiles: ReportTileVM[];
  gained: {
    points: GoogleGainedPointVM[];
    max: number;
    /** Null until two days of reading exist. */
    total: number | null;
    /** "Sep 3" — the first day the count is known from, when it is inside the period. */
    sinceLabel: string | null;
    /** The gain in words, made once (gainedWords): the Gained figure's value and line, and the clause the Reviews head ends on. */
    words: { value: string; meta: string; head: string };
  };
  latest: GoogleReviewVM[];
  /** "the five Google shows first" or "every review, from your Business Profile". */
  source: string;
  table: { columns: string[]; rows: (string | number)[][] };
  /**
   * The old Today's one line when a review was news and not yet answered, where it led (that review, with its reply box),
   * and which review it drew, read now by the away card's grouping alone (todayAwayGrouped), which no page draws: Today's
   * To do lists the reviews to answer (need-you/reviews.ts), and Since you looked leaves out the bell's rows about them.
   */
  todayLine: { text: string; to: string; review: { id: string; reviewId: string } } | null;
}

/**
 * Whether a bell row's subject is this review. A new review's notice was kept about Google's own id for it, the receptionist's
 * reply notice about the review's row, so a row is about the review when its subject is either.
 */
export function reviewNoticeIsAbout(
  about: { type: string; id: string } | null | undefined,
  review: { id: string; reviewId?: string | null },
): boolean {
  return !!about && about.type === "review" && (about.id === review.id || about.id === review.reviewId);
}

/** The rating against the one before the period, in words: "up from 4.7", "down from 4.9", "same as the 30 days before". */
function ratingCompareWords(rating: number, before: number, rangeLabel: string): string {
  const now = Math.round(rating * 10);
  const was = Math.round(before * 10);
  if (now === was) return `same as ${beforeWords(rangeLabel)}`;
  return `${now > was ? "up" : "down"} from ${(was / 10).toFixed(1)}`;
}

/** "3d ago", and past a week the date in the workspace's zone ("Sep 6", with the year when it is not this year there). */
function whenWords(iso: string | null, tz: string, nowMs: number): string {
  const at = isoMs(iso);
  if (at === null) return "";
  return agoWords(at, nowMs, { dateAfterMs: WEEK_MS, date: (ms) => clockDate(ms, tz, nowMs) });
}

/** Whether a review is news: first seen recently, written recently, and after the first read. */
export function reviewIsNew(
  googleReview: Pick<GoogleReviewDto, "first_seen_at" | "published_at">,
  linkedAt: string,
  nowMs: number,
): boolean {
  const seen = isoMs(googleReview.first_seen_at);
  if (seen === null || nowMs - seen > REVIEW_NEWS_MS) return false;
  const linked = isoMs(linkedAt);
  if (linked !== null && seen - linked < BOOTSTRAP_MS) return false;
  const written = isoMs(googleReview.published_at);
  return written !== null && nowMs - written <= REVIEW_NEWS_MAX_AGE_MS;
}

/** A review as a card draws it; "when" is in the workspace's zone (`tz`), never the runtime's. */
export function toGoogleReviewVM(
  googleReview: GoogleReviewDto,
  linkedAt: string,
  tz: string,
  nowMs: number,
): GoogleReviewVM {
  return {
    id: googleReview.id,
    reviewId: googleReview.review_id,
    stars: starsOf(googleReview.rating),
    rating: googleReview.rating,
    author: googleReview.author?.trim() || "A customer",
    when: whenWords(googleReview.published_at, tz, nowMs),
    text: (googleReview.body ?? "").replace(/\s+/g, " ").trim(),
    replied: !!googleReview.reply_text,
    replyText: (googleReview.reply_text ?? "").replace(/\s+/g, " ").trim(),
    heldReply: heldReviewReplyOf(googleReview, tz),
    mapsUri: googleReview.maps_uri,
    isNew: reviewIsNew(googleReview, linkedAt, nowMs),
    fromProfile: googleReview.origin === "profile",
  };
}

/** The reviews as a table, the twin of a card that lists them: who, how many stars, when, and their words. */
export function googleReviewsTable(rows: readonly GoogleReviewVM[]): GoogleVM["table"] {
  return {
    columns: ["Reviewer", "Stars", "Written", "Words"],
    rows: rows.map((r) => [r.author, r.rating ?? "—", r.when || "—", r.text || "—"]),
  };
}

/** The period's gain from the day snapshots, before it is put in words. */
type GoogleGained = Omit<GoogleVM["gained"], "words">;

/** What the readings cannot say until Google's count has been read on two days: said here once, in the figure, the head and the card. */
const NEEDS_SECOND_READING = "needs a second day of reading";

const noGainYet = (): GoogleVM["gained"]["words"] => ({
  value: "—",
  meta: NEEDS_SECOND_READING,
  head: `what changed ${NEEDS_SECOND_READING}`,
});

/** A period with no gain to count, made afresh each time: a caller that writes to it writes to its own. */
const noGained = (): GoogleGained => ({ points: [], max: 0, total: null, sinceLabel: null });

/**
 * Which days a gain is of, as a clause: since the first day on record where the period reaches back past it, up to the
 * last reading where that is behind the day (a missed read; the count stopped, and "the last 30 days" would claim a
 * window it did not see), else the period itself.
 */
function gainedScope(g: GoogleGained, days: number, last: string, behind: boolean): string {
  if (g.sinceLabel) return `since ${g.sinceLabel}`;
  // Not behind is a period that ends today, read today: its words are the report's own for one that does.
  if (!behind) return withinWords(days, null);
  return days === 1 ? `on ${fmtDay(last)}` : `in the ${rangeLabelOf(days)} to ${fmtDay(last)}`;
}

/**
 * What the daily readings gained, put in words once: the Gained figure's value and its line, and the clause the Reviews
 * head ends on, so the head's number is the figure's. A fall is said as one ("down 4"), never as a minus sign. `today` is
 * the workspace's day.
 */
function gainedWords(
  googleGained: GoogleGained,
  days: number,
  today: string,
  until: string | null,
): GoogleVM["gained"]["words"] {
  const { total, sinceLabel } = googleGained;
  if (total === null) return noGainYet();
  const last = googleGained.points.at(-1)?.day ?? today;
  // Behind the day: a read was missed, or the period itself ended before today (`until`, days a member picked on
  // Reports). Either way the count is of days up to `last`, and says so.
  const behind = until !== null || last < shiftKey(today, -1);
  const scope = gainedScope(googleGained, days, last, behind);
  const head =
    total < 0
      ? `down ${plural(-total, "rating")} ${scope}`
      : `${total ? `${plural(total, "rating")} gained` : "none gained"} ${scope}`;
  const meta = sinceLabel
    ? `since ${sinceLabel}, the first day on record`
    : total < 0
      ? "Google's count fell"
      : `new ratings${behind ? ` to ${fmtDay(last)}` : ""}, words or not`;
  return { value: total < 0 ? `down ${-total}` : String(total), meta, head };
}

/**
 * What a period gained, from the day snapshots: the count on the last read
 * day less the count on the newest day before the period (or the first day
 * inside it, which is then named), and the same for the period before.
 */
export function gainedOver(
  days: GoogleDayDto[],
  periodDays: number,
): { current: GoogleGained; previous: number | null } {
  const sorted = [...days].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (sorted.length < 2) return { current: noGained(), previous: null };
  const last = sorted[sorted.length - 1];
  const since = shiftKey(last.day, -(periodDays - 1));
  const before = sorted.filter((d) => d.day < since);
  const inside = sorted.filter((d) => d.day >= since);
  const baseline = before.length ? before[before.length - 1] : inside[0];
  const total = last.review_count - baseline.review_count;
  const sinceLabel = before.length ? null : fmtDay(baseline.day);
  // Gains day by day: each read day less the read day before it, on the day it was read.
  const byDay = new Map(sorted.map((d) => [d.day, d.review_count]));
  const points: GoogleGainedPointVM[] = [];
  let prev: number | null = before.length ? baseline.review_count : null;
  for (let day = since; day <= last.day; day = shiftKey(day, 1)) {
    const count = byDay.get(day);
    const gained = count !== undefined && prev !== null ? Math.max(0, count - prev) : 0;
    if (count !== undefined) prev = count;
    points.push({ ...dayPointOf(day), gained });
  }
  const max = Math.max(0, ...points.map((p) => p.gained));
  // The period before: the same arithmetic one period earlier, null without a baseline of its own.
  const prevSince = shiftKey(since, -periodDays);
  const prevBefore = sorted.filter((d) => d.day < prevSince);
  const prevInside = sorted.filter((d) => d.day >= prevSince && d.day < since);
  const previous =
    prevBefore.length && prevInside.length
      ? prevInside[prevInside.length - 1].review_count - prevBefore[prevBefore.length - 1].review_count
      : null;
  return { current: { points, max, total: before.length || inside.length >= 2 ? total : null, sinceLabel }, previous };
}

/** The days a listing's gain is counted over: how many, and their last day where that was before today. */
interface GainWindow {
  days: number;
  /** Null for a period that ends today, which each caller says; else the day it ended (Reports' days a member picked). */
  until: string | null;
}

/**
 * The listing, the reviews and the readings as the pages draw them, in the workspace's zone (`tz`) at `nowMs`, over a
 * period. Where the period ended before today the readings after its last day are not its own, and what it gained is
 * said "to" that day.
 */
export function toGoogleVM(dto: GoogleReadDto, period: GainWindow, nowMs: number, tz: string): GoogleVM {
  const { days: periodDays, until } = period;
  const listing = dto.listing;
  const result = dto.connection ?? null;
  const connection: GoogleVM["connection"] = result
    ? {
        email: result.google_email,
        location: result.location_title,
        words: connectionWords(result, nowMs),
        pending: !result.location_name,
        trouble: !!result.sync_error,
      }
    : null;
  const canReply = !!result && !!result.location_name;
  const reply = { mode: dto.reply_mode, words: reviewReplyWords(dto.reply_mode, canReply) };
  if (!listing)
    return {
      listing: null,
      connection,
      canReply,
      reply,
      tiles: [],
      gained: { ...noGained(), words: noGainYet() },
      latest: [],
      source: "",
      table: googleReviewsTable([]),
      todayLine: null,
    };

  const latest = [...dto.reviews]
    .sort((a, b) => (isoMs(b.published_at) ?? 0) - (isoMs(a.published_at) ?? 0))
    .map((r) => toGoogleReviewVM(r, listing.linked_at, tz, nowMs));
  const source = reviewsFromProfile(result)
    ? "every review, from your Business Profile"
    : `the ${latest.length === 1 ? "one" : latest.length} Google shows first`;

  const days = dto.days
    .filter((d) => until === null || d.day <= until)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const { current, previous } = gainedOver(days, periodDays);
  const gained: GoogleVM["gained"] = {
    ...current,
    words: gainedWords(current, periodDays, zoneDayKey(nowMs, tz), until),
  };
  const noun = plural(periodDays, "day");
  const inPeriod = days.length
    ? days.filter((d) => d.day >= shiftKey(days[days.length - 1].day, -(periodDays - 1)))
    : [];
  const ratingSpark = inPeriod.flatMap((d) => (d.rating === null ? [] : [d.rating]));
  const countSpark = inPeriod.map((d) => d.review_count);
  const baselineRating = (() => {
    if (!days.length) return null;
    const since = shiftKey(days[days.length - 1].day, -(periodDays - 1));
    const before = days.filter((d) => d.day < since);
    return before.length ? before[before.length - 1].rating : null;
  })();
  // The period before sits beside the figure in counts (compareWords): a percentage of a rating, or of counts this small, lies.
  const rangeLabel = rangeLabelOf(periodDays);
  const ratingCompare =
    typeof listing.rating === "number" && typeof baselineRating === "number"
      ? ratingCompareWords(listing.rating, baselineRating, rangeLabel)
      : null;
  const newest = latest[0] ?? null;
  const checked = checkedWords(listing, nowMs);

  const tiles: ReportTileVM[] = [
    {
      id: "rating",
      metric: "rating",
      label: "Rating on Google",
      value: typeof listing.rating === "number" ? listing.rating.toFixed(1) : "—",
      meta: `${reviewsWords(listing.review_count)} · ${checked.toLowerCase()}`,
      delta: null,
      spark: ratingSpark,
      compare: ratingCompare,
    },
    {
      id: "reviews",
      metric: "reviews",
      label: "Reviews on Google",
      value: typeof listing.review_count === "number" ? String(listing.review_count) : "—",
      meta: "as Google counts them, with or without words",
      delta: null,
      spark: countSpark,
      compare: null,
    },
    {
      id: "gained",
      metric: "ratings_gained",
      label: `Gained in ${noun}`,
      value: gained.words.value,
      meta: gained.words.meta,
      delta: null,
      spark: gained.points.map((p) => p.gained),
      // A count that fell in the period before is no figure to measure against ("up from -2").
      compare:
        gained.total !== null && previous !== null && previous >= 0
          ? compareWords(gained.total, previous, rangeLabel, true)
          : null,
    },
    {
      id: "newest",
      metric: "newest_review",
      label: "Newest review",
      value: newest?.when || "—",
      meta: newest
        ? `${newest.stars} · ${newest.author}`
        : canReply
          ? "no review yet"
          : "none of the five Google shows has a date",
      delta: null,
      spark: [],
      compare: null,
    },
  ];

  // News until it is answered: a review the owner (or the receptionist) has replied to is dealt with, and its line goes.
  const news = latest.find((r) => r.isNew && !r.replied) ?? null;
  const todayLine = news
    ? {
        text: `${NEW_REVIEW_NEWS} ${news.stars} from ${news.author}${news.text ? ` — “${reviewSnippet(news.text)}”` : ""}`,
        to: reviewRoute(news.id),
        review: { id: news.id, reviewId: news.reviewId },
      }
    : null;

  return {
    listing: {
      name: listing.name,
      address: listing.address,
      ratingLabel: ratingWords(listing.rating),
      count: listing.review_count,
      checked,
      mapsUri: listing.maps_uri,
      trouble: !!listing.check_error,
    },
    connection,
    canReply,
    reply,
    tiles,
    gained,
    latest,
    source,
    table: googleReviewsTable(latest),
    todayLine,
  };
}
