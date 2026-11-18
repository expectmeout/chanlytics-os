/**
 * The video platform's word about a clip a watched folder brought (the footage sources plan, "Taking a file in",
 * steps 4 and 5). The platform's webhook and the sweep that asks after a lost one both finish the Library's row
 * (00556 file_media_ready, file_media_failed); this finishes the item the clip came from.
 *
 *   ready    every item still taking the clip is in.
 *   failed   the failed copy is let go (the file is removed and its purge deletes the copy at the platform), and each
 *            item waits to be fetched again as a new job, twice. Then it says it failed, and its folder's line says so.
 *   passed   a clip its provider never measured, whose length the platform has now said (00642 file_media_ready; the
 *            review's finding 11): too long, and its item ends as too big by its length; or no room in the videos,
 *            and its item waits for room. The row is already removed, and its purge deletes the copy.
 *
 * Heard twice it changes nothing: each write names the state it leaves. A word already written (`repeated`, or
 * `gone` for a clip passed over) is read from the row instead, so a settlement that did not land the first time lands
 * when the word comes again. However it settles, a clip is one fewer in flight: the workspace's next take is handed
 * its job.
 */
import {
  findFileForWork,
  removeFailedTake,
  settleTakesFailed,
  settleTakesPassed,
  settleTakesReady,
  type MediaFate,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { scheduleJobOnce } from "@chanlytics/jobs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../../shared/log.js";
import { TAKE_RESTS_MS } from "./budgets.js";
import { handOutTakesNow } from "./hand-out.js";

type Db = SupabaseClient<Database>;

/** The platform's word as the items are settled by it: playable, not prepared, or passed over for its length. */
type TakenWord = { said: "ready" | "failed" } | { said: "long" | "minutes"; seconds: number | null };

/** Why a removed row says it was passed over (00642 file_media_ready writes it as it removes one). */
const PASSED_AS: Readonly<Record<string, "long" | "minutes">> = { too_long: "long", no_room: "minutes" };

/**
 * The platform's word, from its answer or, for a word heard before, from the row: `repeated` is ready or failed as
 * the row stands, and `gone` is a watched clip passed over, which its row still says.
 */
async function takenWordOf(db: Db, fate: MediaFate, seconds: number | null): Promise<TakenWord | null> {
  if (fate.fate === "ready" || fate.fate === "failed") return { said: fate.fate };
  if (fate.fate === "passed") return fate.why ? { said: fate.why, seconds } : null;
  if ((fate.fate !== "repeated" && fate.fate !== "gone") || !fate.tenant_id || !fate.file_id) return null;
  const row = await findFileForWork(db, fate.tenant_id, fate.file_id);
  if (!row) return null;
  if (fate.fate === "repeated")
    return row.media_status === "ready" || row.media_status === "failed" ? { said: row.media_status } : null;
  const passed = row.source === "drive" && row.removed_at ? PASSED_AS[row.media_error ?? ""] : undefined;
  return passed ? { said: passed, seconds: row.seconds === null ? seconds : Number(row.seconds) } : null;
}

/**
 * The items a clip came from, settled by the platform's word; `seconds` is the length the platform measured, where it
 * said one. Throws when it could not be written, so it is said again.
 */
export async function settleTakenVideo(db: Db, fate: MediaFate, seconds: number | null = null): Promise<void> {
  const { tenant_id: tenantId, file_id: fileId } = fate;
  if (!tenantId || !fileId) return;
  const word = await takenWordOf(db, fate, seconds);
  if (!word) return;
  // A word about a video no folder brought (a member's upload, a found one) settles no item, and hands nothing out.
  if ((await settleByWord(db, { tenantId, fileId }, word)) === 0) return;
  // One fewer in flight: the workspace's next waiting file begins now. A hand-out that fails waits for the clock.
  await handOutTakesNow(db, tenantId);
}

/** One clip's items settled by one word. Answers how many items it settled. */
async function settleByWord(
  db: Db,
  clip: { tenantId: NonNullable<MediaFate["tenant_id"]>; fileId: string },
  word: TakenWord,
): Promise<number> {
  const { tenantId, fileId } = clip;
  const log = logger({ tenant_id: tenantId });
  if (word.said === "ready") {
    const settled = await settleTakesReady(db, tenantId, fileId);
    if (settled > 0) log.info("source_take", { file: fileId, took: "in", items: settled });
    return settled;
  }
  if (word.said === "long" || word.said === "minutes") {
    const settled = await settleTakesPassed(db, {
      tenantId,
      fileId,
      why: word.said,
      seconds: word.seconds,
      roomAfter: new Date(Date.now() + TAKE_RESTS_MS.room),
    });
    const took = word.said === "long" ? "too_big:seconds" : "waits:room";
    if (settled > 0) log.info("source_take", { file: fileId, took, items: settled });
    return settled;
  }
  const { again, failed } = await settleTakesFailed(db, { tenantId, fileId, why: "stream" });
  // Only a clip a watched folder brought is removed here: an upload's failed tile is its owner's to delete.
  if (await removeFailedTake(db, tenantId, fileId)) {
    await scheduleJobOnce(db, {
      tenantId,
      kind: "file_purge",
      dueAt: new Date(),
      payload: { file_id: fileId, why: "remove" },
    });
  }
  if (again + failed > 0) log.warn("source_take_failed", { file: fileId, why: "stream", again, failed });
  return again + failed;
}
