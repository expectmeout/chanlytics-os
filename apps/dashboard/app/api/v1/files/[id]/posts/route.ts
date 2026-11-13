import { z } from "zod";
import { write } from "@/server/shared/route";
import { fileScope } from "@/server/files/file";
import { moveFilePost } from "@/server/posts/instagram";

/**
 * PATCH /api/v1/files/:id/posts — `{ post_id, when }`: Change time (00621), for a post of this file still waiting for its time,
 * at either place. The same post, its approval and its words, set for another time, its job moved with it, in one step.
 * Whoever may post. Answers `{ moved: true }`; refused as late once a run has taken its job (Instagram is making it ready,
 * or it is being sent). One door for both places: a post moves by its own id.
 *
 * The handle is in src/server/posts/instagram.ts.
 */
export const PATCH = write({
  scope: fileScope,
  role: "partner",
  rate: "settings",
  input: z.object({ post_id: z.uuid(), when: z.iso.datetime({ offset: true }) }),
  handle: ({ ctx, input, member, row }) => moveFilePost(ctx, member, row, input),
});
