/**
 * Letting a watched clip's copy go (the footage sources plan, "Availability" and D6; 00654 file_copies_let_go). A
 * workspace keeps sixty minutes of video at the video platform, and a watched folder brings more, so a copy leaves in
 * two ways: by room, when a clip being taken or brought back needs it, the least recently used first; and by age, with
 * room to spare, once it was not used for two weeks. Its original stays with its provider and its stills, its sound
 * and what AI wrote of it stay here, so nothing an owner made is lost, and the copy comes back when it is asked for.
 *
 * Which copies may go is the database's to say, in one place and under the workspace's one lock: only what something
 * can give back, playable, looked at, named by no video being made: a watched folder's clip held by a folder still
 * being read, or a video with a checked copy on Chanlytics' own shelf (the archive plan's B2). Never an upload or a
 * found video, nor a made video the shelf does not hold: nothing can give one back.
 *
 * The order is mark, ask, delete, say: a copy is marked going; where the shelf is what would give it back, the shelf is
 * asked, at that moment, whether it holds the video's very bytes; then the copy is deleted at the platform, and only
 * then said away, with its id emptied. A shelf that does not hold it, or gives no answer, keeps the video here and
 * nothing is deleted. A delete that does not land leaves it going, and the half-hourly sweep finishes it (sweep.ts),
 * asking the shelf as this does. There is no lease and no lock table: the mark is the claim.
 */
import { deleteStreamVideo, type StreamAccount } from "@chanlytics/channels/files";
import type { TenantId } from "@chanlytics/contracts";
import { keepCopyHere, markCopiesGoing, markCopyGone, type CopyGoing } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { logAndGoOn } from "@chanlytics/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../../shared/log.js";
import { askShelf } from "../shelf/check.js";
import { LET_GO } from "../takes/budgets.js";
import { streamAccount } from "../video-keys.js";

type Db = SupabaseClient<Database>;

/** What became of one copy marked going: whether it went, and whether the shelf is what stands behind it. */
interface CopyWent {
  went: boolean;
  shelf: boolean;
}

/**
 * One copy marked going: the shelf asked where it is what would give the video back, then the copy deleted at the
 * video platform and said away. A shelf that does not hold the video's bytes now, or gives no answer, keeps the
 * video here: the mark is undone and nothing is deleted.
 */
async function finishOne(
  db: Db,
  account: StreamAccount,
  copy: { tenantId: TenantId; id: string; mediaRef: string | null },
): Promise<CopyWent> {
  const says = await askShelf(db, { tenantId: copy.tenantId, fileId: copy.id }, logger({ tenant_id: copy.tenantId }));
  const shelf = says === "holds";
  if (says === "put_back" || says === "unsure") {
    await keepCopyHere(db, copy.tenantId, copy.id);
    return { went: false, shelf };
  }
  // One the platform no longer has (a 404) is gone already. One with no id has nothing there to delete.
  if (copy.mediaRef && !(await deleteStreamVideo(account, copy.mediaRef))) return { went: false, shelf };
  return { went: await markCopyGone(db, copy.tenantId, copy.id), shelf };
}

/** One copy marked going, finished: asked of the shelf, deleted at the video platform and said away. Answers whether it went. */
export async function finishCopyGoing(
  db: Db,
  account: StreamAccount,
  copy: { tenantId: TenantId; id: string; mediaRef: string | null },
): Promise<boolean> {
  return (await finishOne(db, account, copy)).went;
}

/** Copies marked going, each finished in turn while the job has time. Answers how many went, and how many of those the shelf holds. */
async function finishGoing(
  db: Db,
  account: StreamAccount,
  going: { tenantId: TenantId; copies: readonly CopyGoing[]; deadline: number },
): Promise<{ went: number; fromShelf: number }> {
  const finished = { went: 0, fromShelf: 0 };
  for (const copy of going.copies) {
    // Out of time: what is left stays marked, and the sweep finishes it.
    if (Date.now() >= going.deadline) break;
    const one = await finishOne(db, account, { tenantId: going.tenantId, ...copy }).catch(
      logAndGoOn("copy: let it go", { went: false, shelf: false }),
    );
    if (one.went) finished.went += 1;
    if (one.went && one.shelf) finished.fromShelf += 1;
  }
  return finished;
}

/**
 * Room made for a video of `seconds`, by letting the workspace's least recently used copies go: as many as free what
 * is short, and none where all that may go would not. Answers whether every copy it marked went, so the room is there.
 */
export async function makeRoom(db: Db, tenantId: TenantId, seconds: number, deadline: number): Promise<boolean> {
  const account = streamAccount();
  if (!account) return false;
  const copies = await markCopiesGoing(db, {
    tenantId,
    // A clip whose length is not known yet still needs some room: the smallest there is.
    seconds: Math.max(seconds, 1),
    unusedBefore: null,
    restedBefore: new Date(Date.now() - LET_GO.restMs),
    limit: LET_GO.forRoom,
  });
  if (copies.length === 0) return false;
  const finished = await finishGoing(db, account, { tenantId, copies, deadline });
  logger({ tenant_id: tenantId }).info("copy_let_go", {
    by: "room",
    marked: copies.length,
    went: finished.went,
    from_shelf: finished.fromShelf,
    seconds: copies.reduce((sum, copy) => sum + copy.seconds, 0),
  });
  return finished.went === copies.length;
}

/**
 * A workspace's copies unused for two weeks let go, a few at a time: asked as one of its folders is read, so the work
 * is spread by the pace the folders are read at and a quiet workspace costs one small read of its own rows. Answers
 * how many went. Never throws: a read is not failed for it.
 */
export async function letUnusedCopiesGo(db: Db, tenantId: TenantId, deadline: number): Promise<number> {
  const account = streamAccount();
  if (!account) return 0;
  try {
    const copies = await markCopiesGoing(db, {
      tenantId,
      seconds: null,
      unusedBefore: new Date(Date.now() - LET_GO.unusedMs),
      restedBefore: new Date(Date.now() - LET_GO.restMs),
      limit: LET_GO.aRead,
    });
    if (copies.length === 0) return 0;
    const finished = await finishGoing(db, account, { tenantId, copies, deadline });
    logger({ tenant_id: tenantId }).info("copy_let_go", {
      by: "age",
      marked: copies.length,
      went: finished.went,
      from_shelf: finished.fromShelf,
    });
    return finished.went;
  } catch (failure) {
    logAndGoOn("copy: let the unused go")(failure);
    return 0;
  }
}
