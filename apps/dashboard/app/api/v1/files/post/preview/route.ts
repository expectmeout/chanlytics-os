import { z } from "zod";
import { POST_SHAPES } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { postPlanInput, previewPost } from "@/server/files/post/make";

/**
 * POST /api/v1/files/post/preview — the real picture a post would be, for Ask's card to show: a JPEG, kept nowhere. A POST for the
 * length of what it is asked, and since each is drawn afresh. Whoever may save one.
 *
 * The handle is in src/server/files/post/make.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "file_upload",
  input: postPlanInput.extend({ shape: z.enum(POST_SHAPES).optional() }),
  handle: ({ ctx, input, member }) => previewPost(ctx, member, input),
});
