/**
 * A post that moved on its own, told on the bell (00616, the content redesign's stage 3): one set for its time that went up,
 * or one the recheck at its time held, on Instagram or Google. A post that went at a press is seen where it was pressed, so
 * its going up says nothing here; a post whose job failed is told by the job's own line (the runner's `told: owner`).
 *
 * Never a failed job: the bell's write keeps its own trouble (recordNotification), so a post that is up stays up whatever the
 * bell could do, and a kind the database does not take yet (00616 not applied) is logged and let go.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { POST_PLACES, STANDING_WORDS, TAKE_DOWN_BELL, fileSaidOf, isOneOf, type TenantId } from "@chanlytics/contracts";
import { findFileForWork, listPostsRemovedThere, type PostRow, type TakeDownKept } from "@chanlytics/db/files";
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
          title: STANDING_WORDS.up.bell.title(place),
          body: POST_BELL.upBody(name),
          route: postBellRouteOf(post.file_id, false),
          about,
        }
      : {
          kind: "post_stopped",
          title: POST_BELL.held(name),
          body: STANDING_WORDS.stopped.bell.body(moved.why),
          route: postBellRouteOf(post.file_id, true),
          about,
        },
    db,
  );
}

/**
 * A take-down's news, told on the bell (00682; the canvas's Today 6). A place that would not take a post down for
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
      {
        kind: "post_down",
        title: STANDING_WORDS.came_down.bell.title(name),
        body: STANDING_WORDS.came_down.bell.body(down),
        ...row,
      },
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

/**
 * A post its place no longer holds, found by a read of its numbers (content/observe.ts) or of what its account holds
 * (content/posts-read.ts). Told once. Where a take-down from here had asked it down (one its place left to its owner to
 * delete), it is the take-down that came through, in its words, which close the piece's "Delete it in" line too. Where
 * nobody asked, it was removed on the place itself, by its owner there or by the place, and the line says so in its
 * own words: Chanlytics did not take it down (the content status review of 24 Nov 2026, A12). A read that fails says
 * the first, as every such post was told before. Never a failed job, as above.
 */
export async function tellPostGone(db: Db, post: PostRow): Promise<void> {
  const place = post.place;
  if (!isOneOf(POST_PLACES, place)) return;
  const none: string[] = [];
  const there = await listPostsRemovedThere(db, post.tenant_id, [post]).catch(
    logAndGoOn("whether a post was removed at its place", none),
  );
  if (there.length === 0) {
    const kept = { kept: true, fileId: post.file_id, place, down: [place] };
    await tellTakeDownMoved(db, post.tenant_id, kept, { toOwner: false });
    return;
  }
  const file = await findFileForWork(db, post.tenant_id, post.file_id).catch(
    logAndGoOn("removed post's piece for its bell line", null),
  );
  await recordNotification(
    post.tenant_id,
    {
      kind: "post_down",
      title: STANDING_WORDS.removed.bell.title(place, fileSaidOf(file?.name ?? "")),
      body: STANDING_WORDS.removed.bell.body(place),
      route: takeDownBellRouteOf(post.file_id),
      about: { type: "file", id: post.file_id },
    },
    db,
  );
}
