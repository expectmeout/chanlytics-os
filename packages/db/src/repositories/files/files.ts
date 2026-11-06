/**
 * A business's files (00551, decision 0099), the rows: reads on the member's session, under RLS and the columns a member may see,
 * and the service role's own. The doors are doors.ts, and the copy Anthropic holds is read only by the service role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FILES_MAX, FILES_BUCKET, type FileShelfFilter } from "@chanlytics/contracts";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

export type FileRow = Database["public"]["Tables"]["files"]["Row"];

/** What a member's session may read (00551's column grants): no fingerprint, and never the copy's id. */
const MEMBER_COLUMNS =
  "id, tenant_id, status, source, source_ref, name, mime, bytes, width, height, look, look_status, shows, who_in_it, removed_at, created_at, updated_at";

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
>;

/** What the workspace keeps, newest first. */
export async function filesOf(db: Db, tenantId: string): Promise<FileMemberRow[]> {
  const { data, error } = await db
    .from("files")
    .select(MEMBER_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(FILES_MAX);
  if (error) throw new Error(`files: ${error.message}`);
  return data ?? [];
}

/** What each file says of itself and no more, for what counts them: a workspace at its cap is a few KB this way, and a megabyte with its looks. */
export async function filesTalliedOf(
  db: Db,
  tenantId: string,
): Promise<Pick<FileMemberRow, "status" | "shows" | "source" | "look_status" | "created_at">[]> {
  const { data, error } = await db
    .from("files")
    .select("status, shows, source, look_status, created_at")
    .eq("tenant_id", tenantId)
    .is("removed_at", null)
    .limit(FILES_MAX);
  if (error) throw new Error(`files tallied: ${error.message}`);
  return data ?? [];
}

/**
 * A page of one shelf, newest first, ending just before `before`: by the time and the id, so a file kept while a person scrolls moves
 * nothing past them and none is read twice, and two kept at one instant still have an order.
 */
export async function filesOnShelfOf(
  db: Db,
  tenantId: string,
  shelf: FileShelfFilter,
  page: { limit: number; before?: { at: string; id: string } | null },
): Promise<FileMemberRow[]> {
  let q = db
    .from("files")
    .select(MEMBER_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("removed_at", null)
    .eq("status", shelf.status);
  if (shelf.made !== undefined) q = shelf.made ? q.eq("source", "made") : q.neq("source", "made");
  if (shelf.shows)
    q = shelf.orUnsorted ? q.or(`shows.is.null,shows.in.(${shelf.shows.join(",")})`) : q.in("shows", [...shelf.shows]);
  if (page.before) {
    const { at, id } = page.before;
    q = q.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`);
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(page.limit);
  if (error) throw new Error(`files on shelf: ${error.message}`);
  return data ?? [];
}

/** One file, under the caller's RLS; null where it is not there for them, or was removed. */
export async function fileOf(db: Db, id: string): Promise<FileMemberRow | null> {
  const { data, error } = await db
    .from("files")
    .select(MEMBER_COLUMNS)
    .eq("id", id)
    .is("removed_at", null)
    .maybeSingle();
  if (error) throw new Error(`file: ${error.message}`);
  return data ?? null;
}

/** The named files that are still there for the caller: what a question's turn says of the files it came with. */
export async function filesNamedBy(
  db: Db,
  tenantId: string,
  ids: readonly string[],
): Promise<Pick<FileMemberRow, "id" | "name" | "look">[]> {
  const { data, error } = await db
    .from("files")
    .select("id, name, look")
    .eq("tenant_id", tenantId)
    .in("id", [...ids])
    .is("removed_at", null);
  if (error) throw new Error(`files named: ${error.message}`);
  return data ?? [];
}

/** One file whole, for the service role's work on it, removed or not. */
export async function fileForWork(db: Db, tenantId: string, id: string): Promise<FileRow | null> {
  const { data, error } = await db.from("files").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new Error(`file: ${error.message}`);
  return data ?? null;
}

/** How a post was made, for the service role: a member's session has no grant on it (00553). */
export async function fileMadeOf(db: Db, tenantId: string, id: string): Promise<FileRow["made"]> {
  const { data, error } = await db.from("files").select("made").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new Error(`file made: ${error.message}`);
  return data?.made ?? null;
}

/** How the workspace's newest post that is still here was made, for the service role; null before its first. */
export async function newestMadeOf(db: Db, tenantId: string): Promise<FileRow["made"]> {
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
export async function fileSeen(db: Db, tenantId: string, fingerprint: string): Promise<boolean> {
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
 * The sweep's read across workspaces: looks worth trying again, tried long enough ago. A wait or a failure heals only while
 * it is young, so a paused workspace's are not read for ever; a lower edition is read again whatever its age.
 */
export async function filesToLookAgain(
  db: Db,
  a: { edition: number; triedBefore: string; bornAfter: string; limit: number },
): Promise<{ id: string; tenant_id: string }[]> {
  const tried = () =>
    db
      .from("files")
      .select("id, tenant_id")
      .is("removed_at", null)
      .neq("look_status", "refused")
      .lt("looked_at", a.triedBefore);
  const [young, older] = await Promise.all([
    tried()
      .in("look_status", ["waiting", "failed"])
      .gte("created_at", a.bornAfter)
      .order("looked_at", { ascending: true })
      .limit(a.limit),
    tried().lt("look_edition", a.edition).order("looked_at", { ascending: true }).limit(a.limit),
  ]);
  if (young.error) throw new Error(`files to look again: ${young.error.message}`);
  if (older.error) throw new Error(`files to read again: ${older.error.message}`);
  const seen = new Map([...(young.data ?? []), ...(older.data ?? [])].map((f) => [f.id, f]));
  return [...seen.values()].slice(0, a.limit);
}

/** The sweep's other read: a removal whose purge has not finished, so what an owner was told can't be brought back is gone. */
export async function filesToPurgeAgain(
  db: Db,
  a: { removedBefore: string; removedAfter: string; limit: number },
): Promise<{ id: string; tenant_id: string }[]> {
  const { data, error } = await db
    .from("files")
    .select("id, tenant_id")
    .lt("removed_at", a.removedBefore)
    .gte("removed_at", a.removedAfter)
    .order("removed_at", { ascending: true })
    .limit(a.limit);
  if (error) throw new Error(`files to purge again: ${error.message}`);
  return data ?? [];
}

/** The bucket, on whichever client holds the service role. */
export const filesBucket = (db: Db): ReturnType<Db["storage"]["from"]> => db.storage.from(FILES_BUCKET);
