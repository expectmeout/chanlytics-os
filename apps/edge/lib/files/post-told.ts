/**
 * A post that moved on its own, told on the bell (00616, the content redesign's stage 3): one set for its time that went up,
 * or one the recheck at its time held, on Instagram or Google. A post that went at a press is seen where it was pressed, so
 * its going up says nothing here; a post whose job failed is told by the job's own line (the runner's `told: owner`).
 *
 * Never a failed job: the bell's write keeps its own trouble (recordNotification), so a post that is up stays up whatever the
 * bell could do, and a kind the database does not take yet (00616 not applied) is logged and let go.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { POST_PLACES, TAKE_DOWN_BELL, fileSaidOf, isOneOf, type TenantId } from "@chanlytics/contracts";
import { findFileForWork, type PostRow, type TakeDownKept } from "@chanlytics/db/files";
import { logAndGoOn } from "@chanlytics/log";
import type { Database } from "@chanlytics/db/types";
import { recordNotification } from "../shared/alerts/notify.js";
import { POST_BELL, postBellRouteOf, postWaited, takeDownBellRouteOf } from "./post-bell";

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
          title: POST_BELL.held(name),
          body: POST_BELL.heldBody(moved.why),
          route: postBellRouteOf(post.file_id, true),
          about,
        },
    db,
  );
}

/**
 * A take-down's news, told on the bell (00683; the canvas's Today 6). A place that would not take a post down for
 * Chanlytics while the post is still up leaves it to the owner: told once, at the first answer, never again at each
 * "I deleted it" that found it still there (the piece's own line says that, to the person looking at it). And once every
 * place the piece was asked down from says done, that it is gone, which closes the first (contracts NOTICE_MENDS).
 * Both are about the piece, and open it at its lines. Never a failed job, as above.
 */
export async function tellTakeDownMoved(
  db: Db,
  tenantId: TenantId,
  kept: TakeDownKept,
  left: { toOwner: boolean },
): Promise<void> {
  const { fileId, place, down } = kept;
  if (!kept.kept || !fileId || (!down && !(left.toOwner && place))) return;
  const file = await findFileForWork(db, tenantId, fileId).catch(
    logAndGoOn("take-down's piece for its bell line", null),
  );
  const name = fileSaidOf(file?.name ?? "");
  const row = { route: takeDownBellRouteOf(fileId), about: { type: "file", id: fileId } };
  if (down) {
    await recordNotification(
      tenantId,
      { kind: "post_down", title: TAKE_DOWN_BELL.down(name), body: TAKE_DOWN_BELL.downFrom(down), ...row },
      db,
    );
    return;
  }
  if (!place) return;
  await recordNotification(
    tenantId,
    { kind: "post_by_hand", title: TAKE_DOWN_BELL.byHand(place, name), body: TAKE_DOWN_BELL.byHandWhy, ...row },
    db,
  );
}
