import "server-only";
import {
  dealsAreOn,
  detectLanguage,
  policyClassOffered,
  v1FromAnswer,
  type AskLanguage,
  type AskMessageVM,
  type AskProposal,
  type AskScope,
  type PageContext,
} from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";
import type { Member } from "../route";
import { log } from "@/server/log";
import { load, readerContext, type ReaderContext } from "../readers";
import * as readers from "../readers/facts";
import { runAskTurn, type TurnEvent, type TurnInput, type TurnResult } from "./loop";
import { storedRaw, threadForTurn } from "./memory";
import { askTurnText, workspaceFacts, type SearchAnswering, type WorkspaceFacts } from "./prompt";
import { appendMessage, touchThread } from "./store";

/**
 * One turn of the assistant, kept in one place for its two doors: POST /api/v1/ask (the typed Line) and the voice
 * door ElevenLabs calls (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.4). Moved verbatim from the
 * route, in two halves, because the route refuses a thread that cannot be kept BEFORE its stream opens (a thrown
 * AppError is a JSON refusal there) and only then streams the turn: `prepareAskTurn` is the first half (the thread
 * kept, the question saved, the workspace's facts read), `finishAskTurn` the second (the turn run and stored, the
 * answer as the Line draws it). `askTurn` runs both for a caller with no stream of its own to open first.
 */

/** What a turn is asked with: the route's body as it reads it, or the voice door's transcript. */
export interface AskTurnAsk {
  text: string;
  threadId: string | null;
  /** This turn's scope: one, `null` to clear the thread's, `undefined` to keep it (the Phase 5 plan, D9). */
  scope: AskScope | null | undefined;
  surface: string | null;
  context: PageContext | null;
  openedMs: number | null;
  answering: SearchAnswering | null;
  /** The person is listening, not reading (the spoken register, spec §3.4). */
  spoken?: boolean;
}

/** A line the turn's door sends: the thread first, then the turn's own events. */
export type AskTurnLine = TurnEvent | { t: "thread"; id: string; title: string };

export interface AskTurnDone {
  thread: { id: string; title: string };
  result: TurnResult;
  /** The answer as the Line draws it, beside the v1 fields it gives (spec 5.8). */
  message: AskMessageVM;
}

/** The first half's yield: everything the turn is run with, once the thread is kept and the facts are read. */
export interface PreparedTurn {
  ctx: RouteContext;
  member: Member;
  tenantId: string;
  ask: AskTurnAsk;
  thread: { id: string; title: string; scope: AskScope | null };
  scope: AskScope | null;
  earlier: Pick<TurnInput, "history" | "sinceLastMs" | "chain" | "told" | "cited">;
  rc: ReaderContext;
  facts: WorkspaceFacts;
  timezone: string;
  language: AskLanguage;
  personLabel: string;
}

export async function prepareAskTurn(ctx: RouteContext, member: Member, ask: AskTurnAsk): Promise<PreparedTurn> {
  const { text, threadId, answering } = ask;
  const tenantId = member.tenantId;

  // The thread, before anything else: a question that could not be saved is
  // not answered, so a person never sees an answer they cannot find again.
  const kept = await threadForTurn(ctx, { tenantId, threadId, text, scope: ask.scope, answering });
  // The thread's earlier turns: their lines, what they told and cited, the time since, and the chain while warm.
  const { thread, scope, ...earlier } = kept;
  await appendMessage(ctx, thread.id, tenantId, "user", { text, ...(answering ? { answering } : {}) });

  // A turn keeps what may be kept across turns (the workspace's name and zone, five minutes): the next question of
  // the same person does not read them again. The GET routes keep nothing.
  const rc = readerContext(ctx, member, undefined, { keep: true });
  const [{ name, timezone }, cfg, policies, sellsBy] = await Promise.all([
    load(rc, readers.facts, undefined).then((r) => r.data),
    load(rc, readers.config, undefined).then((r) => r.data),
    // The autonomy modes ride in the stable block, so "what can the receptionist do alone" needs no read.
    load(rc, readers.policies, undefined).then(
      (r) => r.data,
      () => [],
    ),
    load(rc, readers.sellsBy, undefined).then((r) => r.data),
  ]);
  // The rows the pane draws: the follow-ups' only where deals are on (0006).
  const offered = policies.filter((p) => policyClassOffered(p.class, dealsAreOn(sellsBy)));
  const facts = workspaceFacts(name, timezone, cfg?.config ?? null, offered);
  const language = detectLanguage(text);
  const personLabel = ctx.email ? `${ctx.email} (${member.role})` : member.role;
  return { ctx, member, tenantId, ask, thread, scope, earlier, rc, facts, timezone, language, personLabel };
}

export async function finishAskTurn(p: PreparedTurn, emit: (ev: AskTurnLine) => void): Promise<AskTurnDone> {
  const { ctx, member, tenantId, ask, thread: turn, scope, earlier, rc, facts, timezone, language, personLabel } = p;
  const { text, surface, context, openedMs, answering } = ask;
  emit({ t: "thread", id: turn.id, title: turn.title });
  const t0 = Date.now();
  const result = await runAskTurn({
    ctx,
    tenantId,
    role: member.role,
    facts,
    timezone,
    personLabel,
    language,
    scope,
    surface,
    ...earlier,
    text: askTurnText(text, answering),
    openedMs,
    context,
    spoken: ask.spoken ?? false,
    emit,
    // One clock for the turn: the tools' today is the readers' today.
    now: rc.now,
    rc,
  });
  // The answer as the Line draws it, beside the v1 fields it gives (spec 5.8): the history, copy and search
  // read `text`, and the erase hook finds a person by the ids the sources carry.
  const v1 = v1FromAnswer(result.answer);
  // A new search's card carries the thread it was planned in, so the search keeps it (00172) and the answer
  // to its question lands back here. An answer's card needs none: its search already has one or never will.
  const proposals: AskProposal[] = result.proposals.map((p) =>
    p.kind === "lead_search" && !p.payload.amends ? { ...p, payload: { ...p.payload, thread_id: turn.id } } : p,
  );
  const content = {
    v: 2,
    answer: result.answer,
    ...v1,
    proposals,
    language: result.answer.language,
    ungrounded: result.ungrounded,
    tools: result.tools,
    latency_ms: result.latencyMs,
    failed: result.failed,
    ...(result.failure ? { failure: result.failure.slice(0, 200) } : {}),
    model: result.model,
    rounds: result.rounds,
    shape: result.shape,
  };
  let saved: { id: string; created_at: string } | null = null;
  try {
    saved = await appendMessage(ctx, turn.id, tenantId, "assistant", { ...content, raw: storedRaw(result.raw) });
    // A thread keeps its first question as its title; an answer moves it up the list, and it keeps the scope
    // this turn ran with (the Phase 5 plan, D9), so the next question sent with none is asked about the same.
    await touchThread(ctx, turn.id, scope);
  } catch (e) {
    log.error("ask_save_failed", { error: e });
  }
  const message: AskMessageVM = {
    id: saved?.id ?? `unsaved-${Date.now()}`,
    role: "assistant",
    text: v1.text,
    at: saved?.created_at ?? new Date().toISOString(),
    atMs: saved ? Date.parse(saved.created_at) : Date.now(),
    citations: v1.citations,
    followups: v1.followups,
    navigate: v1.navigate,
    proposals,
    language: result.answer.language,
    ungrounded: result.ungrounded,
    tools: result.tools,
    latencyMs: result.latencyMs,
    rounds: result.rounds,
    failed: result.failed,
    answer: result.answer,
  };
  log.info("ask_turn", {
    tenant_id: tenantId,
    tools: result.tools,
    proposals: result.proposals.map((p) => p.kind),
    rounds: result.rounds,
    ms: Date.now() - t0,
    failed: result.failed,
    failure: result.failure,
    ungrounded: result.ungrounded,
    citations: v1.citations.length,
    form: result.answer.form,
    language: result.answer.language,
    first_say_ms: result.shape.first_say_ms,
    cache_hit: result.shape.cache_hit,
    follow_up: result.shape.follow_up,
    opened_ms: openedMs,
  });
  emit({ t: "final", message });
  return { thread: { id: turn.id, title: turn.title }, result, message };
}

/** Both halves in a row, for a door with no stream to open between them (the voice door). */
export async function askTurn(
  ctx: RouteContext,
  member: Member,
  ask: AskTurnAsk,
  emit: (ev: AskTurnLine) => void,
): Promise<AskTurnDone> {
  return finishAskTurn(await prepareAskTurn(ctx, member, ask), emit);
}
