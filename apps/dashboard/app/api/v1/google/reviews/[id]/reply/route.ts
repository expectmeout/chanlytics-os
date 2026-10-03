import { write, workspace } from "@/server/route";
import { replyToGoogleReview } from "@/server/connections/google-actions";

/**
 * POST /api/v1/google/reviews/:id/reply — {comment}: the business answers a
 * review, on Google, in the owner's or an operator's own words. The edge
 * holds the token and makes the call; this route proves who is asking,
 * keeps the ledger (subject 'review', verb 'reply_review'), and says what
 * happened. A reply replaces the previous one: Google keeps one per review.
 * The body is the route's own to read: cleanReply decides what a reply is.
 *
 * The handle is replyToGoogleReview in src/server/connections/google-actions.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "google_reply",
  handle: ({ ctx, req, member }) => replyToGoogleReview(ctx, req, member),
});
