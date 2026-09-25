/**
 * The shape of one Ask turn, as the loop measured it: where the time went and
 * what the model was fed.
 *
 * Logged as `ask_turn_shape` and stored on the turn's own row
 * (ask_messages.content.shape), so a day's numbers are one query
 * (tooling/scripts/ask-day.mjs), never a search of the logs. Milliseconds
 * count from the turn's start in the loop. Null means "never happened this
 * turn": a turn answered by cards alone streams no Say; a broken stream has
 * no first byte; a script sends no opened_ms. The spec:
 * docs/superpowers/specs/2026-09-25-ask-rewired-design.md, 5.8.
 */
export interface AskTurnShape {
  v: 1;
  /** The model and the effort the rounds ran at. */
  model: string;
  effort: string;
  surface: string | null;
  scope_kind: string | null;
  /** A second or later question on its thread, and how long after the thread's previous turn it came. */
  follow_up: boolean;
  since_last_ms: number | null;
  /** From the palette opening to the question being sent, as the tab measured it. */
  opened_ms: number | null;
  /** The snapshot and the prefetch, before the first round. */
  snapshot_ms: number;
  prefetched: string[];
  rounds: number;
  /** Each round's time from its request to its last event. */
  rounds_ms: number[];
  /** Each tool call's name and time, in the order they ran. */
  tools_ms: Array<{ name: string; ms: number }>;
  /** The first byte of the model's stream, its first text token, and the first Say the person saw. */
  first_byte_ms: number | null;
  first_text_ms: number | null;
  first_say_ms: number | null;
  final_ms: number;
  /** Summed over the rounds, as the API counted them. */
  tokens: AskTurnTokens;
  /** Cache reads over everything the model was fed; null when nothing was counted (cacheHitOf). */
  cache_hit: number | null;
  /** Rounds that stopped at ASK_MAX_TOKENS. */
  cap_hits: number;
  /** Whether the answer's format held for the turn (false once the API refused it, D15). */
  format: boolean;
  failed: boolean;
}

export interface AskTurnTokens {
  input: number;
  cache_read: number;
  cache_creation: number;
  output: number;
}

/**
 * Cache reads over everything the model was fed: the reads, the writes and the
 * uncached input. A write is what a miss costs, so it counts against the hit.
 * Null when the model was not fed at all (a turn refused before its first
 * round), which no average should count as a miss.
 */
export function cacheHitOf(t: AskTurnTokens): number | null {
  const fed = t.input + t.cache_read + t.cache_creation;
  return fed > 0 ? t.cache_read / fed : null;
}
