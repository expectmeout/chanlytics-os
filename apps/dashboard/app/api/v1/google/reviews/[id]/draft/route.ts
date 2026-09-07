import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError } from "@chanlytics/contracts";
import { takeRate } from "@/server/rate-limit";
import { edgeGoogle } from "@/server/google";

/**
 * POST /api/v1/google/reviews/:id/draft — the receptionist's draft of a
 * reply to this review, for the person who will send it. Nothing is posted:
 * the words come back to the composer on Reports, and "Send to Google" is
 * the reply route. The edge holds the model key and the Autonomy row; a
 * workspace whose reviews row is Never gets no draft, and is told why.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAID: Record<string, string> = {
  policy_never: "Review replies are set to Never on Autonomy. Set them to Ask for a draft, or Auto to have new reviews answered.",
  no_review: "That review is not on record.",
  no_model_key: "Drafting is not available here yet.",
  model_failed: "The receptionist could not write a draft just now. Write the reply yourself, or try again.",
  empty_draft: "The receptionist could not write a draft just now. Write the reply yourself, or try again.",
};

export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "operator");
  await takeRate(ctx.userId, "google_draft");
  const id = typeof ctx.params.id === "string" ? ctx.params.id : "";
  if (!UUID.test(id)) throw new AppError("validation", "Which review?", 400);
  const a = await edgeGoogle({ op: "draft", tenant_id: member.tenantId, user_id: ctx.userId, id }, 25_000);
  const b = a.body ?? {};
  if (a.status !== 200 || b.ok !== true || typeof b.text !== "string") {
    const reason = typeof b.error === "string" ? b.error : "failed";
    const said = SAID[reason] ?? `No draft this time (${reason}).`;
    throw new AppError(a.status === 404 ? "not_found" : a.status === 409 ? "conflict" : "internal", said, a.status === 404 ? 404 : a.status === 409 ? 409 : 502);
  }
  return { text: b.text, mode: typeof b.mode === "string" ? b.mode : "ask" };
});
