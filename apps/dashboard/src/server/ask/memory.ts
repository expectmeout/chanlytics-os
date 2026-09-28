import "server-only";
import {
  AppError,
  answerText,
  cacheHitOf,
  type AskAnswer,
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
import type { TurnInput, TurnResult } from "./loop";

/**
 * What a turn keeps of its thread: the thread it continues and the history it is asked with, before the model is asked
 * (threadForTurn, the ask route's), and the turn as it ends, measured (finishTurn, runAskTurn's).
 */

/** The question as the route read it, and the search it answers, if any. */
interface Asked {
  tenantId: string;
  threadId: string | null;
  text: string;
  scope: AskScope | null;
  answering: SearchAnswering | null;
}

/**
 * The thread a turn lands in: the caller's own when the question names one, else a new one, titled and scoped once.
 * A thread that is not the caller's is a 404, except for an answer to a search's question, which starts one of the
 * caller's own. The scope is the question's, else the thread's.
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
      if (!scope) scope = found.thread.scope;
    } else if (!answering) throw new AppError("not_found", "That thread is not yours.", 404);
  }
  if (!thread) {
    // A thread keeps its first question as its title (D9); an answer's is the search's name, never the sentence
    // the model is given.
    const title = answering ? titleFromSearch(answering.name) : titleFromQuestion(text);
    const created = await createThread(ctx, tenantId, title, scope);
    thread = { id: created.id, title: created.title, scope };
  }
  return { thread, history, sinceLastMs, scope };
}

/** How a turn ended, as each of runAskTurn's ends says it. */
export interface TurnEnd {
  answer: AskAnswer;
  failed: boolean;
  failure: string | null;
  rounds: number;
  ungrounded?: boolean;
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
  roundsMs: number[];
  toolsMs: Array<{ name: string; ms: number }>;
  firstByteMs: number | null;
  firstTextMs: number | null;
  firstSayMs: number | null;
  tokens: AskTurnShape["tokens"];
  capHits: number;
  format: boolean;
  toolsUsed: string[];
  proposals: AskProposal[];
}

/** The turn as it returns: its end, with where the time went and what the model was fed (AskTurnShape), logged. */
export function finishTurn(r: TurnEnd, so: TurnSoFar): TurnResult {
  const { input, model, t0, built, contextMs, dataDropped, pageBlocks, crossBlocks, plan } = so;
  const { roundsMs, toolsMs, firstByteMs, firstTextMs, firstSayMs, tokens, capHits, format, toolsUsed, proposals } = so;
  const shape: AskTurnShape = {
    v: 1,
    model: model.id,
    effort: model.effort,
    surface: input.surface,
    scope_kind: input.scope?.kind ?? null,
    follow_up: input.history.length > 0,
    since_last_ms: input.sinceLastMs ?? null,
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
    ...r,
    text: answerText(r.answer),
    model: model.id,
    shape,
  };
}
