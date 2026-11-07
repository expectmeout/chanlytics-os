/**
 * The public listing, read on the hour: `checkListing` reads it from Places,
 * writes what changed and tells the bell, and `listListingsDue` and
 * `listConnectionsDue` are what the sweep (api/cron/google.ts) reads each tick.
 * A connected profile's own read is profile-sync.ts.
 */
import { emitEvent } from "@chanlytics/db/events";
import { patchListing } from "@chanlytics/db/imports";
import { planListingCheck, type PlaceDetails } from "@chanlytics/channels/google";
import { localDate, HOUR_MS } from "@chanlytics/contracts";
import { scheduleWebsiteRead } from "../imports/website-read.js";
import { keepAndPush } from "../shared/alerts/notify.js";
import { logger } from "../shared/log.js";
import { readAllRows } from "../shared/paged.js";
import { placesKey } from "../shared/google/config.js";
import { readPlace } from "../shared/google/places.js";
import {
  aboutReview,
  connectionOf,
  reviewRowIds,
  type ConnectionRow,
  type Db,
  type ListingRow,
} from "../shared/google/rows.js";
import {
  listGoogleConnectionsDue,
  listGoogleListingsDue,
  pageGoogleReviewIds,
  saveGoogleListingDay,
  saveGoogleReviews,
} from "@chanlytics/db/google";

export type CheckResult =
  { ok: true; fresh: number; counted: number; answered?: number } | { ok: false; error: string };

/**
 * Read the public listing, decide what changed, write it, tell the bell. A
 * failed read leaves its words on the row (check_error) and the last good
 * numbers in place; the next hour tries again. With the profile connected
 * the reviews come from there, every one of them, and this keeps only the
 * rating, the count and the day. Never throws for Google's sake — only for
 * the database's.
 *
 * `askWebsite`: a listing just linked has its website read too (imports/website-read.ts: its services, prices and rules
 * for Check, and where it says its customers book), by a job: no read of a listing waits for a site, since a page drawn
 * as a browser draws it takes longer than a request can hold. Only the link asks, at the owner's press.
 */
export async function checkListing(
  db: Db,
  row: ListingRow,
  tz: string,
  { askWebsite = false, now = new Date() }: { askWebsite?: boolean; now?: Date } = {},
): Promise<CheckResult> {
  const log = logger({ tenant_id: row.tenant_id, place: row.place_id });
  const key = placesKey();
  if (!key) return { ok: false, error: "no_places_key" };

  let details: PlaceDetails;
  try {
    details = await readPlace(key, row.place_id);
  } catch (otherError) {
    const error = (otherError instanceof Error ? otherError.message : String(otherError)).slice(0, 300);
    // The stamp is NOT moved. It was, briefly, to stop a permanently failing
    // listing holding the head of every hourly page — but `checked_at` is the
    // last SUCCESSFUL read (00069's own comment), and three things read it as
    // that: it is the news cutoff for which reviews are new (google/sync.ts),
    // it is the `first` flag that clears the Places copies and withholds the
    // first sync's bells, and it is the twenty-hour due window. Moving it on a
    // failure announced days-old reviews as new, replied to them in public,
    // and pushed the retry from the next hour to the next day. Fair rotation
    // past a permanently failing row needs its own `last_attempt_at` column,
    // which is a migration, not a stamp borrowed from a column that means
    // something else.
    await patchListing(db, row.tenant_id, { check_error: error });
    log.warn("google_check_failed", { error });
    return { ok: false, error };
  }

  if (askWebsite) await scheduleWebsiteRead(db, row.tenant_id, details.facts.website);

  const conn = await connectionOf(db, row.tenant_id);
  const carriesReviews = !(conn && conn.location_name);
  // Every id, not the first thousand. Capped, the set of reviews we have
  // already seen was missing whatever fell past the page -- so a listing with
  // more than a thousand reviews announced old reviews as new, every hour, for
  // ever.
  const known = await readAllRows<{ review_id: string }>("google_reviews", (from, to) =>
    pageGoogleReviewIds(db, row.tenant_id, from, to),
  );
  const plan = planListingCheck(
    { rating: row.rating, review_count: row.review_count, checked_at: row.checked_at },
    new Set(known.map((k) => k.review_id)),
    details,
    localDate(tz, now),
    now.getTime(),
    { reviews: carriesReviews },
  );

  await patchListing(db, row.tenant_id, plan.listing);
  const day = await saveGoogleListingDay(db, row.tenant_id, plan.day);
  if (day.error) throw new Error(day.error.message);
  if (plan.reviews.length) {
    // first_seen_at is not in the payload: an existing row keeps its own.
    const reviews = await saveGoogleReviews(
      db,
      row.tenant_id,
      plan.reviews.map((review) => ({
        tenant_id: row.tenant_id,
        review_id: review.review_id,
        origin: "places",
        rating: review.rating,
        author: review.author,
        author_uri: review.author_uri,
        author_photo_uri: review.author_photo_uri,
        body: review.text,
        language_code: review.language_code,
        published_at: review.published_at,
        maps_uri: review.maps_uri,
        last_seen_at: review.last_seen_at,
      })),
    );
    if (reviews.error) throw new Error(reviews.error.message);
  }
  // A new review reaches the phones too (decision 0040), about the review's row and opening it (contracts reviewRoute).
  const rowIds = await reviewRowIds(
    db,
    row.tenant_id,
    plan.bells.flatMap((b) => (b.review_id ? [b.review_id] : [])),
  );
  for (const b of plan.bells) {
    await keepAndPush(row.tenant_id, {
      kind: "review",
      title: b.title,
      body: b.body,
      ...aboutReview(rowIds, b.review_id),
    });
  }
  if (plan.fresh.length || plan.counted) {
    await emitEvent(db, row.tenant_id, "google.reviews", "listing", null, {
      source: "places",
      fresh: plan.fresh.length,
      counted: plan.counted,
      rating: plan.listing.rating,
      review_count: plan.listing.review_count,
    }).catch(() => {});
  }
  log.info("google_checked", {
    rating: plan.listing.rating,
    review_count: plan.listing.review_count,
    shown: plan.reviews.length,
    fresh: plan.fresh.length,
    counted: plan.counted,
    profile: !carriesReviews,
  });
  return { ok: true, fresh: plan.fresh.length, counted: plan.counted };
}

/** How long a listing or a profile rests between reads: once a day, with room for the sweep's own drift. */
const CHECK_EVERY_MS = 20 * HOUR_MS;

/** The listings the sweep reads this tick: never read first, then the oldest. */
export async function listListingsDue(db: Db, now: Date, limit: number): Promise<ListingRow[]> {
  const before = new Date(now.getTime() - CHECK_EVERY_MS).toISOString();
  // The sweep's page: every workspace's listing that is due, by design.
  const { data, error } = await listGoogleListingsDue(db, before, limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** The connected profiles the sweep syncs this tick: complete ones, never synced first, then the oldest. */
export async function listConnectionsDue(db: Db, now: Date, limit: number): Promise<ConnectionRow[]> {
  const before = new Date(now.getTime() - CHECK_EVERY_MS).toISOString();
  // The sweep's page: every workspace's profile that is due, by design.
  const { data, error } = await listGoogleConnectionsDue(db, before, limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
