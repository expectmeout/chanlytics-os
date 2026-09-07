import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError } from "@chanlytics/contracts";
import { cleanReply } from "@chanlytics/channels";
import { takeRate } from "@/server/rate-limit";
import { recordDecision } from "@/server/verbs";
import { edgeGoogle } from "@/server/google";

/**
 * POST /api/v1/google/reviews/:id/reply — {comment}: the business answers a
 * review, on Google, in the owner's or an operator's own words. The edge
 * holds the token and makes the call; this route proves who is asking,
 * keeps the ledger (subject 'review', verb 'reply_review'), and says what
 * happened. A reply replaces the previous one: Google keeps one per review.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAID: Record<string, string> = {
  not_connected: "Connect your Business Profile first — replies go through it.",
  not_from_profile: "This review was read from the public listing; replies need the Business Profile connected.",
  no_review: "That review is not on record.",
  no_token: "The connection to Google was lost. Connect again from Integrations.",
  google_refused: "Google did not accept the reply.",
};

export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "operator");
  await takeRate(ctx.userId, "google_reply");
  const id = typeof ctx.params.id === "string" ? ctx.params.id : "";
  if (!UUID.test(id)) throw new AppError("validation", "Which review?", 400);
  const body = (await req.json().catch(() => ({}))) as { comment?: unknown };
  const comment = cleanReply(body.comment);
  if (!comment) throw new AppError("validation", "Write the reply first.", 400);
  const a = await edgeGoogle({ op: "reply", tenant_id: member.tenantId, user_id: ctx.userId, id, comment }, 25_000);
  const b = a.body ?? {};
  if (a.status !== 200 || b.ok !== true) {
    const reason = typeof b.error === "string" ? b.error : "failed";
    const said = SAID[reason] ?? `The reply did not go through (${reason}).`;
    throw new AppError(a.status === 404 ? "not_found" : a.status === 409 ? "conflict" : "internal", reason === "google_refused" && typeof b.detail === "string" ? `${said} ${b.detail.slice(0, 200)}` : said, a.status === 404 ? 404 : a.status === 409 ? 409 : 502);
  }
  const repliedAt = typeof b.replied_at === "string" ? b.replied_at : null;
  const replyText = typeof b.reply_text === "string" ? b.reply_text : comment;
  const decisionId = await recordDecision(ctx, member.tenantId, "review", id, "reply_review", { comment, replied_at: repliedAt });
  return { reply_text: replyText, replied_at: repliedAt, decision_id: decisionId };
});
