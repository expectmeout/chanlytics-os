/**
 * A made video's copy on Chanlytics' own shelf (00695, the archive plan's B2): what the shelving, the letting go and a
 * return read and write of `file_archives` and `file_archive_parts`, where the copy's origin is the shelf. Only the
 * service role writes, through the doors named here, each of which names the state it leaves.
 *
 * A copy is begun with its job in one statement, so one that is saving always has the job that puts it. It is checked
 * only by what the shelf itself says of the bytes it holds. One found missing or wrong is put back, not marked lost:
 * the video's own file is still Chanlytics', and only a copy that cannot be put from it leaves nothing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, FILE_ARCHIVE_STATES, heldTenantId, isOneOf, type TenantId } from "@chanlytics/contracts";
import { z } from "zod";
import type { Database } from "../../types";
import { isMissingDoor } from "../../shared/missing-door";
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
 * is saving again with its job, in one statement. A failed copy holds no room on the shelf, so it comes back only
 * where it fits within `secondsMax` (00729: the shelf's one room, as a first copy is judged); a checked one is counted
 * already. Answers whether it was begun. A database older than 00729 takes no limit, and is asked as it was.
 */
export async function putShelfCopyBack(
  db: Db,
  copy: { tenantId: TenantId; fileId: string; secondsMax: number },
): Promise<boolean> {
  const asked = { p_tenant_id: copy.tenantId, p_file_id: copy.fileId };
  const within = await db.rpc("file_shelf_again", { ...asked, p_seconds_max: copy.secondsMax });
  const { data, error } =
    within.error && isMissingDoor(within.error) ? await db.rpc("file_shelf_again", asked) : within;
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

/** What the shelf is owed, for every workspace together: what the half-hourly pass begins, and what it only says. */
export interface ShelfOwed {
  /** Made videos with no shelf copy's row that fit the room left, the newest first. */
  begin: { tenantId: TenantId; fileId: string; bytes: number }[];
  /** Copies the shelf refused a while ago, to try again. */
  again: { tenantId: TenantId; fileId: string }[];
  /** How many videos a full shelf is holding back, and in how many workspaces. */
  full: { videos: number; workspaces: number };
  /** How many videos that fit weigh more than the pass reads at once. */
  heavy: number;
}

const OwedAnswer = z.object({
  begin: z.array(z.object({ tenant_id: z.string(), file_id: z.string(), bytes: z.number() })),
  again: z.array(z.object({ tenant_id: z.string(), file_id: z.string() })),
  full: z.object({ videos: z.number(), workspaces: z.number() }),
  heavy: z.number(),
});

/**
 * What the shelf is owed (file_shelf_owed, 00729), for every workspace whose switch is on, in one statement: the made
 * videos with no shelf copy's row that fit the room left and weigh no more than `bytesMax`, the copies the shelf
 * refused, and what a full shelf holds back. A read: each is begun through its own door, which judges the room again.
 * Null from a database older than 00729, where nothing is asked.
 */
export async function listShelfOwed(
  db: Db,
  ask: { secondsMax: number; bytesMax: number; staleSeconds: number; limit: number },
): Promise<ShelfOwed | null> {
  const { data, error } = await platformWide(db).rpc("file_shelf_owed", {
    p_seconds_max: ask.secondsMax,
    p_bytes_max: ask.bytesMax,
    p_stale_seconds: ask.staleSeconds,
    p_limit: ask.limit,
  });
  if (error && isMissingDoor(error)) return null;
  if (error) throw new DbFailure(error, "cannot read what the shelf is owed");
  const answer = readAnswer("file_shelf_owed", OwedAnswer, data);
  return {
    begin: answer.begin.map((video) => ({
      tenantId: heldTenantId(video.tenant_id),
      fileId: video.file_id,
      bytes: Number(video.bytes),
    })),
    again: answer.again.map((copy) => ({ tenantId: heldTenantId(copy.tenant_id), fileId: copy.file_id })),
    full: { videos: Number(answer.full.videos), workspaces: Number(answer.full.workspaces) },
    heavy: Number(answer.heavy),
  };
}

/**
 * A made video whose own kept file is gone can be given no shelf copy, and its row says so (file_shelf_unkept, 00729):
 * failed as not found, with no piece, once, so nothing asks for it again. Answers whether the row was written.
 */
export async function markShelfUnkept(db: Db, tenantId: TenantId, fileId: string): Promise<boolean> {
  const { data, error } = await db.rpc("file_shelf_unkept", { p_tenant_id: tenantId, p_file_id: fileId });
  if (error) throw new DbFailure(error, "cannot say the video has no file to shelve");
  return data === true;
}
