/**
 * What the shelf really holds, held to what the rows say (the "Prove it works" plan, lane 1; the archive plan left it
 * to its B6: "a pass that lists the shelf for objects no row names"). Every other check asks the shelf about one
 * video at the moment something leans on it. Nothing ever asked the shelf what it holds, so two things could stand
 * unseen: an object no row names, which nothing would ever take off; and a row that says checked with nothing behind
 * it, found only on the day its video was wanted.
 *
 * A step of the half-hourly pass, a few workspaces a pass. For each, in this order: its rows are read whole, then the
 * shelf's own list of what it holds for that workspace, under a ticket for that workspace alone (apps/relay/src/
 * shelf.ts). So a copy begun meanwhile already has its row, and a row that was checked had its object before the list
 * was taken. Then:
 *
 *   on the shelf, no row      taken off. Asked of the database once more first, at that moment: a copy's row is
 *                             written before its bytes are put, so an object with no row is nobody's.
 *   a row checked, no object  asked of the shelf itself (check.ts), which reads that one file's record and, where it
 *                             holds nothing, puts the copy back from the video's own kept file and says so once.
 *                             Not for a removed file: its purge is taking both away.
 *
 * Nothing is judged by half an answer: a list that could not be had whole (no answer, a relay older than the list)
 * leaves the workspace as it is and ends the step for this pass, and rows past what one read holds are a refusal, not
 * a part. A key under the workspace's name that is no file's is said and never touched. Bounded by count and by time:
 * it runs inside the health sweep, so once its time has come no workspace is begun, no page of a list asked for and
 * no mend started; what is left waits for its next turn.
 */
import { listShelf, removeFromShelf, type Shelf } from "@chanlytics/channels/files";
import { MIN_MS, SECOND_MS, type TenantId } from "@chanlytics/contracts";
import { findFileForWork, hasShelfCopy, listShelfCopies, listShelvingWorkspaces } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errField, logger, type Logger } from "../../shared/log.js";
import { askShelf } from "./check.js";
import { shelfOf } from "./shelve.js";

type Db = SupabaseClient<Database>;

/** How the compare is paced: a floor under what should never happen, so slow and small. */
const SHELF_COMPARE = {
  /** The workspaces one pass compares. */
  aSweep: 10,
  /** Nothing is begun once the step has run this long: no workspace, no page of a list, no mend. */
  mostMs: 5 * SECOND_MS,
  /** The most objects taken off, and the most copies asked after, in one workspace a pass: the rest wait their turn. */
  mendsAWorkspace: 20,
  /** The clock's step the slice is chosen by: finer than the pass, so no schedule lands on the same slices for good. */
  slotMs: 10 * MIN_MS,
} as const;

/** What one workspace's compare mended: objects taken off the shelf, and copies put back. */
interface Mended {
  removed: number;
  putBack: number;
}

/**
 * Which slice of the workspaces a pass compares, by the clock alone, so nothing is kept between passes: each slot of
 * the clock is scattered over the slices (a multiply by a large odd number), and every workspace's turn comes round
 * whatever the pass's own period is.
 */
function sliceOf(nowMs: number, total: number): number {
  const slices = Math.max(1, Math.ceil(total / SHELF_COMPARE.aSweep));
  const slot = Math.floor(nowMs / SHELF_COMPARE.slotMs);
  return (Math.imul(slot, 0x9e3779b1) >>> 0) % slices;
}

/** The workspaces this pass compares: the first read says how many there are, and is the slice itself where it is the first. */
async function workspacesOf(db: Db, nowMs: number): Promise<TenantId[]> {
  const size = SHELF_COMPARE.aSweep;
  const first = await listShelvingWorkspaces(db, { from: 0, size });
  const slice = sliceOf(nowMs, first.total);
  if (first.total === 0 || slice === 0) return first.tenantIds;
  return (await listShelvingWorkspaces(db, { from: slice * size, size })).tenantIds;
}

/** One object no row names, taken off the shelf: asked of the database once more first. Answers whether it went. */
async function takeOff(db: Db, shelf: Shelf, video: { tenantId: TenantId; fileId: string }, log: Logger) {
  if (await hasShelfCopy(db, video.tenantId, video.fileId)) return false;
  const gone = await removeFromShelf(shelf, video);
  log.warn("file_shelve_failed", { file: video.fileId, why: "unheld", gone });
  return gone;
}

/** One copy whose row says checked and whose object the list did not name: the shelf itself asked. Answers whether it was put back. */
async function askAfterBare(db: Db, video: { tenantId: TenantId; fileId: string }, log: Logger): Promise<boolean> {
  const file = await findFileForWork(db, video.tenantId, video.fileId);
  // Purged, or on its way out: its purge takes the object and then the row.
  if (!file || file.removed_at) return false;
  return (await askShelf(db, video, log)) === "put_back";
}

/**
 * One workspace's shelf compared with its rows and mended, while the step has time (`until`); null where the shelf's
 * list could not be had whole.
 */
async function compare(db: Db, shelf: Shelf, at: { tenantId: TenantId; until: number }): Promise<Mended | null> {
  const { tenantId, until } = at;
  const log = logger({ tenant_id: tenantId });
  // The rows first, the list second: see the head of this file.
  const rows = await listShelfCopies(db, tenantId);
  const listed = await listShelf(shelf, tenantId, {}, until);
  if (!listed.ok) return null;
  const named = new Set(rows.map((row) => row.fileId));
  const onShelf = new Set(listed.files);
  const mended: Mended = { removed: 0, putBack: 0 };
  for (const fileId of listed.files.filter((id) => !named.has(id)).slice(0, SHELF_COMPARE.mendsAWorkspace)) {
    if (Date.now() >= until) return mended;
    if (await takeOff(db, shelf, { tenantId, fileId }, log)) mended.removed += 1;
  }
  const bare = rows.filter((row) => row.state === "checked" && !onShelf.has(row.fileId));
  for (const row of bare.slice(0, SHELF_COMPARE.mendsAWorkspace)) {
    if (Date.now() >= until) return mended;
    if (await askAfterBare(db, { tenantId, fileId: row.fileId }, log)) mended.putBack += 1;
  }
  if (listed.other > 0) log.warn("file_shelve_failed", { why: "unknown_keys", keys: listed.other });
  return mended;
}

/**
 * The pass's step. Answers how many objects it took off and copies it had put back. Nothing is asked where this
 * deployment has no shelf, and a relay that cannot say what it holds ends the step for this pass.
 */
export async function keepShelfTrue(db: Db, nowMs = Date.now()): Promise<number> {
  const shelf = shelfOf();
  if (!shelf) return 0;
  const until = nowMs + SHELF_COMPARE.mostMs;
  let mends = 0;
  for (const tenantId of await workspacesOf(db, nowMs)) {
    if (Date.now() >= until) break;
    try {
      const mended = await compare(db, shelf, { tenantId, until });
      if (!mended) break;
      mends += mended.removed + mended.putBack;
    } catch (failure) {
      // One workspace that cannot be compared is a line: the next is still compared.
      logger({ tenant_id: tenantId }).error("files_sweep_failed", { part: "shelf_held", error: errField(failure) });
    }
  }
  return mends;
}
