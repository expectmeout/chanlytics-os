/**
 * The receptionist writing under a Google review: one model call through the model port (lib/ai/model.ts: the registry's
 * route for review_reply, its fallback on an overload, the call written to the usage ledger), the prompt from contracts
 * (review-reply.ts, the review fenced as someone else's words), the draft cleaned before anyone sees it.
 *
 * A reply is a few sentences in the business's name; a fast model does it
 * well and cheaply, so this is not the Opus the WhatsApp brain uses. The
 * budget is the sync's: the hourly sweep answers at most a handful per
 * workspace, and a draft asked for from Reports has a person waiting.
 */
import {
  cleanDraft,
  fenced,
  frameDraftChange,
  MODEL_PAUSED_WORDS,
  reviewReplyPrompt,
  type ReviewReplyFacts,
  type ReviewToAnswer,
} from "@chanlytics/contracts";
import { callModel } from "../ai/model.js";
import type { TenantId } from "@chanlytics/contracts";

type DraftResult =
  | { ok: true; text: string; usage: { input_tokens: number; output_tokens: number } | null }
  | { ok: false; error: "no_model_key" | "model_failed" | "empty_draft" | "payment_required"; detail?: string };

/** Who the draft is for: the workspace the ledger writes it to, and the review it answers. */
export interface ReviewDraftFor {
  tenantId: TenantId;
  reviewId?: string | null;
}

export async function draftReviewReply(
  facts: ReviewReplyFacts,
  review: ReviewToAnswer,
  forWhom: ReviewDraftFor,
  asked?: { instruction: string; given: string | null } | null,
): Promise<DraftResult> {
  const prompt = reviewReplyPrompt(facts, review);
  // What the owner said for this one reply, with what stands on their screen: theirs to give, a figure included.
  const result = asked
    ? {
        system: prompt.system,
        user: [
          prompt.user,
          asked.given ? `The reply so far:\n${fenced("reply", asked.given)}` : null,
          frameDraftChange(asked.instruction),
        ]
          .filter(Boolean)
          .join("\n\n"),
      }
    : prompt;
  const modelAnswer = await callModel(
    {
      purpose: "review_reply",
      body: { system: result.system, messages: [{ role: "user", content: result.user }] },
    },
    { tenantId: forWhom.tenantId, subjectId: forWhom.reviewId ?? null },
  );
  if (!modelAnswer) return { ok: false, error: "no_model_key" };
  if (modelAnswer.outcome === "held")
    return {
      ok: false,
      error: "payment_required",
      detail:
        modelAnswer.why === "unpaid"
          ? "This workspace is paused or its plan has ended."
          : MODEL_PAUSED_WORDS.reviewReply,
    };
  if (modelAnswer.outcome !== "ok")
    return { ok: false, error: "model_failed", detail: `${modelAnswer.status} ${modelAnswer.error}` };
  const text = cleanDraft(modelAnswer.text);
  if (!text) return { ok: false, error: "empty_draft" };
  return {
    ok: true,
    text,
    usage: { input_tokens: modelAnswer.usage.input, output_tokens: modelAnswer.usage.output },
  };
}
