import { write, workspace } from "@/server/shared/route";
import { AppError } from "@chanlytics/contracts";
import { requireUuid } from "@/server/shared/request-guards";
import { callEdgeGoogle } from "@/server/connections/google";

/**
 * POST /api/v1/google/reviews/:id/draft — the receptionist's draft of a
 * reply to this review, for the person who will send it. Nothing is posted:
 * the words come back to the composer on Reports, and "Send to Google" is
 * the reply route. The edge holds the model key and the Autonomy row; a
 * workspace whose reviews row is Never gets no draft, and is told why.
 *
 * A read of the workspace the tab named, not of the review as a row: the
 * review lives on the edge's side of the door, which answers 404 for one
 * that is not on record.
 */
const REASON_WORDS: Record<string, string> = {
  policy_never:
    "Review replies are set to Never on Autonomy. Set them to Ask for a draft, or Auto to have new reviews answered.",
  no_review: "That review is not on record.",
  no_model_key: "Drafting is not available here yet.",
  model_failed: "The receptionist could not write a draft just now. Write the reply yourself, or try again.",
  empty_draft: "The receptionist could not write a draft just now. Write the reply yourself, or try again.",
};

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "google_draft",
  handle: async ({ ctx, member }) => {
    const id = requireUuid(ctx.params.id, "review");
    const answer = await callEdgeGoogle({ op: "draft", tenant_id: member.tenantId, user_id: ctx.userId, id }, 25_000);
    const body = answer.body ?? {};
    if (answer.status !== 200 || body.ok !== true || typeof body.text !== "string") {
      const reason = typeof body.error === "string" ? body.error : "failed";
      const sentence = REASON_WORDS[reason] ?? `No draft this time (${reason}).`;
      throw new AppError(
        answer.status === 404 ? "not_found" : answer.status === 409 ? "conflict" : "internal",
        sentence,
        answer.status === 404 ? 404 : answer.status === 409 ? 409 : 502,
      );
    }
    return { text: body.text, mode: typeof body.mode === "string" ? body.mode : "ask" };
  },
});
