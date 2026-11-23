/**
 * A made video's copy on Chanlytics' own shelf (00690, the archive plan's B2): what the shelving, the letting go and a
 * return read and write of `file_archives` and `file_archive_parts`, where the copy's origin is the shelf. Only the
 * service role writes, through the doors named here, each of which names the state it leaves.
 *
 * A copy is begun with its job in one statement, so one that is saving always has the job that puts it. It is checked
 * only by what the shelf itself says of the bytes it holds. One found missing or wrong is put back, not marked lost:
 * the video's own file is still Chanlytics', and only a copy that cannot be put from it leaves nothing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, FILE_ARCHIVE_STATES, isOneOf, type TenantId } from "@chanlytics/contracts";
import { z } from "zod";
import type { Database } from "../../types";
import { readAnswer } from "../../shared/read-json";
import { platformWide } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;

/** Why a shelf copy could not be put: other bytes than the video's, no file to put it from, or the shelf would not take it. */
const SHELF_FAILURES = ["mismatch", "not_found", "refused"] as const;
type ShelfFailure = (typeof SHELF_FAILURES)[number];

/** A video's piece on the shelf, as its row says it: where its copy stands, why it failed, and the bytes it must be. */
interface ShelfPart {
  state: (typeof FILE_ARCHIVE_STATES)[number];
  why: ShelfFailure | null;
  bytes: number;
  sha256: string | null;
}

const BegunAnswer = z.object({ fate: z.enum(["none", "kept", "full", "begun"]), state: z.string().optional() });

/**
 * A made video's shelf copy begun (file_shelf_begin): its row and its piece, with the bytes and the SHA-256 taken as
 * the video was made, and its job, in one statement. `none`: not a made video still there. `kept`: it has one already.
 * `full`: the workspace's shelf has no room for it within `secondsMax`. `begun`: saving, and its job is on the ledger.
 */
export async function beginShelfCopy(
  db: Db,
  ask: { tenantId: TenantId; fileId: string; bytes: number; sha256: string; secondsMax: number },
): Promise<"none" | "kept" | "full" | "begun"> {
  const { data, error } = await db.rpc("file_shelf_begin", {
    p_tenant_id: ask.tenantId,
    p_file_id: ask.fileId,
    p_bytes: ask.bytes,
    p_sha256: ask.sha256,
    p_seconds_max: ask.secondsMax,
  });
  if (error) throw new DbFailure(error, "cannot begin the video's shelf copy");
  return readAnswer("file_shelf_begin", BegunAnswer, data).fate;
}

/**
 * What the shelf holds compared with what was sent (file_shelf_checked): `bytes` and `sha256` are the shelf's own
 * record. `checked` where both are the piece's own; `mismatch` where not, and the copy is failed; `none` where no
 * copy was saving.
 */
export async function markShelfChecked(
  db: Db,
  ask: { tenantId: TenantId; fileId: string; bytes: number; sha256: string | null },
): Promise<"checked" | "mismatch" | "none"> {
  const { data, error } = await db.rpc("file_shelf_checked", {
    p_tenant_id: ask.tenantId,
    p_file_id: ask.fileId,
    p_bytes: ask.bytes,
    // The door takes a text; a SHA-256 the shelf did not say is no match there.
    p_sha256: ask.sha256 ?? "",
  });
  if (error) throw new DbFailure(error, "cannot check the video's shelf copy");
  return data === "checked" || data === "mismatch" ? data : "none";
}

/** A shelf copy that could not be put (file_shelf_failed), with why. Answers whether one was saving. */
export async function failShelfCopy(
  db: Db,
  ask: { tenantId: TenantId; fileId: string; why: ShelfFailure },
): Promise<boolean> {
  const { data, error } = await db.rpc("file_shelf_failed", {
    p_tenant_id: ask.tenantId,
    p_file_id: ask.fileId,
    p_why: ask.why,
  });
  if (error) throw new DbFailure(error, "cannot say the video's shelf copy failed");
  return data === true;
}

/**
 * A shelf copy put back (file_shelf_again): one that was checked and is found missing or wrong, or one that failed,
 * is saving again with its job, in one statement. Answers whether it was begun.
 */
export async function putShelfCopyBack(db: Db, tenantId: TenantId, fileId: string): Promise<boolean> {
  const { data, error } = await db.rpc("file_shelf_again", { p_tenant_id: tenantId, p_file_id: fileId });
  if (error) throw new DbFailure(error, "cannot put the video's shelf copy back");
  return data === true;
}

/** A file's video piece on the shelf, as its rows say it; null where the file has no shelf copy. */
export async function findShelfPart(db: Db, tenantId: TenantId, fileId: string): Promise<ShelfPart | null> {
  const copy = await db
    .from("file_archives")
    .select("id, state, why")
    .eq("tenant_id", tenantId)
    .eq("file_id", fileId)
    .eq("origin", "shelf")
    .maybeSingle();
  if (copy.error) throw new DbFailure(copy.error, "cannot read the video's shelf copy");
  if (!copy.data || !isOneOf(FILE_ARCHIVE_STATES, copy.data.state)) return null;
  const piece = await db
    .from("file_archive_parts")
    .select("bytes, sha256")
    .eq("tenant_id", tenantId)
    .eq("archive_id", copy.data.id)
    .eq("part", "video")
    .maybeSingle();
  if (piece.error) throw new DbFailure(piece.error, "cannot read the shelf copy's piece");
  if (!piece.data) return null;
  return {
    state: copy.data.state,
    why: isOneOf(SHELF_FAILURES, copy.data.why) ? copy.data.why : null,
    bytes: Number(piece.data.bytes),
    sha256: piece.data.sha256,
  };
}

/**
 * Shelf copies left saving for `staleSeconds` get their job again (file_shelf_requeue), for every workspace in one
 * statement: the floor under the doors that write the job themselves. Answers how many jobs it wrote.
 */
export async function requeueShelfCopies(db: Db, ask: { staleSeconds: number; limit: number }): Promise<number> {
  const { data, error } = await platformWide(db).rpc("file_shelf_requeue", {
    p_stale_seconds: ask.staleSeconds,
    p_limit: ask.limit,
  });
  if (error) throw new DbFailure(error, "cannot ask again for the shelf copies left saving");
  return typeof data === "number" ? data : 0;
}
