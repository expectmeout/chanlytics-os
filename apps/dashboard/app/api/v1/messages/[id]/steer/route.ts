import { z } from "zod";
import { AppError } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { messageScope, recordDecision } from "@/server/verbs";
import { steerDraft } from "@/server/service";

const MAX_CHARS = 500;

const Body = z.object({
  text: z.string().trim().min(1, "Say what should change.").max(MAX_CHARS, `Keep it under ${MAX_CHARS} characters — it is worked into one reply.`),
});

/**
 * POST /api/v1/messages/:id/steer — { text }: rewrite a held draft before
 * the customer sees it. The message is the row (messageScope): visible
 * under RLS first, then the role judged where it lives; only a draft that
 * is still waiting can be rewritten, and the decision is recorded only
 * once the rewrite happened.
 */
export const POST = write({
  scope: messageScope,
  role: "operator",
  rate: "whisper",
  input: Body,
  handle: async ({ ctx, row: m, input }) => {
    const id = m.id;
    const text = input.text;
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
  },
});
