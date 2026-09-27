/**
 * The receptionist writing under a Google review: one model call, the prompt
 * from contracts (review-reply.ts), the draft cleaned before anyone sees it.
 *
 * A reply is a few sentences in the business's name; a fast model does it
 * well and cheaply, so this is not the Opus the WhatsApp brain uses. The
 * budget is the sync's: the hourly sweep answers at most a handful per
 * workspace, and a draft asked for from Reports has a person waiting.
 */
import Anthropic from "@anthropic-ai/sdk";
import { cleanDraft, reviewReplyPrompt, type ReviewReplyFacts, type ReviewToAnswer } from "../packages/contracts.js";
import { env } from "../env.js";

export const REVIEW_REPLY_MODEL = "claude-sonnet-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  // Built on first use, not at import: this module rides along with the
  // sweep, which must keep reading listings on a deployment without a key.
  if (!client) client = new Anthropic({ timeout: 15_000, maxRetries: 1 });
  return client;
}

type DraftResult =
  | { ok: true; text: string; usage: { input_tokens: number; output_tokens: number } | null }
  | { ok: false; error: "no_model_key" | "model_failed" | "empty_draft"; detail?: string };

export async function draftReviewReply(facts: ReviewReplyFacts, review: ReviewToAnswer): Promise<DraftResult> {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, error: "no_model_key" };
  const p = reviewReplyPrompt(facts, review);
  let res;
  try {
    res = await anthropic().messages.create({
      model: REVIEW_REPLY_MODEL,
      max_tokens: 300,
      system: p.system,
      messages: [{ role: "user", content: p.user }],
    });
  } catch (e) {
    return { ok: false, error: "model_failed", detail: e instanceof Error ? e.message : String(e) };
  }
  const raw = res.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
  const text = cleanDraft(raw);
  if (!text) return { ok: false, error: "empty_draft" };
  return {
    ok: true,
    text,
    usage: res.usage ? { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens } : null,
  };
}
