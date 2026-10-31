/**
 * Google for the dashboard: the rows a member may read (RLS), and the
 * edge's verbs — status, search, link, unlink, refresh, connect, locations,
 * choose, disconnect, reply — behind the diagnostic key the dashboard
 * already holds. The Places key and the OAuth client secret live on the
 * edge; nothing here knows either. The one secret the dashboard uses for
 * Google is its own: the key that signs the OAuth state.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";
import {
  appLink,
  listingFactsOf,
  type GoogleAudience,
  type GoogleConnectionDto,
  type GoogleReadDto,
  type GoogleListingDto,
  type GoogleListingFacts,
  DAY_MS,
} from "@chanlytics/contracts";

import { callEdge, edgeConfigured, READY_TTL_MS, type EdgeAnswer } from "../edge";
import { deployment, env } from "../env";

const LISTING_COLUMNS =
  "place_id, name, address, maps_uri, business_status, rating, review_count, linked_at, checked_at, check_error";
// The reply the receptionist holds, and when it goes under Holds it (00462, decision 0064 step 6), with the rest.
const REVIEW_COLUMNS =
  "id, review_id, origin, rating, author, author_uri, author_photo_uri, body, language_code, published_at, reply_text, replied_at, draft_text, posts_at, maps_uri, first_seen_at";
/** Never the credentials name: the row says who and when, not where the token is. */
export const CONNECTION_COLUMNS =
  "google_email, account_title, location_name, location_title, connected_at, last_synced_at, sync_error";

/** The reviews a screen shows; the rest are on Google. */
const REVIEWS_SHOWN = 20;
/** Days of snapshots the longest report period reads, with one to spare. */
const DAYS_KEPT = 92;

export async function listingFor(db: SupabaseClient<Database>, tenantId: string): Promise<GoogleListingDto | null> {
  const { data, error } = await db
    .from("google_listings")
    .select(LISTING_COLUMNS)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * The listing's name and address, and Google's facts as the edge stored them (contracts listingFactsOf), which no read
 * above hands the browser: what the first receptionist is built from, and what the first run's Check asks about.
 */
export async function listingFactsFor(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<{ name: string; address: string | null; facts: GoogleListingFacts | null } | null> {
  const { data, error } = await db
    .from("google_listings")
    .select("name, address, facts")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { name: data.name, address: data.address, facts: listingFactsOf(data.facts) } : null;
}

export async function connectionFor(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<GoogleConnectionDto | null> {
  const { data, error } = await db
    .from("google_connections")
    .select(CONNECTION_COLUMNS)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Google as the database holds it for a workspace: the listing, the connection, the newest reviews and the daily readings,
 * four reads at once (the reviews and the days hang off the listing by a foreign key that cascades, so a workspace with no
 * listing has none, and they need not wait to learn so). `now` is the turn's clock, which says how far back the days go.
 * The Google reader (readers/connections.ts) adds the Autonomy row to it.
 */
export async function googleRead(
  db: SupabaseClient<Database>,
  tenantId: string,
  now: number,
): Promise<Omit<GoogleReadDto, "reply_mode">> {
  const sinceDay = new Date(now - DAYS_KEPT * DAY_MS).toISOString().slice(0, 10);
  const [listing, connection, reviews, days] = await Promise.all([
    listingFor(db, tenantId),
    connectionFor(db, tenantId),
    db
      .from("google_reviews")
      .select(REVIEW_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(REVIEWS_SHOWN),
    db
      .from("google_listing_days")
      .select("day, rating, review_count")
      .eq("tenant_id", tenantId)
      .gte("day", sinceDay)
      .order("day", { ascending: true }),
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
  return callEdge("/api/admin/google", body, {
    workspace: typeof body.tenant_id === "string" ? body.tenant_id : null,
    user: typeof body.user_id === "string" ? body.user_id : null,
    timeoutMs,
  });
}

interface GoogleReadiness {
  places: boolean;
  profile: boolean;
  /** Google's consent-screen audience for our app, as the edge states it; null = nothing to say. */
  audience: GoogleAudience | null;
  /** The public half of the OAuth client, when the profile door is open. */
  oauth: { client_id: string; redirect_uri: string } | null;
}

const NOT_READY: GoogleReadiness = { places: false, profile: false, audience: null, oauth: null };
let googleReadyCache: { at: number; value: GoogleReadiness } | null = null;

/**
 * What this deployment can do with Google. Cached for five minutes per
 * lambda: the answer changes when an operator sets a key, not between two
 * page loads. Unreachable edge → nothing, so nothing draws a verb that
 * cannot work.
 */
export async function googleReadiness(now = Date.now()): Promise<GoogleReadiness> {
  if (googleReadyCache && now - googleReadyCache.at < READY_TTL_MS) return googleReadyCache.value;
  const a = await edgeGoogle({ op: "status" }, 4_000);
  const b = a.body ?? {};
  const ready =
    b.ready && typeof b.ready === "object"
      ? (b.ready as Partial<Record<"places" | "profile" | "audience", unknown>>)
      : null;
  const oauth =
    b.profile && typeof b.profile === "object"
      ? (b.profile as Partial<Record<"client_id" | "redirect_uri", unknown>>)
      : null;
  const value: GoogleReadiness =
    a.status === 200 && b.ok === true && ready
      ? {
          places: ready.places === true,
          profile:
            ready.profile === true && typeof oauth?.client_id === "string" && typeof oauth?.redirect_uri === "string",
          audience:
            ready.audience === "testing" || ready.audience === "unverified" || ready.audience === "verified"
              ? ready.audience
              : null,
          oauth:
            typeof oauth?.client_id === "string" && typeof oauth?.redirect_uri === "string"
              ? { client_id: oauth.client_id, redirect_uri: oauth.redirect_uri }
              : null,
        }
      : NOT_READY;
  googleReadyCache = { at: now, value };
  return value;
}

/**
 * The secret that signs the OAuth state (Google, Instagram, a mailbox): GOOGLE_OAUTH_STATE_SECRET, on every deployment.
 * Without it, a connection says it is not available here. The door key the dashboard shares with the edge stood in off
 * production until 31 October 2026 (the GOOGLE_OAUTH_STATE_SECRET switch); it signs nothing of a person's now.
 */
export function stateSecret(): string | null {
  return env.GOOGLE_OAUTH_STATE_SECRET ?? null;
}

/**
 * Where the browser lands after Google: Connections, with the outcome in a word the card reads once. On the workspace's OWN
 * address when the signed state has proved whose workspace it was (`slug`, contracts appLink), so a person who holds two
 * reads the word on the business they connected and not on the one this browser used last; on the front door, which carries
 * the tab to the last workspace used, for a refusal made before the state proves itself (a declined consent, a state that is
 * malformed, expired or another person's), when no workspace is known to name.
 */
export function afterGoogle(
  origin: string,
  outcome: string,
  why?: string,
  to: { slug?: string | null; backTo?: string | null } = {},
): string {
  // The first run's Your business asked (decision 0073, R17): back to it, the outcome said there.
  const page = to.backTo === "start" ? "start/business" : "admin/integrations";
  return `${origin}${appLink(to.slug, page, { google: outcome, why: why || null })}`;
}

/** The edge's word on the listing read that follows a link or a choice: what it found, or why it could not look. */
type ReadOutcome = { ok: true; fresh: number; counted: number } | { ok: false; error: string };

export function readOutcome(v: unknown): ReadOutcome | null {
  return v && typeof v === "object" ? (v as ReadOutcome) : null;
}
