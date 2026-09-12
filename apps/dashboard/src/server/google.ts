/**
 * Google for the dashboard: the rows a member may read (RLS), and the
 * edge's verbs — status, search, link, unlink, refresh, connect, locations,
 * choose, disconnect, reply — behind the diagnostic key the dashboard
 * already holds. The Places key and the OAuth client secret live on the
 * edge; nothing here knows either. The one secret the dashboard uses for
 * Google is its own: the key that signs the OAuth state.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { deployment } from "./deployment";
import type { Database } from "@chanlytics/db";
import type { GoogleAudience, GoogleConnectionDto, GoogleDayDto, GoogleListingDto, GoogleReviewDto } from "@chanlytics/contracts";
import type { EdgeAnswer } from "./lines";

import { edgeConfigured, edgeHeaders, edgeUrl } from "./edge";

export const LISTING_COLUMNS = "place_id, name, address, maps_uri, business_status, rating, review_count, linked_at, checked_at, check_error";
export const REVIEW_COLUMNS = "id, review_id, origin, rating, author, author_uri, author_photo_uri, body, language_code, published_at, reply_text, replied_at, maps_uri, first_seen_at";
/** Never the credentials name: the row says who and when, not where the token is. */
export const CONNECTION_COLUMNS = "google_email, account_title, location_name, location_title, connected_at, last_synced_at, sync_error";

/** The reviews a screen shows; the rest are on Google. */
export const REVIEWS_SHOWN = 20;
/** Days of snapshots the longest report period reads, with one to spare. */
export const DAYS_KEPT = 92;

export async function listingFor(db: SupabaseClient<Database>, tenantId: string): Promise<GoogleListingDto | null> {
  const { data, error } = await db.from("google_listings").select(LISTING_COLUMNS).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data as GoogleListingDto) : null;
}

export async function connectionFor(db: SupabaseClient<Database>, tenantId: string): Promise<GoogleConnectionDto | null> {
  const { data, error } = await db.from("google_connections").select(CONNECTION_COLUMNS).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data as GoogleConnectionDto) : null;
}

export async function googleFor(db: SupabaseClient<Database>, tenantId: string): Promise<{ listing: GoogleListingDto | null; connection: GoogleConnectionDto | null; reviews: GoogleReviewDto[]; days: GoogleDayDto[] }> {
  const [listing, connection] = await Promise.all([listingFor(db, tenantId), connectionFor(db, tenantId)]);
  if (!listing) return { listing: null, connection, reviews: [], days: [] };
  const sinceDay = new Date(Date.now() - DAYS_KEPT * 86_400_000).toISOString().slice(0, 10);
  const [reviews, days] = await Promise.all([
    db.from("google_reviews").select(REVIEW_COLUMNS).eq("tenant_id", tenantId).order("published_at", { ascending: false, nullsFirst: false }).limit(REVIEWS_SHOWN),
    db.from("google_listing_days").select("day, rating, review_count").eq("tenant_id", tenantId).gte("day", sinceDay).order("day", { ascending: true }),
  ]);
  if (reviews.error) throw new Error(reviews.error.message);
  if (days.error) throw new Error(days.error.message);
  return {
    listing,
    connection,
    reviews: (reviews.data ?? []).map((r) => ({ ...r, origin: r.origin === "profile" ? "profile" : "places" })),
    days: days.data ?? [],
  };
}

/** One call to the edge's google endpoint. Never throws: a failure is a status the caller reads. */
export async function edgeGoogle(body: Record<string, unknown>, timeoutMs = 20_000): Promise<EdgeAnswer> {
  if (!edgeConfigured()) return { status: 503, body: { ok: false, error: "no_edge_credential" } };
  // The deployment gate the other provider doors keep: a preview never reaches Google under the business's name.
  if (!deployment.providersLive) return { status: 503, body: { ok: false, error: "preview" } };
  try {
    const r = await fetch(`${edgeUrl()}/api/admin/google`, {
      method: "POST",
      headers: edgeHeaders("/api/admin/google", { workspace: typeof body.tenant_id === "string" ? body.tenant_id : null }),
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
  /** Google's consent-screen audience for our app, as the edge states it; null = nothing to say. */
  audience: GoogleAudience | null;
  /** The public half of the OAuth client, when the profile door is open. */
  oauth: { client_id: string; redirect_uri: string } | null;
}

const NOT_READY: GoogleReadiness = { places: false, profile: false, audience: null, oauth: null };
let readyCache: { at: number; value: GoogleReadiness } | null = null;
const READY_TTL_MS = 5 * 60_000;

/**
 * What this deployment can do with Google. Cached for five minutes per
 * lambda: the answer changes when an operator sets a key, not between two
 * page loads. Unreachable edge → nothing, so nothing draws a verb that
 * cannot work.
 */
export async function googleReadiness(now = Date.now()): Promise<GoogleReadiness> {
  if (readyCache && now - readyCache.at < READY_TTL_MS) return readyCache.value;
  const a = await edgeGoogle({ op: "status" }, 4_000);
  const b = a.body ?? {};
  const ready = b.ready && typeof b.ready === "object" ? (b.ready as Partial<Record<"places" | "profile" | "audience", unknown>>) : null;
  const oauth = b.profile && typeof b.profile === "object" ? (b.profile as Partial<Record<"client_id" | "redirect_uri", unknown>>) : null;
  const value: GoogleReadiness = a.status === 200 && b.ok === true && ready
    ? {
      places: ready.places === true,
      profile: ready.profile === true && typeof oauth?.client_id === "string" && typeof oauth?.redirect_uri === "string",
      audience: ready.audience === "testing" || ready.audience === "unverified" || ready.audience === "verified" ? ready.audience : null,
      oauth: typeof oauth?.client_id === "string" && typeof oauth?.redirect_uri === "string" ? { client_id: oauth.client_id, redirect_uri: oauth.redirect_uri } : null,
    }
    : NOT_READY;
  readyCache = { at: now, value };
  return value;
}

/** For tests and for a route that must not read a stale answer. */
export function forgetGoogleReadiness(): void {
  readyCache = null;
}

/** The secret that signs the OAuth state: the key the dashboard already shares with the edge. */
export function stateSecret(): string | null {
  // Its own secret once set; the shared key until then, so nothing moves before it is.
  return process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.DIAG_KEY || null;
}

/** Where the browser lands after Google: Integrations, with the outcome in a word the card reads once. */
export function afterGoogle(origin: string, outcome: string, why?: string): string {
  const q = new URLSearchParams({ google: outcome });
  if (why) q.set("why", why);
  return `${origin}/?${q.toString()}#/admin/integrations`;
}

/** The edge's word on the listing read that follows a link or a choice: what it found, or why it could not look. */
export type ReadOutcome = { ok: true; fresh: number; counted: number } | { ok: false; error: string };

export function readOutcome(v: unknown): ReadOutcome | null {
  return v && typeof v === "object" ? (v as ReadOutcome) : null;
}
