import "server-only";
import { featureRejected } from "./sse";

/**
 * What a turn gives up when the API refuses its request for it, once each and in this order: the page's data blocks
 * (the Phase 2 plan, D14), the tools' examples (the Phase 3 plan, D9), then the answer's format (D15). The same round
 * is asked again without it; a refusal that names none of them, or one already given up, is the turn's.
 */
type Dropped = "context" | "examples" | "format";

/** The line each drop logs, once a turn. */
export const DROP_EVENTS: Record<Dropped, string> = {
  context: "ask_context_rejected",
  examples: "ask_examples_rejected",
  format: "ask_format_rejected",
};

/** A refusal of the request for its search_result blocks, or their cache marks (D14). */
function blocksRefused(message: string): boolean {
  return /^400\b/.test(message) && /search_result|citation|cache_control/i.test(message);
}

/** A refusal of the request for its tools' `input_examples` (D9). */
function examplesRefused(message: string): boolean {
  return /^400\b/.test(message) && /input_examples/.test(message);
}

/**
 * What to give up for this refusal, given what the turn still carries. A second examples refusal, with them already
 * gone, is the turn's -- never the format's, whose predicate would match the "input_schema" the real refusal names.
 */
export function dropFor(message: string, still: Record<Dropped, boolean>): Dropped | null {
  if (!message) return null;
  if (still.context && blocksRefused(message)) return "context";
  if (examplesRefused(message)) return still.examples ? "examples" : null;
  return still.format && featureRejected(message) ? "format" : null;
}
