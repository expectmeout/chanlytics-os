/**
 * What the ops door reads about the database itself, as the service role: which migration it has applied. A read that
 * fails throws, with the database's own words, so the door can say what it could not read.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Db = SupabaseClient<Database>;

/** The newest migration a database has applied (null before any) and how many it holds. */
export interface MigrationHead {
  head: string | null;
  applied: number;
}

/**
 * `migration_head()`, over the CLI's ledger, which PostgREST cannot read: a release compares this head with main's
 * (docs/runbook.md, Deploy). A database the function has not reached yet refuses, and that refusal is thrown as it was
 * worded.
 */
export async function migrationHead(db: Db): Promise<MigrationHead> {
  const { data, error } = await db.rpc("migration_head");
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return { head: row?.head ?? null, applied: row?.applied ?? 0 };
}
