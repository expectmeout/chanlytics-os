/**
 * What the bell says of a post that moved on its own (00616, the content redesign's stage 3): one set for its time that went
 * up, or one the recheck at its time held. A post sent at a press is seen where it was pressed, and a post that failed is
 * the job's own line (today/notifications/feed.ts). Each row opens the piece in Campaigns › Content: one up in Made, one held
 * in Made's Needs you, where it says why.
 */
import { POST_PLACE_SAID, SECOND_MS, contentRouteOf, fileSaidOf, type PostPlace } from "@chanlytics/contracts";

export const POST_BELL = {
  // The content canvas's bell (PhDoors "bell"): "Posted to Google" over the piece's name; a held one is the piece's name over
  // "Didn't post · <why>", and its door says Try again (today/notifications/feed.ts). A piece that could not be read is
  // named without its name (post-told.ts): a post up then says only where, and a held one is "Your post", never a blank row.
  up: (place: PostPlace) => `Posted to ${POST_PLACE_SAID[place]}`,
  upBody: (name: string) => fileSaidOf(name),
  held: (name: string) => fileSaidOf(name) || "Your post",
  heldBody: (reason: string) => (reason ? `Didn't post · ${reason}` : "Didn't post"),
} as const;

/** Where a post's row opens: the piece, in Made, or in Made's Needs you while it waits for the owner. */
export const postBellRouteOf = (fileId: string, held: boolean): string =>
  contentRouteOf({ list: "made", view: held ? "needs" : "all", open: fileId, post: held });

/** Longer than this between its press and its time, a post waited for its time, and its going up is news. */
const WAITED_MS = 2 * 60 * SECOND_MS;

/** Whether a post waited for its time: set at a press for later than two minutes on (00616 post_begin's own line). */
export const postWaited = (post: { approved_at: string | null; scheduled_for: string }): boolean =>
  !!post.approved_at && Date.parse(post.scheduled_for) - Date.parse(post.approved_at) > WAITED_MS;
