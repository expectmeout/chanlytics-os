/**
 * Try again, on a source that stopped (decision 0073, R23; POST /api/admin/imports/again): the source starts again from
 * where it stopped, through the connection it was read through, else the workspace's mailbox that reads it now (the
 * calendar's grant, or the newest mailbox connected). What a mailbox brings is each mailbox's own row (0086): every one
 * of the source that stopped starts again, each through its own mailbox; a row an earlier ledger kept for the
 * workspace, through the mailbox its cursor names. The clients' file is the browser's: it is added again from People,
 * never here. A source this deployment brings in no other way is refused by name.
 */
import { IMPORT_SOURCES, UUID, parseTenantConfig, type ImportSource } from "../packages/contracts.js";
import {
  getTenantConfig,
  importCursorOf,
  importsOf,
  mailboxConnectionsOf,
  type ImportLedgerRow,
  type Json,
} from "../packages/db.js";
import { json, refuse } from "../http.js";
import { pg } from "../pg.js";
import { workspaceFor, type Admitted } from "../admin-auth.js";
import { errField, logger } from "../log.js";
import { startHistory } from "./history-import.js";

/** The sources a mailbox brings, which Try again starts again here. */
const THROUGH_A_MAILBOX: readonly ImportSource[] = ["mailbox", "contacts", "calendar"];

/** The connection a cursor names (the parts write it there), or null. */
function connectionIn(cursor: Json | null): string | null {
  const c = cursor && typeof cursor === "object" && !Array.isArray(cursor) ? (cursor as Record<string, unknown>) : null;
  return typeof c?.connection === "string" && UUID.test(c.connection) ? c.connection : null;
}

export async function importAgain(
  auth: Admitted,
  body: Partial<{ tenant_id: string; user_id: string; source: string }>,
): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const source = body.source;
  if (typeof source !== "string" || !(IMPORT_SOURCES as readonly string[]).includes(source))
    return refuse(400, "bad_request", "source is one of the imports ledger's sources");
  if (!THROUGH_A_MAILBOX.includes(source as ImportSource))
    return refuse(409, "unavailable", "this source is brought in again where it was first brought in");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const L = logger({ tenant_id: tenantId });
  try {
    const rows = (await importsOf(db, tenantId)).filter((r) => r.source === source);
    if (!rows.length) return refuse(404, "not_found", "nothing of this source was brought in");
    const stopped = rows.filter((r) => r.state === "failed");
    const cfg = parseTenantConfig((await getTenantConfig(db, tenantId))?.config ?? null);
    const live = (await mailboxConnectionsOf(db, tenantId)).filter((m) => m.state !== "removed");
    // A mailbox's own row, through that mailbox; the workspace's, through the one its cursor names while it is still
    // connected, else the calendar's grant, else the newest mailbox.
    const throughOf = async (row: ImportLedgerRow): Promise<string | null> => {
      const named = row.connection_id ?? connectionIn(await importCursorOf(db, tenantId, source));
      const granted = source === "calendar" ? (cfg?.calendar_grant?.mailbox_id ?? null) : null;
      const newest = row.connection_id ? null : (live[live.length - 1]?.id ?? null);
      return [named && live.some((m) => m.id === named) ? named : null, granted, newest].find((c) => !!c) ?? null;
    };
    let started = 0;
    for (const row of stopped.length ? stopped : rows.slice(0, 1)) {
      const connection = await throughOf(row);
      if (!connection) continue;
      await startHistory(db, {
        tenantId,
        source: source as ImportSource,
        connectionId: connection,
        via: row.via,
        again: true,
      });
      started++;
    }
    if (!started) return refuse(409, "not_connected", "no mailbox is connected to read it through");
    return json(200, { ok: true });
  } catch (e) {
    L.error("history_start_failed", { source, error: errField(e) });
    return refuse(502, "could_not_queue", "it could not be started again");
  }
}
