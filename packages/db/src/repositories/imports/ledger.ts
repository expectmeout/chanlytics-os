/**
 * What was brought in (decision 0073, 00477): the imports ledger, one row per workspace and source. Read under the
 * member's own session (RLS: members read their workspace's), for Setup, Today and Connections; written through the one
 * door (`import_ledger_note`), by the jobs on the service role and by the clients' file import on the member's.
 * Every read on a workspace's table goes through `tenantDb`, so none can reach another workspace's row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";
import { tenantDb } from "../../tenant-db";

type Db = SupabaseClient<Database>;

/** One source's row, as the page reads it (contracts imports/ledger.ts ImportRowDto). */
export interface ImportLedgerRow {
  source: string;
  state: string;
  counts: Record<string, number>;
  parts_done: number;
  parts_total: number | null;
  oldest: string | null;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  via: string | null;
}

/** The counts as numbers: a key the row holds that is not a number is left out, never read as zero. */
function ledgerCountsOf(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out;
}

/** The workspace's ledger, every source it holds. */
export async function importsOf(db: Db, tenantId: string): Promise<ImportLedgerRow[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("imports")
    .select("source, state, counts, parts_done, parts_total, oldest, started_at, finished_at, last_error, via");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, counts: ledgerCountsOf(r.counts) }));
}

/** A run's state, written: counts added to what came before (`add`) or set whole; its parts, reach, cursor and error. */
export interface ImportNote {
  tenantId: string;
  source: string;
  state: "queued" | "running" | "done" | "failed";
  counts?: Record<string, number>;
  add?: boolean;
  partsDone?: number | null;
  partsTotal?: number | null;
  oldest?: string | null;
  via?: string | null;
  error?: string | null;
  cursor?: Json | null;
}

export async function noteImport(db: Db, n: ImportNote): Promise<void> {
  const { error } = await db.rpc("import_ledger_note", {
    p_tenant_id: n.tenantId,
    p_source: n.source,
    p_state: n.state,
    p_counts: (n.counts ?? {}) as Json,
    p_add: n.add ?? false,
    p_parts_done: n.partsDone ?? undefined,
    p_parts_total: n.partsTotal ?? undefined,
    p_oldest: n.oldest ?? undefined,
    p_via: n.via ?? undefined,
    p_error: n.error ?? undefined,
    p_cursor: n.cursor ?? undefined,
  });
  if (error) throw new Error(error.message);
}

/** Where a source's job stands (its cursor), for the job that picks it up again; null before it ran. */
export async function importCursorOf(db: Db, tenantId: string, source: string): Promise<Json | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("imports")
    .select("job_cursor, state")
    .eq("source", source)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.job_cursor as Json | null) ?? null;
}
