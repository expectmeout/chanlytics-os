/**
 * A post as its place's adapter is asked about it: by its take-down (take-down.ts) and by a read of its numbers
 * (observe.ts), each through the same shape.
 */
import type { SentPlacement } from "@chanlytics/contracts";
import type { PostRow } from "@chanlytics/db/files";

export const sentPlacementOf = (post: PostRow): SentPlacement => ({
  postId: post.id,
  kind: post.kind === "story" || post.kind === "reel" ? post.kind : "picture",
  externalId: post.external_id,
  caption: post.caption,
  sentAt: post.published_at ?? post.updated_at,
});
