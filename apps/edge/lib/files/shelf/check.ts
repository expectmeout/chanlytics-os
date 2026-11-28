/**
 * What the shelf says of a video, asked at the moment something leans on it (the archive plan's B2; the PRD's
 * principle 2 and FR-5.3): a copy at the video platform is let go, or fetched again, only on the shelf's own word that
 * it holds the video's very bytes, never on the strength of a row. The letting go and the return both ask here, so the
 * two never disagree.
 *
 * A shelf that holds nothing of a video whose row says checked, or holds other bytes, must never happen. Where it does,
 * nothing is lost by it: the copy is put back from the video's own kept file (the door writes its job), and one error
 * line says so, which Health reads. A shelf that gives no answer is not a loss, and nothing is changed for it.
 */
import { readShelfRecord } from "@chanlytics/channels/files";
import type { TenantId } from "@chanlytics/contracts";
import { findShelfPart, putShelfCopyBack } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "../../shared/log.js";
import { SHELF_SECONDS_MAX, shelfOf } from "./shelve.js";

type Db = SupabaseClient<Database>;

/**
 * What the shelf says of a video:
 *
 *   none       it has no say: the video has no shelf copy, or one that can never be put (its own file is gone, or is
 *              other bytes). Whatever else can give the video back decides.
 *   holds      its row is checked, and the shelf holds those very bytes now.
 *   put_back   its row said so and the shelf did not (nothing there, or other bytes), or the shelf once refused it:
 *              the copy is being put back from the video's own kept file.
 *   unsure     the copy is on its way to the shelf, or the shelf gave no answer.
 */
type ShelfSays = "none" | "holds" | "put_back" | "unsure";

/** The shelf asked about one video, and a copy that is not there put back. `log` is the asker's, for the one line. */
export async function askShelf(db: Db, video: { tenantId: TenantId; fileId: string }, log: Logger): Promise<ShelfSays> {
  const part = await findShelfPart(db, video.tenantId, video.fileId);
  if (!part) return "none";
  if (part.state === "saving" || part.state === "saved") return "unsure";
  if (part.state === "failed") {
    // The shelf would not take it once, and its own file is still there to put it from: asked for again.
    if (part.why !== "refused") return "none";
    // Within the shelf's room: a failed copy holds none, so it comes back only where it fits (00729).
    return (await putShelfCopyBack(db, { ...video, secondsMax: SHELF_SECONDS_MAX })) ? "put_back" : "unsure";
  }
  if (part.state !== "checked") return "none";
  const shelf = shelfOf();
  if (!shelf) return "unsure";
  const held = await readShelfRecord(shelf, video);
  if (!held.ok) return "unsure";
  if (held.record && held.record.bytes === part.bytes && held.record.sha256 === part.sha256) return "holds";
  const again = await putShelfCopyBack(db, { ...video, secondsMax: SHELF_SECONDS_MAX });
  log.error("shelf_copy_lost", {
    file: video.fileId,
    found: held.record ? "other_bytes" : "nothing",
    kept: "here",
    again,
  });
  return "put_back";
}
