/**
 * An effort said in the messages (Anthropic's per-message effort, beta EFFORT_MESSAGE_BETA, on the Claude API and on
 * the models MODEL_TAKES marks, read 15 Oct 2026): a system message with no content whose output_config holds an effort alone. It
 * sets the effort from where it stands in `messages` on, and the request's own output_config -- what its cache is keyed
 * by -- stays as it was, so the prefix the cache holds is read as before; a change to the request's own effort would
 * write the messages to the cache again. One may stand anywhere in `messages`, the first place and between an
 * assistant's turn and the next question included.
 *
 * Ask's turn raises its effort this way for a draft and sets it back on the next turn that is none (the dashboard's
 * server/ask/effort.ts); the edge lets the messages through and holds a round to the ceiling its effort earns
 * (ask-gateway.ts, askRoundCap); the port sends them, with their beta, only to a model that takes them, and folds them
 * into the request's own effort for one that does not (channels models/anthropic.ts, MODEL_TAKES.effortMessages).
 *
 * The API's words, probed 15 Oct 2026: without the beta, "messages.1.output_config: Extra inputs are not permitted";
 * to Sonnet 5, "output_config.effort requires a model that supports per-turn effort; this model does not"; a level it
 * does not know, the five MODEL_EFFORTS holds. Beside a JSON-schema answer format the message is taken, and the cache
 * was read through it (6,568 tokens): a hair salon's three-step win-back drafted in 8.1 s at low, 8.8 s at high, and
 * 86 s and 8,854 output tokens at max.
 */
import { MODEL_EFFORTS, type ModelEffort } from "./models";

/** The beta an effort message needs (Anthropic's migration guide for Opus 5.5, read 15 Oct 2026). */
export const EFFORT_MESSAGE_BETA = "mid-conversation-output-config-2026-07-01";

/** An effort message as the API takes it: a system message with no content, its output_config an effort alone. */
export interface EffortMessage {
  role: "system";
  content: [];
  output_config: { effort: ModelEffort };
}

/** The message that sets `effort` from where it stands on. */
export function effortMessage(effort: ModelEffort): EffortMessage {
  return { role: "system", content: [], output_config: { effort } };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Whether `m` is an effort message: a system message, no content, an output_config with a level the API takes and nothing else. */
export function isEffortMessage(m: unknown): m is EffortMessage {
  if (!isRecord(m)) return false;
  const { role, content, output_config: oc, ...rest } = m;
  if (role !== "system" || !Array.isArray(content) || content.length > 0 || Object.keys(rest).length > 0) return false;
  if (!isRecord(oc)) return false;
  const { effort, ...more } = oc;
  return Object.keys(more).length === 0 && (MODEL_EFFORTS as readonly unknown[]).includes(effort);
}

/** The effort in force at the end of `messages`: the last effort message's, else `base`, the request's own. */
export function effortInForce<B extends ModelEffort | null>(messages: readonly unknown[], base: B): ModelEffort | B {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (isEffortMessage(m)) return m.output_config.effort;
  }
  return base;
}

/** Whether `a` thinks longer than `b`: further along MODEL_EFFORTS. */
export function effortAbove(a: ModelEffort, b: ModelEffort): boolean {
  return MODEL_EFFORTS.indexOf(a) > MODEL_EFFORTS.indexOf(b);
}

/**
 * A request's body as a model that takes no effort message is sent it: its messages without them, and the effort they
 * ended on as the request's own, beside its format. A body that carries none is returned as it is.
 */
export function foldEffortMessages(body: Record<string, unknown>): Record<string, unknown> {
  const messages = Array.isArray(body.messages) ? (body.messages as unknown[]) : [];
  const effort = effortInForce(messages, null);
  if (effort === null) return body;
  const own = isRecord(body.output_config) ? body.output_config : {};
  return { ...body, messages: messages.filter((m) => !isEffortMessage(m)), output_config: { ...own, effort } };
}
