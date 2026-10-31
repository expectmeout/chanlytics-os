/**
 * What was brought in (decision 0073, 00477; 0086, 00499): the imports ledger, one row a mailbox for what a mailbox
 * brings (its mail, its contacts) and one a workspace for every other source. Read under the member's own session (RLS:
 * members read their workspace's), for Setup, Today and Connections; written through the one door
 * (`import_ledger_note`), by the jobs on the service role and by the clients' file import on the member's. Every read
 * on a workspace's table goes through `tenantDb`, so none can reach another workspace's row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";
import { tenantDb } from "../../tenant-db";

type Db = SupabaseClient<Database>;

/** One source's row, as the page reads it (contracts imports/ledger.ts ImportRowDto). */
export interface ImportLedgerRow {
  source: string;
  /** The mailbox it came through; null for a workspace's own source, and for a row from before a mailbox took it. */
  connection_id: string | null;
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

/** The workspace's ledger, every row it holds: a source's, or a mailbox's of a source. */
export async function importsOf(db: Db, tenantId: string): Promise<ImportLedgerRow[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("imports")
    .select(
      "source, connection_id, state, counts, parts_done, parts_total, oldest, started_at, finished_at, last_error, via",
    );
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
  /** The mailbox it comes through, for what a mailbox brings (contracts PER_MAILBOX_SOURCES); else none. */
  connectionId?: string | null;
  /** The run writing (0086): a write of a run the row is no longer held by changes nothing. */
  run?: string | null;
  /** This write takes the row for its run: a start, or Stop (which takes it from every run). */
  take?: boolean;
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
    p_connection_id: n.connectionId ?? undefined,
    p_run: n.run ?? undefined,
    p_take: n.take ?? undefined,
  });
  if (error) throw new Error(error.message);
}

/** A row as a part reads it before it reads on: where it stands, the run that holds it and its job's place. */
export interface ImportRunRow {
  state: string;
  run: string | null;
  last_error: string | null;
  job_cursor: Json | null;
}

/** The mailbox a row's cursor names, as the parts write it; null where it names none. */
const namedIn = (cursor: unknown): unknown =>
  cursor && typeof cursor === "object" && !Array.isArray(cursor)
    ? (cursor as Record<string, unknown>).connection
    : null;

/**
 * A source's row, as the part that reads it next finds it: the mailbox's own (for what a mailbox brings), else the row
 * an earlier ledger kept for the workspace that import_ledger_note hands the mailbox as it next writes (its cursor names
 * this mailbox, or it is still going and names none); the workspace's for every other source. Null before it ran.
 */
export async function importRowOf(
  db: Db,
  tenantId: string,
  source: string,
  connectionId: string | null = null,
): Promise<ImportRunRow | null> {
  const q = tenantDb(db, tenantId)
    .from("imports")
    .select("connection_id, state, run, last_error, job_cursor")
    .eq("source", source);
  const { data, error } = await (connectionId
    ? q.or(`connection_id.eq.${connectionId},connection_id.is.null`)
    : q.is("connection_id", null));
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const kept = rows.find((r) => r.connection_id === null);
  const named = kept ? namedIn(kept.job_cursor) : null;
  const handed =
    kept && (named === connectionId || (!named && (kept.state === "queued" || kept.state === "running"))) ? kept : null;
  const own = connectionId ? (rows.find((r) => r.connection_id === connectionId) ?? handed) : rows[0];
  return own
    ? {
        state: own.state,
        run: own.run,
        last_error: own.last_error,
        job_cursor: own.job_cursor ?? null,
      }
    : null;
}

/** Where a source's job stands (its cursor), for the job that picks it up again; null before it ran. */
export async function importCursorOf(
  db: Db,
  tenantId: string,
  source: string,
  connectionId: string | null = null,
): Promise<Json | null> {
  return (await importRowOf(db, tenantId, source, connectionId))?.job_cursor ?? null;
}
