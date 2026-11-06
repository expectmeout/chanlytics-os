import { write, workspace } from "@/server/route";
import { makePost, postPlanInput } from "@/server/files/post/make";

/**
 * POST /api/v1/files/post — a post made from a photo, kept as a file in a shape each: Ask's card's Save. No model is called and
 * nothing is spent. The same picture pressed twice is the one file. Whoever may add a photo.
 *
 * The handle is in src/server/files/post/make.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "file_upload",
  input: postPlanInput,
  handle: ({ ctx, input, member }) => makePost(ctx, member, input),
});
