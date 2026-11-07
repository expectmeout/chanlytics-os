/**
 * A business's files (00551, decision 0099), the doors: every write. The ones a member calls ask the settings permission
 * themselves; the ones the edge calls are the service role's alone. A row lives from its bytes proven until they are gone:
 * file_start holds a place on the ledger and nothing else, and file_found is the one door every road keeps a file by.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileLook, FileShows, FileStatus } from "@chanlytics/contracts";
import type { Database, Json } from "../../database.types";

type Db = SupabaseClient<Database>;

/** A member's upload begins: the door's permission and cap, and the purge that lets its bytes go if they never become a file. */
export async function startFile(db: Db, tenantId: string, id: string) {
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
export async function recordFileFound(
  db: Db,
  args: {
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
    p_tenant_id: args.tenantId,
    p_id: args.id,
    p_status: args.status,
    p_source: args.source,
    p_source_ref: args.sourceRef as string,
    p_name: args.name,
    p_mime: args.mime,
    p_bytes: args.bytes,
    p_fingerprint: args.fingerprint,
    p_width: args.width as number,
    p_height: args.height as number,
    p_shows: args.shows as string,
    p_edition: args.edition,
    ...(args.actor ? { p_actor: args.actor } : {}),
  });
  if (error) throw new Error(`file found: ${error.message}`);
  return fateOf(data);
}

/** What Ask made, kept as a file once its bytes are stored (00553). The service role's. */
export async function recordFileMade(
  db: Db,
  args: {
    tenantId: string;
    id: string;
    name: string;
    bytes: number;
    fingerprint: string;
    width: number;
    height: number;
    look: Json;
    whoInIt: string;
    made: Json;
    actor: string | null;
  },
): Promise<FileFate> {
  const { data, error } = await db.rpc("file_made", {
    p_tenant_id: args.tenantId,
    p_id: args.id,
    p_name: args.name,
    p_bytes: args.bytes,
    p_fingerprint: args.fingerprint,
    p_width: args.width,
    p_height: args.height,
    p_look: args.look,
    p_who_in_it: args.whoInIt,
    p_made: args.made,
    ...(args.actor ? { p_actor: args.actor } : {}),
  });
  if (error) throw new Error(`file made: ${error.message}`);
  return fateOf(data);
}

/** What a person says of a file. A field left out stays. */
export async function updateFileRow(
  db: Db,
  args: {
    tenantId: string;
    id: string;
    name?: string | undefined;
    shows?: string | undefined;
    whoInIt?: string | undefined;
    status?: "filed" | "set_aside" | undefined;
  },
) {
  return db.rpc("file_change", {
    p_tenant_id: args.tenantId,
    p_id: args.id,
    ...(args.name !== undefined ? { p_name: args.name } : {}),
    ...(args.shows !== undefined ? { p_shows: args.shows } : {}),
    ...(args.whoInIt !== undefined ? { p_who_in_it: args.whoInIt } : {}),
    ...(args.status !== undefined ? { p_status: args.status } : {}),
  });
}

/** The Inbox's one press: what waits, among these, is filed. Answers how many moved. */
export async function keepManyFiles(db: Db, tenantId: string, ids: readonly string[]) {
  return db.rpc("file_keep_many", { p_tenant_id: tenantId, p_ids: [...ids] });
}

/** A person removed a file. Its bytes go by the file_purge job, and an import does not bring it back. */
export async function deleteFileRow(db: Db, tenantId: string, id: string) {
  return db.rpc("file_remove", { p_tenant_id: tenantId, p_id: id });
}

/** What the look saw, under the owner's corrections, and every way a look ends: a settled failure comes here too. */
export async function keepFileLook(
  db: Db,
  args: {
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
    p_tenant_id: args.tenantId,
    p_id: args.id,
    p_status: args.status,
    p_edition: args.edition,
    p_look: args.look,
    p_name: args.name as string,
    p_shows: args.shows as string,
  });
  if (error) throw new Error(`file look: ${error.message}`);
}

/** What a public listing offered and nobody kept goes aside: that listing was not this business's, or its own profile came. */
export async function setFileListingAside(db: Db, tenantId: string): Promise<number> {
  const { data, error } = await db.rpc("file_listing_aside", { p_tenant_id: tenantId });
  if (error) throw new Error(`file listing aside: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

/** A removed file's bytes and Anthropic's copy are gone, so its row goes. */
export async function recordFilePurged(db: Db, tenantId: string, id: string): Promise<void> {
  const { error } = await db.rpc("file_purged", { p_tenant_id: tenantId, p_id: id });
  if (error) throw new Error(`file purged: ${error.message}`);
}
