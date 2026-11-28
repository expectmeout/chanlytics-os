/**
 * What the shelf is owed, caught up by the half-hourly pass (00729; the "Prove it works" plan, lane 1). A made video's
 * shelf copy is begun as the video is made (piece-make.ts, shelve.ts), and three things could leave one with none for
 * good: the run ended between "sent" and the copy's first step, that call failed (it is only logged), or the shelf
 * was full. A video made before its workspace's switch was on has none either. Nothing read for them, so such a video
 * never stepped aside. This is the floor under the making:
 *
 *   never begun   a made video with no shelf copy's row, in a workspace whose switch is on, that fits the room left:
 *                 its own kept file is read, its SHA-256 taken, and its copy begun through the door a new video's
 *                 goes through. A few a pass, the newest first, so a paced catch-up never holds a new video. One whose
 *                 kept file is gone can be given no copy: its row says so, once, and it is asked for no more.
 *   refused       a copy the shelf would not take, or whose job ended (a relay down past its two tries): put back
 *                 through its door, within the shelf's room.
 *   full          a video that does not fit is left where it is and asked for again every pass, so it is shelved by
 *                 itself once there is room. How many wait, and in how many workspaces, is one line a pass: the
 *                 shelf's limit (contracts FILE_SHELF_MINUTES_MAX) is not one an owner is told of.
 *
 * Which videos is the database's to say, for every workspace in one statement (file_shelf_owed), and the doors that
 * begin a copy judge the room again under the workspace's lock. Bounded by count, by weight and by time: it runs
 * inside the health sweep, which has one minute for everything it does. Never throws for one video: the next is
 * still tried.
 */
import { createHash } from "node:crypto";
import { DbFailure, HOUR_MS, SECOND_MS, fileMadePathOf, type TenantId } from "@chanlytics/contracts";
import {
  beginShelfCopy,
  filesBucket,
  listShelfOwed,
  markShelfUnkept,
  putShelfCopyBack,
  type ShelfOwed,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errField, logger } from "../../shared/log.js";
import { SHELF_SECONDS_MAX, saysNotThere, shelfOf } from "./shelve.js";

type Db = SupabaseClient<Database>;

/**
 * How the catch-up is paced. A made video's kept file is read whole to take its SHA-256, as it was held whole when it
 * was made, so a pass reads few, and none past a weight: the made videos production kept on 23 November ran ten to
 * fifteen seconds each, at 46 MiB a minute on average (the archive PRD's S4).
 */
const SHELF_CATCH_UP = {
  /** A video is left for an hour after it was made, and a refused copy for an hour after it was: its making is over by then. */
  staleSeconds: HOUR_MS / SECOND_MS,
  /** The most videos one pass begins a copy of, and the most refused copies it puts back, for every workspace together. */
  aSweep: 3,
  /** The heaviest kept file a pass reads. One past it is counted and said, never read. */
  bytesMax: 150_000_000,
  /** No kept file is opened once the step has run this long: what is left waits for the next pass. */
  mostMs: 8 * SECOND_MS,
  /** One kept file's read is given this long. Storage's own requests are not bounded for it (packages/db service-client.ts). */
  readMs: 8 * SECOND_MS,
} as const;

/** What one pass did: copies begun late, refused copies put back, and videos whose kept file was found gone. */
interface CaughtUp {
  begun: number;
  again: number;
  unkept: number;
}

/**
 * A made video's own kept file, read whole within its time: its bytes, or null where Storage says it is not there. A
 * read that fails any other way, or runs past its time, throws: the video is asked for again next pass.
 */
async function readKept(db: Db, video: { tenantId: TenantId; fileId: string }): Promise<Uint8Array | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timer = setTimeout(
        () => resolve({ data: null, error: { message: `timed out after ${SHELF_CATCH_UP.readMs} ms` } }),
        SHELF_CATCH_UP.readMs,
      );
    });
    const read = await Promise.race([
      filesBucket(db).download(fileMadePathOf(video.tenantId, video.fileId, "video")),
      late,
    ]);
    if (read.error && saysNotThere(read.error)) return null;
    if (read.error) throw new DbFailure(read.error, "read a made video's kept file");
    return new Uint8Array(await read.data.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One made video's copy begun late: its kept file read, its SHA-256 taken, and the copy begun as a new video's is. A
 * kept file that is not there, or holds nothing, can be given no copy, and the video's row says so.
 */
async function beginLate(db: Db, video: { tenantId: TenantId; fileId: string }): Promise<keyof CaughtUp | null> {
  const bytes = await readKept(db, video);
  if (!bytes?.length) {
    await markShelfUnkept(db, video.tenantId, video.fileId);
    logger({ tenant_id: video.tenantId }).warn("file_shelve_failed", {
      file: video.fileId,
      why: "not_found",
      by: "pass",
    });
    return "unkept";
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fate = await beginShelfCopy(db, { ...video, bytes: bytes.length, sha256, secondsMax: SHELF_SECONDS_MAX });
  // Kept or full since the list was read (another video of its workspace took the room): the next pass judges anew.
  return fate === "begun" ? "begun" : null;
}

/** What is owed, begun: each through its own door, one at a time, while the step has time. */
async function beginWhatIsOwed(db: Db, owed: ShelfOwed, until: number): Promise<CaughtUp> {
  const done: CaughtUp = { begun: 0, again: 0, unkept: 0 };
  const said = (video: { tenantId: TenantId; fileId: string }) => (failure: unknown) => {
    logger({ tenant_id: video.tenantId }).error("files_sweep_failed", {
      part: "shelf_owed",
      file: video.fileId,
      error: errField(failure),
    });
    return null;
  };
  for (const copy of owed.again) {
    const back = await putShelfCopyBack(db, { ...copy, secondsMax: SHELF_SECONDS_MAX }).catch(said(copy));
    if (back) done.again += 1;
  }
  for (const video of owed.begin) {
    if (Date.now() >= until) break;
    const end = await beginLate(db, video).catch(said(video));
    if (end) done[end] += 1;
  }
  return done;
}

/**
 * The pass's step. Answers how many copies it began or put back. Nothing is asked where this deployment has no shelf
 * (no relay, or no ticket key), or of a database older than 00729.
 */
export async function keepShelfCaughtUp(db: Db, nowMs = Date.now()): Promise<number> {
  if (!shelfOf()) return 0;
  const owed = await listShelfOwed(db, {
    secondsMax: SHELF_SECONDS_MAX,
    bytesMax: SHELF_CATCH_UP.bytesMax,
    staleSeconds: SHELF_CATCH_UP.staleSeconds,
    limit: SHELF_CATCH_UP.aSweep,
  });
  if (!owed) return 0;
  const log = logger({});
  const done = await beginWhatIsOwed(db, owed, nowMs + SHELF_CATCH_UP.mostMs);
  // One that needed the floor is a line: a made video's copy should be begun as it is made.
  if (done.begun + done.again + done.unkept > 0) log.warn("file_shelve_failed", { why: "never_begun", ...done });
  // A full shelf, said every pass it holds a video back: the limit is the platform's own, and nobody else is told.
  if (owed.full.videos > 0) log.warn("file_shelve_failed", { why: "shelf_full", ...owed.full });
  if (owed.heavy > 0)
    log.warn("file_shelve_failed", { why: "too_heavy", videos: owed.heavy, bytes_max: SHELF_CATCH_UP.bytesMax });
  return done.begun + done.again;
}
