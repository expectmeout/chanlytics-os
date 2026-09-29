/**
 * The Business Profile connection: the code from Google becomes the
 * workspace's connection (`connectProfile`), the locations it may choose
 * among are read, the chosen one is bound as the listing and synced at once
 * (`bindLocation`, through profile-sync.ts), and the grant is given back
 * (`disconnectProfile`).
 */
import { emitEvent } from "../packages/db.js";
import {
  tokenExchangeRequest,
  revokeRequest,
  grantHasScope,
  idTokenClaims,
  listAccounts,
  listLocations,
  type GbpLocation,
  type PlacesHttp,
  type TokenGrant,
} from "../packages/channels.js";
import type { EdgeRefusal } from "../packages/contracts.js";
import { profileClient } from "./google-config.js";
import { http } from "./places.js";
import { connectionOf, type ConnectionRow, type Db } from "./google-rows.js";
import { grantFrom, readCredentials, storeCredentials, tokenFor } from "./profile-credentials.js";
import type { CheckResult } from "./listing-check.js";
import { syncProfile } from "./profile-sync.js";

const BUSINESS_SCOPE = "https://www.googleapis.com/auth/business.manage";

export type ConnectResult =
  | { ok: true; pending: false; connection: ConnectionRow; read: CheckResult }
  | { ok: true; pending: true; connection: ConnectionRow; locations: LocationChoice[] }
  | EdgeRefusal;

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

/** The locations a pending (or connected) profile may choose among, read again: Google's refusal is in `detail`. */
export async function locationsFor(
  db: Db,
  tenantId: string,
): Promise<{ ok: true; locations: LocationChoice[] } | EdgeRefusal> {
  const t = await tokenFor(db, tenantId);
  if (!t.ok) return t;
  try {
    return { ok: true, locations: (await allLocations(t.token)).filter((l) => !!l.place_id) };
  } catch (e) {
    return {
      ok: false,
      error: "accounts_unreadable",
      detail: (e instanceof Error ? e.message : String(e)).slice(0, 300),
    };
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
): Promise<{ ok: true; connection: ConnectionRow; read: CheckResult } | EdgeRefusal> {
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
          // The old place's hours and number are not this one's; the next Places read fills them.
          facts: {},
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
