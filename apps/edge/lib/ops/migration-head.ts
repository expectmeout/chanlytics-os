/**
 * The migrations line of the diag report: the newest migration the database has applied and how many, read through
 * packages/db's `migrationHead`. A database the function has not reached yet refuses, and the report says so in this
 * line's own words rather than failing whole.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMigrationHead } from "@chanlytics/db/console";
import type { Database } from "@chanlytics/db/types";
import type { MigrationHead } from "@chanlytics/db/console";

type MigrationsLine = MigrationHead | { error: string };

export async function getMigrationsLine(db: SupabaseClient<Database>): Promise<MigrationsLine> {
  try {
    return await getMigrationHead(db);
  } catch (e) {
    return { error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }
}
