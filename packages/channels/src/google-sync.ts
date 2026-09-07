/**
 * The check: what a fresh read of the listing changes, decided once, purely.
 *
 * Google shows the five reviews it finds most relevant, never a feed, and it
 * counts every rating, with or without words. So "new" is decided two ways
 * and both are said honestly: a review is new when it was not on record and
 * was written since the previous check (a relevance shift can surface an
 * old one, and that is not news); the count is the truth for how many
 * ratings arrived, words or not. The first read after linking is history
 * and raises nothing. The edge runs this plan against the tables and the
 * bell; the tests run it against fixtures.
 */
import { ratingWords, reviewSnippet, starsOf } from "@chanlytics/contracts";
import type { PlaceDetails, PlaceReview } from "./google-places";

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
  };
  day: { day: string; rating: number | null; review_count: number };
  /** Every review Google showed, to upsert; the row keeps its first_seen_at. */
  reviews: Array<PlaceReview & { last_seen_at: string }>;
  /** Not on record and written since the previous check: news. */
  fresh: PlaceReview[];
  /** Ratings gained by Google's count since the previous read; 0 on the first. */
  counted: number;
  bells: ReviewBell[];
}

/** More new reviews than this in one check become one row, not a pile. */
export const REVIEW_BELL_MAX = 3;
/** A review dated up to this long before the previous check still counts as written since it: Google's clock and ours differ, and a review can be dated by its visit. */
export const FRESH_SLACK_MS = 2 * 86_400_000;

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

function writtenSince(r: PlaceReview, sinceMs: number): boolean {
  const at = r.published_at ? Date.parse(r.published_at) : NaN;
  return !Number.isNaN(at) && at >= sinceMs - FRESH_SLACK_MS;
}

function overall(rating: number | null, count: number | null): string {
  return `${ratingWords(rating)} overall${typeof count === "number" ? ` · ${plural(count, "review")}` : ""}`;
}

export function planListingCheck(
  before: ListingBefore,
  knownIds: ReadonlySet<string>,
  fresh: PlaceDetails,
  day: string,
  nowMs: number,
): ListingCheckPlan {
  const now = new Date(nowMs).toISOString();
  const first = !before.checked_at;
  const sinceMs = before.checked_at ? Date.parse(before.checked_at) : NaN;
  const unseen = fresh.reviews.filter((r) => !knownIds.has(r.review_id));
  const news = first || Number.isNaN(sinceMs) ? [] : unseen.filter((r) => writtenSince(r, sinceMs));
  const counted = first || typeof before.review_count !== "number" || typeof fresh.review_count !== "number"
    ? 0
    : Math.max(0, fresh.review_count - before.review_count);

  const bells: ReviewBell[] = [];
  if (news.length > 0 && news.length <= REVIEW_BELL_MAX) {
    for (const r of news) {
      bells.push({
        title: `New on Google: ${starsOf(r.rating)} from ${r.author?.trim() || "a customer"}`,
        body: `${r.text?.trim() ? `“${reviewSnippet(r.text, 280)}”` : "A rating without words."}\n${overall(fresh.rating, fresh.review_count)}.`,
        review_id: r.review_id,
      });
    }
  } else if (news.length > REVIEW_BELL_MAX) {
    const who = news.map((r) => r.author?.trim() || "a customer").slice(0, 5).join(", ");
    bells.push({
      title: `${news.length} new reviews on Google`,
      body: `From ${who}${news.length > 5 ? " and others" : ""}. ${overall(fresh.rating, fresh.review_count)}. The words are on Reports.`,
      review_id: null,
    });
  } else if (counted > 0) {
    bells.push({
      title: `${plural(counted, "new rating")} on Google`,
      body: `${overall(fresh.rating, fresh.review_count)}. Google shows the words of its five most relevant reviews; a rating outside them counts without its words.`,
      review_id: null,
    });
  }

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
    },
    day: { day, rating: fresh.rating, review_count: fresh.review_count ?? 0 },
    reviews: fresh.reviews.map((r) => ({ ...r, last_seen_at: now })),
    fresh: news,
    counted,
    bells,
  };
}
