/**
 * The public listing, read on the hour: `checkListing` reads it from Places,
 * writes what changed and tells the bell, and `listingsDue` and
 * `connectionsDue` are what the sweep (api/cron/google.ts) reads each tick.
 * A connected profile's own read is profile-sync.ts.
 */
import { emitEvent } from "../packages/db.js";
import { planListingCheck, type PlaceDetails } from "../packages/channels.js";
import { bookingPageKept, listingFactsOf, localDate, HOUR_MS } from "../packages/contracts.js";
import { siteBookingPage } from "./booking-page.js";
import { recordNotification } from "../ops/notify.js";
import { logger } from "../log.js";
import { readAllRows } from "../paged.js";
import { placesKey } from "./google-config.js";
import { readPlace } from "./places.js";
import { connectionOf, type ConnectionRow, type Db, type ListingRow } from "./google-rows.js";

export type CheckResult =
  { ok: true; fresh: number; counted: number; answered?: number } | { ok: false; error: string };

/**
 * Whether a read of a listing reads its website for the booking page it names (lib/google/booking-page.ts). Only the
 * link does, inside its own request and at the owner's press. Every other read keeps what the link found, while the
 * website is the one it was found on: the sweep reads its listings one after another inside its function's time
 * (vercel.json), with no room for a site each.
 */
type SiteRead = "read" | "keep";

/**
 * Read the public listing, decide what changed, write it, tell the bell. A
 * failed read leaves its words on the row (check_error) and the last good
 * numbers in place; the next hour tries again. With the profile connected
 * the reviews come from there, every one of them, and this keeps only the
 * rating, the count and the day. Never throws for Google's sake — only for
 * the database's.
 */
export async function checkListing(
  db: Db,
  row: ListingRow,
  tz: string,
  site: SiteRead,
  now = new Date(),
): Promise<CheckResult> {
  const L = logger({ tenant_id: row.tenant_id, place: row.place_id });
  const key = placesKey();
  if (!key) return { ok: false, error: "no_places_key" };

  let details: PlaceDetails;
  try {
    details = await readPlace(key, row.place_id);
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    // The stamp is NOT moved. It was, briefly, to stop a permanently failing
    // listing holding the head of every hourly page — but `checked_at` is the
    // last SUCCESSFUL read (00069's own comment), and three things read it as
    // that: it is the news cutoff for which reviews are new (google-sync.ts),
    // it is the `first` flag that clears the Places copies and withholds the
    // first sync's bells, and it is the twenty-hour due window. Moving it on a
    // failure announced days-old reviews as new, replied to them in public,
    // and pushed the retry from the next hour to the next day. Fair rotation
    // past a permanently failing row needs its own `last_attempt_at` column,
    // which is a migration, not a stamp borrowed from a column that means
    // something else.
    const { error: upErr } = await db
      .from("google_listings")
      .update({ check_error: error })
      .eq("tenant_id", row.tenant_id);
    if (upErr) throw new Error(upErr.message, { cause: e });
    L.warn("google_check_failed", { error });
    return { ok: false, error };
  }

  const booking_page =
    site === "read"
      ? await siteBookingPage(fetch, details.facts.website)
      : bookingPageKept(listingFactsOf(row.facts), details.facts.website);
  details = { ...details, facts: { ...details.facts, booking_page } };

  const conn = await connectionOf(db, row.tenant_id);
  const carriesReviews = !(conn && conn.location_name);
  // Every id, not the first thousand. Capped, the set of reviews we have
  // already seen was missing whatever fell past the page -- so a listing with
  // more than a thousand reviews announced old reviews as new, every hour, for
  // ever.
  const known = await readAllRows<{ review_id: string }>("google_reviews", (from, to) =>
    db.from("google_reviews").select("review_id").eq("tenant_id", row.tenant_id).order("review_id").range(from, to),
  );
  const plan = planListingCheck(
    { rating: row.rating, review_count: row.review_count, checked_at: row.checked_at },
    new Set(known.map((k) => k.review_id)),
    details,
    localDate(tz, now),
    now.getTime(),
    { reviews: carriesReviews },
  );

  const listing = await db.from("google_listings").update(plan.listing).eq("tenant_id", row.tenant_id);
  if (listing.error) throw new Error(listing.error.message);
  const day = await db
    .from("google_listing_days")
    .upsert({ tenant_id: row.tenant_id, ...plan.day }, { onConflict: "tenant_id,day" });
  if (day.error) throw new Error(day.error.message);
  if (plan.reviews.length) {
    // first_seen_at is not in the payload: an existing row keeps its own.
    const reviews = await db.from("google_reviews").upsert(
      plan.reviews.map((r) => ({
        tenant_id: row.tenant_id,
        review_id: r.review_id,
        origin: "places",
        rating: r.rating,
        author: r.author,
        author_uri: r.author_uri,
        author_photo_uri: r.author_photo_uri,
        body: r.text,
        language_code: r.language_code,
        published_at: r.published_at,
        maps_uri: r.maps_uri,
        last_seen_at: r.last_seen_at,
      })),
      { onConflict: "tenant_id,review_id" },
    );
    if (reviews.error) throw new Error(reviews.error.message);
  }
  for (const b of plan.bells) {
    await recordNotification(row.tenant_id, {
      kind: "review",
      title: b.title,
      body: b.body,
      route: "reports",
      about: b.review_id ? { type: "review", id: b.review_id } : null,
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
  L.info("google_checked", {
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
export async function listingsDue(db: Db, now: Date, limit: number): Promise<ListingRow[]> {
  const before = new Date(now.getTime() - CHECK_EVERY_MS).toISOString();
  const { data, error } = await db
    .from("google_listings")
    .select("*")
    .or(`checked_at.is.null,checked_at.lt.${before}`)
    .order("checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** The connected profiles the sweep syncs this tick: complete ones, never synced first, then the oldest. */
export async function connectionsDue(db: Db, now: Date, limit: number): Promise<ConnectionRow[]> {
  const before = new Date(now.getTime() - CHECK_EVERY_MS).toISOString();
  const { data, error } = await db
    .from("google_connections")
    .select("*")
    .not("location_name", "is", null)
    .or(`last_synced_at.is.null,last_synced_at.lt.${before}`)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
