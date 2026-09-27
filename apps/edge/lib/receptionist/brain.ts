/**
 * The receptionist brain — Claude Opus 5 with a guardrailed, bilingual system prompt.
 *
 * It answers in a record, not a string (contracts/brain.ts): the reply, what
 * the customer wanted, whether a person should take over and why, how sure it
 * is, which facts it leaned on, which language. The API constrains the
 * decoding to that shape; the parse below is the second door. The handoff
 * token in the text still works, for the day a prompt says it.
 *
 * If the API will not take the record's shape — a rejected format, a schema
 * it no longer accepts — the same request runs without it and is read the
 * old way, with a log line saying so. The words go out either way; silence
 * is never the fallback.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ThreadTurn } from "../packages/core.js";
import { BRAIN_OUTPUT_JSON_SCHEMA, parseBrainOutput, brainMetaOf, type BrainMeta } from "../packages/contracts.js";
import { logger } from "../log.js";

export const BRAIN_MODEL = "claude-opus-5";

// The system prompt is TENANT CONFIG (PRD E4): it arrives as a parameter from
// tenant-runtime, so this file knows how to talk, never who it speaks for.

/**
 * A budget, because this call sits inside a 60s webhook invocation that also
 * has to persist, send and escalate. The SDK defaults to a 10-minute timeout
 * with retries, so a slow response could consume the whole invocation and
 * destroy the customer's message rather than falling back to the holding
 * reply. 20s x 2 attempts leaves room for the send that follows.
 */
const BRAIN_TIMEOUT_MS = 20_000;
const client = new Anthropic({ timeout: BRAIN_TIMEOUT_MS, maxRetries: 1 });

export interface BrainReply {
  text: string;
  escalate: boolean;
  reason?: "human_token" | "refusal" | "brain_error";
  usage?: { input_tokens: number; output_tokens: number };
  /** What the row remembers about this answer; absent when the model's
   *  answer could not be read and the holding reply went out instead. An
   *  answer read without its record (the schema refused, the plain retry
   *  taken) carries a record that says so, at confidence 0: the confidence
   *  dial then holds it where the owner set a floor, instead of the outage
   *  quietly switching the floor off. */
  meta?: BrainMeta;
}

interface TextBlock {
  type: string;
  text?: string;
}
interface RawResponse {
  stop_reason: string;
  content: TextBlock[];
  usage?: { input_tokens: number; output_tokens: number };
}

// output_config predates this SDK pin's types; the API accepts it (proven in prod).
const create = client.messages.create.bind(client.messages) as unknown as (p: unknown) => Promise<RawResponse>;

/** The API refused the REQUEST — its format or schema — not the content. */
function formatRejected(e: unknown): boolean {
  const err = e as { status?: number; message?: string } | null;
  return err?.status === 400 && /output_config|output_format|json_schema|schema|format/i.test(err.message ?? "");
}

const TOKEN = /\s*\[\[HUMAN\]\]\s*/g;

/** The old reading: words with a handoff token somewhere in them. */
function legacyReply(raw: string, fallbackText: string, stopReason: string, usage: BrainReply["usage"]): BrainReply {
  let escalate = raw.includes("[[HUMAN]]");
  // Truncation can eat the trailing token — a capped reply is a handoff.
  if (stopReason === "max_tokens") escalate = true;
  let text = raw.replace(TOKEN, "").trim();
  if (!text) {
    text = fallbackText;
    escalate = true;
  }
  return {
    text,
    escalate,
    reason: escalate ? "human_token" : undefined,
    usage,
    meta: {
      intent: "other",
      confidence: 0,
      reason: "read without its record: the schema was refused and the plain retry answered",
      facts_used: [],
      language: "other",
      model: BRAIN_MODEL,
    },
  };
}

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
  /**
   * The owner's instruction for a rewrite (contracts frameSteer): a separate,
   * uncached system block, present only when a held draft is being steered.
   */
  steer?: string,
): Promise<BrainReply> {
  const L = logger();
  const userContent = image
    ? [
        { type: "image", source: { type: "base64", media_type: image.mime, data: image.base64 } },
        { type: "text", text: userText },
      ]
    : userText;
  // The thread's memory is read after the customer's message is stored, so
  // its last turn is usually that same message; appending it again showed
  // the model every message twice. The copy is skipped, the memory kept.
  const last = history[history.length - 1];
  const prior =
    last && last.role === "user" && last.content.trim() === userText.trim() ? history.slice(0, -1) : history;
  const messages = [...prior, { role: "user" as const, content: userContent }];
  const base = {
    model: BRAIN_MODEL,
    // The record costs more tokens than the words alone; a capped answer is
    // an unreadable one, and unreadable means the holding reply.
    max_tokens: 900,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      // Uncached on purpose: one line per contact would otherwise evict the
      // business profile from the cache on every new customer.
      ...(nowNote ? [{ type: "text", text: nowNote }] : []),
      ...(leadNote ? [{ type: "text", text: `Who you are speaking with: ${leadNote}` }] : []),
      ...(steer ? [{ type: "text", text: steer }] : []),
    ],
    messages,
  };

  let response: RawResponse;
  let structured = true;
  try {
    response = await create({
      ...base,
      output_config: { effort: "low", format: { type: "json_schema", schema: BRAIN_OUTPUT_JSON_SCHEMA } },
    });
  } catch (e) {
    if (!formatRejected(e)) throw e;
    L.error("brain_format_rejected", { error: String((e as Error).message ?? e).slice(0, 200) });
    structured = false;
    response = await create({ ...base, output_config: { effort: "low" } });
  }
  const usage = response.usage
    ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
    : undefined;

  if (response.stop_reason === "refusal") {
    return { text: fallbackText, escalate: true, reason: "refusal", usage };
  }

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("")
    .trim();
  if (!structured) return legacyReply(raw, fallbackText, response.stop_reason, usage);

  // A capped answer is a cut-off document: nothing in it can be trusted to
  // be whole, so the holding reply goes out and a person is told, as a capped
  // reply always meant.
  if (response.stop_reason === "max_tokens") {
    L.error("brain_capped", { chars: raw.length });
    return { text: fallbackText, escalate: true, reason: "human_token", usage };
  }
  const parsed = parseBrainOutput(raw);
  if (!parsed.ok) {
    L.error("brain_parse_failed", { error: parsed.error, chars: raw.length });
    return { text: fallbackText, escalate: true, reason: "brain_error", usage };
  }

  let text = parsed.value.reply.trim();
  // The record says so, or the old token does — either is a handoff.
  let escalate = parsed.value.escalate || text.includes("[[HUMAN]]");
  text = text.replace(TOKEN, "").trim();
  if (!text) {
    text = fallbackText;
    escalate = true;
  }
  return {
    text,
    escalate,
    reason: escalate ? "human_token" : undefined,
    usage,
    meta: brainMetaOf(parsed.value, BRAIN_MODEL),
  };
}
