/**
 * What the Business Profile and the website say (decision 0073, 00479 business_reads): one row per workspace and source,
 * offered at the first run's Check. Read under the member's own session (RLS: members read their workspace's); written by
 * the edge on the service role, the newest read standing whole.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";
import { tenantDb } from "../../tenant-db";

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
export async function businessReadsOf(db: Db, tenantId: string): Promise<BusinessReadRow[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("business_reads")
    .select("source, facts, read_from, read_at, error");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** A source's read kept whole (the service role's): what it found, from where, or why it could not be read. */
export async function keepBusinessRead(
  db: Db,
  r: {
    tenantId: string;
    source: "google_profile" | "website";
    facts: Json;
    readFrom: string | null;
    error: string | null;
  },
): Promise<void> {
  const { error } = await db.from("business_reads").upsert(
    {
      tenant_id: r.tenantId,
      source: r.source,
      facts: r.facts,
      read_from: r.readFrom,
      read_at: new Date().toISOString(),
      error: r.error ? r.error.slice(0, 300) : null,
    },
    { onConflict: "tenant_id,source" },
  );
  if (error) throw new Error(`business_reads: ${error.message}`);
}

/**
 * The linked listing's stored facts (google_listings.facts), for the Business Profile's details to go where the public
 * listing's do (decision 0073, R17); null with no listing linked. Service role.
 */
export async function listingFactsStored(db: Db, tenantId: string): Promise<Json | null> {
  const { data, error } = await tenantDb(db, tenantId).from("google_listings").select("facts").maybeSingle();
  if (error) throw new Error(`google_listings: ${error.message}`);
  return data ? (data.facts ?? null) : null;
}

/** The place the workspace's listing is linked to (google_listings.place_id), when one is: what the owner said was theirs. */
export async function linkedPlaceOf(db: Db, tenantId: string): Promise<string | null> {
  const { data, error } = await tenantDb(db, tenantId).from("google_listings").select("place_id").maybeSingle();
  if (error) throw new Error(`google_listings: ${error.message}`);
  return data?.place_id ?? null;
}
