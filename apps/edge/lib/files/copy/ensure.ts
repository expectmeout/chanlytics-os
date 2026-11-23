/**
 * The one door onto a video's copy at the video platform (the footage sources plan, "Availability"; 00654). A watched
 * folder's clip keeps its original with its provider, so its copy at the platform can be let go and fetched again, and
 * a row then holds no id there. Everything that reads a video's copy asks here, by what it is for:
 *
 *   play, moment, piece, warm,  want the copy. One that is here is used, and when is written (what is let go first is
 *   publish, ad                 what was used longest ago). One that is away is asked for: its return's job is put on
 *                               the ledger, held once per file, so a second asker joins the first's. One that is lost
 *                               says why, as a word of a closed set (contracts FILE_COPY_LOSSES). A post set for later
 *                               and an ad ask as Play does (the archive PRD, FR-6.2).
 *   prefetch                    wants the copy too, and never says it was used: AI's early fetch of a clip its card
 *                               names is not a use, so it keeps no clip ahead of one somebody played (A10).
 *   look, digest, upkeep        use a copy only where one is here, and never bring one back: a poster cut again, a
 *                               digest's late step, the sweep and a purge.
 *
 * The id itself is read off the row in this module and nowhere else on the edge (tests/files/copies holds the list),
 * so a reader that skips the door finds none, and cannot ask the platform for a copy that is gone.
 */
import {
  FILE_COPY_LOSSES,
  FILE_COPY_STATES,
  FILE_COPY_WAITS,
  isOneOf,
  type FileCopyLoss,
  type FileCopyWait,
  type TenantId,
} from "@chanlytics/contracts";
import { findFileForWork, settleFileCopy, touchFileCopy, type FileRow } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { scheduleJobOnce } from "@chanlytics/jobs";
import { logAndGoOn } from "@chanlytics/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COPY_RETURN, LET_GO } from "../takes/budgets.js";

type Db = SupabaseClient<Database>;

/** The purposes that want the copy at the platform: one that is away is asked for, once for every asker. */
const WANTING = ["play", "moment", "piece", "warm", "publish", "ad", "prefetch"] as const;

/** What a copy is asked for: to have it at the platform, or only to use one that is here. */
type CopyPurpose = (typeof WANTING)[number] | "look" | "digest" | "upkeep";

/**
 * The purposes that want a copy without saying it was used: what is let go first is what was used longest ago, and a
 * clip AI fetched early for a card nobody pressed was not used.
 */
const UNMARKED: readonly CopyPurpose[] = ["prefetch"];

/**
 * What the door reads of a row: the whole row serves, and so does a sweep's narrow read of one. Where a copy stands
 * may be left out: a read that asks only for videos on their way to the platform (an upload being prepared) names
 * none, and a row read before the column existed (the edge deployed ahead of 00654) has none. Both are here.
 */
type CopyRow = Pick<FileRow, "id" | "tenant_id" | "media_ref"> & Partial<Pick<FileRow, "copy_state" | "copy_why">>;

/**
 * Where a video's copy stands, to whoever asked. `mediaRef` is the copy's id at the video platform: always there for
 * one that is `here`; for one on its way out or back, only what the row still holds (what a purge deletes).
 */
export type CopyHeld<Row> =
  | { copy: "here"; row: Row; mediaRef: string }
  /** On its way back (asked for now, or before), or out: nothing to read just now. */
  | { copy: "returning" | "going"; row: Row; mediaRef: string | null }
  /** Let go, and not asked for by this purpose, or it could not come back when last asked: `reason` says why. */
  | { copy: "away"; row: Row; mediaRef: null; reason: FileCopyWait | null }
  /** Its folder cannot give it back: `loss` says why. Its stills and its words are still its file's. */
  | { copy: "lost"; row: Row; mediaRef: null; loss: FileCopyLoss }
  /** No video's copy: the file is not there, was removed, or is a picture. */
  | { copy: "none"; row: Row | null; mediaRef: null };

/** The return's job, on the ledger: held once per file while one waits or runs, so every asker joins the same one. */
async function askForReturn(db: Db, row: CopyRow, afterMs = 0): Promise<void> {
  await scheduleJobOnce(db, {
    tenantId: row.tenant_id,
    kind: "copy_return",
    dueAt: new Date(Date.now() + afterMs),
    payload: { file_id: row.id },
  });
}

/** A copy that is away or lost, as its row says it, to a purpose that brings nothing back. */
function awayAsTheRowSays<Row extends CopyRow>(row: Row, state: "away" | "lost"): CopyHeld<Row> {
  if (state === "lost")
    return {
      copy: "lost",
      row,
      mediaRef: null,
      loss: isOneOf(FILE_COPY_LOSSES, row.copy_why) ? row.copy_why : "no_origin",
    };
  return {
    copy: "away",
    row,
    mediaRef: null,
    reason: isOneOf(FILE_COPY_WAITS, row.copy_why) ? row.copy_why : null,
  };
}

/**
 * The door, for a row its asker already holds. A picture's row, which holds no copy, answers `none`.
 */
export async function ensureCopyOf<Row extends CopyRow>(
  db: Db,
  row: Row,
  purpose: CopyPurpose,
): Promise<CopyHeld<Row>> {
  // Wanted at the platform: one that is away is asked for. The rest only use one that is here.
  const wanted = isOneOf(WANTING, purpose);
  const state = isOneOf(FILE_COPY_STATES, row.copy_state) ? row.copy_state : "here";
  if (state === "here") {
    if (!row.media_ref) return { copy: "none", row, mediaRef: null };
    // A use that could not be written is a line: the copy is here, and whoever asked is served.
    if (wanted && !UNMARKED.includes(purpose))
      await touchFileCopy(db, row.tenant_id, row.id, new Date(Date.now() - LET_GO.touchEveryMs)).catch(
        logAndGoOn("copy: say it was used"),
      );
    return { copy: "here", row, mediaRef: row.media_ref };
  }
  if (state === "returning") return { copy: "returning", row, mediaRef: row.media_ref };
  if (state === "going") {
    // Being let go this moment: its return is asked for a little on, once the delete has landed.
    if (wanted) await askForReturn(db, row, COPY_RETURN.afterGoingMs);
    return { copy: wanted ? "returning" : "going", row, mediaRef: row.media_ref };
  }
  if (!wanted) return awayAsTheRowSays(row, state);
  // Away, or lost as far as its row knows: its origins are asked first, so a lost original is said at once and one
  // that came back to its folder is fetched again.
  const standing = await settleFileCopy(db, row.tenant_id, row.id);
  if (!standing) return { copy: "none", row: null, mediaRef: null };
  if (standing.state === "lost")
    return {
      copy: "lost",
      row,
      mediaRef: null,
      loss: isOneOf(FILE_COPY_LOSSES, standing.reason) ? standing.reason : "no_origin",
    };
  if (standing.state === "away") await askForReturn(db, row);
  return { copy: "returning", row, mediaRef: null };
}

/** The door, by a file's id: the row is read whole, and a file that is not a video still there answers `none`. */
export async function ensureCopy(
  db: Db,
  tenantId: TenantId,
  fileId: string,
  purpose: CopyPurpose,
): Promise<CopyHeld<FileRow>> {
  const row = await findFileForWork(db, tenantId, fileId);
  if (!row || row.removed_at || row.kind !== "video") return { copy: "none", row, mediaRef: null };
  return ensureCopyOf(db, row, purpose);
}
