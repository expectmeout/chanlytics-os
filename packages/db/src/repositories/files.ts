/**
 * A business's files (00551, decision 0099): reads on the member's session, under RLS and the columns a member may see;
 * every write through a door. The doors a member calls ask the settings permission themselves; the ones the edge calls are
 * the service role's alone, and the copy Anthropic holds is read only by them. A row lives from its bytes proven until they
 * are gone: file_start holds a place on the ledger and nothing else, and file_found is the one door every road keeps a file by.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FILES_MAX, FILES_BUCKET, type FileLook, type FileShows, type FileStatus } from "@chanlytics/contracts";
import type { Database } from "../database.types";

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

/** One file whole, for the service role's work on it, removed or not. */
export async function fileForWork(db: Db, tenantId: string, id: string): Promise<FileRow | null> {
  const { data, error } = await db.from("files").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new Error(`file: ${error.message}`);
  return data ?? null;
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

/** A member's upload begins: the door's permission and cap, and the purge that lets its bytes go if they never become a file. */
export async function fileStart(db: Db, tenantId: string, id: string) {
  return db.rpc("file_start", { p_tenant_id: tenantId, p_id: id });
}

/** What became of what was brought: a new file, the file it twins (or nothing, if a person let it go), or no room. */
export type FileFate = { fate: "kept" | "here" | "full"; file_id: string | null };

function fateOf(data: unknown): FileFate {
  const o = (data ?? {}) as { fate?: unknown; file_id?: unknown };
  if (o.fate !== "kept" && o.fate !== "here" && o.fate !== "full") throw new Error("file found: no fate answered");
  return { fate: o.fate, file_id: typeof o.file_id === "string" ? o.file_id : null };
}

/**
 * A file whose bytes were proven, by any road: the one door. The service role's: no session may say what the bytes are, and
 * asked twice it answers the same.
 */
export async function fileFound(
  db: Db,
  a: {
    tenantId: string;
    id: string;
    status: Extract<FileStatus, "inbox" | "filed">;
    source: string;
    sourceRef: string | null;
    name: string;
    mime: string;
    bytes: number;
    fingerprint: string;
    width: number | null;
    height: number | null;
    shows: FileShows | null;
    edition: number;
    actor: string | null;
  },
): Promise<FileFate> {
  const { data, error } = await db.rpc("file_found", {
    p_tenant_id: a.tenantId,
    p_id: a.id,
    p_status: a.status,
    p_source: a.source,
    p_source_ref: a.sourceRef as string,
    p_name: a.name,
    p_mime: a.mime,
    p_bytes: a.bytes,
    p_fingerprint: a.fingerprint,
    p_width: a.width as number,
    p_height: a.height as number,
    p_shows: a.shows as string,
    p_edition: a.edition,
    ...(a.actor ? { p_actor: a.actor } : {}),
  });
  if (error) throw new Error(`file found: ${error.message}`);
  return fateOf(data);
}

/** What a person says of a file. A field left out stays. */
export async function fileChange(
  db: Db,
  a: {
    tenantId: string;
    id: string;
    name?: string | undefined;
    shows?: string | undefined;
    whoInIt?: string | undefined;
    status?: "filed" | "set_aside" | undefined;
  },
) {
  return db.rpc("file_change", {
    p_tenant_id: a.tenantId,
    p_id: a.id,
    ...(a.name !== undefined ? { p_name: a.name } : {}),
    ...(a.shows !== undefined ? { p_shows: a.shows } : {}),
    ...(a.whoInIt !== undefined ? { p_who_in_it: a.whoInIt } : {}),
    ...(a.status !== undefined ? { p_status: a.status } : {}),
  });
}

/** The Inbox's one press: what waits, among these, is filed. Answers how many moved. */
export async function fileKeepMany(db: Db, tenantId: string, ids: readonly string[]) {
  return db.rpc("file_keep_many", { p_tenant_id: tenantId, p_ids: [...ids] });
}

/** A person removed a file. Its bytes go by the file_purge job, and an import does not bring it back. */
export async function fileRemove(db: Db, tenantId: string, id: string) {
  return db.rpc("file_remove", { p_tenant_id: tenantId, p_id: id });
}

/** What the look saw, under the owner's corrections, and every way a look ends: a settled failure comes here too. */
export async function fileLookKeep(
  db: Db,
  a: {
    tenantId: string;
    id: string;
    status: "done" | "refused" | "failed";
    edition: number;
    look: FileLook | null;
    name: string | null;
    shows: FileShows | null;
  },
): Promise<void> {
  const { error } = await db.rpc("file_look_keep", {
    p_tenant_id: a.tenantId,
    p_id: a.id,
    p_status: a.status,
    p_edition: a.edition,
    p_look: a.look,
    p_name: a.name as string,
    p_shows: a.shows as string,
  });
  if (error) throw new Error(`file look: ${error.message}`);
}

/** What a public listing offered and nobody kept goes aside: that listing was not this business's, or its own profile came. */
export async function fileListingAside(db: Db, tenantId: string): Promise<number> {
  const { data, error } = await db.rpc("file_listing_aside", { p_tenant_id: tenantId });
  if (error) throw new Error(`file listing aside: ${error.message}`);
  return typeof data === "number" ? data : 0;
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

/** A removed file's bytes and Anthropic's copy are gone, so its row goes. */
export async function filePurged(db: Db, tenantId: string, id: string): Promise<void> {
  const { error } = await db.rpc("file_purged", { p_tenant_id: tenantId, p_id: id });
  if (error) throw new Error(`file purged: ${error.message}`);
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
