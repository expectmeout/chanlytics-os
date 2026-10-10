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

/** One workspace's day, as the targets read it (decision 0031, invariant 12): the numbers the platform is paged on. */
export interface PlatformDayPromises {
  tenant_id: string;
  name: string;
  brain_p95_ms: number | null;
  job_lag_ms: Record<string, number> | null;
  duplicate_sends: number | null;
  dead_letters: Record<string, number> | null;
  relay_lag_ms: number | null;
  intake_lag_ms: Record<string, number> | null;
}

/**
 * The rollup's day for every workspace that worked in it, with the workspace's name: what the health sweep holds to
 * contracts' PLATFORM_NUMBERS once a day. A read that fails throws, with the database's words.
 */
export async function platformDay(db: Db, day: string): Promise<PlatformDayPromises[]> {
  const { data, error } = await db
    .from("platform_metrics")
    .select("tenant_id, brain_p95_ms, job_lag_ms, duplicate_sends, dead_letters, relay_lag_ms, intake_lag_ms")
    .eq("day", day);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  // The workspaces' names, for the page: a second read, by the ids the day holds.
  const ids = [...new Set(rows.map((r) => r.tenant_id))];
  const names = new Map<string, string>();
  if (ids.length) {
    const t = await db.from("tenants").select("id, name").in("id", ids);
    if (t.error) throw new Error(t.error.message);
    for (const w of t.data ?? []) names.set(w.id, w.name);
  }
  return rows.map((r) => ({
    ...r,
    name: names.get(r.tenant_id) ?? r.tenant_id,
    job_lag_ms: r.job_lag_ms as Record<string, number> | null,
    dead_letters: r.dead_letters as Record<string, number> | null,
    intake_lag_ms: r.intake_lag_ms as Record<string, number> | null,
  }));
}
