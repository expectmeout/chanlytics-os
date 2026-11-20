/**
 * A folder chosen and watched (the footage sources plan, P2): the folder chooser's read, the start of a watch, and the
 * acts on a watched folder's row.
 *
 *   The chooser   one level at a time, folders only: the account's own Drive, its shared drives, what was shared
 *                 with it, then the folder opened. Only the levels a person opens are read, no file is listed before
 *                 a folder is chosen, and no Google key reaches the browser.
 *   A folder      one folder named by its id, for a pasted link: asked of its account, nothing listed.
 *   A watch       the folder validated (it exists, it can be listed, and where its changes are read), then its place
 *                 in the provider's changes saved BEFORE its first walk begins, so nothing that changes during the
 *                 walk is missed; then the walk's first step put on the ledger. Choosing a folder twice is one watch.
 *   Check now     one read of the folder, at once.
 *   Stop          the folder is no longer read and its channel is closed. What came in stays.
 *   Confirm       a person's word that a held wave of removals is real: the next walk marks them.
 *
 * How many folders a workspace may watch is an entitlement, not the schema's: one at launch (the plan's D5).
 */
import { SECOND_MS, type SourceFolder, type TenantId } from "@chanlytics/contracts";
import { driveSource, type DriveFolderChoices, type DrivePlace } from "@chanlytics/channels/files";
import {
  findMediaSource,
  findSourceConnection,
  listMediaSourcesOf,
  patchMediaSource,
  saveMediaSource,
  type MediaSourceRow,
  type SourceConnectionRow,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { scheduleJobOnce } from "@chanlytics/jobs";
import { logAndGoOn } from "@chanlytics/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "../../shared/log.js";
import { closeChannel } from "./channel.js";
import { getSourceToken } from "./credentials.js";
import { SOURCE_PACE } from "./pace.js";
import { markSourceSignedOut, settleRefusedKey } from "./standing.js";

type Db = SupabaseClient<Database>;

/** How many folders a workspace may watch at launch (the plan's D5): an entitlement, held here and not in the schema. */
const SOURCES_A_WORKSPACE = 1;

/** Why an act on an account or a folder was not done. */
export type WatchRefusal =
  "not_found" | "needs_reconnect" | "unavailable" | "no_access" | "too_many" | { restMs: number };

type Refused = { ok: false; reason: WatchRefusal };

/** The account and an hour's key for it, or why it cannot be asked. */
async function openAccount(
  db: Db,
  named: { tenantId: TenantId; connectionId: string },
  log: Logger,
): Promise<{ ok: true; connection: SourceConnectionRow; token: string } | Refused> {
  const connection = await findSourceConnection(db, named.tenantId, named.connectionId);
  if (!connection) return { ok: false, reason: "not_found" };
  if (connection.health !== "ok") return { ok: false, reason: "needs_reconnect" };
  const token = await getSourceToken(db, connection.id);
  if (token.ok) return { ok: true, connection, token: token.token };
  if (token.reason !== "signed_out" && token.reason !== "no_credentials") return { ok: false, reason: "unavailable" };
  await markSourceSignedOut(db, connection, log);
  return { ok: false, reason: "needs_reconnect" };
}

/** A provider's refusal as the door says it. */
const watchRefusalOf = (reply: { verdict: "pace"; restMs: number } | { verdict: "no_access" | "gone" }): Refused => ({
  ok: false,
  reason: reply.verdict === "pace" ? { restMs: reply.restMs } : reply.verdict === "gone" ? "not_found" : "no_access",
});

/**
 * A door's ask of the provider that threw, said as the door says it: a key its provider refused is settled first
 * (standing.ts), and the account then needs a reconnect, or the ask is simply made again.
 */
async function refusedKey(db: Db, connection: SourceConnectionRow, log: Logger, error: unknown): Promise<Refused> {
  const settled = await settleRefusedKey({ db, connection, log }, error);
  return { ok: false, reason: settled === "signed_out" ? "needs_reconnect" : "unavailable" };
}

/** One level of the folder chooser: the folders under a place, a page of them. */
export async function listFolderChoices(
  db: Db,
  ask: { tenantId: TenantId; connectionId: string; where: DrivePlace; page: string | null },
  log: Logger,
): Promise<{ ok: true; choices: DriveFolderChoices } | Refused> {
  const account = await openAccount(db, ask, log);
  if (!account.ok) return account;
  try {
    const reply = await driveSource().listFolders(account.token, ask.where, ask.page);
    return reply.verdict === "ok" ? { ok: true, choices: reply.answer } : watchRefusalOf(reply);
  } catch (error) {
    return refusedKey(db, account.connection, log, error);
  }
}

/**
 * One folder as its account names it, by its id: what a pasted link is read to before anyone is asked to watch it.
 * Nothing is listed and nothing is kept; a folder the account cannot open says so.
 */
export async function nameFolder(
  db: Db,
  ask: { tenantId: TenantId; connectionId: string; folderId: string },
  log: Logger,
): Promise<{ ok: true; folder: SourceFolder } | Refused> {
  const account = await openAccount(db, ask, log);
  if (!account.ok) return account;
  try {
    const reply = await driveSource().validateFolder(account.token, ask.folderId);
    return reply.verdict === "ok" ? { ok: true, folder: reply.answer } : watchRefusalOf(reply);
  } catch (error) {
    return refusedKey(db, account.connection, log, error);
  }
}

/** A folder's walk asked for: the first step of the run after its newest. */
async function scheduleWalk(db: Db, source: MediaSourceRow, walk: "snapshot" | "reconcile"): Promise<void> {
  await scheduleJobOnce(db, {
    tenantId: source.tenant_id,
    kind: "source_walk",
    dueAt: new Date(),
    payload: { source_id: source.id, run: String(source.walk_run + 1), step: "0", walk },
  });
}

/** What a watch is asked with. */
interface WatchAsk {
  tenantId: TenantId;
  connectionId: string;
  folderId: string;
  includeSubfolders: boolean;
}

/** A folder its account may read, and the place its changes are read from: asked before it is watched. */
async function findFolderAndPlace(
  token: string,
  folderId: string,
): Promise<{ ok: true; folder: SourceFolder; cursor: string } | Refused> {
  const drive = driveSource();
  const folder = await drive.validateFolder(token, folderId);
  if (folder.verdict !== "ok") return watchRefusalOf(folder);
  const cursor = await drive.getStartCursor(token, folder.answer);
  if (cursor.verdict !== "ok") return watchRefusalOf(cursor);
  return { ok: true, folder: folder.answer, cursor: cursor.answer };
}

/**
 * A folder watched. Its place in the provider's changes is saved before the walk's first step is written, and a folder
 * already watched is answered as it stands. One watched again after it was stopped starts over from a new place and a
 * whole walk, which finds what it held then and what it holds now.
 */
export async function watchFolder(
  db: Db,
  ask: WatchAsk,
  log: Logger,
): Promise<{ ok: true; source: MediaSourceRow; made: boolean } | Refused> {
  const account = await openAccount(db, ask, log);
  if (!account.ok) return account;
  const others = (await listMediaSourcesOf(db, ask.tenantId)).filter((row) => row.state !== "stopped");
  const already = others.find((row) => row.connection_id === ask.connectionId && row.folder_id === ask.folderId);
  if (already) return { ok: true, source: already, made: false };
  if (others.length >= SOURCES_A_WORKSPACE) return { ok: false, reason: "too_many" };
  const found = await findFolderAndPlace(account.token, ask.folderId).catch((error: unknown) =>
    refusedKey(db, account.connection, log, error),
  );
  if (!found.ok) return found;
  const { folder, cursor } = found;
  const kept = await saveMediaSource(db, {
    tenant_id: ask.tenantId,
    connection_id: ask.connectionId,
    folder_id: folder.id,
    folder_name: folder.name.slice(0, 500),
    drive_id: folder.driveId,
    include_subfolders: ask.includeSubfolders,
    change_cursor: cursor,
    read_gap_seconds: SOURCE_PACE.readGapMs / SECOND_MS,
  });
  let source = kept.source;
  if (!kept.made) {
    // Stopped once, watched again: a new place, and a whole walk from it.
    const again = await patchMediaSource(db, {
      tenantId: ask.tenantId,
      id: source.id,
      from: ["stopped"],
      patch: {
        state: "setting_up",
        folder_name: folder.name.slice(0, 500),
        drive_id: folder.driveId,
        include_subfolders: ask.includeSubfolders,
        change_cursor: cursor,
        last_error: null,
        last_error_at: null,
      },
    });
    if (!again) return { ok: true, source, made: false };
    source = again;
  }
  await scheduleWalk(db, source, kept.made ? "snapshot" : "reconcile");
  log.info("source_watched", { source: source.id, again: !kept.made, subfolders: ask.includeSubfolders });
  return { ok: true, source, made: kept.made };
}

/** Check now: one read of the folder at once, unless one already waits or runs. */
export async function checkSourceNow(
  db: Db,
  named: { tenantId: TenantId; sourceId: string },
): Promise<{ ok: true; scheduled: boolean } | Refused> {
  const source = await findMediaSource(db, named.tenantId, named.sourceId);
  if (!source || (source.state !== "watching" && source.state !== "frozen")) return { ok: false, reason: "not_found" };
  const outcome = await scheduleJobOnce(db, {
    tenantId: named.tenantId,
    kind: "source_read",
    dueAt: new Date(),
    payload: { source_id: source.id },
  });
  return { ok: true, scheduled: outcome === "scheduled" };
}

/** A held wave of removals confirmed by a person: the folder is walked at the clock's next turn, and that walk marks them. */
export async function confirmSourceHold(
  db: Db,
  named: { tenantId: TenantId; sourceId: string },
): Promise<{ ok: true } | Refused> {
  const source = await findMediaSource(db, named.tenantId, named.sourceId);
  if (!source || source.hold_at === null) return { ok: false, reason: "not_found" };
  const nowIso = new Date().toISOString();
  await patchMediaSource(db, {
    tenantId: named.tenantId,
    id: source.id,
    from: ["watching"],
    patch: { hold_confirmed_at: nowIso, next_walk_at: nowIso },
  });
  return { ok: true };
}

/** A folder no longer watched: its channel closed, nothing read again. What came in stays. */
export async function stopWatching(
  db: Db,
  named: { tenantId: TenantId; sourceId: string },
  log: Logger,
): Promise<{ ok: true; source: MediaSourceRow } | Refused> {
  const source = await findMediaSource(db, named.tenantId, named.sourceId);
  if (!source) return { ok: false, reason: "not_found" };
  if (source.state === "stopped") return { ok: true, source };
  const stopped = await patchMediaSource(db, {
    tenantId: named.tenantId,
    id: source.id,
    from: null,
    patch: {
      state: "stopped",
      next_read_at: null,
      next_walk_at: null,
      walk_kind: null,
      walk_started_at: null,
      walk_touched_at: null,
      channel_id: null,
      channel_resource_id: null,
      channel_token_hash: null,
      channel_expires_at: null,
      hold_at: null,
      hold_count: null,
      hold_confirmed_at: null,
      last_error: null,
      last_error_at: null,
    },
  });
  // Its channel, closed with its account's own key where that still reads; one left open ends by itself in a week.
  const token = await getSourceToken(db, source.connection_id).catch(logAndGoOn("footage stop: a token", null));
  if (token?.ok)
    await closeChannel(
      { drive: driveSource(), token: token.token, log, source },
      source.channel_id,
      source.channel_resource_id,
    );
  log.info("source_stopped", { source: source.id });
  return { ok: true, source: stopped ?? source };
}
