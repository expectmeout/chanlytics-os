import { write, workspace } from "@/server/shared/route";
import { makePost, postPlanInput } from "@/server/posts/make";

/**
 * POST /api/v1/files/post — a post made from a photo, kept as a file in a shape each: Ask's card's Save. No model is called and
 * nothing is spent. The same picture pressed twice is the one file. Whoever may change the workspace's settings, as its card's
 * Undo deletes it (DELETE files/:id); adding a photo is an operator's too.
 *
 * The handle is in src/server/posts/make.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "file_upload",
  input: postPlanInput,
  handle: ({ ctx, input, member }) => makePost(ctx, member, input),
});
