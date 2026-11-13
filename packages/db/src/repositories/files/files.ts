/**
 * A business's files (00551, decision 0099), the rows: reads on the member's session, under RLS and the columns a member may see,
 * and the service role's own. The doors are doors.ts, and the copy Anthropic holds is read only by the service role.
 *
 * A video whose bytes are still on their way (00556 media_status uploading) is no file yet to any page or to Ask: every member
 * read leaves it out, and the tile that sends it draws it from the browser's own state.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FILES_MAX,
  FILES_BUCKET,
  type FileKind,
  type FileShelfFilter,
  DbFailure,
  isUuid,
  recordOrEmpty,
} from "@chanlytics/contracts";
import type { Database } from "../../types";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

export type FileRow = Database["public"]["Tables"]["files"]["Row"];

/**
 * What a member's session may read (00551's and 00556's column grants): no fingerprint, never the copy's id or the video
 * platform's, and not the sound whole, which is read by id.
 */
const MEMBER_COLUMNS =
  "id, tenant_id, status, source, source_ref, name, mime, bytes, width, height, look, look_status, shows, who_in_it, removed_at, created_at, updated_at, kind, seconds, media_status, sound_said";

/** Not a video still on its way: a picture has no media_status, and a video counts from its last byte. */
const ARRIVED = "media_status.is.null,media_status.neq.uploading";

export type FileMemberRow = Pick<
  FileRow,
  | "id"
  | "tenant_id"
  | "status"
  | "source"
  | "source_ref"
  | "name"
  | "mime"
  | "bytes"
  | "width"
  | "height"
  | "look"
  | "look_status"
  | "shows"
  | "who_in_it"
  | "removed_at"
  | "created_at"
  | "updated_at"
  | "kind"
  | "seconds"
  | "media_status"
  | "sound_said"
>;

/**
 * The files named, by the name a person and Ask both say or by the row's id (a turn's scope names its file by id): only those
 * rows, so a question about one file reads one. A name is whatever a file may be called, in any language (contracts fileNameOf:
 * año-nuevo), so it is asked for as it stands and never held to a pattern of letters; an id is a uuid, or it names nothing.
 */
export async function listFilesByName(
  db: Db,
  tenantId: TenantId,
  named: { names: readonly string[]; ids: readonly string[] },
): Promise<FileMemberRow[]> {
  const names = [...new Set(named.names.filter(Boolean))];
  const ids = [...new Set(named.ids.filter((id) => isUuid(id)))];
  // Async, so it answers rows and never hands a builder on (a builder's type spells out the whole schema).
  const among = async (column: "name" | "id", values: readonly string[]) =>
    await db
      .from("files")
      .select(MEMBER_COLUMNS)
      .eq("tenant_id", tenantId)
      .in(column, [...values])
      .is("removed_at", null)
      .or(ARRIVED)
      .limit(FILES_MAX);
  const [byName, byId] = await Promise.all([
    names.length ? among("name", names) : null,
    ids.length ? among("id", ids) : null,
  ]);
  if (byName?.error) throw new DbFailure(byName.error, "files by name");
  if (byId?.error) throw new DbFailure(byId.error, "files by id");
  const rows = new Map([...(byName?.data ?? []), ...(byId?.data ?? [])].map((row) => [row.id, row]));
  return [...rows.values()];
}

/**
 * One page of one shelf, newest first, found by its words where words are given (00597 files_found), and how many stand there in
 * all: the search answers the page's ids, and their rows are read through the member's own columns, in the search's order.
 */
export async function listFilesFound(
  db: Db,
  tenantId: TenantId,
  shelf: FileShelfFilter,
  page: { words?: string | undefined; offset: number; limit: number },
): Promise<{ rows: FileMemberRow[]; total: number }> {
  const { data, error } = await db.rpc("files_found", {
    p_tenant_id: tenantId,
    p_status: shelf.status,
    p_limit: page.limit,
    p_offset: page.offset,
    ...(shelf.made === undefined ? {} : { p_made: shelf.made }),
    ...(shelf.shows ? { p_shows: [...shelf.shows] } : {}),
    ...(shelf.orUnsorted ? { p_or_unsorted: true } : {}),
    ...(page.words?.trim() ? { p_words: page.words } : {}),
  });
  if (error) throw new DbFailure(error, "files found");
  const found = recordOrEmpty(data);
  const ids = Array.isArray(found.ids) ? found.ids.filter((id): id is string => typeof id === "string") : [];
  const total = typeof found.total === "number" ? found.total : ids.length;
  if (!ids.length) return { rows: [], total };
  const read = await db
    .from("files")
    .select(MEMBER_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("id", ids)
    .is("removed_at", null)
    .or(ARRIVED);
  if (read.error) throw new DbFailure(read.error, "files found, read");
  const byId = new Map(read.data.map((r) => [r.id, r]));
  return { rows: ids.flatMap((id) => byId.get(id) ?? []), total };
}

/** What each file says of itself and no more, for what counts them: a workspace at its cap is a few KB this way, and a megabyte with its looks. */
export async function listFilesTallied(
  db: Db,
  tenantId: TenantId,
): Promise<Pick<FileMemberRow, "status" | "shows" | "source" | "look_status" | "created_at" | "kind">[]> {
  const { data, error } = await db
    .from("files")
    .select("status, shows, source, look_status, created_at, kind")
    .eq("tenant_id", tenantId)
    .is("removed_at", null)
    .or(ARRIVED)
    .limit(FILES_MAX);
  if (error) throw new DbFailure(error, "files tallied");
  return data ?? [];
}

/**
 * A page of one shelf, newest first, ending just before `before`: by the time and the id, so a file kept while a person scrolls moves
 * nothing past them and none is read twice, and two kept at one instant still have an order.
 */
export async function listFilesOnShelf(
  db: Db,
  tenantId: TenantId,
  shelf: FileShelfFilter,
  page: { limit: number; before?: { at: string; id: string } | null },
): Promise<FileMemberRow[]> {
  let query = db
    .from("files")
    .select(MEMBER_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("removed_at", null)
    .or(ARRIVED)
    .eq("status", shelf.status);
  if (shelf.made !== undefined) query = shelf.made ? query.eq("source", "made") : query.neq("source", "made");
  if (shelf.kind) query = query.eq("kind", shelf.kind);
  if (shelf.shows)
    query = shelf.orUnsorted
      ? query.or(`shows.is.null,shows.in.(${shelf.shows.join(",")})`)
      : query.in("shows", [...shelf.shows]);
  if (page.before) {
    const { at, id } = page.before;
    query = query.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`);
  }
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(page.limit);
  if (error) throw new DbFailure(error, "files on shelf");
  return data ?? [];
}

/** How many files made here are kept and still there, a video on its way aside: Content's tally, counted and never listed. */
export async function countFilesMade(
  db: Db,
  tenantId: TenantId,
  status: "filed" | "set_aside" = "filed",
): Promise<number> {
  const { count, error } = await db
    .from("files")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("removed_at", null)
    .or(ARRIVED)
    .eq("status", status)
    .eq("source", "made");
  if (error) throw new DbFailure(error, "files made");
  return count ?? 0;
}

/**
 * How many photos found online wait for the owner's yes (the Library's Found online): what Content marks beside Library
 * while Made is shown, so what waits is said wherever the owner stands.
 */
export async function countFilesWaiting(db: Db, tenantId: TenantId): Promise<number> {
  const { count, error } = await db
    .from("files")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("removed_at", null)
    .or(ARRIVED)
    .eq("status", "inbox");
  if (error) throw new DbFailure(error, "files waiting");
  return count ?? 0;
}

/** How many files the business keeps that Ask did not make, a file on its way aside: the Library's count on Content. */
export async function countFilesKept(db: Db, tenantId: TenantId): Promise<number> {
  const { count, error } = await db
    .from("files")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("removed_at", null)
    .or(ARRIVED)
    .eq("status", "filed")
    .neq("source", "made");
  if (error) throw new DbFailure(error, "files kept");
  return count ?? 0;
}

/** The most files one read names by id: a view of Content draws a page of lines, each one file. */
const FILES_BY_ID_MAX = 100;

/** These files, under the caller's RLS, where they are still there: the files a page of Content's lines is of. */
export async function listFilesByIds(db: Db, tenantId: TenantId, ids: readonly string[]): Promise<FileMemberRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from("files")
    .select(MEMBER_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("id", [...ids].slice(0, FILES_BY_ID_MAX))
    .is("removed_at", null)
    .or(ARRIVED);
  if (error) throw new DbFailure(error, "files by id");
  return data;
}

/** One file, under the caller's RLS; null where it is not there for them, or was removed. */
export async function findFile(db: Db, id: string): Promise<FileMemberRow | null> {
  const { data, error } = await db
    .from("files")
    .select(MEMBER_COLUMNS)
    .eq("id", id)
    .is("removed_at", null)
    .or(ARRIVED)
    .maybeSingle();
  if (error) throw new DbFailure(error, "file");
  return data ?? null;
}

/** A video's sound whole, under the caller's RLS: what is said and how it sounds, read by id and never by the list. */
export async function readFileSound(db: Db, id: string): Promise<FileRow["sound"]> {
  const { data, error } = await db.from("files").select("sound").eq("id", id).is("removed_at", null).maybeSingle();
  if (error) throw new DbFailure(error, "file sound");
  return data?.sound ?? null;
}

/**
 * A video's length as the video platform says it, kept where the row had none: its webhook did not say, and the browser could
 * not read the clip. Only where none is kept, so the platform's first word is never written over.
 */
export async function keepVideoSeconds(db: Db, tenantId: TenantId, id: string, seconds: number): Promise<void> {
  const { error } = await db
    .from("files")
    .update({ seconds, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("kind", "video")
    .is("seconds", null)
    .is("removed_at", null);
  if (error) throw new DbFailure(error, "video seconds");
}

/**
 * The named files that are still there for the caller: what a question's turn says of the files it came with. A video's sound
 * rides with it whole, since the turn shows its sheet with what was heard after it.
 */
export async function listFilesNamedBy(
  db: Db,
  tenantId: TenantId,
  ids: readonly string[],
): Promise<
  Pick<FileRow, "id" | "name" | "look" | "kind" | "seconds" | "media_status" | "width" | "height" | "sound">[]
> {
  const { data, error } = await db
    .from("files")
    .select("id, name, look, kind, seconds, media_status, width, height, sound")
    .eq("tenant_id", tenantId)
    .in("id", [...ids])
    .is("removed_at", null)
    .or(ARRIVED);
  if (error) throw new DbFailure(error, "files named");
  return data ?? [];
}

/** One file whole, for the service role's work on it, removed or not. */
export async function findFileForWork(db: Db, tenantId: TenantId, id: string): Promise<FileRow | null> {
  const { data, error } = await db.from("files").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new DbFailure(error, "file");
  return data ?? null;
}

/** How a post was made, for the service role: a member's session has no grant on it (00553). */
export async function getFileMade(db: Db, tenantId: TenantId, id: string): Promise<FileRow["made"]> {
  const { data, error } = await db.from("files").select("made").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new DbFailure(error, "file made");
  return data?.made ?? null;
}

/** How the workspace's newest post that is still here was made, for the service role; null before its first. */
export async function getNewestMade(db: Db, tenantId: TenantId): Promise<FileRow["made"]> {
  const { data, error } = await db
    .from("files")
    .select("made")
    .eq("tenant_id", tenantId)
    .eq("source", "made")
    // A post is a picture: a video made here keeps a plan of its own (00613), and no look to carry on.
    .eq("kind", "image")
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "newest made");
  return data?.made ?? null;
}

/** Whether this file is here, or a person let it go: either way an import stores no bytes for it. */
export async function markFileSeen(db: Db, tenantId: TenantId, fingerprint: string): Promise<boolean> {
  const [live, letGo] = await Promise.all([
    db
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("fingerprint", fingerprint)
      .is("removed_at", null),
    db
      .from("files_let_go")
      .select("fingerprint", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("fingerprint", fingerprint),
  ]);
  if (live.error) throw new DbFailure(live.error, "file seen");
  if (letGo.error) throw new DbFailure(letGo.error, "file let go");
  return (live.count ?? 0) + (letGo.count ?? 0) > 0;
}

/**
 * The copy Anthropic holds for reading it, kept unless the file was removed while it went up: then nothing would ever let
 * that copy go, so this answers false and the caller deletes it.
 */
export async function keepClaudeCopy(
  db: Db,
  tenantId: TenantId,
  id: string,
  copy: { id: string; expires_at: string | null; width: number; height: number },
): Promise<boolean> {
  const { data, error } = await db
    .from("files")
    .update({ claude_copy: copy, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .is("removed_at", null)
    .select("id");
  if (error) throw new DbFailure(error, "file copy");
  return (data ?? []).length > 0;
}

/**
 * The sweep's read across workspaces: looks worth trying again, tried long enough ago, of one kind, each read under its own
 * edition. A wait or a failure heals only while it is young, so a paused workspace's are not read for ever; a lower edition is
 * read again whatever its age. A video's wait is its digest's, which listVideosToDigestAgain reads, so `young` is false for one.
 */
export async function listFilesToLookAgain(
  db: Db,
  args: { kind: FileKind; edition: number; triedBefore: string; bornAfter: string; limit: number; young?: boolean },
): Promise<{ id: string; tenant_id: TenantId }[]> {
  const tried = () =>
    db
      .from("files")
      .select("id, tenant_id")
      .eq("kind", args.kind)
      .is("removed_at", null)
      .neq("look_status", "refused")
      .lt("looked_at", args.triedBefore);
  const [young, older] = await Promise.all([
    args.young === false
      ? Promise.resolve({ data: [], error: null })
      : tried()
          .in("look_status", ["waiting", "failed"])
          .gte("created_at", args.bornAfter)
          .order("looked_at", { ascending: true })
          .limit(args.limit),
    tried().lt("look_edition", args.edition).order("looked_at", { ascending: true }).limit(args.limit),
  ]);
  if (young.error) throw new DbFailure(young.error, "files to look again");
  if (older.error) throw new DbFailure(older.error, "files to read again");
  const seen = new Map([...(young.data ?? []), ...(older.data ?? [])].map((f) => [f.id, f]));
  return [...seen.values()].slice(0, args.limit);
}

/** A playable video whose digest has not finished, as the sweep reads it: what it has, so the step it lacks comes next. */
export type VideoToDigest = Pick<FileRow, "id" | "tenant_id" | "claude_copy" | "sound">;

/**
 * The sweep's read of videos: playable, young, and their digest or their look stopped short a day ago. A step lost (its job
 * failed for good, or never ran) is scheduled again from what the row already holds.
 */
export async function listVideosToDigestAgain(
  db: Db,
  range: { triedBefore: string; bornAfter: string; limit: number },
): Promise<VideoToDigest[]> {
  const { data, error } = await db
    .from("files")
    .select("id, tenant_id, claude_copy, sound")
    .eq("kind", "video")
    .eq("media_status", "ready")
    .is("removed_at", null)
    .in("look_status", ["waiting", "failed"])
    .lt("looked_at", range.triedBefore)
    .gte("created_at", range.bornAfter)
    .order("looked_at", { ascending: true })
    .limit(range.limit);
  if (error) throw new DbFailure(error, "videos to digest again");
  return data ?? [];
}

/** A video the platform has not answered for: its id there and where it stood. */
export type VideoWaiting = Pick<FileRow, "id" | "tenant_id" | "media_ref" | "media_status">;

/**
 * The sweep's read of videos the platform's webhook has not finished: on their way or being prepared, untouched since
 * `updatedBefore`, and no older than `updatedAfter` (one never sent is let go by its purge a day on).
 */
export async function listVideosWaiting(
  db: Db,
  range: { updatedBefore: string; updatedAfter: string; limit: number },
): Promise<VideoWaiting[]> {
  const { data, error } = await db
    .from("files")
    .select("id, tenant_id, media_ref, media_status")
    .in("media_status", ["uploading", "processing"])
    .is("removed_at", null)
    .lt("updated_at", range.updatedBefore)
    .gte("updated_at", range.updatedAfter)
    .order("updated_at", { ascending: true })
    .limit(range.limit);
  if (error) throw new DbFailure(error, "videos waiting");
  return data ?? [];
}

/** The sweep's other read: a removal whose purge has not finished, so what an owner was told can't be brought back is gone. */
export async function listFilesToPurgeAgain(
  db: Db,
  args: { removedBefore: string; removedAfter: string; limit: number },
): Promise<{ id: string; tenant_id: TenantId }[]> {
  const { data, error } = await db
    .from("files")
    .select("id, tenant_id")
    .lt("removed_at", args.removedBefore)
    .gte("removed_at", args.removedAfter)
    .order("removed_at", { ascending: true })
    .limit(args.limit);
  if (error) throw new DbFailure(error, "files to purge again");
  return data ?? [];
}

/** The bucket, on whichever client holds the service role. */
export const filesBucket = (db: Db): ReturnType<Db["storage"]["from"]> => db.storage.from(FILES_BUCKET);
