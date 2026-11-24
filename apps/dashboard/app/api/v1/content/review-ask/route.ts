import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { snoozeReviewAsk } from "@/server/content/review-ask";

/**
 * POST /api/v1/content/review-ask — `{ act: "rest" }`: Not now on the plan's proposal to ask every client for a review
 * (the content loop's pass 6; the content canvas's Loop4): it rests for 30 days, kept as the workspace's decision. The
 * card's Approve is POST playbooks with the after-visit starter. Owner or operator, as starting the ask is. Answers
 * `{ rested_until }`.
 *
 * The handle is in src/server/content/review-ask.ts.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  input: z.strictObject({ act: z.literal("rest") }),
  handle: ({ ctx, member }) => snoozeReviewAsk(ctx, member),
});
