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
  type ModelSpeed,
} from "@chanlytics/contracts";
import { calledName, type ToolRun } from "./tools";
import type { BuiltContext, SearchResultBlock } from "./context";
import { argsOf, type RoundBlock, type RoundResult } from "./round";
import { chainEnd, rawTurn, type TurnEnd } from "./memory";
import type { TurnInput, TurnResult } from "./loop";
import { log } from "@/server/log";

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
    messageIds: [] as Array<string | null>,
    /** The model that answered the last round that said so: a fallback's when the edge asked one. */
    answeredBy: null as string | null,
    cacheMiss: [] as Array<string | null>,
    hopMs: null as number | null,
    /** The speed each round that came back went at, as the edge said it (null where it said none). */
    speeds: [] as Array<ModelSpeed | null>,
    /** A draft, asked harder than the turn's own effort, and what found it (effort.ts); null while there is none. */
    draft: null as AskTurnShape["draft"],
    /**
     * A round that stopped at its ceiling: counted and said, since whatever it wrote may be half-written, and a tool
     * call or an answer that is half-written does not parse at all (caught where it is used: argsOf, normalizeAnswer).
     * A turn that keeps hitting the cap is a budget that is too small, not a model that keeps changing its mind.
     */
    capped(stopReason: string | null, round: number, blocks: RoundBlock[], tenantId: string): void {
      if (stopReason !== "max_tokens") return;
      meter.capHits++;
      log.error("ask_round_hit_cap", {
        round,
        tools: blocks.filter((b) => b.type === "tool_use").map((b) => calledName(b.name, argsOf(b))),
        tenant_id: tenantId,
      });
    },
    /** A round that came back, begun at `roundAt`: its time, and its stream's first byte and text from the turn's start. */
    round(r: RoundResult, roundAt: number): void {
      meter.roundsMs.push(r.timing?.totalMs ?? Date.now() - roundAt);
      if (meter.messageIds.length === 0) meter.hopMs = r.timing?.hopMs ?? null;
      meter.messageIds.push(r.usage?.messageId ?? null);
      meter.answeredBy = r.usage?.model ?? meter.answeredBy;
      meter.cacheMiss.push(r.usage?.cacheMiss ?? null);
      meter.speeds.push(r.timing?.speed ?? null);
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
    /** The API's id for the last round that came back; null before one did, or when its stream never said it. */
    lastId(): string | null {
      return meter.messageIds.at(-1) ?? null;
    },
    /**
     * The message a round follows on, for the cache diagnostics (the Phase 6 plan, D2): the round before it, else, on
     * a live turn's first round, the previous turn's last (Chain.lastId), else null, which starts a comparison. Never
     * part of the prefix a replay is matched on (memory.ts prefixOf).
     */
    follows(live: boolean, chain: TurnInput["chain"]): { previous_message_id: string | null } {
      const previous = meter.messageIds.length ? meter.lastId() : live ? (chain?.lastId ?? null) : null;
      return { previous_message_id: previous };
    },
    /** A Say the person saw: the first one's time, from the turn's start. */
    said(): void {
      if (meter.firstSayMs === null) meter.firstSayMs = Date.now() - t0;
    },
  };
  return meter;
}

/**
 * The speed a turn ran at (AskTurnShape.speed): its rounds' as the edge said them, one word when they agree and mixed
 * when fast mode's limit slowed some. Standard where no round said one: an edge older than fast mode, which never sends
 * it, or a turn no round of which came back.
 */
function speedOfTurn(said: ReadonlyArray<ModelSpeed | null>): AskTurnShape["speed"] {
  const [first, ...rest] = said.filter((s): s is ModelSpeed => s !== null);
  if (first === undefined) return "standard";
  return rest.every((s) => s === first) ? first : "mixed";
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
  /** How the answer that ended the turn was written: the answer tool's input, as text, or null where none was. */
  answerIn: "tool" | "text" | null;
  toolsUsed: string[];
  proposals: AskProposal[];
  /** Where the question sits in every request of the turn: a later round only appends. */
  questionAt: number;
  /** Whether the turn replayed its thread's chain (replayFor), as its last request did. */
  live: boolean;
  /** The first 16 hex of the sha256 of the turn's system blocks: what the answer was written from. */
  promptHash: string;
}

/**
 * The turn as it returns: its end, with where the time went and what the model was fed (AskTurnShape), logged, and the
 * turn as the model was sent it (RawTurn), which no log line carries.
 */
export function finishTurn(r: TurnEnd, soFar: TurnSoFar): TurnResult {
  const { lastRound, ...end } = r;
  const { input, model, t0, built, contextMs, dataDropped, pageBlocks, crossBlocks, plan, format, toolsUsed } = soFar;
  const { roundsMs, toolsMs, firstByteMs, firstTextMs, firstSayMs, tokens, capHits } = soFar.meter;
  const { messageIds, cacheMiss, hopMs, speeds } = soFar.meter;
  const { proposals, live } = soFar;
  // What the turn keeps beside it (RawTurn): a live turn, its link and what it told; a rebuilt one, what its lines told.
  const kept = live && input.chain ? chainEnd(input.chain) : input.told ? { told: input.told } : {};
  const shape: AskTurnShape = {
    v: 1,
    model: model.id,
    answered_by: soFar.meter.answeredBy,
    prompt_hash: soFar.promptHash,
    effort: model.effort,
    draft: soFar.meter.draft,
    speed: speedOfTurn(speeds),
    surface: input.surface,
    scope_kind: input.scope?.kind ?? null,
    follow_up: input.history.length > 0,
    since_last_ms: input.sinceLastMs ?? null,
    replay: live ? "live" : input.history.length > 0 ? "rebuilt" : "none",
    opened_ms: input.openedMs ?? null,
    spoken: input.spoken ?? false,
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
    message_ids: messageIds,
    cache_miss: cacheMiss,
    hop_ms: hopMs,
    cap_hits: capHits,
    format,
    answer_tool: model.answerTool,
    answer_in: r.failed ? null : soFar.answerIn,
    failed: r.failed,
  };
  log.info("ask_turn_shape", { tenant_id: input.tenantId, ...shape, tools: toolsUsed, form: r.answer.form });
  return {
    ungrounded: false,
    tools: toolsUsed,
    proposals,
    latencyMs: Date.now() - t0,
    ...end,
    text: answerText(r.answer),
    model: model.id,
    shape,
    raw:
      lastRound && !lastRound.streamError
        ? rawTurn({ ...lastRound, messageId: soFar.meter.lastId() }, soFar.questionAt, kept)
        : null,
  };
}

/**
 * What a turn's cards leave out of what was asked (the operator stress run, 15 Oct 2026: "turn the receptionist off, add
 * a note that she prefers mornings, and put her on a new list called Mornings" made two cards, 4 times of 4, and "2 cards
 * to review" answered over the list's refusal a round before): a proposal refused, until a later call of the same tool
 * and action makes its card, and a part a card leaves out because it already reads so (ProposalOutcome.noted). While
 * one stands, a turn never ends on its cards' count alone: the round goes back, and the model is told to say it.
 */
export function turnUnmade() {
  const refused = new Map<string, string>();
  const noted: string[] = [];
  return {
    /** A proposal's outcome, under the name its call is recorded by (`propose_list.make`). */
    heard(name: string, o: { isError: boolean; refusal?: string; noted?: string; result: string }): void {
      if (o.isError) refused.set(name, o.refusal ?? o.result);
      else refused.delete(name);
      if (o.noted) noted.push(o.noted);
    },
    /**
     * A round of cards alone, every one made: "answer", they are the Do, said in a sentence with no second round;
     * "owed", part of what was asked is no card and not yet said, so the round goes back to say it; else null. A refused
     * or failed proposal keeps the round -- the model must say why and what the person can do instead.
     */
    alone(r: { acts: number; calls: number; refused: boolean; made: boolean }): "answer" | "owed" | null {
      if (r.acts !== r.calls || r.refused || !r.made) return null;
      return refused.size > 0 || noted.length > 0 ? "owed" : "answer";
    },
    /** What the round after cards alone is told: each part no card carries, and that the answer says it. */
    words(): string {
      const parts = [
        ...[...refused].map(([name, why]) => `${name} was refused (${why})`),
        ...noted.map((n) => `${n}, so its card leaves that as it is`),
      ];
      return `Part of what they asked is no card: ${parts.join("; ")}. Propose what you still can, then answer: what the cards do and, in a short clause each, what was not made and why, or what already holds, and what they can do instead. Never leave one out.`;
    },
  };
}
