/**
 * A watched clip's copy at the video platform, let go and brought back (00654, the footage sources plan's
 * Availability): what the copy's door, its return and the letting go read and write of `files`. Only the service role
 * writes, through these.
 *
 * Every move names the state it leaves, in SQL: a copy marked going by one caller is another's to leave alone, a
 * return begun twice is one return, and the video platform's word about an earlier attempt never settles a later one
 * (the row is found by the copy's own id there).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DbFailure,
  FILE_COPY_LOSSES,
  FILE_COPY_STATES,
  FILE_COPY_WHYS,
  isOneOf,
  type FileCopyLoss,
  type FileCopyState,
  type FileCopyWait,
  type FileCopyWhy,
  type TenantId,
} from "@chanlytics/contracts";
import { z } from "zod";
import type { Database } from "../../types";
import { readAnswer } from "../../shared/read-json";
import { platformWide } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;

/** Where a copy stands once settled by what its origins now say, and the item a return would read it from. */
interface CopyStanding {
  state: FileCopyState;
  /** Why it is lost, or why it did not come back when last asked for; null where neither. */
  reason: FileCopyWhy | null;
  /** The origin that can give it back; null where none can. */
  itemId: string | null;
}

const StandingAnswer = z.object({
  copy_state: z.string().nullable(),
  copy_why: z.string().nullable().optional(),
  item_id: z.string().nullable().optional(),
});

/**
 * A copy that is away or lost set to what its origins now say (file_copy_settle): lost, with why, where none can give
 * it back; away again where one can. Answers where it now stands; null for a file that is not there.
 */
export async function settleFileCopy(db: Db, tenantId: TenantId, fileId: string): Promise<CopyStanding | null> {
  const { data, error } = await db.rpc("file_copy_settle", { p_tenant_id: tenantId, p_file_id: fileId });
  if (error) throw new DbFailure(error, "cannot settle the video's copy");
  const answer = readAnswer("file_copy_settle", StandingAnswer, data);
  if (!isOneOf(FILE_COPY_STATES, answer.copy_state)) return null;
  return {
    state: answer.copy_state,
    reason: isOneOf(FILE_COPY_WHYS, answer.copy_why) ? answer.copy_why : null,
    itemId: answer.item_id ?? null,
  };
}

/**
 * A copy was used just now: what is let go first is what was used longest ago. Written only where the last use is
 * older than `staleBefore`, so a clip played and looked at through one turn is one write.
 */
export async function touchFileCopy(db: Db, tenantId: TenantId, fileId: string, staleBefore: Date): Promise<void> {
  const { error } = await db
    .from("files")
    .update({ copy_used_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", fileId)
    .eq("copy_state", "here")
    .or(`copy_used_at.is.null,copy_used_at.lt.${staleBefore.toISOString()}`);
  if (error) throw new DbFailure(error, "cannot say the video's copy was used");
}

/** A copy marked going: its file, the id to delete at the video platform, and the seconds that frees. */
export interface CopyGoing {
  id: string;
  mediaRef: string;
  seconds: number;
}

const GoingAnswer = z.array(
  z.object({ id: z.string(), media_ref: z.string(), seconds: z.number().nullable().optional() }),
);

/**
 * A workspace's copies marked going (file_copies_let_go). By room (`seconds`: a video of that length must fit): the
 * least recently used first, as many as free what is short, none where all that may go would not. By age (`seconds`
 * null): each one unused since `unusedBefore`. Never an upload, a video made here or a found video, and never one
 * used or arrived since `restedBefore`. The caller deletes each at the video platform, then says so (markCopyGone).
 */
export async function markCopiesGoing(
  db: Db,
  rule: { tenantId: TenantId; seconds: number | null; unusedBefore: Date | null; restedBefore: Date; limit: number },
): Promise<CopyGoing[]> {
  const { data, error } = await db.rpc("file_copies_let_go", {
    p_tenant_id: rule.tenantId,
    // Null: by age, where a time is given, and never by room.
    p_seconds: rule.seconds,
    p_unused_before: rule.unusedBefore ? rule.unusedBefore.toISOString() : null,
    p_rested_before: rule.restedBefore.toISOString(),
    p_limit: rule.limit,
  });
  if (error) throw new DbFailure(error, "cannot let the workspace's copies go");
  return readAnswer("file_copies_let_go", GoingAnswer, data).map((copy) => ({
    id: copy.id,
    mediaRef: copy.media_ref,
    seconds: Number(copy.seconds ?? 0),
  }));
}

/**
 * A copy marked going was deleted at the video platform (file_copy_gone): the file is away and holds no id there, and
 * what waited for room in the videos is due. Answers whether it was one.
 */
export async function markCopyGone(db: Db, tenantId: TenantId, fileId: string): Promise<boolean> {
  const { data, error } = await db.rpc("file_copy_gone", { p_tenant_id: tenantId, p_id: fileId });
  if (error) throw new DbFailure(error, "cannot say the video's copy went");
  return data === true;
}

/** Which of the day's budgets bound a return. */
const RETURN_BUDGETS_BOUND = ["units", "platform_bytes", "workspace_returns"] as const;

/**
 * What a return's door said: nothing to bring back (here, going, none), one already under way (returning), no origin
 * can give it back (lost), the videos are full (room), a day's budget binds (wait), or go: the copy is marked
 * returning, and its length is held in the minutes.
 */
export type CopyReturnBegun =
  | { fate: "here" | "going" | "returning" | "none" | "go" }
  | { fate: "lost"; loss: FileCopyLoss }
  | { fate: "room"; seconds: number | null }
  | { fate: "wait"; binds: (typeof RETURN_BUDGETS_BOUND)[number]; until: Date };

const BegunAnswer = z.object({
  fate: z.enum(["here", "going", "returning", "none", "go", "lost", "room", "wait"]),
  why: z.string().optional(),
  seconds: z.number().nullable().optional(),
  binds: z.enum(RETURN_BUDGETS_BOUND).optional(),
  until: z.string().optional(),
});

/**
 * A copy's return judged and begun in one place (file_copy_return_begin): its origin, room for its own length, and
 * the day's budgets, under the workspace's one lock. Every number is the caller's setting.
 */
export async function beginCopyReturn(
  db: Db,
  budgets: {
    tenantId: TenantId;
    fileId: string;
    /** What the return will still spend at the provider. */
    units: number;
    platformBytesMax: number;
    workspaceReturnsMax: number;
    unitsMax: number;
    staleSeconds: number;
  },
): Promise<CopyReturnBegun> {
  const { data, error } = await db.rpc("file_copy_return_begin", {
    p_tenant_id: budgets.tenantId,
    p_id: budgets.fileId,
    p_units: budgets.units,
    p_platform_bytes_max: budgets.platformBytesMax,
    p_workspace_returns_max: budgets.workspaceReturnsMax,
    p_units_max: budgets.unitsMax,
    p_stale_seconds: budgets.staleSeconds,
  });
  if (error) throw new DbFailure(error, "cannot begin the copy's return");
  const answer = readAnswer("file_copy_return_begin", BegunAnswer, data);
  if (answer.fate === "lost")
    return { fate: "lost", loss: isOneOf(FILE_COPY_LOSSES, answer.why) ? answer.why : "no_origin" };
  if (answer.fate === "room") return { fate: "room", seconds: answer.seconds ?? null };
  if (answer.fate === "wait") {
    if (!answer.binds || !answer.until) throw new Error("file copy return begin: a wait named no budget");
    return { fate: "wait", binds: answer.binds, until: new Date(answer.until) };
  }
  return { fate: answer.fate };
}

/**
 * The id the video platform gave a copy coming back, kept on its row (file_copy_returning): only on one that is
 * returning and holds none. Answers whether it was kept; where it was not, the caller deletes that copy.
 */
export async function keepReturningCopy(
  db: Db,
  tenantId: TenantId,
  fileId: string,
  mediaRef: string,
): Promise<boolean> {
  const { data, error } = await db.rpc("file_copy_returning", {
    p_tenant_id: tenantId,
    p_id: fileId,
    p_media_ref: mediaRef,
  });
  if (error) throw new DbFailure(error, "cannot keep the returning copy");
  return data === true;
}

/**
 * A return that did not happen (file_copy_return_failed): the file is away again, with why, and its media_status is
 * untouched. Only the attempt named by its own copy's id is undone (`mediaRef` null where the video platform was
 * never asked). Answers whether it was.
 */
export async function failCopyReturn(
  db: Db,
  failed: { tenantId: TenantId; fileId: string; reason: FileCopyWait; mediaRef: string | null },
): Promise<boolean> {
  const { data, error } = await db.rpc("file_copy_return_failed", {
    p_tenant_id: failed.tenantId,
    p_id: failed.fileId,
    p_why: failed.reason,
    // Null: the attempt that never asked the platform.
    p_media_ref: failed.mediaRef,
  });
  if (error) throw new DbFailure(error, "cannot end the copy's return");
  return data === true;
}

/**
 * Why a copy that is away could not be asked for just now (its folder is not being read, this deployment cannot fetch
 * a video), kept on its row for whoever reads it next. Only on one that is away.
 */
export async function keepCopyWait(db: Db, tenantId: TenantId, fileId: string, reason: FileCopyWait): Promise<void> {
  const { error } = await db
    .from("files")
    .update({ copy_why: reason })
    .eq("tenant_id", tenantId)
    .eq("id", fileId)
    .eq("copy_state", "away");
  if (error) throw new DbFailure(error, "cannot say why the video's copy waits");
}

/** Whether a file's copy is being brought back right now: what opens the relay's key door for its origin. */
export async function isCopyReturning(db: Db, tenantId: TenantId, fileId: string): Promise<boolean> {
  const { data, error } = await db
    .from("files")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", fileId)
    .eq("copy_state", "returning")
    .is("removed_at", null)
    .maybeSingle();
  if (error) throw new DbFailure(error, "cannot read whether the video's copy is returning");
  return data !== null;
}

/**
 * A file by its id alone, whichever workspace's, as a copy named for its return finds it: its workspace, and whether
 * a return of it has been begun and holds no id yet (its job may still be writing one). Null where this database
 * holds no such file.
 */
export async function findReturnAnywhere(
  db: Db,
  fileId: string,
): Promise<{ tenantId: TenantId; awaitsItsId: boolean } | null> {
  const { data, error } = await platformWide(db)
    .from("files")
    .select("tenant_id, copy_state, media_ref")
    .eq("id", fileId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "cannot read the file a copy was brought back for");
  if (!data) return null;
  return { tenantId: data.tenant_id, awaitsItsId: data.copy_state === "returning" && data.media_ref === null };
}

/** A copy on its way out or back that nothing has touched for a while: what the sweep asks after. */
export type CopyMoving = Pick<
  Database["public"]["Tables"]["files"]["Row"],
  "id" | "tenant_id" | "copy_state" | "copy_why" | "media_ref" | "updated_at"
>;

/**
 * The sweep's read across workspaces: copies marked going or returning, untouched since `before`, oldest first. A
 * going one's delete is finished; a returning one's word is asked of the video platform, as an upload's is.
 */
export async function listCopiesMoving(db: Db, range: { before: Date; limit: number }): Promise<CopyMoving[]> {
  const { data, error } = await platformWide(db)
    .from("files")
    .select("id, tenant_id, copy_state, copy_why, media_ref, updated_at")
    .in("copy_state", ["going", "returning"])
    .is("removed_at", null)
    .lt("updated_at", range.before.toISOString())
    .order("updated_at", { ascending: true })
    .limit(range.limit);
  if (error) throw new DbFailure(error, "cannot read the copies on their way");
  return data;
}

const GraceAnswer = z.object({ removed: z.number(), kept: z.number(), cleared: z.number() });

/**
 * The seven-day cleanup (source_items_grace_end): each item seen in its provider's bin, or moved out to a place its
 * account can see, `graceSeconds` ago. Its Library file is removed only if nothing used it and no other origin holds
 * it; then its row goes. A file with no origin is never read. Answers how many files went, stayed, and rows cleared.
 */
export async function endSourceGrace(
  db: Db,
  pace: { graceSeconds: number; limit: number },
): Promise<{ removed: number; kept: number; cleared: number }> {
  const { data, error } = await db.rpc("source_items_grace_end", {
    p_grace_seconds: pace.graceSeconds,
    p_limit: pace.limit,
  });
  if (error) throw new DbFailure(error, "cannot end the grace of what left the watched folders");
  const answer = readAnswer("source_items_grace_end", GraceAnswer, data);
  return { removed: answer.removed, kept: answer.kept, cleared: answer.cleared };
}
