import "server-only";

/**
 * What a turn keeps of its thread: the thread it continues and the history it is asked with, before the model is asked
 * (threadForTurn, the ask route's), and the turn as it ends, measured and as the model was sent it (finishTurn,
 * runAskTurn's).
 */

import { createHash } from "node:crypto";
import {
  AppError,
  answerText,
  cacheHitOf,
  type AskAnswer,
  type AskModelId,
  type AskModelProfile,
  type AskProposal,
  type AskScope,
  type AskTurnShape,
} from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";
import { calledName, type ToolRun } from "./tools";
import { titleFromQuestion, titleFromSearch, type SearchAnswering } from "./prompt";
import { createThread, readThread } from "./store";
import type { BuiltContext, SearchResultBlock } from "./context";
import { replayBlocks, resultBlocks, type CallOutcome, type RoundBlock, type RoundResult } from "./round";
import type { Msg, TurnInput, TurnResult } from "./loop";

/** The question as the route read it, and the search it answers, if any. */
interface Asked {
  tenantId: string;
  threadId: string | null;
  text: string;
  /** The question's scope: a scope, none (`null`, which clears the thread's), or no opinion (undefined: the thread's). */
  scope: AskScope | null | undefined;
  answering: SearchAnswering | null;
}

/**
 * The thread a turn lands in: the caller's own when the question names one, else a new one, titled once. A thread
 * that is not the caller's is a 404, except for an answer to a search's question, which starts one of the caller's
 * own. The scope is the question's, none when it said none, else the thread's (the Phase 5 plan, D9).
 */
export async function threadForTurn(
  ctx: RouteContext,
  asked: Asked,
): Promise<{
  thread: { id: string; title: string; scope: AskScope | null };
  /** The thread's turns as the model reads them, oldest first. */
  history: Array<{ role: "user" | "assistant"; text: string }>;
  sinceLastMs: number | null;
  scope: AskScope | null;
}> {
  const { tenantId, threadId, text, answering } = asked;
  let { scope } = asked;
  let history: Array<{ role: "user" | "assistant"; text: string }> = [];
  let sinceLastMs: number | null = null;
  let thread: { id: string; title: string; scope: AskScope | null } | null = null;
  if (threadId) {
    const found = await readThread(ctx, threadId);
    if (found && found.tenantId === tenantId) {
      thread = { id: found.thread.id, title: found.thread.title, scope: found.thread.scope };
      history = found.turns;
      // The thread's previous turn, before this question is appended: how long the person waited to ask again. The
      // read holds the newest rows (readThread), so its last is the previous turn however long the thread is.
      const lastAt = found.messages.at(-1)?.atMs;
      sinceLastMs = lastAt ? Math.max(0, Date.now() - lastAt) : null;
      if (scope === undefined) scope = found.thread.scope;
    } else if (!answering) throw new AppError("not_found", "That thread is not yours.", 404);
  }
  if (!thread) {
    // A thread keeps its first question as its title (the Line's spec, D9); an answer's is the search's name, never
    // the sentence the model is given.
    const title = answering ? titleFromSearch(answering.name) : titleFromQuestion(text);
    const created = await createThread(ctx, tenantId, title, scope ?? null);
    thread = { id: created.id, title: created.title, scope: scope ?? null };
  }
  return { thread, history, sinceLastMs, scope: scope ?? null };
}

/** The round a turn ended on: the request as it went out, what the model wrote, what its calls answered, when it began. */
interface LastRound {
  request: {
    model: AskModelId;
    system: unknown[];
    messages: Msg[];
    tools: unknown[];
    tool_choice: unknown;
    output_config: unknown;
  };
  blocks: RoundBlock[];
  outcomes: CallOutcome[];
  /** Epoch ms, as the request went out. */
  roundAt: number;
  /** The stream broke after it began: the blocks are what came before the break, perhaps not all the model wrote. */
  streamError: string | null;
}

/** How a turn ended, as each of runAskTurn's ends says it. */
export interface TurnEnd {
  answer: AskAnswer;
  failed: boolean;
  failure: string | null;
  rounds: number;
  ungrounded?: boolean;
  /** The round an answer or its cards ended the turn on; a turn that failed has none. */
  lastRound?: LastRound;
}

/**
 * A turn as the model was sent it (the Phase 5 plan, D2 and D11), for a later turn to replay verbatim: the answer's row
 * keeps it at content.raw (storedRaw), the Line's reads never select it (store.ts, readThread), and the browser never
 * gets it. It is the last request's own messages and bytes, never derived again. A turn that failed keeps none, nor
 * one whose last stream broke: what came before the break is the answer, never a turn to replay.
 */
export interface RawTurn {
  /**
   * Every message before the question in the last request: the thread's earlier turns as the turn was asked with them
   * (foldHistory), none on a thread's first. The thinking blocks that follow are bound to exactly these.
   */
  base: Msg[];
  /**
   * The person's message as the last request carried it: the page's data, the reads made before the model was asked,
   * the turn's words and the question -- without the page's data when a refusal dropped it, and after a question the
   * thread left unanswered, when the fold joined one in (foldHistory).
   */
  question: unknown;
  /** Every message after the question in the last request, in order: each earlier round, and what was sent back. */
  rounds: Msg[];
  /** The last round as a request would carry it back (replayBlocks): its thinking and signatures, its text, its calls. */
  final: unknown[];
  /** What the last round's calls answered, as the next request would carry it: its cards', alone or beside an answer. */
  results: unknown[];
  /** When the last round began, epoch ms: the cache's five minutes run from a request's start, not from the saved row. */
  at: number;
  /** The model the requests named. */
  model: AskModelId;
  /** What the last request sent besides its messages, hashed (prefixOf): a replay on another is cold. */
  prefix: string;
}

/**
 * The sha256, in hex, of what a request sends besides its messages that a live replay needs unchanged: system and
 * tools as they were sent, the tool choice, and the output config -- the effort and the answer's format. A setting, a
 * note, the hours, an autonomy mode, the workspace's shape, the role, a refusal of the examples or the format, another
 * effort or format, or a last round that could call no tool gives another: any of them makes a replay miss the cache
 * and write it all again, where a cold turn's words cost less.
 */
function prefixOf(request: LastRound["request"]): string {
  const { system, tools, tool_choice, output_config } = request;
  return createHash("sha256").update(JSON.stringify({ system, tools, tool_choice, output_config })).digest("hex");
}

/** The turn as it was sent, from the round it ended on and where the question sits in that round's request. */
function rawTurn({ request, blocks, outcomes, roundAt }: LastRound, questionAt: number): RawTurn {
  const { model, messages } = request;
  return {
    base: messages.slice(0, questionAt),
    question: messages[questionAt].content,
    rounds: messages.slice(questionAt + 1),
    final: replayBlocks(blocks),
    results: resultBlocks(outcomes),
    at: roundAt,
    model,
    prefix: prefixOf(request),
  };
}

/**
 * The raw turn as the answer's row keeps it, at content.raw: its messages and blocks as ONE JSON string, beside its
 * scalars. jsonb does not keep an object's keys in their order -- it writes them back shortest first, then by their
 * bytes -- so a turn kept as objects would come back reordered (a call's input `{action, words}` as `{words, action}`),
 * and a replay must be the bytes that were sent: the cache is a prefix match, and a thinking block is bound to the
 * conversation as it was sent. A string comes back as it went, and JSON.parse keeps its keys' order.
 */
export function storedRaw(
  raw: RawTurn | null,
): { at: number; model: AskModelId; prefix: string; blocks: string } | null {
  if (!raw) return null;
  const { base, question, rounds, final, results, at, model, prefix } = raw;
  return { at, model, prefix, blocks: JSON.stringify({ base, question, rounds, final, results }) };
}

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
}

/**
 * The turn as it returns: its end, with where the time went and what the model was fed (AskTurnShape), logged, and the
 * turn as the model was sent it (RawTurn), which no log line carries.
 */
export function finishTurn(r: TurnEnd, soFar: TurnSoFar): TurnResult {
  const { lastRound, ...end } = r;
  const { input, model, t0, built, contextMs, dataDropped, pageBlocks, crossBlocks, plan, format, toolsUsed } = soFar;
  const { roundsMs, toolsMs, firstByteMs, firstTextMs, firstSayMs, tokens, capHits } = soFar.meter;
  const { proposals } = soFar;
  const shape: AskTurnShape = {
    v: 1,
    model: model.id,
    effort: model.effort,
    surface: input.surface,
    scope_kind: input.scope?.kind ?? null,
    follow_up: input.history.length > 0,
    since_last_ms: input.sinceLastMs ?? null,
    replay: input.history.length > 0 ? "rebuilt" : "none",
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
    raw: lastRound && !lastRound.streamError ? rawTurn(lastRound, soFar.questionAt) : null,
  };
}
