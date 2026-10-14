/**
 * A connected profile that stopped syncing, told to its owner once, and the notice closed when a sync works again or the
 * connection is removed (the wiring's second audit, R11 S11-4). A failure was `sync_error` on the row and a line in the
 * log, and the owner found out by noticing that new reviews had stopped arriving.
 *
 * Told at the first failure when only the owner can mend its cause (`lasting`: Google refused the grant, Vault holds no
 * credentials, the account lost the location), else once the profile has gone contracts GOOGLE_SYNC_TOLD_AFTER_MS
 * without a sync that worked: it is tried every hour while it fails, so a passing outage has cleared by then. A cause
 * that is the platform's (no OAuth client configured) is never the owner's to hear. Once per breakage: the notice is kept
 * under the last sync that worked (notify's onceKey), so the hourly tries find it told, and a breakage after the next
 * good sync is a new one. Best effort: Connections and Setup already say it from the row.
 */
import { GOOGLE_SYNC_NOTICE_WORDS, GOOGLE_SYNC_TOLD_AFTER_MS, type EdgeRefusal } from "../packages/contracts.js";
import { PlacesError } from "../packages/channels.js";
import { mendWarnings, notifyOnce } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import { errField, type Logger } from "../log.js";
import type { ConnectionRow, Db } from "./google-rows.js";

/** Whose a failed sync's cause is: the owner's to mend, a passing one of Google's, or the platform's. */
export type SyncCause = "lasting" | "passing" | "ours";

/** Google's answers to a call it will refuse until someone acts: the grant refused, access to the location gone, the location gone. */
const LASTING_STATUSES: ReadonlySet<number> = new Set([401, 403, 404]);

/** The cause of a token tokenFor could not give: no credentials, or a refresh Google refused for good, is the owner's. */
export function causeOfToken(r: EdgeRefusal): SyncCause {
  if (r.error === "no_oauth_client") return "ours";
  if (r.error === "no_credentials") return "lasting";
  return r.error === "no_token" && /^invalid_grant\b/u.test(r.detail ?? "") ? "lasting" : "passing";
}

/** The cause of a read of the reviews that failed: a refusal Google will repeat is the owner's, the rest pass. */
export function causeOfRead(e: unknown): SyncCause {
  return e instanceof PlacesError && LASTING_STATUSES.has(e.status) ? "lasting" : "passing";
}

/** Where the notice opens: Connections, where the profile is reconnected. */
const CONNECTIONS_ROUTE = "admin/integrations";

/** The owner told that the profile stopped syncing, once per breakage, when the breakage is lasting (see the header). */
export async function tellSyncStopped(
  db: Db,
  conn: ConnectionRow,
  f: { cause: SyncCause; now: Date; L: Logger },
): Promise<void> {
  if (f.cause === "ours") return;
  // The last sync that worked, or the connect when none has: the breakage is counted from it, and kept under it.
  const lastGood = conn.last_synced_at ?? conn.connected_at;
  const nowMs = f.now.getTime();
  if (f.cause === "passing" && nowMs - Date.parse(lastGood) < GOOGLE_SYNC_TOLD_AFTER_MS) return;
  try {
    const addressing = await loadTenantNotifications(db, conn.tenant_id);
    // Who to tell could not be read: not "nobody". The next hour's failure asks again.
    if (addressing.unread) return;
    await notifyOnce(
      { tenantId: conn.tenant_id, ...addressing },
      {
        kind: "sweep",
        route: CONNECTIONS_ROUTE,
        about: { type: "google_connection", id: conn.tenant_id },
        subject: GOOGLE_SYNC_NOTICE_WORDS.title,
        body: GOOGLE_SYNC_NOTICE_WORDS.body({
          lasting: f.cause === "lasting",
          lastSyncedMs: conn.last_synced_at ? Date.parse(conn.last_synced_at) : null,
          nowMs,
        }),
        redactedBody: "A workspace's Google Business Profile stopped syncing.",
        onceKey: `google_sync_stopped:${conn.tenant_id}:${lastGood}`,
      },
      { db },
    );
  } catch (e) {
    f.L.error("google_sync_notice_failed", { error: errField(e) });
  }
}

/**
 * A sync that worked, or a connection removed: the notice of its breakage closes (contracts NOTICE_MENDS). Asked after a
 * sync only where one could be open: the row said it was failing, or this is the first sync since a (re)connect, which
 * clears the row's error before it syncs.
 */
export async function syncMended(
  db: Db,
  tenantId: string,
  change: "google_connection.synced" | "google_connection.removed",
): Promise<void> {
  await mendWarnings(db, { tenantId, by: { change }, subject: null, keptId: null });
}
