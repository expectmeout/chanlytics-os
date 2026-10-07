/**
 * The migrations line of the diag report: the newest migration the database has applied and how many, read through
 * packages/db's `migrationHead`. A database the function has not reached yet refuses, and the report says so in this
 * line's own words rather than failing whole.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { migrationHead } from "../packages/db.js";
import type { Database, MigrationHead } from "../packages/db.js";

type MigrationsLine = MigrationHead | { error: string };

export async function migrationsLine(db: SupabaseClient<Database>): Promise<MigrationsLine> {
  try {
    return await migrationHead(db);
  } catch (e) {
    return { error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }
}
