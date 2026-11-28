/**
 * The half-hourly pass over copies on their way out or back, and the seven-day cleanup (the footage sources plan,
 * "Availability" and D3; 00654). It is the floor under what is done as it happens: a letting go finishes in the job
 * that began it, and the video platform says its own word about a copy coming back.
 *
 *   going       marked, and its delete at the platform never landed (its job ran out of time, or died): finished here.
 *   returning   the platform's word did not come (its webhook lost, or a preview, which has none): the platform is
 *               asked itself, as it is for an upload, and the row is written as the webhook would have. One whose
 *               job died before the platform was asked is away again; one the platform still has not prepared after
 *               an hour is given up.
 *   no room     asked for (Play, AI, a video being made) and the videos were full: asked for again here, so it
 *               comes back by itself once another copy makes room, and nobody is told to ask again.
 *   the shelf   a made video's copy left saving for an hour (the archive plan's B2): its job is written again. The
 *               doors that begin a copy write its job themselves, so this is only the floor under them.
 *   owed        what the shelf never got (00729, shelf/catch-up.ts): a made video with no copy's row has its kept file
 *               read and its copy begun, a copy the shelf refused is put back, and a full shelf is said.
 *   the grace   an item seen in its provider's bin, or moved out to a place its account can see, seven days ago: its
 *               Library file leaves only if nothing used it and no other origin holds it, and its row goes. One
 *               statement for every workspace (source_items_grace_end), which reads tombstones alone: a file with
 *               no origin left is never touched, and nothing is written to the owner's own let-go list.
 *
 * Few at a time, with no clock of its own; it catches its own failures, since nothing else the sweep does waits on it.
 */
import { deleteStreamVideo, readStreamVideo, type StreamAccount } from "@chanlytics/channels/files";
import { SECOND_MS } from "@chanlytics/contracts";
import {
  endSourceGrace,
  failCopyReturn,
  listCopiesAwaitingRoom,
  listCopiesMoving,
  markFileMediaFailed,
  markFileMediaReady,
  requeueShelfCopies,
  type CopyMoving,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { scheduleJobOnce } from "@chanlytics/jobs";
import { logAndGoOn } from "@chanlytics/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errField, logger } from "../../shared/log.js";
import { catchUpShelf } from "../shelf/catch-up.js";
import { COPY_RETURN, LET_GO, SHELF_REQUEUE, SOURCE_GRACE } from "../takes/budgets.js";
import { streamAccount } from "../video-keys.js";
import { hearCopyWord } from "./bring-back.js";
import { ensureCopyOf } from "./ensure.js";
import { finishCopyGoing } from "./let-go.js";

type Db = SupabaseClient<Database>;

/** How many copies on their way one pass asks after. */
const SWEEP_COPIES = 50;

/** A copy coming back whose id the platform holds: its word asked for, and written as its webhook would have. */
async function askAfterReturn(
  db: Db,
  account: StreamAccount,
  copy: CopyMoving,
  held: { mediaRef: string; oldMs: number },
): Promise<void> {
  const { mediaRef, oldMs } = held;
  const read = await readStreamVideo(account, mediaRef);
  if (read.ok && read.video.ready) {
    const { seconds, width, height } = read.video;
    return hearCopyWord(await markFileMediaReady(db, { mediaRef, seconds, width, height }), mediaRef);
  }
  if (read.ok && read.video.state === "error")
    return hearCopyWord(await markFileMediaFailed(db, mediaRef, read.video.errorCode), mediaRef);
  // A copy the platform no longer has, though it was asked for: deleted there by hand, or lapsed.
  if (!read.ok && read.gone)
    return hearCopyWord(await markFileMediaFailed(db, mediaRef, "ERR_NOT_AT_STREAM"), mediaRef);
  // Still being prepared, or the platform gave no answer: left for the next pass, and given up after an hour.
  if (oldMs < COPY_RETURN.giveUpMs) return;
  const ended = await failCopyReturn(db, { tenantId: copy.tenant_id, fileId: copy.id, reason: "failed", mediaRef });
  if (ended) await deleteStreamVideo(account, mediaRef).catch(logAndGoOn("copy: let the unfinished copy go", false));
}

/** One copy on its way, moved on: by what the door says its row holds, never by the row's own id read here. */
async function moveCopyOn(db: Db, account: StreamAccount, copy: CopyMoving, nowMs: number): Promise<void> {
  const held = await ensureCopyOf(db, copy, "upkeep");
  const oldMs = nowMs - Date.parse(copy.updated_at);
  if (held.copy === "going") {
    if (oldMs >= LET_GO.staleMs)
      await finishCopyGoing(db, account, { tenantId: copy.tenant_id, id: copy.id, mediaRef: held.mediaRef });
    return;
  }
  if (held.copy !== "returning") return;
  if (held.mediaRef) return askAfterReturn(db, account, copy, { mediaRef: held.mediaRef, oldMs });
  // Begun, and the platform never asked: its job died in between. The file is away again, and the next ask begins anew.
  if (oldMs >= COPY_RETURN.staleSeconds * SECOND_MS)
    await failCopyReturn(db, { tenantId: copy.tenant_id, fileId: copy.id, reason: "stopped", mediaRef: null });
}

/**
 * Copies that wait for room, asked for again: each one's return goes back on the ledger (held once a file, so one
 * already waiting or running is left alone), and the return itself judges whether there is room now. Answers how many.
 */
async function askAgainForRoom(db: Db, nowMs: number): Promise<number> {
  const waiting = await listCopiesAwaitingRoom(db, {
    since: new Date(nowMs - COPY_RETURN.roomAskForMs),
    limit: COPY_RETURN.roomAsksASweep,
  });
  for (const copy of waiting)
    await scheduleJobOnce(db, {
      tenantId: copy.tenant_id,
      kind: "copy_return",
      dueAt: new Date(nowMs),
      payload: { file_id: copy.id },
    });
  return waiting.length;
}

/** What a pass did: see `keepCopiesMoving`. */
interface CopiesMoved {
  copies: number;
  asked: number;
  shelved: number;
  owed: number;
  removed: number;
  kept: number;
  cleared: number;
}

/**
 * The pass. Answers how many copies it asked after, how many it asked for again, how many shelf copies it wrote a
 * job for again, how many copies the shelf was owed it began or put back, and what the cleanup did.
 */
export async function keepCopiesMoving(db: Db, nowMs: number): Promise<CopiesMoved> {
  const log = logger({});
  const account = streamAccount();
  const moving = account
    ? await listCopiesMoving(db, { before: new Date(nowMs - COPY_RETURN.askAfterMs), limit: SWEEP_COPIES })
    : [];
  for (const copy of moving) {
    if (!account) break;
    // One copy that cannot be moved on is a line: the rest are still asked after.
    await moveCopyOn(db, account, copy, nowMs).catch((failure: unknown) =>
      logger({ tenant_id: copy.tenant_id }).error("files_sweep_failed", {
        part: "copies",
        file: copy.id,
        error: errField(failure),
      }),
    );
  }
  // A read that fails here is a line: the cleanup below still runs.
  const askedAgain = await askAgainForRoom(db, nowMs).catch((failure: unknown) => {
    log.error("files_sweep_failed", { part: "copies_room", error: errField(failure) });
    return 0;
  });
  // A read that fails here is a line too: the cleanup below still runs.
  const shelved = await requeueShelfCopies(db, {
    staleSeconds: SHELF_REQUEUE.staleSeconds,
    limit: SHELF_REQUEUE.aSweep,
  }).catch((failure: unknown) => {
    log.error("files_sweep_failed", { part: "shelf", error: errField(failure) });
    return 0;
  });
  // One that needed the floor is a line: a copy's job should never go missing.
  if (shelved > 0) log.warn("file_shelve_failed", { why: "left_saving", asked_again: shelved });
  // What the shelf never got, begun; it says its own lines. A failure here is a line too: the cleanup still runs.
  const owed = await catchUpShelf(db, nowMs).catch((failure: unknown) => {
    log.error("files_sweep_failed", { part: "shelf_owed", error: errField(failure) });
    return 0;
  });
  const grace = await endSourceGrace(db, { graceSeconds: SOURCE_GRACE.seconds, limit: SOURCE_GRACE.aSweep });
  if (grace.cleared > 0) log.info("copy_grace", grace);
  return { copies: moving.length, asked: askedAgain, shelved, owed, ...grace };
}
