/** Google: listing. */

import type { SchemaSet } from "../shared/schema-sets";
import { agoWords, HOUR_MS, DAY_MS } from "../shared/time";
import { reviewsPhrase } from "../shared/words";
import { type ReviewReplyMode } from "./review-reply";
import type { Hours } from "../config/workspace-config/business-profile";
import { DAYS, dayProblems } from "../config/workspace-config/config-rules";
import { WEEKDAY_KEYS } from "../shared/zone/math";
import { normalizePhone } from "../shared/phone";

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
  const item = raw as Record<string, unknown>;
  if (!Object.keys(item).length) return null;
  const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const hours = Array.isArray(item.hours)
    ? item.hours.flatMap((p: unknown): GooglePeriod[] => {
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
    phone_e164: text(item.phone_e164),
    phone_display: text(item.phone_display),
    website: text(item.website),
    primary_type: text(item.primary_type),
    primary_type_label: text(item.primary_type_label),
    service_area_only: item.service_area_only === true,
    time_zone: text(item.time_zone),
  };
}

/**
 * The booking page the website's read found (business_reads, bookingPageRead), as Check offers it: only while the config
 * holds no booking link. A link the owner has is theirs, whatever the website says. The one test, for the setup read and
 * for the page, whose next save may hold a link the read has not seen yet.
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
    const created: Hours = list.length === 1 ? { open: list[0].open, close: list[0].close } : { intervals: list };
    if (dayProblems(created, day).length) unsure.add(day);
    else hours[day] = created;
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
  /**
   * The reply the receptionist wrote and holds (decision 0064, step 6): under Ask me for your OK, under Holds it until
   * `posts_at`, when the hourly sync posts it unless it was stopped. Null where none is held; absent from a server before.
   */
  draft_text?: string | null;
  posts_at?: string | null;
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
  /** Business Profiles can be connected here (an OAuth client); absent means no (decision 0073, R17). */
  profile?: boolean;
  listing: {
    name: string;
    rating: number | null;
    review_count: number | null;
    checked_at: string | null;
    check_error: string | null;
  } | null;
  connected?: boolean;
  /**
   * The Business Profile connection as Connections reads it (connectionWords): a sync that failed is said on Setup too, with
   * the way back, where Setup called a lapsed authorisation "connected" and nothing else said it (the wiring's second
   * audit, R11 S11-4). Absent reads as none.
   */
  connection?: Pick<GoogleConnectionDto, "google_email" | "location_name" | "last_synced_at" | "sync_error"> | null;
  /**
   * The days Google gives hours for in a way the record cannot hold (hoursFromGoogle's `unsure`: past midnight, around
   * the clock) and the record does not state yet: the first run's Check asks about them. Absent reads as none.
   */
  unsure?: Day[];
  /** Google's kind of place (the facts' primary_type, e.g. "moving_company"): what Check's service chips suggest by. */
  type?: string | null;
  /**
   * The number on the listing, E.164 (the facts' phone_e164): the first run's phone step offers to keep it, and buys
   * the receptionist's own number in its area code. Absent reads as none.
   */
  phone?: string | null;
}

/** Google shows this many reviews of a listing, the most relevant first. */
export const GOOGLE_SHOWN_REVIEWS = 5;

/**
 * What a notice of a new review begins with, on the bell and on Today's line (packages/channels google/sync.ts reviewBells says
 * it): the one way to tell a review that waits for an answer from the notice that the receptionist gave one ("Replied to …").
 */
export const NEW_REVIEW_NEWS = "New on Google:";

/** A review first seen this recently is news on Today. */
export const REVIEW_NEWS_MS = 36 * HOUR_MS;

/** …unless it was written long ago and merely resurfaced in the five Google shows. */
export const REVIEW_NEWS_MAX_AGE_MS = 14 * DAY_MS;

/** The first read after linking is history, not news. */
export const BOOTSTRAP_MS = HOUR_MS;

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
export function listingLine(input: { name: string; rating: number | null; review_count: number | null }): string {
  if (!input.review_count) return `${input.name} · no reviews on Google yet`;
  return `${input.name} · ${ratingWords(input.rating)} · ${reviewsWords(input.review_count)} on Google`;
}

/** When the listing was read, in words — the fact the owner wants when a number looks stale. */
export function checkedWords(
  googleListing: Pick<GoogleListingDto, "checked_at" | "check_error">,
  nowMs: number,
): string {
  if (googleListing.check_error && googleListing.checked_at)
    return `Google could not be read since ${agoWords(Date.parse(googleListing.checked_at), nowMs)} — read again once a day`;
  if (googleListing.check_error) return "Google could not be read yet — read again once a day";
  if (googleListing.checked_at) return `Checked ${agoWords(Date.parse(googleListing.checked_at), nowMs)}`;
  return "Not read yet";
}

/** The connection in words: whose account, and when it last synced or why it could not. */
export function connectionWords(
  googleConnection: Pick<GoogleConnectionDto, "google_email" | "location_name" | "last_synced_at" | "sync_error">,
  nowMs: number,
): string {
  const person = googleConnection.google_email ? `Connected as ${googleConnection.google_email}` : "Connected";
  if (!googleConnection.location_name) return `${person} · choose the location to finish`;
  if (googleConnection.sync_error && googleConnection.last_synced_at)
    return `${person} · could not sync since ${agoWords(Date.parse(googleConnection.last_synced_at), nowMs)} — read again once a day`;
  if (googleConnection.sync_error) return `${person} · could not sync yet — read again once a day`;
  if (googleConnection.last_synced_at)
    return `${person} · synced ${agoWords(Date.parse(googleConnection.last_synced_at), nowMs)}`;
  return `${person} · not synced yet`;
}
