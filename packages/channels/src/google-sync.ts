/**
 * The check: what a fresh read of the listing changes, decided once, purely.
 *
 * Two sources, one rule for news. The public listing shows the five reviews
 * Google finds most relevant, never a feed, and counts every rating, with
 * or without words: a review is new when it was not on record and was
 * written since the previous check (a relevance shift can surface an old
 * one, and that is not news), and the count is the truth for how many
 * ratings arrived. The owner's Business Profile carries every review, so
 * there the rule is simply: not on record, written since the last sync.
 * The first read after linking or connecting is history and raises
 * nothing. The edge runs these plans against the tables and the bell; the
 * tests run them against fixtures.
 */
import { ratingWords, reviewSnippet, starsOf, type GoogleListingFacts } from "@chanlytics/contracts";
import type { PlaceDetails, PlaceReview } from "./google-places";
import type { GbpReview, GbpReviewsPage } from "./google-profile";

export interface ListingBefore {
  rating: number | null;
  review_count: number | null;
  /** The previous successful read; null before the first. */
  checked_at: string | null;
}

export interface ReviewBell {
  title: string;
  body: string;
  /** The review it is about, when it is about one. */
  review_id: string | null;
}

/** More new reviews than this in one check become one row, not a pile. */
export const REVIEW_BELL_MAX = 3;
/** A review dated up to this long before the previous check still counts as written since it: Google's clock and ours differ, and a review can be dated by its visit. */
export const FRESH_SLACK_MS = 2 * 86_400_000;

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

function overall(rating: number | null, count: number | null): string {
  return `${ratingWords(rating)} overall${typeof count === "number" ? ` · ${plural(count, "review")}` : ""}`;
}

interface NewsItem {
  review_id: string;
  rating: number | null;
  author: string | null;
  text: string | null;
}

/**
 * The bell rows for what is new: one per review up to three, else one
 * summary naming who wrote; with nothing new by name but ratings gained by
 * the count, one row that says why the words are missing.
 */
export function reviewBells(
  news: NewsItem[],
  counted: number,
  listing: { rating: number | null; review_count: number | null },
): ReviewBell[] {
  if (news.length > 0 && news.length <= REVIEW_BELL_MAX) {
    return news.map((r) => ({
      title: `New on Google: ${starsOf(r.rating)} from ${r.author?.trim() || "a customer"}`,
      body: `${r.text?.trim() ? `“${reviewSnippet(r.text, 280)}”` : "A rating without words."}\n${overall(listing.rating, listing.review_count)}.`,
      review_id: r.review_id,
    }));
  }
  if (news.length > REVIEW_BELL_MAX) {
    const who = news
      .map((r) => r.author?.trim() || "a customer")
      .slice(0, 5)
      .join(", ");
    return [
      {
        title: `${news.length} new reviews on Google`,
        body: `From ${who}${news.length > 5 ? " and others" : ""}. ${overall(listing.rating, listing.review_count)}. The words are on Reports.`,
        review_id: null,
      },
    ];
  }
  if (counted > 0) {
    return [
      {
        title: `${plural(counted, "new rating")} on Google`,
        body: `${overall(listing.rating, listing.review_count)}. Google shows the words of its five most relevant reviews; a rating outside them counts without its words.`,
        review_id: null,
      },
    ];
  }
  return [];
}

function writtenSince(at: string | null, sinceMs: number): boolean {
  const t = at ? Date.parse(at) : NaN;
  return !Number.isNaN(t) && t >= sinceMs - FRESH_SLACK_MS;
}

/* ------------------------------------------------------ the public listing */

export interface ListingCheckPlan {
  listing: {
    name: string;
    address: string | null;
    maps_uri: string | null;
    business_status: string | null;
    rating: number | null;
    review_count: number | null;
    checked_at: string;
    check_error: null;
    /** What the listing says now beyond its name and address (google_listings.facts), for the first run to offer. */
    facts: GoogleListingFacts;
  };
  day: { day: string; rating: number | null; review_count: number };
  /** Every review Google showed, to upsert; the row keeps its first_seen_at. Empty when the profile carries the reviews. */
  reviews: Array<PlaceReview & { last_seen_at: string }>;
  /** Not on record and written since the previous check: news. */
  fresh: PlaceReview[];
  /** Ratings gained by Google's count since the previous read; 0 on the first. */
  counted: number;
  bells: ReviewBell[];
}

export function planListingCheck(
  before: ListingBefore,
  knownIds: ReadonlySet<string>,
  fresh: PlaceDetails,
  day: string,
  nowMs: number,
  opts: { reviews?: boolean } = {},
): ListingCheckPlan {
  const now = new Date(nowMs).toISOString();
  const first = !before.checked_at;
  const sinceMs = before.checked_at ? Date.parse(before.checked_at) : NaN;
  // With the profile connected the reviews come from there, every one of them; the listing keeps the rating and the count.
  const carriesReviews = opts.reviews !== false;
  const unseen = carriesReviews ? fresh.reviews.filter((r) => !knownIds.has(r.review_id)) : [];
  const news = first || Number.isNaN(sinceMs) ? [] : unseen.filter((r) => writtenSince(r.published_at, sinceMs));
  const counted =
    first || typeof before.review_count !== "number" || typeof fresh.review_count !== "number"
      ? 0
      : Math.max(0, fresh.review_count - before.review_count);
  return {
    listing: {
      name: fresh.name,
      address: fresh.address,
      maps_uri: fresh.maps_uri,
      business_status: fresh.business_status,
      rating: fresh.rating,
      review_count: fresh.review_count,
      checked_at: now,
      check_error: null,
      facts: fresh.facts,
    },
    day: { day, rating: fresh.rating, review_count: fresh.review_count ?? 0 },
    reviews: carriesReviews ? fresh.reviews.map((r) => ({ ...r, last_seen_at: now })) : [],
    fresh: news,
    counted,
    bells: carriesReviews ? reviewBells(news, counted, fresh) : [],
  };
}

/* ------------------------------------------------------- the owner's profile */

export interface ProfileBefore {
  /** The previous successful sync; null before the first. */
  last_synced_at: string | null;
}

export interface KnownReview {
  updated_at: string | null;
  reply_text: string | null;
}

export interface ProfileSyncPlan {
  /** The rating and the count as the profile reports them, when it does. */
  listing: { rating: number | null; review_count: number | null; checked_at: string; check_error: null } | null;
  day: { day: string; rating: number | null; review_count: number } | null;
  /** Every review read, to upsert with origin 'profile'; the row keeps its first_seen_at. */
  reviews: Array<GbpReview & { last_seen_at: string }>;
  /** Not on record and written since the last sync: news. */
  fresh: GbpReview[];
  /** Reviews whose reply appeared or changed since the last sync — answered on Google, not here. */
  replied: string[];
  bells: ReviewBell[];
  synced_at: string;
}

export function planProfileSync(
  before: ProfileBefore,
  known: ReadonlyMap<string, KnownReview>,
  page: GbpReviewsPage,
  day: string,
  nowMs: number,
): ProfileSyncPlan {
  const now = new Date(nowMs).toISOString();
  const first = !before.last_synced_at;
  const sinceMs = before.last_synced_at ? Date.parse(before.last_synced_at) : NaN;
  const unseen = page.reviews.filter((r) => !known.has(r.review_id));
  const news = first || Number.isNaN(sinceMs) ? [] : unseen.filter((r) => writtenSince(r.created_at, sinceMs));
  const replied = page.reviews
    .filter((r) => {
      const k = known.get(r.review_id);
      return !!k && !!r.reply_text && r.reply_text !== k.reply_text;
    })
    .map((r) => r.review_id);
  const rating = page.average_rating;
  const count = page.total_count;
  const listing: ProfileSyncPlan["listing"] =
    typeof count === "number" || typeof rating === "number"
      ? {
          rating: typeof rating === "number" ? Math.round(rating * 10) / 10 : null,
          review_count: count,
          checked_at: now,
          check_error: null,
        }
      : null;
  return {
    listing,
    day: typeof count === "number" ? { day, rating: listing?.rating ?? null, review_count: count } : null,
    reviews: page.reviews.map((r) => ({ ...r, last_seen_at: now })),
    fresh: news,
    replied,
    bells: reviewBells(news, 0, { rating: listing?.rating ?? null, review_count: count }),
    synced_at: now,
  };
}
