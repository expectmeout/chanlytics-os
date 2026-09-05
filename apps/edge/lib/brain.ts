/**
 * The salon receptionist brain — Claude Opus 5 with a guardrailed, bilingual system prompt.
 * Returns { text, escalate } — escalate=true when the model signals human handoff.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ThreadTurn } from "./store.js";

// The system prompt is TENANT CONFIG (PRD E4): it arrives as a parameter from
// tenant-runtime, so this file knows how to talk, never who it speaks for.

/**
 * A budget, because this call sits inside a 60s webhook invocation that also
 * has to persist, send and escalate. The SDK defaults to a 10-minute timeout
 * with retries, so a slow response could consume the whole invocation and
 * destroy the customer's message rather than falling back to the holding
 * reply. 20s x 2 attempts leaves room for the send that follows.
 */
const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });

export interface BrainReply {
  text: string;
  escalate: boolean;
  reason?: "human_token" | "refusal";
  usage?: { input_tokens: number; output_tokens: number };
}

interface TextBlock { type: string; text?: string }

export async function generateReply(
  history: ThreadTurn[],
  userText: string,
  systemPrompt: string,
  fallbackText: string,
  /**
   * Who the receptionist is talking to, in a line or two.
   *
   * The bot had the conversation but not the person: it would greet a
   * customer of two years exactly as it greets a stranger, and could not use
   * a name WhatsApp had already told us. Passed as a SEPARATE system block so
   * the business profile above it stays byte-identical and keeps its prompt
   * cache — this changes per contact, that does not.
   */
  leadNote?: string,
  /**
   * The current moment in the business's timezone.
   *
   * Also a separate block, and for a sharper version of the same reason: this
   * changes every MINUTE. Folded into the prompt above it would evict the
   * business profile from the cache on literally every message, and the
   * receptionist would pay full price for its own clock.
   */
  nowNote?: string,
  /**
   * A photo the customer sent, when the workspace lets the receptionist look
   * (features.vision). Goes BEFORE the words, as the API prefers; the words
   * are built in vision.ts and restate the standing rules.
   */
  image?: { mime: string; base64: string },
): Promise<BrainReply> {
  const userContent = image
    ? [
        { type: "image", source: { type: "base64", media_type: image.mime, data: image.base64 } },
        { type: "text", text: userText },
      ]
    : userText;
  const messages = [...history, { role: "user" as const, content: userContent }];
  // output_config/effort predates this SDK pin's types; the API accepts it (proven in prod).
  const response = (await (client.messages.create as (p: unknown) => Promise<unknown>)({
    model: "claude-opus-5",
    max_tokens: 600,
    output_config: { effort: "low" },
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      // Uncached on purpose: one line per contact would otherwise evict the
      // business profile from the cache on every new customer.
      ...(nowNote ? [{ type: "text", text: nowNote }] : []),
      ...(leadNote ? [{ type: "text", text: `Who you are speaking with: ${leadNote}` }] : []),
    ],
    messages,
  })) as { stop_reason: string; content: TextBlock[]; usage?: { input_tokens: number; output_tokens: number } };
  const usage = response.usage
    ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
    : undefined;

  if (response.stop_reason === "refusal") {
    return {
      text: fallbackText,
      escalate: true,
      reason: "refusal",
      usage,
    };
  }

  let text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n")
    .trim();

  let escalate = text.includes("[[HUMAN]]");
  // Truncation can eat the trailing [[HUMAN]] token — treat a capped reply as
  // a handoff rather than silently dropping the escalation.
  if (response.stop_reason === "max_tokens") escalate = true;
  text = text.replace(/\s*\[\[HUMAN\]\]\s*/g, "").trim();
  if (!text) {
    text = fallbackText;
    escalate = true;
  }
  return { text, escalate, reason: escalate ? "human_token" : undefined, usage };
}
