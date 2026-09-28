import "server-only";

/**
 * How a turn ends: where the time went and what the model was fed (AskTurnShape), measured while the turn runs
 * (turnMeter) and said as it returns (finishTurn), beside the turn as the model was sent it (memory.ts rawTurn), which
 * no log line carries. runAskTurn's; memory.ts never reads it.
 */

import {
  answerText,
  cacheHitOf,
  type AskModelProfile,
  type AskProposal,
  type AskTurnShape,
} from "@chanlytics/contracts";
import { calledName, type ToolRun } from "./tools";
import type { BuiltContext, SearchResultBlock } from "./context";
import type { RoundResult } from "./round";
import { chainEnd, rawTurn, type TurnEnd } from "./memory";
import type { TurnInput, TurnResult } from "./loop";

/**
 * Where the time went and what the model was fed (AskTurnShape), as a turn measures it from `t0`, its start: the first
 * byte of the model's stream, its first text token, the first Say the person saw, each round's time, each tool's, the
 * tokens by cache or not, and the rounds that stopped at the cap. Only the loop sees all of it; finishTurn reads it.
 */
export function turnMeter(t0: number) {
  const meter = {
    firstByteMs: null as number | null,
    firstTextMs: null as number | null,
    firstSayMs: null as number | null,
    roundsMs: [] as number[],
    toolsMs: [] as Array<{ name: string; ms: number }>,
    tokens: { input: 0, cache_read: 0, cache_creation: 0, output: 0 },
    capHits: 0,
    /** A round that came back, begun at `roundAt`: its time, and its stream's first byte and text from the turn's start. */
    round(r: RoundResult, roundAt: number): void {
      meter.roundsMs.push(r.timing?.totalMs ?? Date.now() - roundAt);
      if (r.timing) {
        if (meter.firstByteMs === null && r.timing.firstEventMs !== null)
          meter.firstByteMs = roundAt - t0 + r.timing.firstEventMs;
        if (meter.firstTextMs === null && r.timing.firstTextMs !== null)
          meter.firstTextMs = roundAt - t0 + r.timing.firstTextMs;
      }
      if (r.usage) {
        meter.tokens.input += r.usage.inputTokens;
        meter.tokens.cache_read += r.usage.cacheReadTokens;
        meter.tokens.cache_creation += r.usage.cacheCreationTokens;
        meter.tokens.output += r.usage.outputTokens ?? 0;
      }
    },
    /** A Say the person saw: the first one's time, from the turn's start. */
    said(): void {
      if (meter.firstSayMs === null) meter.firstSayMs = Date.now() - t0;
    },
  };
  return meter;
}

/** What the turn read, measured and made up to its end: runAskTurn's own, as they stand when it ends. */
interface TurnSoFar {
  input: TurnInput;
  model: AskModelProfile;
  t0: number;
  built: BuiltContext | null;
  contextMs: number;
  dataDropped: boolean;
  pageBlocks: SearchResultBlock[];
  crossBlocks: SearchResultBlock[];
  plan: ToolRun[];
  meter: ReturnType<typeof turnMeter>;
  format: boolean;
  toolsUsed: string[];
  proposals: AskProposal[];
  /** Where the question sits in every request of the turn: a later round only appends. */
  questionAt: number;
  /** Whether the turn replayed its thread's chain (replayFor), as its last request did. */
  live: boolean;
}

/**
 * The turn as it returns: its end, with where the time went and what the model was fed (AskTurnShape), logged, and the
 * turn as the model was sent it (RawTurn), which no log line carries.
 */
export function finishTurn(r: TurnEnd, soFar: TurnSoFar): TurnResult {
  const { lastRound, ...end } = r;
  const { input, model, t0, built, contextMs, dataDropped, pageBlocks, crossBlocks, plan, format, toolsUsed } = soFar;
  const { roundsMs, toolsMs, firstByteMs, firstTextMs, firstSayMs, tokens, capHits } = soFar.meter;
  const { proposals, live } = soFar;
  // What the turn keeps beside it (RawTurn): a live turn, its link and what it told; a rebuilt one, what its lines told.
  const kept = live && input.chain ? chainEnd(input.chain) : input.told ? { told: input.told } : {};
  const shape: AskTurnShape = {
    v: 1,
    model: model.id,
    effort: model.effort,
    surface: input.surface,
    scope_kind: input.scope?.kind ?? null,
    follow_up: input.history.length > 0,
    since_last_ms: input.sinceLastMs ?? null,
    replay: live ? "live" : input.history.length > 0 ? "rebuilt" : "none",
    opened_ms: input.openedMs ?? null,
    context_rows: built ? built.rows : null,
    context_chars: built ? built.chars : null,
    warm: built ? (built.failed ? "failed" : built.warm) : input.context ? "failed" : "none",
    context_ms: contextMs,
    context_dropped: dataDropped && (pageBlocks.length > 0 || crossBlocks.length > 0),
    cross_page: plan.map((p) => calledName(p.name, p.input)),
    rounds: r.rounds,
    rounds_ms: roundsMs,
    tools_ms: toolsMs,
    first_byte_ms: firstByteMs,
    first_text_ms: firstTextMs,
    first_say_ms: firstSayMs,
    final_ms: Date.now() - t0,
    tokens,
    cache_hit: cacheHitOf(tokens),
    cap_hits: capHits,
    format,
    failed: r.failed,
  };
  console.log(
    JSON.stringify({
      level: "info",
      event: "ask_turn_shape",
      tenant: input.tenantId,
      ...shape,
      tools: toolsUsed,
      form: r.answer.form,
    }),
  );
  return {
    ungrounded: false,
    tools: toolsUsed,
    proposals,
    latencyMs: Date.now() - t0,
    ...end,
    text: answerText(r.answer),
    model: model.id,
    shape,
    raw: lastRound && !lastRound.streamError ? rawTurn(lastRound, soFar.questionAt, kept) : null,
  };
}
