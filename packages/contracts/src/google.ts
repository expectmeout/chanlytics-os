/**
 * Google — a business's listing on Google Maps, as facts.
 *
 * Most businesses live on Google whether or not they asked to. The listing
 * is public: a name, an address, a rating, a count of reviews, and the five
 * reviews Google shows first. Setup finds it from the facts the workspace
 * already holds, the edge reads it once a day, and what changed reaches the
 * bell, Today and Reports. The owner's own Business Profile, connected once,
 * adds every review and the right to answer them.
 *
 * Two honesties shape every line: Google shows at most five reviews of the
 * public listing, sorted by relevance, so "new" is a review not on record
 * and written since the previous check, while the count of ratings is
 * exact; and fewer than two days of reading cannot say what a period
 * gained. Pure: the routes feed it rows, the tests feed it fixtures.
 */
import type { SchemaSet } from "./schema-sets";
import { agoWords } from "./time";
import { reviewReplyWords, type ReviewReplyMode } from "./review-reply";
import { dayDate, fmtDay, deltaOf, type ReportTileVM } from "./reports";

export interface GoogleListingDto {
  place_id: string;
  name: string;
  address: string | null;
  maps_uri: string | null;
  business_status: string | null;
  rating: number | null;
  review_count: number | null;
  linked_at: string;
  /** The last successful read; null before the first. */
  checked_at: string | null;
  /** The words of the last failed read; null once a read succeeds again. */
  check_error: string | null;
}

export interface GoogleReviewDto {
  id: string;
  review_id: string;
  origin: SchemaSet<"google_reviews.origin">;
  rating: number | null;
  author: string | null;
  author_uri: string | null;
  author_photo_uri: string | null;
  body: string | null;
  language_code: string | null;
  published_at: string | null;
  reply_text: string | null;
  replied_at: string | null;
  maps_uri: string | null;
  first_seen_at: string;
}

/** The rating and the count on one local day, as the edge read them. */
export interface GoogleDayDto {
  day: string;
  rating: number | null;
  review_count: number;
}

/** The owner's Business Profile, connected: whose account, which location, when it last synced. Never a token. */
export interface GoogleConnectionDto {
  google_email: string | null;
  account_title: string | null;
  /** Null while the owner still has to choose among several locations. */
  location_name: string | null;
  location_title: string | null;
  connected_at: string;
  last_synced_at: string | null;
  sync_error: string | null;
}

/** Google's consent-screen audience for our app, as the operator set it on the edge; null = nothing to say. */
export type GoogleAudience = "testing" | "unverified" | "verified";

/** What `GET /api/v1/google` returns. */
export interface GoogleDto {
  /** Whether this deployment can look listings up (a Places key on the edge) and connect profiles (an OAuth client on the edge), and which audience Google's consent screen has. */
  ready: { places: boolean; profile: boolean; audience?: GoogleAudience | null };
  listing: GoogleListingDto | null;
  connection: GoogleConnectionDto | null;
  /** The newest first; at most a screenful. */
  reviews: GoogleReviewDto[];
  /** Oldest first. */
  days: GoogleDayDto[];
  /** The Autonomy row for reviews: what the receptionist does under a new one. */
  reply_mode: ReviewReplyMode;
}

/** What a search found: what the owner confirms with one tap. */
export interface GoogleCandidateDto {
  place_id: string;
  name: string;
  address: string | null;
  maps_uri: string | null;
}

/** A location of the connected account, for the owner to choose. */
export interface GoogleLocationDto {
  account_name: string;
  account_title: string;
  location_name: string;
  title: string;
  address: string | null;
  /** Null for a location not on Maps yet — it cannot be chosen until Google lists it. */
  place_id: string | null;
  maps_uri: string | null;
}

/** The facts Setup reads: can the listing be found here, is one linked, is the profile connected. */
export interface SetupGoogleFacts {
  /** Either door is open: listings can be found here, or profiles connected. */
  ready: boolean;
  /** Listings can be found here (a Places key); absent means yes. */
  places?: boolean;
  listing: { name: string; rating: number | null; review_count: number | null; checked_at: string | null; check_error: string | null } | null;
  connected?: boolean;
}

/** Google shows this many reviews of a listing, the most relevant first. */
export const GOOGLE_SHOWN_REVIEWS = 5;

/** A review first seen this recently is news on Today. */
export const REVIEW_NEWS_MS = 36 * 3600 * 1000;
/** …unless it was written long ago and merely resurfaced in the five Google shows. */
export const REVIEW_NEWS_MAX_AGE_MS = 14 * 86_400_000;
/** The first read after linking is history, not news. */
const BOOTSTRAP_MS = 3600 * 1000;

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** "4.8 ★"; "no rating yet" when Google has none. */
export function ratingWords(rating: number | null | undefined): string {
  return typeof rating === "number" && Number.isFinite(rating) ? `${rating.toFixed(1)} ★` : "no rating yet";
}

/** "★★★★☆" for a review's stars; five hollow stars for none. */
export function starsOf(rating: number | null | undefined): string {
  const n = typeof rating === "number" && Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0;
  return "★".repeat(n) + "☆".repeat(5 - n);
}

/** "213 reviews"; "reviews not counted yet" before the first read. */
export function reviewsWords(count: number | null | undefined): string {
  return typeof count === "number" ? plural(count, "review") : "reviews not counted yet";
}

/** One line about the listing: "Northside Movers · 4.8 ★ · 213 reviews on Google". */
export function listingLine(l: { name: string; rating: number | null; review_count: number | null }): string {
  if (!l.review_count) return `${l.name} · no reviews on Google yet`;
  return `${l.name} · ${ratingWords(l.rating)} · ${reviewsWords(l.review_count)} on Google`;
}

/** When the listing was read, in words — the fact the owner wants when a number looks stale. */
export function checkedWords(l: Pick<GoogleListingDto, "checked_at" | "check_error">, nowMs: number): string {
  if (l.check_error && l.checked_at) return `Google could not be read since ${agoWords(Date.parse(l.checked_at), nowMs)} — read again once a day`;
  if (l.check_error) return "Google could not be read yet — read again once a day";
  if (l.checked_at) return `Checked ${agoWords(Date.parse(l.checked_at), nowMs)}`;
  return "Not read yet";
}

/** The connection in words: whose account, and when it last synced or why it could not. */
export function connectionWords(c: GoogleConnectionDto, nowMs: number): string {
  const who = c.google_email ? `Connected as ${c.google_email}` : "Connected";
  if (!c.location_name) return `${who} · choose the location to finish`;
  if (c.sync_error && c.last_synced_at) return `${who} · could not sync since ${agoWords(Date.parse(c.last_synced_at), nowMs)} — read again once a day`;
  if (c.sync_error) return `${who} · could not sync yet — read again once a day`;
  if (c.last_synced_at) return `${who} · synced ${agoWords(Date.parse(c.last_synced_at), nowMs)}`;
  return `${who} · not synced yet`;
}

/** A review's words, cut for a line: the first sentence or so. */
export function reviewSnippet(body: string | null | undefined, max = 90): string {
  const t = (body ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export interface GoogleReviewVM {
  id: string;
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
  connection: { email: string | null; location: string | null; words: string; pending: boolean; trouble: boolean } | null;
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
  };
  latest: GoogleReviewVM[];
  /** "the five Google shows first" or "every review, from your Business Profile". */
  source: string;
  table: { columns: string[]; rows: (string | number)[][] };
  /** Today's one line when a review is news, and where it leads. */
  todayLine: { text: string; to: string } | null;
}

const DATE_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
const WEEK_MS = 7 * 86_400_000;

function whenWords(iso: string | null, nowMs: number): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  return agoWords(at, nowMs, { dateAfterMs: WEEK_MS, date: (ms) => DATE_FMT.format(new Date(ms)) });
}

/** "2026-09-04" plus n days, as the same kind of string. */
function shiftDay(day: string, n: number): string {
  const d = dayDate(day);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whether a review is news: first seen recently, written recently, and after the first read. */
export function reviewIsNew(r: Pick<GoogleReviewDto, "first_seen_at" | "published_at">, linkedAt: string, nowMs: number): boolean {
  const seen = Date.parse(r.first_seen_at);
  const linked = Date.parse(linkedAt);
  if (Number.isNaN(seen)) return false;
  if (nowMs - seen > REVIEW_NEWS_MS) return false;
  if (!Number.isNaN(linked) && seen - linked < BOOTSTRAP_MS) return false;
  const written = r.published_at ? Date.parse(r.published_at) : NaN;
  if (Number.isNaN(written)) return false;
  return nowMs - written <= REVIEW_NEWS_MAX_AGE_MS;
}

export function toGoogleReviewVM(r: GoogleReviewDto, linkedAt: string, nowMs: number): GoogleReviewVM {
  return {
    id: r.id,
    stars: starsOf(r.rating),
    rating: r.rating,
    author: r.author?.trim() || "A customer",
    when: whenWords(r.published_at, nowMs),
    text: (r.body ?? "").replace(/\s+/g, " ").trim(),
    replied: !!r.reply_text,
    replyText: (r.reply_text ?? "").replace(/\s+/g, " ").trim(),
    mapsUri: r.maps_uri,
    isNew: reviewIsNew(r, linkedAt, nowMs),
    fromProfile: r.origin === "profile",
  };
}

const EMPTY_GAINED: GoogleVM["gained"] = { points: [], max: 0, total: null, sinceLabel: null };

/**
 * What a period gained, from the day snapshots: the count on the last read
 * day less the count on the newest day before the period (or the first day
 * inside it, which is then named), and the same for the period before.
 */
export function gainedOver(days: GoogleDayDto[], periodDays: number): { current: GoogleVM["gained"]; previous: number | null } {
  const sorted = [...days].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (sorted.length < 2) return { current: EMPTY_GAINED, previous: null };
  const last = sorted[sorted.length - 1];
  const since = shiftDay(last.day, -(periodDays - 1));
  const before = sorted.filter((d) => d.day < since);
  const inside = sorted.filter((d) => d.day >= since);
  const baseline = before.length ? before[before.length - 1] : inside[0];
  const total = last.review_count - baseline.review_count;
  const sinceLabel = before.length ? null : fmtDay(baseline.day);
  // Gains day by day: each read day less the read day before it, on the day it was read.
  const byDay = new Map(sorted.map((d) => [d.day, d.review_count]));
  const points: GoogleGainedPointVM[] = [];
  let prev: number | null = before.length ? baseline.review_count : null;
  for (let day = since; day <= last.day; day = shiftDay(day, 1)) {
    const count = byDay.get(day);
    const gained = count !== undefined && prev !== null ? Math.max(0, count - prev) : 0;
    if (count !== undefined) prev = count;
    points.push({ day, label: fmtDay(day), short: String(dayDate(day).getDate()), gained });
  }
  const max = Math.max(0, ...points.map((p) => p.gained));
  // The period before: the same arithmetic one period earlier, null without a baseline of its own.
  const prevSince = shiftDay(since, -periodDays);
  const prevBefore = sorted.filter((d) => d.day < prevSince);
  const prevInside = sorted.filter((d) => d.day >= prevSince && d.day < since);
  const previous = prevBefore.length && prevInside.length ? prevInside[prevInside.length - 1].review_count - prevBefore[prevBefore.length - 1].review_count : null;
  return { current: { points, max, total: before.length || inside.length >= 2 ? total : null, sinceLabel }, previous };
}

export function toGoogleVM(dto: GoogleDto, periodDays: number, nowMs = Date.now()): GoogleVM {
  const l = dto.listing;
  const c = dto.connection ?? null;
  const connection: GoogleVM["connection"] = c
    ? { email: c.google_email, location: c.location_title, words: connectionWords(c, nowMs), pending: !c.location_name, trouble: !!c.sync_error }
    : null;
  const canReply = !!c && !!c.location_name;
  const reply = { mode: dto.reply_mode, words: reviewReplyWords(dto.reply_mode, canReply) };
  const table = { columns: ["Reviewer", "Stars", "Written", "Words"], rows: [] as (string | number)[][] };
  if (!l) return { listing: null, connection, canReply, reply, tiles: [], gained: EMPTY_GAINED, latest: [], source: "", table, todayLine: null };

  const latest = [...dto.reviews]
    .sort((a, b) => (Date.parse(b.published_at ?? "") || 0) - (Date.parse(a.published_at ?? "") || 0))
    .map((r) => toGoogleReviewVM(r, l.linked_at, nowMs));
  table.rows = latest.map((r) => [r.author, r.rating ?? "—", r.when || "—", r.text || "—"]);
  const source = canReply ? "every review, from your Business Profile" : `the ${latest.length === 1 ? "one" : latest.length} Google shows first`;

  const days = [...dto.days].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const { current: gained, previous } = gainedOver(days, periodDays);
  const noun = `${periodDays} days`;
  const inPeriod = days.length ? days.filter((d) => d.day >= shiftDay(days[days.length - 1].day, -(periodDays - 1))) : [];
  const ratingSpark = inPeriod.map((d) => d.rating ?? 0);
  const countSpark = inPeriod.map((d) => d.review_count);
  const baselineRating = (() => {
    if (!days.length) return null;
    const since = shiftDay(days[days.length - 1].day, -(periodDays - 1));
    const before = days.filter((d) => d.day < since);
    return before.length ? before[before.length - 1].rating : null;
  })();
  const ratingDelta: ReportTileVM["delta"] = typeof l.rating === "number" && typeof baselineRating === "number"
    ? (Math.abs(l.rating - baselineRating) < 0.05
      ? { text: `same as ${noun} ago`, tone: "" }
      : { text: `${l.rating - baselineRating > 0 ? "+" : ""}${(l.rating - baselineRating).toFixed(1)} vs ${noun} ago`, tone: l.rating > baselineRating ? "pos" : "neg" })
    : null;
  const newest = latest[0] ?? null;
  const checked = checkedWords(l, nowMs);

  const tiles: ReportTileVM[] = [
    {
      id: "rating",
      label: "Rating on Google",
      value: typeof l.rating === "number" ? l.rating.toFixed(1) : "—",
      meta: `${reviewsWords(l.review_count)} · ${checked.toLowerCase()}`,
      delta: ratingDelta,
      spark: ratingSpark,
      compare: null,
    },
    {
      id: "reviews",
      label: "Reviews on Google",
      value: typeof l.review_count === "number" ? String(l.review_count) : "—",
      meta: "as Google counts them, with or without words",
      delta: null,
      spark: countSpark,
      compare: null,
    },
    {
      id: "gained",
      label: `Gained in ${noun}`,
      value: gained.total === null ? "—" : String(gained.total),
      meta: gained.total === null ? "needs a second day of reading" : gained.sinceLabel ? `since ${gained.sinceLabel}, the first day on record` : `new ratings, words or not`,
      delta: gained.total !== null && previous !== null ? deltaOf(gained.total, previous, true, noun) : null,
      spark: gained.points.map((p) => p.gained),
      compare: null,
    },
    {
      id: "newest",
      label: "Newest review",
      value: newest?.when || "—",
      meta: newest ? `${newest.stars} · ${newest.author}` : canReply ? "no review yet" : "none of the five Google shows has a date",
      delta: null,
      spark: [],
      compare: null,
    },
  ];

  const news = latest.find((r) => r.isNew) ?? null;
  const todayLine = news
    ? { text: `New on Google: ${news.stars} from ${news.author}${news.text ? ` — “${reviewSnippet(news.text)}”` : ""}`, to: "reports" }
    : null;

  return {
    listing: {
      name: l.name,
      address: l.address,
      ratingLabel: ratingWords(l.rating),
      count: l.review_count,
      checked,
      mapsUri: l.maps_uri,
      trouble: !!l.check_error,
    },
    connection,
    canReply,
    reply,
    tiles,
    gained,
    latest,
    source,
    table,
    todayLine,
  };
}
