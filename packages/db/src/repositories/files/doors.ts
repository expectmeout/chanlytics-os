/**
 * A business's files (00551, decision 0099), the doors: every write. The ones a member calls ask the settings permission
 * themselves; the ones the edge calls are the service role's alone. A row lives from its bytes proven until they are gone:
 * file_start holds a place on the ledger and nothing else, and file_found is the one door every road keeps a file by.
 */
import { heldTenantId, DbFailure } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isOneOf,
  recordOrEmpty,
  type FileLook,
  type FileShows,
  type FileStatus,
  type HeardBy,
  type SoundNote,
  type SoundPart,
  type SoundWords,
} from "@chanlytics/contracts";
import type { Database, Json } from "../../types";
import { asJson } from "../../shared/json";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** A member's upload begins: the door's permission and cap, and the purge that lets its bytes go if they never become a file. */
export async function startFile(db: Db, tenantId: TenantId, id: string) {
  return db.rpc("file_start", { p_tenant_id: tenantId, p_id: id });
}

/** What became of what was brought: a new file, the file it twins (or nothing, if a person let it go), or no room. */
export type FileFate = { fate: "kept" | "here" | "full"; file_id: string | null };

function fateOf(data: unknown): FileFate {
  const o = recordOrEmpty(data);
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
    tenantId: TenantId;
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
    p_source_ref: args.sourceRef,
    p_name: args.name,
    p_mime: args.mime,
    p_bytes: args.bytes,
    p_fingerprint: args.fingerprint,
    p_width: args.width,
    p_height: args.height,
    p_shows: args.shows,
    p_edition: args.edition,
    ...(args.actor ? { p_actor: args.actor } : {}),
  });
  if (error) throw new DbFailure(error, "file found");
  return fateOf(data);
}

/** What Ask made, kept as a file once its bytes are stored (00553). The service role's. */
export async function recordFileMade(
  db: Db,
  args: {
    tenantId: TenantId;
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
  if (error) throw new DbFailure(error, "file made");
  return fateOf(data);
}

/** What a person says of a file. A field left out stays. */
export async function updateFileRow(
  db: Db,
  args: {
    tenantId: TenantId;
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
export async function keepManyFiles(db: Db, tenantId: TenantId, ids: readonly string[]) {
  return db.rpc("file_keep_many", { p_tenant_id: tenantId, p_ids: [...ids] });
}

/** A person removed a file. Its bytes go by the file_purge job, and an import does not bring it back. */
export async function deleteFileRow(db: Db, tenantId: TenantId, id: string) {
  return db.rpc("file_remove", { p_tenant_id: tenantId, p_id: id });
}

/** What the look saw, under the owner's corrections, and every way a look ends: a settled failure comes here too. */
export async function keepFileLook(
  db: Db,
  args: {
    tenantId: TenantId;
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
    p_name: args.name,
    p_shows: args.shows,
  });
  if (error) throw new DbFailure(error, "file look");
}

/** What a public listing offered and nobody kept goes aside: that listing was not this business's, or its own profile came. */
export async function setFileListingAside(db: Db, tenantId: TenantId): Promise<number> {
  const { data, error } = await db.rpc("file_listing_aside", { p_tenant_id: tenantId });
  if (error) throw new DbFailure(error, "file listing aside");
  return typeof data === "number" ? data : 0;
}

/** A removed file's bytes and Anthropic's copy are gone, so its row goes. */
export async function recordFilePurged(db: Db, tenantId: TenantId, id: string): Promise<void> {
  const { error } = await db.rpc("file_purged", { p_tenant_id: tenantId, p_id: id });
  if (error) throw new DbFailure(error, "file purged");
}

/* ------------------------------------------------------------------------------------------------- videos (00556) -- */

/**
 * What became of a video on its way: kept, the clip already here, or no room (the workspace's files, or its minutes). A row
 * kept by an earlier asking says the reservation it holds, which may not be this call's.
 */
export type VideoFate = {
  fate: "kept" | "here" | "full" | "minutes";
  file_id: string | null;
  media_ref: string | null;
};

/**
 * A member's video on its way, once the video platform holds its reservation: the row, uploading, with every fact the browser
 * gave, so the platform's word alone can finish it. The service role's; asked twice it answers the same.
 */
export async function beginFileVideo(
  db: Db,
  video: {
    tenantId: TenantId;
    id: string;
    mediaRef: string;
    name: string;
    mime: string;
    bytes: number;
    fingerprint: string;
    seconds: number | null;
    actor: string | null;
  },
): Promise<VideoFate> {
  const { data, error } = await db.rpc("file_video_begin", {
    p_tenant_id: video.tenantId,
    p_id: video.id,
    p_media_ref: video.mediaRef,
    p_name: video.name,
    p_mime: video.mime,
    p_bytes: video.bytes,
    p_fingerprint: video.fingerprint,
    p_seconds: video.seconds,
    ...(video.actor ? { p_actor: video.actor } : {}),
  });
  if (error) throw new DbFailure(error, "file video begin");
  const answer = recordOrEmpty(data);
  if (answer.fate !== "kept" && answer.fate !== "here" && answer.fate !== "full" && answer.fate !== "minutes")
    throw new Error("file video begin: no fate answered");
  return {
    fate: answer.fate,
    file_id: typeof answer.file_id === "string" ? answer.file_id : null,
    media_ref: typeof answer.media_ref === "string" ? answer.media_ref : null,
  };
}

/** A video's bytes have all gone: its tile says it is being made ready. Only from uploading. */
export async function markFileMediaProcessing(db: Db, tenantId: TenantId, id: string): Promise<void> {
  const { error } = await db.rpc("file_media_processing", { p_tenant_id: tenantId, p_id: id });
  if (error) throw new DbFailure(error, "file media processing");
}

/** What the platform's word did to a row, found by its id there. */
export type MediaFate = {
  fate: "ready" | "failed" | "repeated" | "gone" | "unknown";
  tenant_id: TenantId | null;
  file_id: string | null;
  /** The video was one made here, and this word moved its piece with it (00613): made on ready, failed on failed. */
  made: boolean;
};

const MEDIA_FATES = ["ready", "failed", "repeated", "gone", "unknown"] as const satisfies readonly MediaFate["fate"][];

function mediaFateOf(data: unknown, door: string): MediaFate {
  const o = recordOrEmpty(data);
  if (!isOneOf(MEDIA_FATES, o.fate)) throw new Error(`${door}: no fate answered`);
  return {
    fate: o.fate,
    tenant_id: typeof o.tenant_id === "string" ? heldTenantId(o.tenant_id) : null,
    file_id: typeof o.file_id === "string" ? o.file_id : null,
    made: o.made === true,
  };
}

/**
 * The platform says a video is playable: a file whether or not the browser said done, its length and size the platform's,
 * and its digest's first step on the ledger. A second delivery changes nothing.
 */
export async function markFileMediaReady(
  db: Db,
  media: { mediaRef: string; seconds: number | null; width: number | null; height: number | null },
): Promise<MediaFate> {
  const { data, error } = await db.rpc("file_media_ready", {
    p_media_ref: media.mediaRef,
    p_seconds: media.seconds,
    p_width: media.width,
    p_height: media.height,
  });
  if (error) throw new DbFailure(error, "file media ready");
  return mediaFateOf(data, "file media ready");
}

/** The platform could not read a video: its tile says so, with the platform's own code kept for the server. */
export async function markFileMediaFailed(db: Db, mediaRef: string, code: string | null): Promise<MediaFate> {
  const { data, error } = await db.rpc("file_media_failed", { p_media_ref: mediaRef, p_error: code ?? "" });
  if (error) throw new DbFailure(error, "file media failed");
  return mediaFateOf(data, "file media failed");
}

/** A video whose bytes never arrived, a day on: removed, for the purge to finish. Answers whether it was one. */
export async function removeLapsedUpload(db: Db, tenantId: TenantId, id: string): Promise<boolean> {
  const { data, error } = await db.rpc("file_upload_lapsed", { p_tenant_id: tenantId, p_id: id });
  if (error) throw new DbFailure(error, "file upload lapsed");
  return data === true;
}

/**
 * One part of what was heard of a video, as it lands: its words, the note on how it sounds, or that it has no sound, with
 * the model that heard it, and the list's few words for the whole as it now stands.
 */
export async function keepFileSound(
  db: Db,
  entry: {
    tenantId: TenantId;
    id: string;
    part: SoundPart;
    value: SoundWords | SoundNote | true;
    by: HeardBy | null;
    said: string | null;
  },
): Promise<void> {
  const { error } = await db.rpc("file_sound_keep", {
    p_tenant_id: entry.tenantId,
    p_id: entry.id,
    p_part: entry.part,
    // As the jsonb holds it: what was heard, read in code already (contracts sound.ts), its fields and nothing else.
    p_value: asJson(entry.value),
    p_by: entry.by ? { model: entry.by.model, at: entry.by.at } : null,
    p_said: entry.said,
  });
  if (error) throw new DbFailure(error, "file sound keep");
}
