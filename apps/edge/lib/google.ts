/**
 * Google on the edge: the Places key, the readiness, and the one routine
 * that reads a listing and writes what changed — shared by the link, the
 * "Check now" verb and the hourly sweep. The plan itself is pure
 * (packages/channels google-sync.ts); this file is the only place the key
 * is handled and the only writer of the three google_* tables.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";
import { emitEvent } from "./workspace/db.js";
import { getPlace, placesFetch, planListingCheck, searchPlaces, type PlaceCandidate, type PlaceDetails } from "./workspace/channels.js";
import { localDate } from "./workspace/contracts.js";
import { recordNotification } from "./notify.js";
import { logger } from "./log.js";

export type ListingRow = Database["public"]["Tables"]["google_listings"]["Row"];

export function placesKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY || null;
}

/** What this deployment can do: look listings up now; connect profiles once the OAuth door exists. */
export function googleReadiness(): { places: boolean; profile: boolean } {
  return { places: !!placesKey(), profile: false };
}

/** The listing as the dashboard may see it. Nothing here is secret; the shape is the contract's. */
export function listingForClient(r: ListingRow) {
  return {
    place_id: r.place_id,
    name: r.name,
    address: r.address,
    maps_uri: r.maps_uri,
    business_status: r.business_status,
    rating: r.rating,
    review_count: r.review_count,
    linked_at: r.linked_at,
    checked_at: r.checked_at,
    check_error: r.check_error,
  };
}

export async function findPlaces(key: string, query: string): Promise<PlaceCandidate[]> {
  return searchPlaces(placesFetch(), key, query);
}

export async function readPlace(key: string, placeId: string): Promise<PlaceDetails> {
  return getPlace(placesFetch(), key, placeId);
}

export type CheckResult = { ok: true; fresh: number; counted: number } | { ok: false; error: string };

/**
 * Read the listing, decide what changed, write it, tell the bell. A failed
 * read leaves its words on the row (check_error) and the last good numbers
 * in place; the next hour tries again. Never throws for Google's sake —
 * only for the database's.
 */
export async function checkListing(db: SupabaseClient<Database>, row: ListingRow, tz: string, now = new Date()): Promise<CheckResult> {
  const L = logger({ tenant: row.tenant_id, place: row.place_id });
  const key = placesKey();
  if (!key) return { ok: false, error: "no_places_key" };

  let details: PlaceDetails;
  try {
    details = await readPlace(key, row.place_id);
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    const { error: upErr } = await db.from("google_listings").update({ check_error: error }).eq("tenant_id", row.tenant_id);
    if (upErr) throw new Error(upErr.message);
    L.warn("google_check_failed", { error });
    return { ok: false, error };
  }

  const known = await db.from("google_reviews").select("review_id").eq("tenant_id", row.tenant_id);
  if (known.error) throw new Error(known.error.message);
  const plan = planListingCheck(
    { rating: row.rating, review_count: row.review_count, checked_at: row.checked_at },
    new Set((known.data ?? []).map((k) => k.review_id)),
    details,
    localDate(tz, now),
    now.getTime(),
  );

  const listing = await db.from("google_listings").update(plan.listing).eq("tenant_id", row.tenant_id);
  if (listing.error) throw new Error(listing.error.message);
  const day = await db.from("google_listing_days").upsert({ tenant_id: row.tenant_id, ...plan.day }, { onConflict: "tenant_id,day" });
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
    await recordNotification(row.tenant_id, { kind: "review", title: b.title, body: b.body, route: "reports", about: b.review_id ? { type: "review", id: b.review_id } : null });
  }
  if (plan.fresh.length || plan.counted) {
    await emitEvent(db, row.tenant_id, "google.reviews", "google", "listing", null, {
      fresh: plan.fresh.length, counted: plan.counted, rating: plan.listing.rating, review_count: plan.listing.review_count,
    }).catch(() => {});
  }
  L.info("google_checked", { rating: plan.listing.rating, review_count: plan.listing.review_count, shown: plan.reviews.length, fresh: plan.fresh.length, counted: plan.counted });
  return { ok: true, fresh: plan.fresh.length, counted: plan.counted };
}

/** How long a listing rests between reads: once a day, with room for the sweep's own drift. */
export const CHECK_EVERY_MS = 20 * 3600 * 1000;

/** The listings the sweep reads this tick: never read first, then the oldest. */
export async function listingsDue(db: SupabaseClient<Database>, now: Date, limit: number): Promise<ListingRow[]> {
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
