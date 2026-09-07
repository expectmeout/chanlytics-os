/**
 * Google for the dashboard: the rows a member may read (RLS), and the
 * edge's verbs — status, search, link, unlink, refresh — behind the
 * diagnostic key the dashboard already holds. The Places key lives on the
 * edge; nothing here knows it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";
import type { GoogleDayDto, GoogleListingDto, GoogleReviewDto } from "@chanlytics/contracts";
import type { EdgeAnswer } from "./lines";

const EDGE_BASE = "https://chanlytics-messaging.vercel.app";

export const LISTING_COLUMNS = "place_id, name, address, maps_uri, business_status, rating, review_count, linked_at, checked_at, check_error";
export const REVIEW_COLUMNS = "id, review_id, origin, rating, author, author_uri, author_photo_uri, body, language_code, published_at, reply_text, replied_at, maps_uri, first_seen_at";

/** The reviews a screen shows; the rest are on Google. */
export const REVIEWS_SHOWN = 20;
/** Days of snapshots the longest report period reads, with one to spare. */
export const DAYS_KEPT = 92;

export async function listingFor(db: SupabaseClient<Database>, tenantId: string): Promise<GoogleListingDto | null> {
  const { data, error } = await db.from("google_listings").select(LISTING_COLUMNS).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data as GoogleListingDto) : null;
}

export async function googleFor(db: SupabaseClient<Database>, tenantId: string): Promise<{ listing: GoogleListingDto | null; reviews: GoogleReviewDto[]; days: GoogleDayDto[] }> {
  const listing = await listingFor(db, tenantId);
  if (!listing) return { listing: null, reviews: [], days: [] };
  const sinceDay = new Date(Date.now() - DAYS_KEPT * 86_400_000).toISOString().slice(0, 10);
  const [reviews, days] = await Promise.all([
    db.from("google_reviews").select(REVIEW_COLUMNS).eq("tenant_id", tenantId).order("published_at", { ascending: false, nullsFirst: false }).limit(REVIEWS_SHOWN),
    db.from("google_listing_days").select("day, rating, review_count").eq("tenant_id", tenantId).gte("day", sinceDay).order("day", { ascending: true }),
  ]);
  if (reviews.error) throw new Error(reviews.error.message);
  if (days.error) throw new Error(days.error.message);
  return {
    listing,
    reviews: (reviews.data ?? []).map((r) => ({ ...r, origin: r.origin === "profile" ? "profile" : "places" })),
    days: days.data ?? [],
  };
}

/** One call to the edge's google endpoint. Never throws: a failure is a status the caller reads. */
export async function edgeGoogle(body: Record<string, unknown>, timeoutMs = 20_000): Promise<EdgeAnswer> {
  if (!process.env.DIAG_KEY) return { status: 503, body: { ok: false, error: "no_diag_key" } };
  try {
    const r = await fetch(`${EDGE_BASE}/api/admin/google`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-diag-key": process.env.DIAG_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const parsed = (await r.json().catch(() => null)) as unknown;
    return { status: r.status, body: parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null };
  } catch (e) {
    return { status: 503, body: { ok: false, error: e instanceof Error ? e.message : String(e) } };
  }
}

export interface GoogleReadiness {
  places: boolean;
  profile: boolean;
}

const NOT_READY: GoogleReadiness = { places: false, profile: false };
let readyCache: { at: number; value: GoogleReadiness } | null = null;
const READY_TTL_MS = 5 * 60_000;

/**
 * May this deployment look listings up. Cached for five minutes per lambda:
 * the answer changes when an operator sets a key, not between two page
 * loads. Unreachable edge → not ready, so nothing draws a verb that cannot work.
 */
export async function googleReadiness(now = Date.now()): Promise<GoogleReadiness> {
  if (readyCache && now - readyCache.at < READY_TTL_MS) return readyCache.value;
  const a = await edgeGoogle({ op: "status" }, 4_000);
  const b = a.body ?? {};
  const ready = b.ready && typeof b.ready === "object" ? (b.ready as Partial<GoogleReadiness>) : null;
  const value: GoogleReadiness = a.status === 200 && b.ok === true && ready
    ? { places: ready.places === true, profile: ready.profile === true }
    : NOT_READY;
  readyCache = { at: now, value };
  return value;
}

/** For tests and for a route that must not read a stale answer. */
export function forgetGoogleReadiness(): void {
  readyCache = null;
}
