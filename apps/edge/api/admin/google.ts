/**
 * POST /api/admin/google — a workspace's listing on Google Maps, found and
 * read. Diagnostic-key only; the dashboard's /api/v1/google verbs call it
 * for an owner or an operator.
 *
 *   { op: "status" }                                → may this deployment look listings up
 *   { op: "search", query }                         → what Google finds for the words
 *   { op: "link", tenant_id, user_id, place_id }    → the listing on record, read at once
 *   { op: "unlink", tenant_id }                     → the listing, its reviews and its days, gone
 *   { op: "refresh", tenant_id }                    → read it now
 *
 * The key lives here and nowhere else. Without it every op but status says
 * so, and the dashboard draws nothing — no row, no section, no card.
 */
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { emitEvent } from "../../lib/workspace/db.js";
import { PLACE_ID } from "../../lib/workspace/channels.js";
import { checkListing, findPlaces, googleReadiness, listingForClient, placesKey, readPlace } from "../../lib/google.js";

interface Body {
  op?: string;
  tenant_id?: string;
  user_id?: string;
  place_id?: string;
  query?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const config = { maxDuration: 30 };

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  let body: Body = {};
  try { body = JSON.parse(await request.text()); } catch { /* validated below */ }
  const op = typeof body.op === "string" ? body.op : "";

  if (op === "status") return json(200, { ok: true, ready: googleReadiness() });
  const key = placesKey();
  if (!key) return json(503, { ok: false, error: "no_places_key", hint: "GOOGLE_PLACES_API_KEY on the edge, a key with Places API (New) enabled" });

  if (op === "search") {
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
  const log = (event: string, extra: Record<string, unknown> = {}) => console.log(event, JSON.stringify({ tenant: tenantId, ...extra }));

  if (op === "link") {
    const placeId = typeof body.place_id === "string" ? body.place_id.trim() : "";
    const userId = typeof body.user_id === "string" && UUID.test(body.user_id) ? body.user_id : null;
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
    const after = await db.from("google_listings").select("*").eq("tenant_id", tenantId).single();
    await emitEvent(db, tenantId, "google.linked", "google", "listing", null, { place_id: details.place_id, name: details.name, by: userId, read: read.ok }).catch(() => {});
    log("google_linked", { place_id: details.place_id, read: read.ok });
    return json(200, { ok: true, listing: after.data ? listingForClient(after.data) : listingForClient(saved.data), read });
  }

  const row = await db.from("google_listings").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (row.error) return json(503, { ok: false, error: row.error.message });

  if (op === "unlink") {
    if (!row.data) return json(200, { ok: true, removed: false });
    const del = await db.from("google_listings").delete().eq("tenant_id", tenantId);
    if (del.error) return json(500, { ok: false, error: del.error.message });
    await emitEvent(db, tenantId, "google.unlinked", "google", "listing", null, { place_id: row.data.place_id, name: row.data.name }).catch(() => {});
    log("google_unlinked", { place_id: row.data.place_id });
    return json(200, { ok: true, removed: true });
  }

  if (op === "refresh") {
    if (!row.data) return json(404, { ok: false, error: "no_listing" });
    const read = await checkListing(db, row.data, tz);
    const after = await db.from("google_listings").select("*").eq("tenant_id", tenantId).single();
    return json(read.ok ? 200 : 502, { ok: read.ok, read, listing: after.data ? listingForClient(after.data) : null });
  }

  return json(400, { ok: false, error: "op must be status, search, link, unlink or refresh" });
}
