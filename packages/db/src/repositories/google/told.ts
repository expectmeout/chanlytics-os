/**
 * Google's changes that are on the ledger, each through the door that makes it and writes its event in the change's
 * transaction (00722): a profile's connect finished and its disconnect, a listing linked and unlinked, a read's
 * reviews kept, a profile's sync stamped, a review answered. Each answer is the database's as it came; the caller says
 * a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;
type ReviewInsert = Database["public"]["Tables"]["google_reviews"]["Insert"];

/** A connect finished: its token kept in Vault, and google.connected with what it found (google_connect_finish). */
export const finishGoogleConnect = async (
  db: Db,
  tenantId: TenantId,
  secret: Json,
  event: { email: string | null; accounts: number; locations: number; on_maps: number; by: string | null },
) => db.rpc("google_connect_finish", { p_tenant_id: tenantId, p_secret: secret, p_told: event });

/**
 * A disconnect: the profile's reviews and the connection's row gone, with google.disconnected
 * (google_connection_remove). False where there was no connection. The token leaves Vault first.
 */
export const removeGoogleConnection = async (
  db: Db,
  tenantId: TenantId,
  event: { email: string | null; location: string | null; revoked: boolean; by: string | null },
) => db.rpc("google_connection_remove", { p_tenant_id: tenantId, p_told: event });

/** What a link writes of a place: Google's public read of it. */
export interface ListingLinked {
  place_id: string;
  name: string;
  address: string | null;
  maps_uri: string | null;
  new_review_uri: string | null;
  business_status: string | null;
  facts: Json;
  linked_at: string;
}

/**
 * A listing linked (google_listing_link): the workspace's one listing written from the read, its counts and its check
 * started again, the last place's reviews and days forgotten, with google.linked.
 */
export const linkGoogleListing = async (db: Db, tenantId: TenantId, row: ListingLinked, by: string | null) =>
  db.rpc("google_listing_link", { p_tenant_id: tenantId, p_row: { ...row }, ...(by ? { p_by: by } : {}) });

/** A listing unlinked, with google.unlinked (google_listing_unlink). False where there was none. */
export const unlinkGoogleListing = async (db: Db, tenantId: TenantId, hadProfile: boolean, by: string | null) =>
  db.rpc("google_listing_unlink", { p_tenant_id: tenantId, p_had_profile: hadProfile, ...(by ? { p_by: by } : {}) });

/** What a read says of the reviews it found: google.reviews. */
export interface ReviewsRead {
  source: "places" | "profile";
  fresh: number;
  counted: number;
  rating: number | null;
  review_count: number | null;
}

/**
 * The reviews a read listed, each written over its row (google_reviews_keep): a row keeps its first sighting, and only a
 * read that carries a reply writes one. With `told`, google.reviews in the same transaction.
 */
export const keepGoogleReviews = async (db: Db, tenantId: TenantId, rows: ReviewInsert[], event?: ReviewsRead) =>
  db.rpc("google_reviews_keep", {
    p_tenant_id: tenantId,
    p_reviews: rows.map((row) => ({ ...row })),
    ...(event ? { p_told: { ...event } } : {}),
  });

/**
 * A profile's sync stamped (google_profile_synced): synced, no error, whether its reviews are whole. With `told`, the new
 * reviews' google.reviews in the stamp's transaction. False where the connection is gone.
 */
export const stampGoogleProfileSync = async (
  db: Db,
  tenantId: TenantId,
  sync: { synced_at: string; complete: boolean },
  event?: ReviewsRead,
) =>
  db.rpc("google_profile_synced", {
    p_tenant_id: tenantId,
    p_synced_at: sync.synced_at,
    p_complete: sync.complete,
    ...(event ? { p_told: { ...event } } : {}),
  });

/** What a reply says on the ledger: google.replied. */
export interface ReviewReplied {
  review_id: string;
  chars: number;
  by?: "receptionist";
  usage?: Json;
}

/**
 * A review answered (google_review_replied): its reply on its row and what it held cleared, with google.replied. False
 * where the row is gone.
 */
export const markGoogleReviewReplied = async (
  db: Db,
  tenantId: TenantId,
  rowId: string,
  reply: { reply_text: string | null; replied_at: string | null },
  event: ReviewReplied,
) =>
  db.rpc("google_review_replied", {
    p_tenant_id: tenantId,
    p_id: rowId,
    ...(reply.reply_text === null ? {} : { p_reply_text: reply.reply_text }),
    ...(reply.replied_at === null ? {} : { p_replied_at: reply.replied_at }),
    p_told: { ...event },
  });
