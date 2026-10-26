/**
 * Try again, on a source that stopped (decision 0073, R23; POST /api/admin/imports/again): the source starts again from
 * where it stopped, through the connection it was read through (its cursor names it), else the workspace's mailbox
 * that reads it now (the calendar's grant, or the newest mailbox connected). The clients' file is the browser's: it is
 * added again from People, never here. A source this deployment brings in no other way is refused by name.
 */
import { IMPORT_SOURCES, UUID, parseTenantConfig, type ImportSource } from "../packages/contracts.js";
import { getTenantConfig, importCursorOf, importsOf, mailboxConnectionsOf, type Json } from "../packages/db.js";
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
    const row = (await importsOf(db, tenantId)).find((r) => r.source === source) ?? null;
    if (!row) return refuse(404, "not_found", "nothing of this source was brought in");
    const cfg = parseTenantConfig((await getTenantConfig(db, tenantId))?.config ?? null);
    const live = (await mailboxConnectionsOf(db, tenantId)).filter((m) => m.state !== "removed");
    const named = connectionIn(await importCursorOf(db, tenantId, source));
    // The one its cursor names while it is still connected, else the calendar's grant, else the newest mailbox.
    const granted = source === "calendar" ? (cfg?.calendar_grant?.mailbox_id ?? null) : null;
    const newest = live[live.length - 1]?.id ?? null;
    const connection =
      [named && live.some((m) => m.id === named) ? named : null, granted, newest].find((c): c is string => !!c) ?? null;
    if (!connection) return refuse(409, "not_connected", "no mailbox is connected to read it through");
    await startHistory(db, {
      tenantId,
      source: source as ImportSource,
      connectionId: connection,
      via: row.via,
      again: true,
    });
    return json(200, { ok: true });
  } catch (e) {
    L.error("history_start_failed", { source, error: errField(e) });
    return refuse(502, "could_not_queue", "it could not be started again");
  }
}
