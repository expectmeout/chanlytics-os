/**
 * What the Business Profile and the website say (decision 0073, 00479 business_reads): one row per workspace and source,
 * offered at the first run's Check. Read under the member's own session (RLS: members read their workspace's); written by
 * the edge on the service role, the newest read standing whole.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import { tenantDb } from "../../shared/tenant-db";
import {
  BUSINESS_READ_SOURCES,
  businessReadFactsOf,
  type BusinessReadSource,
  type TenantId,
} from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** One source's read, as the row holds it. */
export interface BusinessReadRow {
  source: string;
  facts: Json;
  read_from: string | null;
  read_at: string;
  error: string | null;
}

/** The workspace's reads, every source it holds. */
export async function listBusinessReads(db: Db, tenantId: TenantId): Promise<BusinessReadRow[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("business_reads")
    .select("source, facts, read_from, read_at, error");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * What the reads say the business does (their `description`), the Google profile's before the website's, as Check offers
 * them (contracts foundOf): the two sources sort that way by their names. Null where neither says, a read that failed
 * among them: it keeps no facts.
 */
export async function findBusinessDescription(
  db: Db,
  tenantId: TenantId,
): Promise<{ text: string; source: BusinessReadSource } | null> {
  const { data, error } = await tenantDb(db, tenantId).from("business_reads").select("source, facts").order("source");
  if (error) throw new Error(`cannot read what the business's reads say: ${error.message}`);
  for (const row of data) {
    const text = businessReadFactsOf(row.facts).description;
    const source = BUSINESS_READ_SOURCES.find((s) => s === row.source);
    if (text && source) return { text, source };
  }
  return null;
}

/** A source's read kept whole (the service role's): what it found, from where, or why it could not be read. */
export async function keepBusinessRead(
  db: Db,
  row: {
    tenantId: TenantId;
    source: "google_profile" | "website";
    facts: Json;
    readFrom: string | null;
    error: string | null;
  },
): Promise<void> {
  const { error } = await db.from("business_reads").upsert(
    {
      tenant_id: row.tenantId,
      source: row.source,
      facts: row.facts,
      read_from: row.readFrom,
      read_at: new Date().toISOString(),
      error: row.error ? row.error.slice(0, 300) : null,
    },
    { onConflict: "tenant_id,source" },
  );
  if (error) throw new Error(`business_reads: ${error.message}`);
}

/**
 * The linked listing's stored facts (google_listings.facts), for the Business Profile's details to go where the public
 * listing's do (decision 0073, R17); null with no listing linked. Service role.
 */
export async function findListingFactsStored(db: Db, tenantId: TenantId): Promise<Json | null> {
  const { data, error } = await tenantDb(db, tenantId).from("google_listings").select("facts").maybeSingle();
  if (error) throw new Error(`google_listings: ${error.message}`);
  return data ? (data.facts ?? null) : null;
}

/**
 * The workspace's listing row changed with what a read of it says: the public listing's (the edge's listing-check.ts: its
 * rating, its count, its facts, or why it could not be read) and the owner's own profile's details where they are
 * connected (profile-details.ts). Service role.
 */
export async function patchListing(
  db: Db,
  tenantId: TenantId,
  patch: Database["public"]["Tables"]["google_listings"]["Update"],
): Promise<void> {
  const { error } = await tenantDb(db, tenantId).from("google_listings").update(patch);
  if (error) throw new Error(`google_listings: ${error.message}`);
}

/** The place the workspace's listing is linked to (google_listings.place_id), when one is: what the owner said was theirs. */
export async function findLinkedPlace(db: Db, tenantId: TenantId): Promise<string | null> {
  const { data, error } = await tenantDb(db, tenantId).from("google_listings").select("place_id").maybeSingle();
  if (error) throw new Error(`google_listings: ${error.message}`);
  return data?.place_id ?? null;
}
