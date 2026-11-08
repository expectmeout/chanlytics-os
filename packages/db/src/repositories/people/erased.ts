/**
 * The tombstones a person erased leaves (decision 0111): a phone's or an address's digest on the erased row, with
 * when it was erased and since when it was being erased. Each answer is the database's as it came; the caller says a
 * failure in its words ("we could not check" is not "nobody").
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** The workspace's erased people among these phones' digests. */
export const listErasedByPhone = async (db: Db, tenantId: string, hashes: string[]) =>
  db
    .from("contacts")
    .select("erased_phone_hash, erased_at, erasing_since")
    .eq("tenant_id", tenantId)
    .in("erased_phone_hash", hashes);

/** The workspace's erased people at this address's digest. */
export const listErasedByEmail = async (db: Db, tenantId: string, digest: string) =>
  db.from("contacts").select("erased_at, erasing_since").eq("tenant_id", tenantId).eq("erased_email_hash", digest);
