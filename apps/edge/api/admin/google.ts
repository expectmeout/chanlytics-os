/**
 * POST /api/admin/google — a workspace's listing on Google Maps, found and
 * read; its Business Profile, connected and answered from. Diagnostic-key
 * only; the dashboard's /api/v1/google verbs call it for an owner or an
 * operator.
 *
 *   { op: "status" }                                       → what this deployment can do, and the public half of the OAuth client
 *   { op: "search", query }                                → what Google finds for the words
 *   { op: "link", tenant_id, user_id, place_id }           → the listing on record, read at once
 *   { op: "unlink", tenant_id }                            → the listing, its reviews, its days and its connection, gone
 *   { op: "refresh", tenant_id }                           → read it now: the profile when connected, the public listing otherwise
 *   { op: "connect", tenant_id, user_id, code }            → the code from Google becomes the connection; one location binds at once, several wait
 *   { op: "locations", tenant_id }                         → the locations the connected account may choose among
 *   { op: "choose", tenant_id, user_id, account_name, location_name } → the chosen location becomes the listing, synced at once
 *   { op: "disconnect", tenant_id }                        → the grant given back, the token gone, the profile's reviews gone
 *   { op: "reply", tenant_id, user_id, id, comment }       → an answer to a review, on Google and on the row
 *   { op: "draft", tenant_id, id }                         → the receptionist's draft of a reply, for a person to send; refused under Never
 *
 * The key and the client secret live here and nowhere else. Without them the
 * ops that need them say so, and the dashboard draws nothing it cannot do.
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { emitEvent } from "../../lib/packages/db.js";
import { PLACE_ID, cleanReply } from "../../lib/packages/channels.js";
import {
  bindLocation, checkListing, connectProfile, connectionForClient, disconnectProfile, draftFor, findPlaces, googleReadiness, listingForClient,
  locationsFor, placesKey, profilePublic, readPlace, replyOnProfile, reviewReplyMode, syncProfile,
} from "../../lib/google.js";

interface Body {
  op?: string;
  tenant_id?: string;
  user_id?: string;
  place_id?: string;
  query?: string;
  code?: string;
  account_name?: string;
  location_name?: string;
  id?: string;
  comment?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const config = { maxDuration: 60 };

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/google");
  if (!auth.ok) return auth.response;
  let body: Body = {};
  try { body = JSON.parse(await request.text()); } catch { /* validated below */ }
  const op = typeof body.op === "string" ? body.op : "";
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;

  if (op === "status") return json(200, { ok: true, ready: googleReadiness(), profile: profilePublic() });

  if (op === "search") {
    const key = placesKey();
    if (!key) return json(503, { ok: false, error: "no_places_key", hint: "GOOGLE_PLACES_API_KEY on the edge, a key with Places API (New) enabled" });
    const query = typeof body.query === "string" ? body.query.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    if (query.length < 3) return json(400, { ok: false, error: "query must be a few words: the business name and where it is" });
    try {
      const candidates = await findPlaces(key, query);
      return json(200, { ok: true, query, candidates });
    } catch (e) {
      return json(502, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  if (!UUID.test(tenantId)) return json(400, { ok: false, error: "tenant_id (a workspace id) is required" });
  const tenant = await db.from("tenants").select("id, timezone").eq("id", tenantId).maybeSingle();
  if (tenant.error) return json(503, { ok: false, error: tenant.error.message });
  if (!tenant.data) return json(404, { ok: false, error: "no such workspace" });
  const tz = tenant.data.timezone || "America/New_York";
  const userId = typeof body.user_id === "string" && UUID.test(body.user_id) ? body.user_id : null;
  const log = (event: string, extra: Record<string, unknown> = {}) => console.log(event, JSON.stringify({ tenant: tenantId, ...extra }));
  const listingNow = async () => {
    const r = await db.from("google_listings").select("*").eq("tenant_id", tenantId).maybeSingle();
    return r.data ? listingForClient(r.data) : null;
  };
  const connectionNow = async () => {
    const r = await db.from("google_connections").select("*").eq("tenant_id", tenantId).maybeSingle();
    return r.data ? connectionForClient(r.data) : null;
  };

  if (op === "link") {
    const key = placesKey();
    if (!key) return json(503, { ok: false, error: "no_places_key" });
    const placeId = typeof body.place_id === "string" ? body.place_id.trim() : "";
    if (!PLACE_ID.test(placeId)) return json(400, { ok: false, error: "place_id is required" });
    // Read it before writing anything: a wrong id is refused here, not kept as a row that never reads.
    let details;
    try {
      details = await readPlace(key, placeId);
    } catch (e) {
      return json(502, { ok: false, error: "unreadable", detail: e instanceof Error ? e.message : String(e) });
    }
    const saved = await db
      .from("google_listings")
      .upsert(
        { tenant_id: tenantId, place_id: details.place_id, name: details.name, address: details.address, maps_uri: details.maps_uri, business_status: details.business_status, linked_by: userId, linked_at: new Date().toISOString(), rating: null, review_count: null, checked_at: null, check_error: null },
        { onConflict: "tenant_id" },
      )
      .select("*")
      .single();
    if (saved.error || !saved.data) return json(500, { ok: false, error: saved.error?.message ?? "write_failed" });
    // A new listing forgets the old one's reviews and days: they were another place's.
    await db.from("google_reviews").delete().eq("tenant_id", tenantId);
    await db.from("google_listing_days").delete().eq("tenant_id", tenantId);
    const read = await checkListing(db, saved.data, tz);
    await emitEvent(db, tenantId, "google.linked", "google", "listing", null, { place_id: details.place_id, name: details.name, by: userId, read: read.ok }).catch(() => {});
    log("google_linked", { place_id: details.place_id, read: read.ok });
    return json(200, { ok: true, listing: (await listingNow()) ?? listingForClient(saved.data), read });
  }

  if (op === "connect") {
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code || code.length > 2000) return json(400, { ok: false, error: "code is required" });
    const r = await connectProfile(db, tenantId, userId, code, tz);
    if (!r.ok) {
      log("google_connect_failed", { error: r.error, detail: r.detail?.slice(0, 200) });
      return json(r.error === "no_oauth_client" ? 503 : 502, { ok: false, error: r.error, detail: r.detail });
    }
    log("google_connected", { pending: r.pending, email: r.connection.google_email });
    return json(200, { ok: true, pending: r.pending, connection: connectionForClient(r.connection), ...(r.pending ? { locations: r.locations } : { read: r.read, listing: await listingNow() }) });
  }

  if (op === "draft") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!UUID.test(id)) return json(400, { ok: false, error: "id (the review's row) is required" });
    // The Autonomy row is read here, once, for the dashboard's draft and the sweep's replies alike.
    const mode = await reviewReplyMode(db, tenantId);
    if (mode === "never") return json(409, { ok: false, error: "policy_never", mode });
    const r = await draftFor(db, tenantId, id);
    if (!r.ok) {
      log("google_review_draft_failed", { id, error: r.error });
      return json(r.error === "no_review" ? 404 : r.error === "no_model_key" ? 503 : 502, r);
    }
    log("google_review_drafted", { id, chars: r.text.length });
    return json(200, { ok: true, text: r.text, mode });
  }

  const conn = await db.from("google_connections").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (conn.error) return json(503, { ok: false, error: conn.error.message });

  if (op === "locations") {
    if (!conn.data) return json(404, { ok: false, error: "not_connected" });
    const r = await locationsFor(db, tenantId);
    return json(r.ok ? 200 : 502, r);
  }

  if (op === "choose") {
    if (!conn.data) return json(404, { ok: false, error: "not_connected" });
    const accountName = typeof body.account_name === "string" ? body.account_name.trim() : "";
    const locationName = typeof body.location_name === "string" ? body.location_name.trim() : "";
    if (!/^accounts\/[\w-]{1,64}$/.test(accountName) || !/^locations\/[\w-]{1,64}$/.test(locationName)) return json(400, { ok: false, error: "account_name and location_name are required" });
    // The choice is proven against what the account may manage, never taken on the client's word.
    const r = await locationsFor(db, tenantId);
    if (!r.ok) return json(502, { ok: false, error: r.error });
    const loc = r.locations.find((l) => l.account_name === accountName && l.name === locationName);
    if (!loc) return json(404, { ok: false, error: "no_such_location" });
    const bound = await bindLocation(db, conn.data, loc, userId, tz);
    if (!bound.ok) return json(502, { ok: false, error: bound.error, detail: bound.detail });
    log("google_location_chosen", { location: loc.name, read: bound.read.ok });
    return json(200, { ok: true, connection: connectionForClient(bound.connection), listing: await listingNow(), read: bound.read });
  }

  if (op === "disconnect") {
    const r = await disconnectProfile(db, tenantId);
    log("google_disconnected", { removed: r.removed, revoked: r.revoked });
    return json(200, r);
  }

  if (op === "reply") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const comment = cleanReply(body.comment);
    if (!UUID.test(id)) return json(400, { ok: false, error: "id (the review's row) is required" });
    if (!comment) return json(400, { ok: false, error: "comment is required" });
    const r = await replyOnProfile(db, tenantId, id, comment);
    if (!r.ok) return json(r.error === "not_connected" || r.error === "not_from_profile" ? 409 : r.error === "no_review" ? 404 : 502, r);
    log("google_replied", { id });
    return json(200, r);
  }

  const row = await db.from("google_listings").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (row.error) return json(503, { ok: false, error: row.error.message });

  if (op === "unlink") {
    if (conn.data) await disconnectProfile(db, tenantId);
    if (!row.data) return json(200, { ok: true, removed: false });
    const del = await db.from("google_listings").delete().eq("tenant_id", tenantId);
    if (del.error) return json(500, { ok: false, error: del.error.message });
    await emitEvent(db, tenantId, "google.unlinked", "google", "listing", null, { place_id: row.data.place_id, name: row.data.name, had_profile: !!conn.data }).catch(() => {});
    log("google_unlinked", { place_id: row.data.place_id });
    return json(200, { ok: true, removed: true });
  }

  if (op === "refresh") {
    if (conn.data && conn.data.location_name) {
      const read = await syncProfile(db, conn.data, tz);
      return json(read.ok ? 200 : 502, { ok: read.ok, read, listing: await listingNow(), connection: await connectionNow() });
    }
    if (!row.data) return json(404, { ok: false, error: "no_listing" });
    if (!placesKey()) return json(503, { ok: false, error: "no_places_key" });
    const read = await checkListing(db, row.data, tz);
    return json(read.ok ? 200 : 502, { ok: read.ok, read, listing: await listingNow(), connection: null });
  }

  return json(400, { ok: false, error: "op must be status, search, link, unlink, refresh, connect, locations, choose, disconnect, reply or draft" });
}
