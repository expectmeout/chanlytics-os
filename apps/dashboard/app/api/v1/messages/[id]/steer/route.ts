import { withRoute } from "@/server/with-route";
import { AppError } from "@chanlytics/contracts";
import { requireOperator, recordDecision } from "@/server/verbs";
import { steerDraft } from "@/server/service";
import { requireUuid } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";

/** One instruction's worth. The edge enforces the same cap. */
const MAX_CHARS = 500;

/**
 * POST /api/v1/messages/:id/steer — {text}.
 *
 * The text whisper: one line for a reply that is waiting its turn, and the
 * receptionist writes it again with that in mind, under the same rules. The
 * new draft waits like the first one did. Operator or owner, on a draft that
 * is still HELD: a reply that already went out cannot be rewritten, and the
 * route says so with a sentence instead of a refusal from upstream.
 *
 * Order: RLS proves the draft is visible → the role door is checked against
 * the draft's OWN workspace → the edge rewrites and re-queues → only then is
 * the decision recorded. A ledger row for a rewrite that did not happen would
 * be a record of nothing.
 */
export const POST = withRoute(async (req, ctx) => {
  const id = requireUuid(ctx.params.id, "message");
  takeRate(ctx.userId, "whisper");
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) throw new AppError("validation", "Say what should change.");
  if (text.length > MAX_CHARS) {
    throw new AppError("validation", `Keep it under ${MAX_CHARS} characters — it is worked into one reply.`);
  }

  const { data: m, error } = await ctx.supabase
    .from("messages")
    .select("id, tenant_id, conversation_id, sender, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!m) throw new AppError("not_found", "Message not found.", 404);
  await requireOperator(ctx, m.tenant_id);
  if (m.sender !== "ai" || m.status !== "queued") {
    throw new AppError("conflict", "This reply is not waiting — there is nothing to rewrite.", 409);
  }

  const r = await steerDraft(id, text);
  if (!r.ok) {
    throw new AppError(
      "upstream_anthropic",
      r.reason === "preview"
        ? "Rewrites only work on the production dashboard."
        : r.reason === "policy_block_price"
          ? "The rewrite would have quoted a price, so the original draft stays."
          : `The receptionist could not rewrite it (${r.reason}).`,
      502,
    );
  }
  const decisionId = await recordDecision(ctx, m.tenant_id, "message", m.id, "edit", { steer: text, new_message_id: r.messageId });
  return { ok: true, message_id: r.messageId, text: r.text, decision_id: decisionId };
});
