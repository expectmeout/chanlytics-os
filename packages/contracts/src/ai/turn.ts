/**
 * A receptionist's turn, as it is kept (decision 0039; model_turns, 00401): what the model read beside its system
 * prompt, and what it answered before layer two replaced any of it. The prompt's own text is kept once, under its hash
 * (model_prompts), so a turn is its prompt's hash and these two records, and reading it again needs nothing that has
 * changed since.
 *
 * A photo is said and never kept: the turn names its type, and whoever reads the turn again reads the words alone.
 * The shapes are type aliases, not interfaces, so a database client takes them as JSON without a cast.
 */
import type { BrainOutput } from "../config/brain-schema";

/** What the model read beside its prompt, block by block, as it was sent. */
export type ModelTurnRequest = {
  /** The clock and what is open (its own system block); null when none was sent. */
  now: string | null;
  /** Who the person is, as the block the model read; null for someone nothing is known of. */
  who: string | null;
  /** An owner's steer, framed as the model read it; null on the receptionist's own turn. */
  steer: string | null;
  /** The thread's turns and the message answered, oldest first. */
  messages: { role: "user" | "assistant"; content: string }[];
  /** The type of a photo that went before the last message's words; null when there was none. */
  photo: string | null;
};

/** What the model answered: its words as they came, and the record the platform read from them. */
export type ModelTurnResponse = {
  /** Why it stopped, in the API's word; null when it named none. */
  stop_reason: string | null;
  /** Its words as they came (the record's own JSON, where it answered in one), cut at MODEL_TURN_TEXT_MAX. */
  text: string;
  /**
   * The record as the platform read it from those words (parseBrainOutput: a reason and the facts capped, a
   * confidence held to 0..1, an intent or language it does not know made "other"), which is what the reply and its
   * row were made from; null where no record could be read. Where the two differ, `text` is what the model wrote.
   */
  record: BrainOutput | null;
};

/** How long keeping a turn may take before it is left behind: the customer's reply never waits on it longer. */
export const MODEL_TURN_WRITE_MS = 1_500;

/** The longest answer a turn keeps. An answer is capped far under it, so what is cut was never one. */
const MODEL_TURN_TEXT_MAX = 20_000;

export function modelTurnRequestOf(sent: {
  now?: string;
  who?: string;
  steer?: string;
  messages: readonly { role: "user" | "assistant"; content: string }[];
  photoType?: string;
}): ModelTurnRequest {
  return {
    now: sent.now ?? null,
    who: sent.who ?? null,
    steer: sent.steer ?? null,
    messages: sent.messages.map((m) => ({ role: m.role, content: m.content })),
    photo: sent.photoType ?? null,
  };
}

/** The answer as it came, with the record read from it where one could be. */
export function modelTurnResponseOf(
  stopReason: string | null,
  record: BrainOutput | null,
  text: string,
): ModelTurnResponse {
  return { stop_reason: stopReason, text: text.slice(0, MODEL_TURN_TEXT_MAX), record: record ? { ...record } : null };
}
