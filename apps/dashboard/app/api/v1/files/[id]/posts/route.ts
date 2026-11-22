import { z } from "zod";
import { write } from "@/server/shared/route";
import { fileScope } from "@/server/files/file";
import { moveFilePost } from "@/server/posts/instagram";
import { sayDeletedByHand, takePieceDown } from "@/server/posts/take-down";

/**
 * PATCH /api/v1/files/:id/posts — `{ post_id, when }`: Change time (00621), for a post of this file still waiting for its time,
 * at either place. The same post, its approval and its words, set for another time, its job moved with it, in one step.
 * Whoever may post. Answers `{ moved: true }`; refused as late once a run has taken its job (Instagram is making it ready,
 * or it is being sent). One door for both places: a post moves by its own id.
 *
 * DELETE — Take down (00683; the content loop PRD's 8.3): the piece comes down everywhere. Each post of it that is up is
 * asked down at its place, each one still waiting is let go, and every ad made here that shows it is paused. A post is
 * taken down only once its place said so, and the piece's record says where each stands. Never undone: it is posted
 * again as a new post. Answers `{ asked, cancelled, ads }`; refused where nothing of it is up, waiting or showing.
 *
 * PUT — `{ post_id }`: "I deleted it", of a post Chanlytics could not take down itself. The place is asked whether it is
 * gone, and the post is taken down once the place shows it is. Answers `{ asking }`.
 *
 * The handles are in src/server/posts/instagram.ts and src/server/posts/take-down.ts.
 */
export const PATCH = write({
  scope: fileScope,
  role: "partner",
  rate: "settings",
  input: z.object({ post_id: z.uuid(), when: z.iso.datetime({ offset: true }) }),
  handle: ({ ctx, input, member, row }) => moveFilePost(ctx, member, row, input),
});

export const DELETE = write({
  scope: fileScope,
  role: "partner",
  rate: "settings",
  handle: ({ ctx, member, row }) => takePieceDown(ctx, member, row),
});

export const PUT = write({
  scope: fileScope,
  role: "partner",
  rate: "settings",
  input: z.strictObject({ post_id: z.uuid() }),
  handle: ({ ctx, input, member, row }) => sayDeletedByHand(ctx, member, row, input),
});
