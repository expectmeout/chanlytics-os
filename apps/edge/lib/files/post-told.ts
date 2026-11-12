/**
 * A post that moved on its own, told on the bell (00616, the content redesign's stage 3): one set for its time that went up,
 * or one the recheck at its time held, on Instagram or Google. A post that went at a press is seen where it was pressed, so
 * its going up says nothing here; a post whose job failed is told by the job's own line (the runner's `told: owner`).
 *
 * Never a failed job: the bell's write keeps its own trouble (recordNotification), so a post that is up stays up whatever the
 * bell could do, and a kind the database does not take yet (00616 not applied) is logged and let go.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { POST_PLACES, isOneOf } from "@chanlytics/contracts";
import { findFileForWork, type PostRow } from "@chanlytics/db/files";
import { logAndGoOn } from "@chanlytics/log";
import type { Database } from "@chanlytics/db/types";
import { recordNotification } from "../shared/alerts/notify.js";
import { POST_BELL, postBellRouteOf, postWaited } from "./post-bell";

type Db = SupabaseClient<Database>;

/** What became of the post: up at its time, or held at its time, with the recheck's words. */
type PostMoved = { is: "up" } | { is: "held"; why: string };

export async function tellPostMoved(db: Db, post: PostRow, moved: PostMoved): Promise<void> {
  // Up at a press is seen at the press; only a post that waited for its time is news when it goes up.
  if (moved.is === "up" && !postWaited(post)) return;
  const place = post.place;
  if (!isOneOf(POST_PLACES, place)) return;
  // A piece that can't be read is no reason to keep the line back: it is named without its name.
  const file = await findFileForWork(db, post.tenant_id, post.file_id).catch(
    logAndGoOn("post's piece for its bell line", null),
  );
  const name = file?.name ?? "";
  const about = { type: "file", id: post.file_id };
  await recordNotification(
    post.tenant_id,
    moved.is === "up"
      ? {
          kind: "post_up",
          title: POST_BELL.up(place),
          body: POST_BELL.upBody(name),
          route: postBellRouteOf(post.file_id, false),
          about,
        }
      : {
          kind: "post_stopped",
          title: POST_BELL.held(place),
          body: POST_BELL.heldBody(name, moved.why),
          route: postBellRouteOf(post.file_id, true),
          about,
        },
    db,
  );
}
