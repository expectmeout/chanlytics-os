import { write, workspace } from "@/server/route";
import { stopGoogleReviewReply } from "@/server/connections/google-actions";

/**
 * POST /api/v1/google/reviews/:id/stop — a reply the receptionist holds under Holds it, stopped before the hourly sync
 * posts it (decision 0064, step 6): it waits for an OK, as one held under Ask me does, and the composer under the review
 * has its words. The edge holds the row and clears its time; this route proves who is asking and keeps the ledger
 * (subject 'review', verb 'cancel_send'). One with no time to clear is no change.
 *
 * The handle is stopGoogleReviewReply in src/server/connections/google-actions.ts.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "google_reply",
  handle: ({ ctx, member }) => stopGoogleReviewReply(ctx, member),
});
