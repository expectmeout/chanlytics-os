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
import type { SchemaSet } from "../shared/schema-sets";
import { clockDate, zoneDayKey } from "../shared/clock";
import { agoWords, isoMs, WEEK_MS, HOUR_MS, DAY_MS } from "../shared/time";
import { plural, reviewsPhrase } from "../shared/words";
import { reviewReplyWords, type ReviewReplyMode } from "./review-reply";
import { reviewRoute } from "../reports/lenses";
import { dayPointOf, fmtDay, rangeLabelOf, withinWords } from "../reports/reports";
import { beforeWords, compareWords, type ReportTileVM } from "../reports/report-tiles";
import type { Hours } from "../config/workspace-config/business-profile";
import { DAYS, dayProblems } from "../config/workspace-config/config-rules";
import { shiftKey } from "../calendar/day-keys";
import { WEEKDAY_KEYS } from "../calendar/zone-math";
import { normalizePhone } from "../shared/phone";
import { bookingPageOf } from "./booking-page";

/** A moment in Google's week: day 0 is Sunday. */
export type GooglePoint = {
  day: number;
  hour: number;
  minute: number;
};

/** One of Google's opening periods. No close means open around the clock. */
export type GooglePeriod = {
  open: GooglePoint;
  close: GooglePoint | null;
};

/**
 * What the public listing says about the business beyond its name and address, as the edge last read it
 * (google_listings.facts): Google's own answers, kept so the first run can offer them for the owner to check.
 * Nothing here reaches a customer until the owner has confirmed it into the Business record.
 */
export type GoogleListingFacts = {
  /** Google's opening periods, as read; null when the listing gives none. */
  hours: GooglePeriod[] | null;
  /** E.164, when Google's international number reads as one. */
  phone_e164: string | null;
  /** The number the way Google prints it for its country, e.g. "(305) 555-0100". */
  phone_display: string | null;
  website: string | null;
  /** Google's kind of place, e.g. "hair_salon", and its label, e.g. "Hair salon". */
  primary_type: string | null;
  primary_type_label: string | null;
  /** A business that goes to its customers and shows no address. */
  service_area_only: boolean;
  /** IANA zone, e.g. "America/New_York". */
  time_zone: string | null;
  /**
   * Where customers book, as the listing's website says it (booking-page.ts): the website itself when it is a page on
   * a booking platform, or the one its home page names. Never Google's own answer, so never in Places' parse: the edge
   * reads the website when a listing is linked, and adds it. Check offers it for the owner to take.
   */
  booking_page?: string | null;
};

/** A moment of Google's week as stored, or null for anything else. */
const pointOf = (v: unknown): GooglePoint | null => {
  const p = v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null;
  return p && typeof p.day === "number" && typeof p.hour === "number" && typeof p.minute === "number"
    ? { day: p.day, hour: p.hour, minute: p.minute }
    : null;
};

/**
 * google_listings.facts as stored, read back. The edge writes GoogleListingFacts from each details read; a listing
 * linked before that read existed holds `{}`, which says nothing, and reads as null. The column is jsonb and nothing
 * but the edge checks what goes in, so each field is read for what it is: a period that is not one is dropped (one
 * with no close is Google's "around the clock", and kept), and a field of the wrong kind is none.
 */
export function listingFactsOf(raw: unknown): GoogleListingFacts | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!Object.keys(r).length) return null;
  const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const hours = Array.isArray(r.hours)
    ? r.hours.flatMap((p: unknown): GooglePeriod[] => {
        const q = p !== null && typeof p === "object" ? (p as Record<string, unknown>) : null;
        const open = q ? pointOf(q.open) : null;
        if (!q || !open) return [];
        if (q.close == null) return [{ open, close: null }];
        const close = pointOf(q.close);
        return close ? [{ open, close }] : [];
      })
    : null;
  return {
    hours,
    phone_e164: text(r.phone_e164),
    phone_display: text(r.phone_display),
    website: text(r.website),
    primary_type: text(r.primary_type),
    primary_type_label: text(r.primary_type_label),
    service_area_only: r.service_area_only === true,
    time_zone: text(r.time_zone),
    booking_page: bookingPageOf(text(r.booking_page)),
  };
}

/**
 * What a later read of a listing keeps of the booking page the link found: the page, while the listing's website is
 * the one it was found on. Only the link reads the website (the edge's checkListing), so a new website has none until
 * the listing is linked again.
 */
export function bookingPageKept(prev: GoogleListingFacts | null, website: string | null): string | null {
  return prev && prev.website === website ? (prev.booking_page ?? null) : null;
}

/**
 * The booking page the website names, as Check offers it: only while the config holds no booking link. A link the
 * owner has is theirs, whatever the website says. The one test, for the setup read and for the page, whose next save
 * may hold a link the read has not seen yet.
 */
export function bookingPageOffered(found: string | null | undefined, holdsLink: boolean): string | null {
  return holdsLink ? null : (found ?? null);
}

type Day = (typeof DAYS)[number];
const hhmm = (h: number, m: number): string => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/**
 * Google's opening periods as the Business record's week (config.ts HoursSchema): a shift per period, a closed day
 * absent. What the record cannot hold is left out and NAMED in `unsure`, so the owner is asked about that day rather
 * than shown a week that quietly differs from the listing:
 *
 * - a period with no close, which is how Google says a place never closes -- every day is unsure;
 * - a shift that closes on another day, past midnight;
 * - a day the record's own rules refuse (config.ts dayProblems: a fifth shift, two that overlap, a close before
 *   its open), judged by the same rules the Business tab's save is.
 */
export function hoursFromGoogle(periods: readonly GooglePeriod[] | null | undefined): {
  hours: Partial<Record<Day, Hours>>;
  unsure: Day[];
} {
  // Around the clock, as Google sends it: one period, Sunday at midnight, no close. The week has no hours to give.
  if ((periods ?? []).some((p) => !p.close)) return { hours: {}, unsure: [...DAYS] };
  const shifts = new Map<Day, Array<{ open: string; close: string }>>();
  const unsure = new Set<Day>();
  for (const p of periods ?? []) {
    const day = WEEKDAY_KEYS[p.open.day];
    if (!day) continue;
    if (!p.close || p.close.day !== p.open.day) {
      unsure.add(day);
      continue;
    }
    const shift = { open: hhmm(p.open.hour, p.open.minute), close: hhmm(p.close.hour, p.close.minute) };
    shifts.set(day, [...(shifts.get(day) ?? []), shift]);
  }
  const hours: Partial<Record<Day, Hours>> = {};
  for (const day of DAYS) {
    const list = (shifts.get(day) ?? []).sort((a, b) => a.open.localeCompare(b.open));
    if (unsure.has(day) || !list.length) continue;
    const made: Hours = list.length === 1 ? { open: list[0].open, close: list[0].close } : { intervals: list };
    if (dayProblems(made, day).length) unsure.add(day);
    else hours[day] = made;
  }
  return { hours, unsure: DAYS.filter((d) => unsure.has(d)) };
}

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

/** What the database holds of Google for a workspace, as the dashboard reads it (the Google reader): everything `GET /api/v1/google` returns but what the deployment can do. */
export interface GoogleReadDto {
  listing: GoogleListingDto | null;
  connection: GoogleConnectionDto | null;
  /** The newest first; at most a screenful. */
  reviews: GoogleReviewDto[];
  /** Oldest first. */
  days: GoogleDayDto[];
  /** The Autonomy row for reviews: what the receptionist does under a new one. */
  reply_mode: ReviewReplyMode;
}

/** What `GET /api/v1/google` returns. */
export interface GoogleDto extends GoogleReadDto {
  /** Whether this deployment can look listings up (a Places key on the edge) and connect profiles (an OAuth client on the edge), and which audience Google's consent screen has. */
  ready: { places: boolean; profile: boolean; audience?: GoogleAudience | null };
}

/** What a search found: what the owner confirms with one tap. */
/**
 * The owner's words as Google's search should read them: a phone number, written any way, goes whole and with its
 * country (E.164), which Google needs to match a listing by its number; anything with a letter in it goes as typed.
 */
export function placesQueryOf(words: string): string {
  const w = words.replace(/\s+/g, " ").trim();
  return /^[\d\s().+-]+$/.test(w) ? (normalizePhone(w) ?? w) : w;
}

export interface GoogleCandidateDto {
  place_id: string;
  name: string;
  address: string | null;
  maps_uri: string | null;
  /** Google's name for the kind of place ("Moving company"), when it gives one: it tells two listings of one name apart. */
  category: string | null;
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
  listing: {
    name: string;
    rating: number | null;
    review_count: number | null;
    checked_at: string | null;
    check_error: string | null;
  } | null;
  connected?: boolean;
  /**
   * The days Google gives hours for in a way the record cannot hold (hoursFromGoogle's `unsure`: past midnight, around
   * the clock) and the record does not state yet: the first run's Check asks about them. Absent reads as none.
   */
  unsure?: Day[];
  /** Google's kind of place (the facts' primary_type, e.g. "moving_company"): what Check's service chips suggest by. */
  type?: string | null;
  /**
   * Where customers book, as the listing's website says it (the facts' booking_page): Check offers it while the record
   * holds no booking link (bookingPageOffered). Absent reads as none.
   */
  bookingPage?: string | null;
  /**
   * The number on the listing, E.164 (the facts' phone_e164): the first run's phone step offers to keep it, and buys
   * the receptionist's own number in its area code. Absent reads as none.
   */
  phone?: string | null;
}

/** Google shows this many reviews of a listing, the most relevant first. */
export const GOOGLE_SHOWN_REVIEWS = 5;

/**
 * What a notice of a new review begins with, on the bell and on Today's line (packages/channels google-sync.ts reviewBells says
 * it): the one way to tell a review that waits for an answer from the notice that the receptionist gave one ("Replied to …").
 */
export const NEW_REVIEW_NEWS = "New on Google:";

/** A review first seen this recently is news on Today. */
export const REVIEW_NEWS_MS = 36 * HOUR_MS;
/** …unless it was written long ago and merely resurfaced in the five Google shows. */
export const REVIEW_NEWS_MAX_AGE_MS = 14 * DAY_MS;
/** The first read after linking is history, not news. */
const BOOTSTRAP_MS = HOUR_MS;

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
  return typeof count === "number" ? reviewsPhrase(count) : "reviews not counted yet";
}

/** One line about the listing: "Northside Movers · 4.8 ★ · 213 reviews on Google". */
export function listingLine(l: { name: string; rating: number | null; review_count: number | null }): string {
  if (!l.review_count) return `${l.name} · no reviews on Google yet`;
  return `${l.name} · ${ratingWords(l.rating)} · ${reviewsWords(l.review_count)} on Google`;
}

/** When the listing was read, in words — the fact the owner wants when a number looks stale. */
export function checkedWords(l: Pick<GoogleListingDto, "checked_at" | "check_error">, nowMs: number): string {
  if (l.check_error && l.checked_at)
    return `Google could not be read since ${agoWords(Date.parse(l.checked_at), nowMs)} — read again once a day`;
  if (l.check_error) return "Google could not be read yet — read again once a day";
  if (l.checked_at) return `Checked ${agoWords(Date.parse(l.checked_at), nowMs)}`;
  return "Not read yet";
}

/** The connection in words: whose account, and when it last synced or why it could not. */
export function connectionWords(c: GoogleConnectionDto, nowMs: number): string {
  const who = c.google_email ? `Connected as ${c.google_email}` : "Connected";
  if (!c.location_name) return `${who} · choose the location to finish`;
  if (c.sync_error && c.last_synced_at)
    return `${who} · could not sync since ${agoWords(Date.parse(c.last_synced_at), nowMs)} — read again once a day`;
  if (c.sync_error) return `${who} · could not sync yet — read again once a day`;
  if (c.last_synced_at) return `${who} · synced ${agoWords(Date.parse(c.last_synced_at), nowMs)}`;
  return `${who} · not synced yet`;
}

/**
 * Whether the reviews on record are the owner's Business Profile's: a location is chosen and a sync has finished. A sync
 * stores every review it read before it stamps itself (the edge's syncProfile), so before the stamp the rows are still the
 * five Google shows, though the connection is there. The one test, for the source's words here and for the reviews report.
 */
export function reviewsFromProfile(
  c: Pick<GoogleConnectionDto, "location_name" | "last_synced_at"> | null | undefined,
): boolean {
  return !!c && !!c.location_name && !!c.last_synced_at;
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
   * Today's one line when a review is news and not yet answered, where it leads (that review, with its reply box), and which
   * review it draws: the bell's row about the same review is not said again under it (todayAwayGrouped), and an answer takes it
   * away.
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
  r: Pick<GoogleReviewDto, "first_seen_at" | "published_at">,
  linkedAt: string,
  nowMs: number,
): boolean {
  const seen = isoMs(r.first_seen_at);
  if (seen === null || nowMs - seen > REVIEW_NEWS_MS) return false;
  const linked = isoMs(linkedAt);
  if (linked !== null && seen - linked < BOOTSTRAP_MS) return false;
  const written = isoMs(r.published_at);
  return written !== null && nowMs - written <= REVIEW_NEWS_MAX_AGE_MS;
}

/** A review as a card draws it; "when" is in the workspace's zone (`tz`), never the runtime's. */
export function toGoogleReviewVM(r: GoogleReviewDto, linkedAt: string, tz: string, nowMs: number): GoogleReviewVM {
  return {
    id: r.id,
    reviewId: r.review_id,
    stars: starsOf(r.rating),
    rating: r.rating,
    author: r.author?.trim() || "A customer",
    when: whenWords(r.published_at, tz, nowMs),
    text: (r.body ?? "").replace(/\s+/g, " ").trim(),
    replied: !!r.reply_text,
    replyText: (r.reply_text ?? "").replace(/\s+/g, " ").trim(),
    mapsUri: r.maps_uri,
    isNew: reviewIsNew(r, linkedAt, nowMs),
    fromProfile: r.origin === "profile",
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
function gainedWords(g: GoogleGained, days: number, today: string, until: string | null): GoogleVM["gained"]["words"] {
  const { total, sinceLabel } = g;
  if (total === null) return noGainYet();
  const last = g.points.at(-1)?.day ?? today;
  // Behind the day: a read was missed, or the period itself ended before today (`until`, days a member picked on
  // Reports). Either way the count is of days up to `last`, and says so.
  const behind = until !== null || last < shiftKey(today, -1);
  const scope = gainedScope(g, days, last, behind);
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
  const l = dto.listing;
  const c = dto.connection ?? null;
  const connection: GoogleVM["connection"] = c
    ? {
        email: c.google_email,
        location: c.location_title,
        words: connectionWords(c, nowMs),
        pending: !c.location_name,
        trouble: !!c.sync_error,
      }
    : null;
  const canReply = !!c && !!c.location_name;
  const reply = { mode: dto.reply_mode, words: reviewReplyWords(dto.reply_mode, canReply) };
  if (!l)
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
    .map((r) => toGoogleReviewVM(r, l.linked_at, tz, nowMs));
  const source = reviewsFromProfile(c)
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
    typeof l.rating === "number" && typeof baselineRating === "number"
      ? ratingCompareWords(l.rating, baselineRating, rangeLabel)
      : null;
  const newest = latest[0] ?? null;
  const checked = checkedWords(l, nowMs);

  const tiles: ReportTileVM[] = [
    {
      id: "rating",
      metric: "rating",
      label: "Rating on Google",
      value: typeof l.rating === "number" ? l.rating.toFixed(1) : "—",
      meta: `${reviewsWords(l.review_count)} · ${checked.toLowerCase()}`,
      delta: null,
      spark: ratingSpark,
      compare: ratingCompare,
    },
    {
      id: "reviews",
      metric: "reviews",
      label: "Reviews on Google",
      value: typeof l.review_count === "number" ? String(l.review_count) : "—",
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
    table: googleReviewsTable(latest),
    todayLine,
  };
}
