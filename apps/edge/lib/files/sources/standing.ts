/**
 * A watched folder made ready for a job, or set down as what it is (the footage sources plan, P2). Every walk and
 * every read starts here: the folder's row, its account, and an hour's key. One that may not be read is not read, and
 * its row says why in the owner's words:
 *
 *   paused   its account needs a reconnect (Google refused the grant), or whoever connected it left the workspace
 *            (the plan's D13: the key reads a departed person's whole Drive, so it does not keep working). What came
 *            in stays, and a reconnect of the account resumes it.
 *   frozen   the folder itself cannot be read. Nothing is marked gone on that word alone, and no re-walk runs while it
 *            is frozen; it is asked after at the quiet floor and thaws by itself.
 *
 * Google giving no answer is neither: the job throws and the ledger tries it again.
 */
import { driveSource, SourceKeyRefused, type DriveSource } from "@chanlytics/channels/files";
import type { FolderStoppedWhy, SchemaSet, SourceFolder, TenantId } from "@chanlytics/contracts";
import {
  findMediaSource,
  findSourceConnection,
  isStillMember,
  listMediaSourcesOfConnection,
  patchMediaSource,
  patchSourceConnection,
  type MediaSourceRow,
  type SourceConnectionRow,
  type SourceRef,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "../../shared/log.js";
import { getSourceToken } from "./credentials.js";
import { SOURCE_PACE } from "./pace.js";

type Db = SupabaseClient<Database>;
type SourceState = SchemaSet<"media_sources.state">;

/** The states a folder is read in, one way or another: what a pause or a freeze may take it from. */
const READ_STATES = ["setting_up", "watching", "frozen"] as const satisfies readonly SourceState[];

/** No walk in flight: what a folder that stops being read is left with. */
const NO_WALK = { walk_kind: null, walk_started_at: null, walk_touched_at: null } as const;

/**
 * A folder ready for a job: its rows, an hour's key for its account, the provider that reads it, and what the job
 * has spent at the provider so far, in its units.
 */
export interface OpenSource {
  db: Db;
  ref: SourceRef;
  source: MediaSourceRow;
  connection: SourceConnectionRow;
  token: string;
  folder: SourceFolder;
  drive: DriveSource;
  spent: { units: number };
  log: Logger;
}

/** Whose a folder that will not open is to mend: its account's (signed out, its connector gone) or the folder's own. */
export type SourceClosedBy = "account" | "folder";

type Opened = { ok: true; open: OpenSource } | { ok: false; skipped: string; cause: SourceClosedBy };

/** A folder as its provider knows it, from its row. */
const folderOf = (source: MediaSourceRow): SourceFolder => ({
  id: source.folder_id,
  name: source.folder_name,
  driveId: source.drive_id,
});

/** One folder paused: nothing is read until its account is connected again, and its row says why, as one word. */
async function pauseSource(db: Db, source: MediaSourceRow, cause: FolderStoppedWhy, at: Date): Promise<void> {
  await patchMediaSource(db, {
    tenantId: source.tenant_id,
    id: source.id,
    from: READ_STATES,
    patch: { state: "paused", stopped_why: cause, last_error_at: at.toISOString(), next_read_at: null, ...NO_WALK },
  });
}

/** Every folder an account reads, paused: its grant is gone, or whoever connected it left. */
async function pauseSourcesOf(
  db: Db,
  connection: SourceConnectionRow,
  cause: FolderStoppedWhy,
  at: Date,
): Promise<number> {
  const sources = await listMediaSourcesOfConnection(db, connection.tenant_id, connection.id);
  const reading = sources.filter((source) => READ_STATES.some((state) => state === source.state));
  for (const source of reading) await pauseSource(db, source, cause, at);
  return reading.length;
}

/** The account signed out by Google: it needs a reconnect, and its folders pause. Nothing in the Library changes. */
export async function markSourceSignedOut(
  db: Db,
  connection: SourceConnectionRow,
  log: Logger,
  at = new Date(),
): Promise<void> {
  await patchSourceConnection(db, {
    tenantId: connection.tenant_id,
    id: connection.id,
    patch: { health: "needs_reconnect" },
  });
  const paused = await pauseSourcesOf(db, connection, "signed_out", at);
  log.warn("source_paused", { connection: connection.id, reason: "signed_out", folders: paused });
}

/**
 * A key its provider refused, settled before anything is paused (the review of 18 Nov, finding 1). A key that lacks
 * the footage's scope is a grant that no longer covers it. A refused key is asked for anew, once: only a refresh
 * its provider refuses for good signs the account out, and a key that was merely stale is replaced. Answers
 * `signed_out` when the account now needs a reconnect, `retry` when whoever asked should simply ask again. Anything
 * else that was thrown is thrown on.
 */
export async function settleRefusedKey(
  asker: { db: Db; connection: SourceConnectionRow; log: Logger },
  error: unknown,
): Promise<"signed_out" | "retry"> {
  if (!(error instanceof SourceKeyRefused)) throw error;
  if (error.refused === "key") {
    const fresh = await getSourceToken(asker.db, asker.connection.id, Date.now(), true);
    const dead = !fresh.ok && (fresh.reason === "signed_out" || fresh.reason === "no_credentials");
    if (!dead) return "retry";
  }
  await markSourceSignedOut(asker.db, asker.connection, asker.log);
  return "signed_out";
}

/** A job stopped by a refused key: skipped where the account is now signed out, else thrown on, to be tried again. */
export async function leaveRefusedKey(
  open: Pick<OpenSource, "db" | "connection" | "log">,
  error: unknown,
): Promise<{ skipped: string }> {
  if ((await settleRefusedKey(open, error)) === "retry") throw error;
  return { skipped: "the account is signed out" };
}

/**
 * The folder itself cannot be read: frozen. Its walk in flight ends where it stands, nothing is marked, and it is
 * asked after at the quiet floor.
 */
export async function freezeSource(open: Pick<OpenSource, "db" | "source" | "log">, at = new Date()): Promise<void> {
  await patchMediaSource(open.db, {
    tenantId: open.source.tenant_id,
    id: open.source.id,
    from: ["setting_up", "watching"],
    patch: {
      state: "frozen",
      stopped_why: "cant_open",
      last_error_at: at.toISOString(),
      next_read_at: new Date(at.getTime() + SOURCE_PACE.quietFloorMs).toISOString(),
      ...NO_WALK,
    },
  });
  open.log.warn("source_frozen", { source: open.source.id });
}

/**
 * An account connected again: its paused folders are read again from where they stood. One whose first walk never
 * ended starts it again (`setting_up`); the rest are read now and walked at the clock's next turn, since what changed
 * while it was paused is still in its provider's list from the place its row kept.
 */
export async function resumeSourcesOf(
  db: Db,
  connection: SourceConnectionRow,
  at = new Date(),
): Promise<MediaSourceRow[]> {
  const sources = await listMediaSourcesOfConnection(db, connection.tenant_id, connection.id);
  const resumed: MediaSourceRow[] = [];
  for (const source of sources.filter((row) => row.state === "paused")) {
    const walked = source.reconciled_at !== null;
    const row = await patchMediaSource(db, {
      tenantId: source.tenant_id,
      id: source.id,
      from: ["paused"],
      patch: {
        state: walked ? "watching" : "setting_up",
        stopped_why: null,
        last_error_at: null,
        next_read_at: walked ? at.toISOString() : null,
        next_walk_at: walked ? at.toISOString() : null,
      },
    });
    if (row) resumed.push(row);
  }
  return resumed;
}

/**
 * A folder opened for a job in one of the states named. Answers `skipped` with the reason when it is not one to read
 * now, and whose it is to mend (`cause`); a folder whose account or connector no longer lets it be read is paused on
 * the way (one stopped stays stopped: pauseSource takes only a folder being read).
 */
export async function openSource(
  db: Db,
  named: { tenantId: TenantId; sourceId: string },
  states: readonly SourceState[],
  log: Logger,
): Promise<Opened> {
  const source = await findMediaSource(db, named.tenantId, named.sourceId);
  if (!source) return { ok: false, skipped: "no such folder", cause: "folder" };
  // A paused folder waits on its account (signed out, or whoever connected it left); any other on itself.
  if (!states.some((state) => state === source.state))
    return {
      ok: false,
      skipped: `the folder is ${source.state}`,
      cause: source.state === "paused" ? "account" : "folder",
    };
  const connection = await findSourceConnection(db, named.tenantId, source.connection_id);
  if (!connection) return { ok: false, skipped: "no such account", cause: "account" };
  const now = new Date();
  if (connection.health !== "ok") {
    await pauseSource(db, source, "signed_out", now);
    return { ok: false, skipped: `the account is ${connection.health}`, cause: "account" };
  }
  // The plan's D13: an account is read only while whoever connected it is still one of the workspace's members.
  if (!connection.connected_by || !(await isStillMember(db, named.tenantId, connection.connected_by))) {
    const paused = await pauseSourcesOf(db, connection, "connector_left", now);
    log.warn("source_paused", { connection: connection.id, reason: "connector_left", folders: paused });
    return { ok: false, skipped: "whoever connected the account left", cause: "account" };
  }
  const token = await getSourceToken(db, connection.id, now.getTime());
  if (!token.ok) {
    if (token.reason === "signed_out" || token.reason === "no_credentials") {
      await markSourceSignedOut(db, connection, log, now);
      return { ok: false, skipped: "the account is signed out", cause: "account" };
    }
    // A deployment with no Google client of its own: no account of the business's is to blame.
    if (token.reason === "no_client") return { ok: false, skipped: "no client on this deployment", cause: "folder" };
    throw new Error(`footage account ${connection.id}: no token (${token.detail ?? "no answer"})`);
  }
  const spent = { units: 0 };
  return {
    ok: true,
    open: {
      db,
      ref: { tenantId: named.tenantId, sourceId: source.id },
      source,
      connection,
      token: token.token,
      folder: folderOf(source),
      drive: driveSource({
        spent: (units) => {
          spent.units += units;
        },
      }),
      spent,
      log,
    },
  };
}
