/**
 * Google on the edge: the Places key, the OAuth client, the readiness, and
 * the routines that read a listing or a profile and write what changed —
 * shared by the link, the connect, "Check now" and the hourly sweep. The
 * plans themselves are pure (packages/channels google-sync.ts); this file
 * is the only place a key, a secret or a token is handled and the only
 * writer of the google_* tables.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../packages/db.js";
import { emitEvent, listPolicies } from "../packages/db.js";
import {
  getPlace,
  placesFetch,
  planListingCheck,
  planProfileSync,
  searchPlaces,
  tokenExchangeRequest,
  tokenRefreshRequest,
  revokeRequest,
  parseTokenResponse,
  grantHasScope,
  idTokenClaims,
  listAccounts,
  listLocations,
  listReviews,
  replyToReview,
  reviewParent,
  type PlaceCandidate,
  type PlaceDetails,
  type OAuthClient,
  type GbpLocation,
  type PlacesHttp,
  type TokenGrant,
} from "../packages/channels.js";
import {
  autoReplyBell,
  autoReplyCandidates,
  localDate,
  parseTenantConfig,
  reviewReplyModeOf,
  type GoogleAudience,
  type ReviewReplyFacts,
  type ReviewReplyMode,
} from "../packages/contracts.js";
import { draftReviewReply } from "./review-reply.js";
import { recordNotification } from "../ops/notify.js";
import { logger } from "../log.js";
import { readAllRows } from "../paged.js";
import { env } from "../env.js";

export type ListingRow = Database["public"]["Tables"]["google_listings"]["Row"];
export type ConnectionRow = Database["public"]["Tables"]["google_connections"]["Row"];
type Db = SupabaseClient<Database>;

const BUSINESS_SCOPE = "https://www.googleapis.com/auth/business.manage";
/** An access token is refreshed this long before it expires. */
const TOKEN_SLACK_MS = 60_000;

export function placesKey(): string | null {
  return env.GOOGLE_PLACES_API_KEY || null;
}

/** The OAuth client for the Business Profile door, when the environment has all three parts. */
export function profileClient(): OAuthClient | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI;
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

/**
 * Google's consent-screen audience for our OAuth app, as the operator set it
 * here when Google's console changed: `testing` (only listed test users may
 * grant; everyone else is refused by Google), `unverified` (in production
 * before Google's review; a warning screen), `verified`. Unknown or unset
 * says nothing rather than something wrong.
 */
export function googleAudience(): GoogleAudience | null {
  const a = env.GOOGLE_OAUTH_AUDIENCE;
  return a === "testing" || a === "unverified" || a === "verified" ? a : null;
}

/** What this deployment can do: look listings up; connect profiles; and which audience the app has with Google. */
export function googleReadiness(): { places: boolean; profile: boolean; audience: GoogleAudience | null } {
  return { places: !!placesKey(), profile: !!profileClient(), audience: googleAudience() };
}

/** The public half of the OAuth client, for the dashboard to build the way to Google. */
export function profilePublic(): { client_id: string; redirect_uri: string } | null {
  const c = profileClient();
  return c ? { client_id: c.clientId, redirect_uri: c.redirectUri } : null;
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

/** The connection as the dashboard may see it: never the token, never the credentials name. */
export function connectionForClient(c: ConnectionRow) {
  return {
    google_email: c.google_email,
    account_title: c.account_title,
    location_name: c.location_name,
    location_title: c.location_title,
    connected_at: c.connected_at,
    last_synced_at: c.last_synced_at,
    sync_error: c.sync_error,
  };
}

const http: PlacesHttp = placesFetch();

export async function findPlaces(key: string, query: string): Promise<PlaceCandidate[]> {
  return searchPlaces(http, key, query);
}

export async function readPlace(key: string, placeId: string): Promise<PlaceDetails> {
  return getPlace(http, key, placeId);
}

export type CheckResult =
  { ok: true; fresh: number; counted: number; answered?: number } | { ok: false; error: string };

async function connectionOf(db: Db, tenantId: string): Promise<ConnectionRow | null> {
  const { data, error } = await db.from("google_connections").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** The Autonomy row for reviews. No row reads as ask: a draft on request, nothing posted alone. */
export async function reviewReplyMode(db: Db, tenantId: string): Promise<ReviewReplyMode> {
  return reviewReplyModeOf(await listPolicies(db, tenantId));
}

/** What the receptionist knows about the business when it writes under a review: the name, the tone, the languages, the services — from the same profile the WhatsApp brain speaks from. */
export async function reviewFacts(db: Db, tenantId: string): Promise<ReviewReplyFacts> {
  const [t, c] = await Promise.all([
    db.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (t.error) throw new Error(t.error.message);
  if (c.error) throw new Error(c.error.message);
  const brain = parseTenantConfig(c.data?.config)?.brain ?? null;
  const p = brain?.profile;
  return {
    name: brain?.business_name || t.data?.name || "the business",
    tone: p?.tone?.trim() || null,
    languages: p?.languages ?? [],
    phone: brain?.phone_display || null,
    website: p?.website ?? null,
    services: (p?.services ?? []).map((s) => s.name),
  };
}

/** A draft for one review on record, for a person to send. Never posts. */
export async function draftFor(
  db: Db,
  tenantId: string,
  rowId: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string; detail?: string }> {
  const review = await db
    .from("google_reviews")
    .select("id, rating, author, body, published_at")
    .eq("tenant_id", tenantId)
    .eq("id", rowId)
    .maybeSingle();
  if (review.error) return { ok: false, error: "review_read_failed", detail: review.error.message };
  if (!review.data) return { ok: false, error: "no_review" };
  const facts = await reviewFacts(db, tenantId);
  const d = await draftReviewReply(facts, {
    rating: review.data.rating,
    author: review.data.author,
    text: review.data.body,
    written_at: review.data.published_at,
  });
  return d.ok ? { ok: true, text: d.text } : { ok: false, error: d.error, detail: d.detail };
}

/**
 * Under the auto mode, the reviews that came in while the receptionist was
 * on duty and have no reply yet are answered on Google, a few per sync
 * (contracts autoReplyCandidates decides which). A draft that fails or a
 * reply Google refuses is logged and left for the next hour; nothing here
 * stops the sync that called it. Returns what was answered, for the bell.
 */
async function answerNewReviews(
  db: Db,
  conn: ConnectionRow,
  parent: string,
  now: Date,
  net: PlacesHttp = http,
): Promise<Array<{ id: string; author: string | null; text: string }>> {
  const L = logger({ tenant: conn.tenant_id, location: conn.location_name ?? "" });
  if ((await reviewReplyMode(db, conn.tenant_id)) !== "auto") return [];
  const unreplied = await db
    .from("google_reviews")
    .select("id, review_id, origin, rating, author, body, published_at, reply_text")
    .eq("tenant_id", conn.tenant_id)
    .eq("origin", "profile")
    .is("reply_text", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(20);
  if (unreplied.error) throw new Error(unreplied.error.message);
  const picks = autoReplyCandidates(unreplied.data ?? [], conn.connected_at, now.getTime());
  if (!picks.length) return [];
  const t = await tokenFor(db, conn.tenant_id, now.getTime(), net);
  if (!t.ok) return [];
  const facts = await reviewFacts(db, conn.tenant_id);
  const answered: Array<{ id: string; author: string | null; text: string }> = [];
  for (const r of picks) {
    const d = await draftReviewReply(facts, {
      rating: r.rating,
      author: r.author,
      text: r.body,
      written_at: r.published_at,
    });
    if (!d.ok) {
      L.warn("google_auto_reply_undrafted", { id: r.id, error: d.error });
      continue;
    }
    let reply;
    try {
      reply = await replyToReview(net, t.token, `${parent}/reviews/${r.review_id}`, d.text);
    } catch (e) {
      L.warn("google_auto_reply_refused", { id: r.id, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const up = await db
      .from("google_reviews")
      .update({ reply_text: reply.reply_text, replied_at: reply.replied_at })
      .eq("id", r.id)
      .eq("tenant_id", conn.tenant_id);
    if (up.error) throw new Error(up.error.message);
    await emitEvent(db, conn.tenant_id, "google.replied", "google", "review", r.id, {
      review_id: r.review_id,
      chars: d.text.length,
      by: "receptionist",
      usage: d.usage,
    }).catch(() => {});
    answered.push({ id: r.id, author: r.author, text: d.text });
  }
  return answered;
}

/**
 * Read the public listing, decide what changed, write it, tell the bell. A
 * failed read leaves its words on the row (check_error) and the last good
 * numbers in place; the next hour tries again. With the profile connected
 * the reviews come from there, every one of them, and this keeps only the
 * rating, the count and the day. Never throws for Google's sake — only for
 * the database's.
 */
export async function checkListing(db: Db, row: ListingRow, tz: string, now = new Date()): Promise<CheckResult> {
  const L = logger({ tenant: row.tenant_id, place: row.place_id });
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
    if (upErr) throw new Error(upErr.message);
    L.warn("google_check_failed", { error });
    return { ok: false, error };
  }

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
    await emitEvent(db, row.tenant_id, "google.reviews", "google", "listing", null, {
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
export const CHECK_EVERY_MS = 20 * 3600 * 1000;

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

/* ---------------------------------------------------------- the profile */

interface StoredCredentials {
  refresh_token: string;
  access_token: string | null;
  /** Epoch ms. */
  expires_at: number | null;
  scope: string | null;
}

async function storeCredentials(db: Db, tenantId: string, c: StoredCredentials): Promise<void> {
  const { error } = await db.rpc("put_google_credentials", { p_tenant_id: tenantId, p_secret: c as unknown as Json });
  if (error) throw new Error(`credentials: ${error.message}`);
}

async function readCredentials(db: Db, tenantId: string): Promise<StoredCredentials | null> {
  const { data, error } = await db.rpc("get_google_credentials", { p_tenant_id: tenantId });
  if (error) throw new Error(`credentials: ${error.message}`);
  const c = data as Partial<StoredCredentials> | null;
  return c && typeof c.refresh_token === "string"
    ? {
        refresh_token: c.refresh_token,
        access_token: c.access_token ?? null,
        expires_at: typeof c.expires_at === "number" ? c.expires_at : null,
        scope: c.scope ?? null,
      }
    : null;
}

async function grantFrom(req: ReturnType<typeof tokenExchangeRequest>, net: PlacesHttp = http): Promise<TokenGrant> {
  const r = await net(req);
  let json: unknown = null;
  try {
    json = JSON.parse(r.body);
  } catch {
    /* below */
  }
  if (r.status < 200 || r.status >= 300) {
    const o = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
    throw new Error(
      typeof o.error === "string"
        ? `${o.error}${typeof o.error_description === "string" ? `: ${o.error_description}` : ""}`
        : `Google answered ${r.status}`,
    );
  }
  return parseTokenResponse(json);
}

/**
 * An access token for the workspace's profile: the stored one while it
 * lasts, else a fresh one from the refresh token, kept for next time.
 */
export async function tokenFor(
  db: Db,
  tenantId: string,
  now = Date.now(),
  net: PlacesHttp = http,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const client = profileClient();
  if (!client) return { ok: false, error: "no_oauth_client" };
  const creds = await readCredentials(db, tenantId);
  if (!creds) return { ok: false, error: "no_credentials" };
  if (creds.access_token && creds.expires_at && creds.expires_at - TOKEN_SLACK_MS > now)
    return { ok: true, token: creds.access_token };
  try {
    const grant = await grantFrom(tokenRefreshRequest(client, creds.refresh_token), net);
    await storeCredentials(db, tenantId, {
      refresh_token: creds.refresh_token,
      access_token: grant.access_token,
      expires_at: now + grant.expires_in * 1000,
      scope: grant.scope || creds.scope,
    });
    return { ok: true, token: grant.access_token };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}

export type ConnectResult =
  | { ok: true; pending: false; connection: ConnectionRow; read: CheckResult }
  | { ok: true; pending: true; connection: ConnectionRow; locations: LocationChoice[] }
  | { ok: false; error: string; detail?: string };

export interface LocationChoice extends GbpLocation {
  account_name: string;
  account_title: string;
}

/** Every location the signed-in account may manage, across its accounts, with the account each belongs to. */
async function allLocations(token: string, net: PlacesHttp = http): Promise<LocationChoice[]> {
  const accounts = await listAccounts(net, token);
  const out: LocationChoice[] = [];
  for (const a of accounts.slice(0, 10)) {
    const locs = await listLocations(net, token, a.name);
    for (const l of locs) out.push({ ...l, account_name: a.name, account_title: a.title });
  }
  return out;
}

/**
 * The code from Google becomes the workspace's connection: the token in
 * Vault, the accounts and locations read, and — with one location on Maps —
 * the listing bound and synced at once. Several locations wait for the
 * owner's choice; none refuses and revokes what was granted.
 *
 * `net` is the ONE thing here that reaches Google, handed in so the paths that
 * matter most can be run instead of read: this function can destroy a working
 * connection on its way to reporting a failure, and a rollback nothing
 * exercises is a rollback nobody has seen work. It reaches the whole way
 * down -- the token exchange, the accounts and locations, the revoke, and on
 * the one-location path `bindLocation` -> `syncProfile` -> `tokenFor` too.
 * It has to, and it has to go further than it looks: a sync that is not the
 * first one ANSWERS reviews publicly under the auto mode, so a transport
 * stopping short of `answerNewReviews` would let a test post a real reply on a
 * real business's listing and bill a real model call to write it.
 */
export async function connectProfile(
  db: Db,
  tenantId: string,
  userId: string | null,
  code: string,
  tz: string,
  now = new Date(),
  net: PlacesHttp = http,
): Promise<ConnectResult> {
  const client = profileClient();
  if (!client) return { ok: false, error: "no_oauth_client" };
  let grant: TokenGrant;
  try {
    grant = await grantFrom(tokenExchangeRequest(client, code), net);
  } catch (e) {
    return { ok: false, error: "exchange_failed", detail: e instanceof Error ? e.message : String(e) };
  }
  if (!grantHasScope(grant, BUSINESS_SCOPE)) {
    await net(revokeRequest(grant.access_token)).catch(() => null);
    return { ok: false, error: "scope_missing" };
  }
  if (!grant.refresh_token) {
    await net(revokeRequest(grant.access_token)).catch(() => null);
    return { ok: false, error: "no_refresh_token" };
  }
  const claims = idTokenClaims(grant.id_token);
  let locations: LocationChoice[];
  try {
    locations = await allLocations(grant.access_token, net);
  } catch (e) {
    await net(revokeRequest(grant.refresh_token)).catch(() => null);
    return { ok: false, error: "accounts_unreadable", detail: e instanceof Error ? e.message : String(e) };
  }
  const onMaps = locations.filter((l) => !!l.place_id);
  if (!locations.length) {
    await net(revokeRequest(grant.refresh_token)).catch(() => null);
    return { ok: false, error: "no_locations" };
  }
  if (!onMaps.length) {
    await net(revokeRequest(grant.refresh_token)).catch(() => null);
    return { ok: false, error: "not_on_maps" };
  }
  const first = onMaps[0];
  const row = {
    tenant_id: tenantId,
    google_email: claims.email,
    google_sub: claims.sub,
    account_name: first.account_name,
    account_title: first.account_title,
    location_name: null,
    location_title: null,
    scopes: grant.scope.split(/\s+/).filter(Boolean),
    connected_by: userId,
    connected_at: now.toISOString(),
    last_synced_at: null,
    sync_error: null,
  };
  // What this workspace had connected before, read BEFORE the upsert overwrites
  // it. A connect is also a RE-connect, and the row below carries
  // `location_name: null` -- so the failure path is not "remove what we just
  // made", it is "put back what was working".
  const prior = await db.from("google_connections").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (prior.error) return { ok: false, error: "connection_write_failed", detail: prior.error.message };
  const saved = await db.from("google_connections").upsert(row, { onConflict: "tenant_id" }).select("*").single();
  if (saved.error || !saved.data) return { ok: false, error: "connection_write_failed", detail: saved.error?.message };
  try {
    await storeCredentials(db, tenantId, {
      refresh_token: grant.refresh_token,
      access_token: grant.access_token,
      expires_at: now.getTime() + grant.expires_in * 1000,
      scope: grant.scope,
    });
  } catch (e) {
    // Without the token the row is a lie. Deleting it unconditionally was the
    // lie's cure and somebody else's outage: a workspace whose profile was
    // connected and syncing lost the connection entirely because a RE-connect
    // could not reach the vault. The vault write is the thing that failed, so
    // the stored credentials are still the previous ones -- restoring the
    // previous row leaves the pair consistent and the profile working.
    const restored = !!prior.data;
    if (restored) await db.from("google_connections").update(prior.data!).eq("tenant_id", tenantId);
    else await db.from("google_connections").delete().eq("tenant_id", tenantId);
    // Giving the grant back is right when we are leaving nothing behind. It is
    // wrong when we just restored a connection for the SAME Google account:
    // Google revokes the grant for a client/user pair, not one token of it, so
    // handing this refresh token back would kill the credentials the restored
    // row runs on -- destroying the connection by the other route.
    // `claims.sub` is null whenever the id_token was missing or unparsable, and
    // "unknown" is not "different": `"sub-1" !== null` would revoke the grant
    // the row we just restored runs on, which is precisely the outage this
    // guard exists to prevent. Not knowing means leaving it alone -- a grant
    // left live costs nothing a person cannot undo; a dead one costs them the
    // connection.
    const otherAccount = claims.sub != null && prior.data?.google_sub !== claims.sub;
    if (!restored || otherAccount) await net(revokeRequest(grant.refresh_token)).catch(() => null);
    return { ok: false, error: "credentials_failed", detail: e instanceof Error ? e.message : String(e) };
  }
  await emitEvent(db, tenantId, "google.connected", "google", "listing", null, {
    email: claims.email,
    accounts: new Set(locations.map((l) => l.account_name)).size,
    locations: locations.length,
    on_maps: onMaps.length,
    by: userId,
  }).catch(() => {});
  if (onMaps.length === 1) {
    const bound = await bindLocation(db, saved.data, first, userId, tz, now, net);
    if (!bound.ok) return { ok: false, error: bound.error, detail: bound.detail };
    return { ok: true, pending: false, connection: bound.connection, read: bound.read };
  }
  return { ok: true, pending: true, connection: saved.data, locations: onMaps };
}

/** The locations a pending (or connected) profile may choose among, read again. */
export async function locationsFor(
  db: Db,
  tenantId: string,
): Promise<{ ok: true; locations: LocationChoice[] } | { ok: false; error: string }> {
  const t = await tokenFor(db, tenantId);
  if (!t.ok) return t;
  try {
    return { ok: true, locations: (await allLocations(t.token)).filter((l) => !!l.place_id) };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}

/**
 * The chosen location becomes the workspace's listing (its place on Maps)
 * and the connection's location, then the profile is synced at once. A
 * listing that named another place forgets what was read from it.
 */
export async function bindLocation(
  db: Db,
  conn: ConnectionRow,
  loc: LocationChoice,
  userId: string | null,
  tz: string,
  now = new Date(),
  net: PlacesHttp = http,
): Promise<{ ok: true; connection: ConnectionRow; read: CheckResult } | { ok: false; error: string; detail?: string }> {
  if (!loc.place_id) return { ok: false, error: "not_on_maps" };
  const existing = await db.from("google_listings").select("place_id").eq("tenant_id", conn.tenant_id).maybeSingle();
  if (existing.error) return { ok: false, error: "listing_read_failed", detail: existing.error.message };
  if (existing.data && existing.data.place_id !== loc.place_id) {
    await db.from("google_reviews").delete().eq("tenant_id", conn.tenant_id);
    await db.from("google_listing_days").delete().eq("tenant_id", conn.tenant_id);
  }
  const listing = await db.from("google_listings").upsert(
    existing.data && existing.data.place_id === loc.place_id
      ? {
          tenant_id: conn.tenant_id,
          place_id: loc.place_id,
          name: loc.title,
          address: loc.address,
          maps_uri: loc.maps_uri,
        }
      : {
          tenant_id: conn.tenant_id,
          place_id: loc.place_id,
          name: loc.title,
          address: loc.address,
          maps_uri: loc.maps_uri,
          business_status: null,
          linked_by: userId,
          linked_at: now.toISOString(),
          rating: null,
          review_count: null,
          checked_at: null,
          check_error: null,
        },
    { onConflict: "tenant_id" },
  );
  if (listing.error) return { ok: false, error: "listing_write_failed", detail: listing.error.message };
  const saved = await db
    .from("google_connections")
    .update({
      account_name: loc.account_name,
      account_title: loc.account_title,
      location_name: loc.name,
      location_title: loc.title,
      last_synced_at: null,
      sync_error: null,
    })
    .eq("tenant_id", conn.tenant_id)
    .select("*")
    .single();
  if (saved.error || !saved.data) return { ok: false, error: "connection_write_failed", detail: saved.error?.message };
  const read = await syncProfile(db, saved.data, tz, now, net);
  const after = await db.from("google_connections").select("*").eq("tenant_id", conn.tenant_id).single();
  return { ok: true, connection: after.data ?? saved.data, read };
}

/**
 * Every review of the connected location, decided against what is on
 * record, written, and told. The first sync replaces the five the public
 * listing showed — their ids are the public listing's, not the profile's —
 * and is history: it raises nothing. A failed sync leaves its words on the
 * connection and is tried again next hour.
 */
export async function syncProfile(
  db: Db,
  conn: ConnectionRow,
  tz: string,
  now = new Date(),
  net: PlacesHttp = http,
): Promise<CheckResult> {
  const L = logger({ tenant: conn.tenant_id, location: conn.location_name ?? "" });
  if (!conn.location_name) return { ok: false, error: "no_location" };
  const failed = async (error: string) => {
    // The stamp is NOT moved, for the reasons checkListing gives above: a
    // profile's `last_synced_at` is its last SUCCESSFUL sync, and moving it on
    // a failed first attempt made the next real sync think it had run before —
    // leaving the Places reviews on file as duplicates for ever and answering
    // reviews the owner had already seen.
    const { error: upErr } = await db
      .from("google_connections")
      .update({ sync_error: error.slice(0, 300) })
      .eq("tenant_id", conn.tenant_id);
    if (upErr) throw new Error(upErr.message);
    L.warn("google_profile_sync_failed", { error });
    return { ok: false as const, error };
  };
  const t = await tokenFor(db, conn.tenant_id, now.getTime(), net);
  if (!t.ok) return failed(t.error);
  let page;
  try {
    page = await listReviews(net, t.token, reviewParent(conn.account_name, conn.location_name));
  } catch (e) {
    return failed(e instanceof Error ? e.message : String(e));
  }
  const first = !conn.last_synced_at;
  const known = await readAllRows<{
    review_id: string;
    replied_at: string | null;
    reply_text: string | null;
    origin: string;
  }>("google_reviews", (from, to) =>
    db
      .from("google_reviews")
      .select("review_id, replied_at, reply_text, origin")
      .eq("tenant_id", conn.tenant_id)
      .order("review_id")
      .range(from, to),
  );
  const plan = planProfileSync(
    { last_synced_at: conn.last_synced_at },
    new Map(
      known
        .filter((k) => k.origin === "profile")
        .map((k) => [k.review_id, { updated_at: k.replied_at, reply_text: k.reply_text }]),
    ),
    page,
    localDate(tz, now),
    now.getTime(),
  );
  if (first) {
    // The public listing's five carry the public ids; from now on the profile is the record.
    const gone = await db.from("google_reviews").delete().eq("tenant_id", conn.tenant_id).eq("origin", "places");
    if (gone.error) throw new Error(gone.error.message);
  }
  if (plan.reviews.length) {
    const up = await db.from("google_reviews").upsert(
      plan.reviews.map((r) => ({
        tenant_id: conn.tenant_id,
        review_id: r.review_id,
        origin: "profile",
        rating: r.rating,
        author: r.author,
        author_uri: null,
        author_photo_uri: r.author_photo_uri,
        body: r.text,
        language_code: null,
        published_at: r.created_at,
        reply_text: r.reply_text,
        replied_at: r.replied_at,
        maps_uri: null,
        last_seen_at: r.last_seen_at,
      })),
      { onConflict: "tenant_id,review_id" },
    );
    if (up.error) throw new Error(up.error.message);
  }
  if (plan.listing) {
    const l = await db.from("google_listings").update(plan.listing).eq("tenant_id", conn.tenant_id);
    if (l.error) throw new Error(l.error.message);
  }
  if (plan.day) {
    const d = await db
      .from("google_listing_days")
      .upsert({ tenant_id: conn.tenant_id, ...plan.day }, { onConflict: "tenant_id,day" });
    if (d.error) throw new Error(d.error.message);
  }
  const done = await db
    .from("google_connections")
    .update({ last_synced_at: plan.synced_at, sync_error: null })
    .eq("tenant_id", conn.tenant_id);
  if (done.error) throw new Error(done.error.message);
  for (const b of plan.bells) {
    await recordNotification(conn.tenant_id, {
      kind: "review",
      title: b.title,
      body: b.body,
      route: "reports",
      about: b.review_id ? { type: "review", id: b.review_id } : null,
    });
  }
  // The first sync is history, never answered. After that, the auto mode
  // answers what came in on duty; a failure here is logged, not thrown.
  const answered = first
    ? []
    : await answerNewReviews(db, conn, reviewParent(conn.account_name, conn.location_name), now, net).catch((e) => {
        L.warn("google_auto_reply_failed", { error: e instanceof Error ? e.message : String(e) });
        return [];
      });
  const bell = autoReplyBell(answered);
  if (bell) {
    await recordNotification(conn.tenant_id, {
      kind: "review",
      title: bell.title,
      body: bell.body,
      route: "reports",
      about: answered.length === 1 ? { type: "review", id: answered[0].id } : null,
    });
  }
  if (plan.fresh.length) {
    await emitEvent(db, conn.tenant_id, "google.reviews", "google", "listing", null, {
      source: "profile",
      fresh: plan.fresh.length,
      counted: 0,
      rating: plan.listing?.rating ?? null,
      review_count: plan.listing?.review_count ?? null,
    }).catch(() => {});
  }
  L.info("google_profile_synced", {
    read: plan.reviews.length,
    fresh: plan.fresh.length,
    replied: plan.replied.length,
    answered: answered.length,
    first,
    rating: plan.listing?.rating ?? null,
    review_count: plan.listing?.review_count ?? null,
  });
  return { ok: true, fresh: plan.fresh.length, counted: 0, answered: answered.length };
}

/** The grant given back to Google, the token gone from Vault, the row gone, the profile's reviews gone. The listing stays. */
export async function disconnectProfile(
  db: Db,
  tenantId: string,
): Promise<{ ok: true; removed: boolean; revoked: boolean }> {
  const conn = await connectionOf(db, tenantId);
  if (!conn) return { ok: true, removed: false, revoked: false };
  let revoked = false;
  const creds = await readCredentials(db, tenantId).catch(() => null);
  if (creds) {
    const r = await http(revokeRequest(creds.refresh_token)).catch(() => null);
    revoked = !!r && r.status === 200;
  }
  await db.rpc("drop_google_credentials", { p_tenant_id: tenantId });
  const gone = await db.from("google_reviews").delete().eq("tenant_id", tenantId).eq("origin", "profile");
  if (gone.error) throw new Error(gone.error.message);
  const del = await db.from("google_connections").delete().eq("tenant_id", tenantId);
  if (del.error) throw new Error(del.error.message);
  await emitEvent(db, tenantId, "google.disconnected", "google", "listing", null, {
    email: conn.google_email,
    location: conn.location_name,
    revoked,
  }).catch(() => {});
  return { ok: true, removed: true, revoked };
}

/** An answer to a review, on Google and on the row. The ledger entry is the dashboard's. */
export async function replyOnProfile(
  db: Db,
  tenantId: string,
  rowId: string,
  comment: string,
  now = new Date(),
): Promise<
  { ok: true; reply_text: string | null; replied_at: string | null } | { ok: false; error: string; detail?: string }
> {
  const conn = await connectionOf(db, tenantId);
  if (!conn || !conn.location_name) return { ok: false, error: "not_connected" };
  const review = await db
    .from("google_reviews")
    .select("id, review_id, origin")
    .eq("tenant_id", tenantId)
    .eq("id", rowId)
    .maybeSingle();
  if (review.error) return { ok: false, error: "review_read_failed", detail: review.error.message };
  if (!review.data) return { ok: false, error: "no_review" };
  if (review.data.origin !== "profile") return { ok: false, error: "not_from_profile" };
  const t = await tokenFor(db, tenantId, now.getTime());
  if (!t.ok) return { ok: false, error: "no_token", detail: t.error };
  let reply;
  try {
    reply = await replyToReview(
      http,
      t.token,
      `${reviewParent(conn.account_name, conn.location_name)}/reviews/${review.data.review_id}`,
      comment,
    );
  } catch (e) {
    return { ok: false, error: "google_refused", detail: e instanceof Error ? e.message : String(e) };
  }
  const up = await db
    .from("google_reviews")
    .update({ reply_text: reply.reply_text, replied_at: reply.replied_at })
    .eq("id", rowId)
    .eq("tenant_id", tenantId);
  if (up.error) return { ok: false, error: "review_write_failed", detail: up.error.message };
  await emitEvent(db, tenantId, "google.replied", "google", "review", rowId, {
    review_id: review.data.review_id,
    chars: comment.length,
  }).catch(() => {});
  return { ok: true, ...reply };
}
