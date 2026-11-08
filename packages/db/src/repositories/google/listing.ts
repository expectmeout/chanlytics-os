/**
 * A workspace's place on Google (google_listings) and its days (google_listing_days), as the edge links, checks and
 * lets them go (decision 0111); the listings due a check are read across workspaces on purpose (platformWide). Each
 * answer is the database's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import { platformWide, tenantDb } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;
type ListingInsert = Database["public"]["Tables"]["google_listings"]["Insert"];
type ListingUpdate = Database["public"]["Tables"]["google_listings"]["Update"];
type DayInsert = Database["public"]["Tables"]["google_listing_days"]["Insert"];

/** The workspace's listing, whole, or none. */
export const findGoogleListing = async (db: Db, tenantId: string) =>
  db.from("google_listings").select("*").eq("tenant_id", tenantId).maybeSingle();

/** The place the workspace's listing is, or none. */
export const findGoogleListingPlace = async (db: Db, tenantId: string) =>
  db.from("google_listings").select("place_id").eq("tenant_id", tenantId).maybeSingle();

/** The workspace's listing saved, one a workspace. */
export const saveGoogleListing = async (db: Db, tenantId: string, row: ListingInsert) =>
  tenantDb(db, tenantId).from("google_listings").upsert(row, { onConflict: "tenant_id" });

/** The workspace's listing saved, one a workspace, and back whole. */
export const saveGoogleListingBack = async (db: Db, tenantId: string, row: ListingInsert) =>
  tenantDb(db, tenantId).from("google_listings").upsert(row, { onConflict: "tenant_id" }).select("*").single();

/** The workspace's listing changed. */
export const patchGoogleListing = async (db: Db, tenantId: string, set: ListingUpdate) =>
  db.from("google_listings").update(set).eq("tenant_id", tenantId);

/** The workspace's listing deleted. */
export const deleteGoogleListing = async (db: Db, tenantId: string) =>
  db.from("google_listings").delete().eq("tenant_id", tenantId);

/** Listings not checked since `before` (never checked first), whichever workspace's: the sweep's page. */
export const listGoogleListingsDue = async (db: Db, before: string, limit: number) =>
  platformWide(db)
    .from("google_listings")
    .select("*")
    .or(`checked_at.is.null,checked_at.lt.${before}`)
    .order("checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

/** One day of the workspace's listing kept, one a day. */
export const saveGoogleListingDay = async (db: Db, tenantId: string, day: Omit<DayInsert, "tenant_id">) =>
  db.from("google_listing_days").upsert({ tenant_id: tenantId, ...day }, { onConflict: "tenant_id,day" });

/** Every day of the workspace's listing deleted: the place they were of is not the workspace's now. */
export const deleteGoogleListingDays = async (db: Db, tenantId: string) =>
  db.from("google_listing_days").delete().eq("tenant_id", tenantId);

/** The workspace's listing changed only while it is still the place `placeId`: the rows written back, none when it moved. */
export const patchGoogleListingAtPlace = async (db: Db, tenantId: string, placeId: string, set: ListingUpdate) =>
  db.from("google_listings").update(set).eq("tenant_id", tenantId).eq("place_id", placeId).select("tenant_id");

/** The workspace's listing's name and address, as Google verified them. */
export const findGoogleListingAddress = async (db: Db, tenantId: string) =>
  db.from("google_listings").select("name, address").eq("tenant_id", tenantId).maybeSingle();

/** The workspace's listing as the Connections page shows it: never Google's facts, which the receptionist reads. */
export const findListingCard = async (db: Db, tenantId: string) =>
  db
    .from("google_listings")
    .select(
      "place_id, name, address, maps_uri, business_status, rating, review_count, linked_at, checked_at, check_error",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();

/** The workspace's listing's name, address and Google's facts. */
export const findGoogleListingFacts = async (db: Db, tenantId: string) =>
  db.from("google_listings").select("name, address, facts").eq("tenant_id", tenantId).maybeSingle();

/** The days of the workspace's listing since `sinceDay`, oldest first: its rating and its count. */
export const listListingDaysSince = async (db: Db, tenantId: string, sinceDay: string) =>
  db
    .from("google_listing_days")
    .select("day, rating, review_count")
    .eq("tenant_id", tenantId)
    .gte("day", sinceDay)
    .order("day", { ascending: true });
