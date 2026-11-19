/**
 * A take's copy at the video platform, by the name it is asked for under (the review of 18 November, finding 10). A
 * job can die between the platform taking a clip's address and the row that holds its copy being written: the copy
 * then sits at the platform, counted in its stored minutes, with nothing here that knows it. So a take's copy is
 * named for its item, and a copy no row holds is deleted in two places: as the platform says its word about it (its
 * webhook), and before the item's next take asks for another.
 *
 * Only an item this database holds is acted on: a copy named for an item it does not know may be another
 * deployment's, and is left alone.
 */
import {
  deleteStreamVideo,
  listStreamVideosNamed,
  type StreamAccount,
  type StreamVideo,
} from "@chanlytics/channels/files";
import { isUuid } from "@chanlytics/contracts";
import { findSourceItemAnywhere, listMediaHeld, type SourceTakeItem } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { logAndGoOn } from "@chanlytics/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../../shared/log.js";
import { streamAccount } from "../video-keys.js";

type Db = SupabaseClient<Database>;

const COPY_NAMED = "take:";

/** What a take's copy is called at the video platform: its item, so a copy with no row can be traced to its take. */
export const takeCopyName = (itemId: string): string => `${COPY_NAMED}${itemId}`;

/** The item a copy was asked for, by its name; null for a video that is no take's. */
function itemOfCopy(name: string | null): string | null {
  const id = name?.startsWith(COPY_NAMED) ? name.slice(COPY_NAMED.length) : "";
  return isUuid(id) ? id : null;
}

/**
 * Before an item is fetched again (a try that failed, or a take that was lost): the copies an earlier try left at the
 * video platform that no Library file holds are deleted, so a job that died mid-take costs no stored minutes. The
 * platform not answering is not a reason to stop the take: the webhook's check is the other road.
 */
export async function clearLeftCopies(
  db: Db,
  account: StreamAccount,
  item: Pick<SourceTakeItem, "id" | "tenant_id">,
): Promise<number> {
  const left = await listStreamVideosNamed(account, takeCopyName(item.id)).catch(
    logAndGoOn("source take: read the copies an earlier try left", null),
  );
  if (!left || left.length === 0) return 0;
  const held = await listMediaHeld(
    db,
    left.map((video) => video.uid),
  );
  let cleared = 0;
  for (const video of left) {
    if (held.has(video.uid)) continue;
    const gone = await deleteStreamVideo(account, video.uid).catch(
      logAndGoOn("source take: let a left copy go", false),
    );
    if (gone) cleared += 1;
  }
  if (cleared > 0)
    logger({ tenant_id: item.tenant_id }).warn("source_take_failed", { item: item.id, why: "copy_left", cleared });
  return cleared;
}

/**
 * The video platform's word about a video no row here holds: where it is a take's copy, of an item this database
 * knows, it is deleted. Left alone while its take may still be writing its row (the item is being taken, holds no
 * file, and the word is not that the copy is ready: by then a living job has long written). Answers whether it went.
 */
export async function clearUnheldCopy(db: Db, video: Pick<StreamVideo, "uid" | "name" | "ready">): Promise<boolean> {
  const itemId = itemOfCopy(video.name);
  const account = streamAccount();
  if (!itemId || !account) return false;
  const item = await findSourceItemAnywhere(db, itemId);
  if (!item) return false;
  if (item.state === "taking" && !item.file_id && !video.ready) return false;
  const gone = await deleteStreamVideo(account, video.uid);
  logger({ tenant_id: item.tenant_id }).warn("source_take_failed", { item: item.id, why: "copy_unheld", gone });
  return gone;
}
