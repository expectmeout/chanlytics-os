/**
 * A business's files (00551, decision 0099), the rows: reads on the member's session, under RLS and the columns a member may see,
 * and the service role's own. The doors are doors.ts, and the copy Anthropic holds is read only by the service role.
 *
 * A video whose bytes are still on their way (00556 media_status uploading) is no file yet to any page or to Ask: every member
 * read leaves it out, and the tile that sends it draws it from the browser's own state.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FILES_MAX, FILES_BUCKET, type FileKind, type FileShelfFilter } from "@chanlytics/contracts";
import type { Database } from "../../types";

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

/** What the workspace keeps, newest first. */
export async function listFiles(db: Db, tenantId: string): Promise<FileMemberRow[]> {
  const { data, error } = await db
    .from("files")
    .select(MEMBER_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("removed_at", null)
    .or(ARRIVED)
    .order("created_at", { ascending: false })
    .limit(FILES_MAX);
  if (error) throw new Error(`files: ${error.message}`);
  return data ?? [];
}

/** What each file says of itself and no more, for what counts them: a workspace at its cap is a few KB this way, and a megabyte with its looks. */
export async function listFilesTallied(
  db: Db,
  tenantId: string,
): Promise<Pick<FileMemberRow, "status" | "shows" | "source" | "look_status" | "created_at" | "kind">[]> {
  const { data, error } = await db
    .from("files")
    .select("status, shows, source, look_status, created_at, kind")
    .eq("tenant_id", tenantId)
    .is("removed_at", null)
    .or(ARRIVED)
    .limit(FILES_MAX);
  if (error) throw new Error(`files tallied: ${error.message}`);
  return data ?? [];
}

/**
 * A page of one shelf, newest first, ending just before `before`: by the time and the id, so a file kept while a person scrolls moves
 * nothing past them and none is read twice, and two kept at one instant still have an order.
 */
export async function listFilesOnShelf(
  db: Db,
  tenantId: string,
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
  if (error) throw new Error(`files on shelf: ${error.message}`);
  return data ?? [];
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
  if (error) throw new Error(`file: ${error.message}`);
  return data ?? null;
}

/** A video's sound whole, under the caller's RLS: what is said and how it sounds, read by id and never by the list. */
export async function readFileSound(db: Db, id: string): Promise<FileRow["sound"]> {
  const { data, error } = await db.from("files").select("sound").eq("id", id).is("removed_at", null).maybeSingle();
  if (error) throw new Error(`file sound: ${error.message}`);
  return data?.sound ?? null;
}

/**
 * The named files that are still there for the caller: what a question's turn says of the files it came with. A video's sound
 * rides with it whole, since the turn shows its sheet with what was heard after it.
 */
export async function listFilesNamedBy(
  db: Db,
  tenantId: string,
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
  if (error) throw new Error(`files named: ${error.message}`);
  return data ?? [];
}

/** One file whole, for the service role's work on it, removed or not. */
export async function findFileForWork(db: Db, tenantId: string, id: string): Promise<FileRow | null> {
  const { data, error } = await db.from("files").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new Error(`file: ${error.message}`);
  return data ?? null;
}

/** How a post was made, for the service role: a member's session has no grant on it (00553). */
export async function getFileMade(db: Db, tenantId: string, id: string): Promise<FileRow["made"]> {
  const { data, error } = await db.from("files").select("made").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new Error(`file made: ${error.message}`);
  return data?.made ?? null;
}

/** How the workspace's newest post that is still here was made, for the service role; null before its first. */
export async function getNewestMade(db: Db, tenantId: string): Promise<FileRow["made"]> {
  const { data, error } = await db
    .from("files")
    .select("made")
    .eq("tenant_id", tenantId)
    .eq("source", "made")
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`newest made: ${error.message}`);
  return data?.made ?? null;
}

/** Whether this file is here, or a person let it go: either way an import stores no bytes for it. */
export async function markFileSeen(db: Db, tenantId: string, fingerprint: string): Promise<boolean> {
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
  if (live.error) throw new Error(`file seen: ${live.error.message}`);
  if (letGo.error) throw new Error(`file let go: ${letGo.error.message}`);
  return (live.count ?? 0) + (letGo.count ?? 0) > 0;
}

/**
 * The copy Anthropic holds for reading it, kept unless the file was removed while it went up: then nothing would ever let
 * that copy go, so this answers false and the caller deletes it.
 */
export async function keepClaudeCopy(
  db: Db,
  tenantId: string,
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
  if (error) throw new Error(`file copy: ${error.message}`);
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
): Promise<{ id: string; tenant_id: string }[]> {
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
  if (young.error) throw new Error(`files to look again: ${young.error.message}`);
  if (older.error) throw new Error(`files to read again: ${older.error.message}`);
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
  if (error) throw new Error(`videos to digest again: ${error.message}`);
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
  if (error) throw new Error(`videos waiting: ${error.message}`);
  return data ?? [];
}

/** The sweep's other read: a removal whose purge has not finished, so what an owner was told can't be brought back is gone. */
export async function listFilesToPurgeAgain(
  db: Db,
  args: { removedBefore: string; removedAfter: string; limit: number },
): Promise<{ id: string; tenant_id: string }[]> {
  const { data, error } = await db
    .from("files")
    .select("id, tenant_id")
    .lt("removed_at", args.removedBefore)
    .gte("removed_at", args.removedAfter)
    .order("removed_at", { ascending: true })
    .limit(args.limit);
  if (error) throw new Error(`files to purge again: ${error.message}`);
  return data ?? [];
}

/** The bucket, on whichever client holds the service role. */
export const filesBucket = (db: Db): ReturnType<Db["storage"]["from"]> => db.storage.from(FILES_BUCKET);
