/**
 * The two rows a workspace keeps for Google, its listing and its profile's
 * connection: their types, the connection read, and what of each the
 * dashboard may see. The other modules in this folder take these types, and
 * `Db`, from here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";

export type ListingRow = Database["public"]["Tables"]["google_listings"]["Row"];
export type ConnectionRow = Database["public"]["Tables"]["google_connections"]["Row"];
type Db = SupabaseClient<Database>;

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

async function connectionOf(db: Db, tenantId: string): Promise<ConnectionRow | null> {
  const { data, error } = await db.from("google_connections").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export { connectionOf, type Db };
