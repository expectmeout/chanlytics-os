import "server-only";
import {
  ASK_ANSWER_FORMAT,
  ASK_MAX_ROUNDS,
  ASK_SPOKEN_TURN_BUDGET_MS,
  ASK_TURN_BUDGET_MS,
  answerWords,
  failedAnswer,
  isUngrounded,
  noteRows,
  partialSay,
  answerSoFar,
  proseAnswer,
  type AskAnswer,
  type AskLanguage,
  type AskMessageVM,
  type AskProposal,
  type AskReadSet,
  type AskRowRef,
  type AskScope,
  type AskShowPreview,
  type AskTurnShape,
  type PageContext,
} from "@chanlytics/contracts";
import type { AskModelProfile, EffortMessage, MembershipRole, WordsMessage } from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";
import { load, type ReaderContext } from "../readers";
import { log } from "@/server/log";
import { GatewayRefused } from "./gateway";
import { DROP_EVENTS, dropFor, letGo, refusalSaid, type Offer } from "./refusals";
import {
  ACT_TOOL_NAMES,
  aboveRoleWords,
  buildProposal,
  calledName,
  cardsOf,
  newToolContext,
  runTool,
  toApiTools,
  toolLabel,
  type ToolContext,
  type ToolRun,
} from "./tools";
import { stableSystem, systemBlocks, systemHash, turnWords, type WorkspaceFacts } from "./prompt";
import { buildContext, shapeBlock, type BuiltContext, type SearchResultBlock } from "./context";
import { crossPagePlan, readBlock, scopedRead, withSkillGuides } from "./cross-page";
import { shape as shapeReader } from "../readers/shape";
import { argsOf, cutOff, replayBlocks, resultBlocks, runRound, type RoundBlock } from "./round";
import { askModel } from "./model";
import { turnEffort } from "./effort";
import {
  foldHistory,
  questionIn,
  replayFor,
  tellNext,
  withMarkers,
  type Chain,
  type LastRound,
  type RawTurn,
  type TurnEnd,
  withWords,
  withoutData,
} from "./memory";
import {
  DROPPED_WORDS,
  PLAN_ANSWER_WORDS,
  besideActs,
  cardsAnswer,
  finishTurn,
  notAgain,
  planAnswerOwed,
  planFallback,
  roundPlan,
  turnMeter,
  turnUnmade,
  writtenAnswer,
  type PlanOwed,
  type PlanSaid,
} from "./turn-end";
import { LAST_ROUND_WORDS, answerInput, everyCallAnswered, roundAnswer } from "./tools/answer";

/**
 * One turn of the assistant.
 *
 * The page the person is on rides in first, as data before their words
 * (context.ts), with the reads the question names of another page and the
 * row the scope names (cross-page.ts); then the model is asked with the
 * read tools and the act tools, and either calls them or writes the answer:
 * the answer is text in the Line's shape (ASK_ANSWER_FORMAT, structured
 * output), or the answer tool's input where ASK_ANSWER_TOOL is on. Reads run
 * as the person, in parallel, and go back as one message. An act tool never
 * acts: it checks and proposes, and may share a round with the answer. Say
 * streams as the answer is written; the last allowed round may call no tool, so
 * a turn always ends in an answer or a stated failure. "How a turn ends" in
 * docs/superpowers/plans/2026-09-23-ask-the-line-3-the-answer.md is this loop.
 */

// The whole round -- the model's thinking, every tool call it makes and, when
// it answers in the same round, the answer itself -- fits in ASK_MAX_TOKENS
// (contracts), the one number the edge also clamps Ask to; a draft's round,
// asked harder, in ASK_DRAFT_MAX_TOKENS (effort.ts, askRoundCap). An act tool's
// arguments are long -- propose_lead_search alone writes a who, a where, up to
// five terms, six criteria and six exclusions -- and at 1200 the stream reached
// the cap in the MIDDLE of that JSON. A cut-off tool call is not a smaller tool
// call: it does not parse at all (see `argsOf`). The loop then asked for 2400,
// but the edge clamped every round to 2000, so 2000 was the real ceiling; it is
// one number now, 4000 since the lead plan's card was cut at 2000 (D10). A cap
// is not a spend, only a ceiling on what may be generated.

/** Say is sent at most this often while it is written (spec 7.4). */
const SAY_EVERY_MS = 50;

export interface TurnEvent {
  t: "trace" | "say" | "final" | "error";
  /** A trace's words, or an error's. */
  text?: string;
  /** Say as written so far, and Show's figures and rows once each closes: a preview, replaced by the final message. */
  headline?: string;
  detail?: string;
  show?: AskShowPreview;
  message?: AskMessageVM;
}

export interface TurnInput {
  ctx: RouteContext;
  tenantId: string;
  role: MembershipRole;
  facts: WorkspaceFacts;
  timezone: string;
  personLabel: string;
  language: AskLanguage;
  scope: AskScope | null;
  surface: string | null;
  /** Prior turns of this thread, oldest first, as a cold turn is asked with them: each answer one line (memory.ts). */
  history: Array<{ role: "user" | "assistant"; text: string }>;
  /** The thread's warm turns as the model was sent them (memory.ts threadForTurn); none or null, the turn is cold. */
  chain?: Chain | null;
  /**
   * What the history's lines already said of the thread's cards (memory.ts threadForTurn): a cold turn keeps it beside
   * its base, so a live turn after it tells only what is newer. None with no history.
   */
  told?: string[] | null;
  /**
   * The rows the thread's earlier answers cited, where each opened (memory.ts threadForTurn): the turn's read set starts
   * with them, so one is named, cited and opened without a read (the Phase 5 plan, D5); a fact about it is read again.
   */
  cited?: AskRowRef[];
  /** The thread's cards no one has pressed yet (memory.ts threadForTurn): none is made a second time (turn-end.ts notAgain). */
  waiting?: AskProposal[];
  text: string;
  /** From the palette opening to the question being sent, as the tab measured it; null from an older tab or a script. */
  openedMs?: number | null;
  /** The person is listening, not reading (the voice door): the spoken register rides in the turn's words. */
  spoken?: boolean;
  /** How they like answers, their own note (contracts answerStyleOf): said in the turn's words; "" or none, nothing. */
  style?: string;
  /** How long after the thread's previous turn this question came; null on a thread's first. */
  sinceLastMs?: number | null;
  /**
   * The page the question was asked on, as the tab sent it and the route read it (contracts PageContext); null from an
   * older tab, a script, or a context the route refused. The turn reads the page again through its readers from these
   * identities (context.ts); nothing the tab says about a row is taken.
   */
  context?: PageContext | null;
  emit: (ev: TurnEvent) => void;
  now?: Date;
  /** The route's reader context, so the turn's reads share its cache; a test may omit it. */
  rc?: ReaderContext;
  /** The person's Stop (the route's stream let go of): the turn ends at once, as "stopped", which turn.ts keeps. */
  signal?: AbortSignal;
}

export interface TurnResult {
  /**
   * The answer as the server read it (normalizeAnswer). One door runs where it
   * is drawn, not here: an Open the person asked for ("open the call") keeps
   * its `now` even when an item names the same row.
   */
  answer: AskAnswer;
  /** Its words (answerText): the thread's history, copy and search. */
  text: string;
  ungrounded: boolean;
  tools: string[];
  proposals: AskProposal[];
  latencyMs: number;
  failed: boolean;
  /** Why it failed, for the log; the answer's headline already says it to the person. */
  failure: string | null;
  rounds: number;
  /** The model the rounds ran on (the deployment's profile). */
  model: string;
  /** Where the time went and what the model was fed (ask-shape.ts): logged, and stored on the turn's row. */
  shape: AskTurnShape;
  /**
   * The turn as the model was sent it (memory.ts): stored on the turn's row, never logged or shipped; null when the
   * turn failed or its last stream broke.
   */
  raw: RawTurn | null;
}

/** A message as a request carries it: the person's or the model's, or an effort said between them (effort.ts). */
export type Msg = { role: "user" | "assistant"; content: unknown } | EffortMessage | WordsMessage;

/**
 * Everything the turn reaches outside itself, as one object: the model
 * round, the page's context, the workspace's shape, a read tool, a proposal. The real modules are
 * the default, so the runtime changes nothing; a test hands in a scripted
 * round and the loop's control flow runs for real against it -- the move
 * whatsapp/ports.ts made for the receptionist's handler. `setAskPorts` is
 * for a test that reaches the loop through the route, which cannot pass a
 * parameter; the runtime never calls it.
 */
export interface AskPorts {
  round: typeof runRound;
  /** The page's context, built through the page's readers or taken from the warm's cache (context.ts). */
  context: (rc: ReaderContext, context: PageContext) => Promise<BuiltContext>;
  /** The shape of the workspace, as the second system block (readers/shape.ts, kept five minutes). */
  shape: (rc: ReaderContext) => Promise<string>;
  tool: typeof runTool;
  propose: typeof buildProposal;
}
const shapeOf = async (rc: ReaderContext): Promise<string> => shapeBlock((await load(rc, shapeReader, undefined)).data);
let overrides: Partial<AskPorts> | null = null;
export function setAskPorts(p: Partial<AskPorts> | null): void {
  overrides = p;
}
export function askPorts(): AskPorts {
  return {
    round: runRound,
    context: buildContext,
    shape: shapeOf,
    tool: runTool,
    propose: buildProposal,
    ...(overrides ?? {}),
  };
}

/**
 * What the turn's tools run with, as the person, its read set starting with the rows the thread's earlier answers cited
 * (the Phase 5 plan, D5): one of them is cited and opened without a read, and any read this turn makes of one -- the
 * page's, another page's, a tool's -- replaces its ref with the fresh one. A craft call reads the question in the
 * person's own words and ends before the turn does (`endsAt`, the turn's budget from its start).
 */
function toolContextOf(input: TurnInput, now: Date, endsAt: number): ToolContext {
  const tc = {
    ...newToolContext(input.ctx, input.tenantId, input.role, input.timezone, now, input.rc),
    language: input.language,
    question: input.text,
    endsAt,
  };
  noteRows(tc.read, input.cited ?? []);
  return tc;
}

/**
 * This turn's words, as the text block before the question (prompt.ts turnWords): who is asking, where, when, the row
 * their words point at and whether the read set holds it, and -- while the question still carries it (`dataDropped`
 * false) -- that the data before them is read already: the page's, the reads made for another page, the scope's row.
 * A live turn's also say what happened since (D8). Made once the read set holds every read before the model's. The guide
 * of a skill the question asks for follows them (cross-page.ts withSkillGuides).
 */
function wordsBlock(
  input: TurnInput,
  now: Date,
  rode: { built: BuiltContext | null; crossBlocks: SearchResultBlock[]; scopedRow: unknown; read: AskReadSet },
) {
  const focus = input.context?.focus;
  // A focus is a scope: a run is cited, and so read, as its broadcast; a page is never a row, and an ad has no read
  // until the Ads read lands (decision 0049), so neither is looked for in the read set.
  const kind = focus?.kind === "run" ? "broadcast" : focus?.kind === "ad" ? "page" : focus?.kind;
  const facts = {
    role: input.role,
    personLabel: input.personLabel,
    scope: input.scope,
    surface: input.surface,
    timezone: input.timezone,
    closures: input.facts.closures,
    focus,
    focusRead: !!focus && !!kind && kind !== "page" && rode.read[kind].has(focus.id),
    // A reach-out's drawer: the page they are on, at its address (contracts scopeFromRoute), whose row the page holds.
    scopeOnPage: input.scope?.kind === "page" && input.scope.id === input.context?.route,
    now,
    spoken: input.spoken ?? false,
    style: input.style ?? "",
    above: aboveRoleWords(input.role),
  };
  const words = (live: boolean, dataDropped: boolean) => ({
    type: "text" as const,
    text: turnWords({
      ...facts,
      since: live ? input.chain?.since : undefined,
      replayedAt: live ? input.chain?.readAt : undefined,
      context: !dataDropped && (rode.built?.blocks.length ?? 0) > 0,
      crossPage: !dataDropped && rode.crossBlocks.length > 0,
      scopeRead: !dataDropped && !!rode.scopedRow,
    }),
  });
  return withSkillGuides(words, input.text);
}

/**
 * The head of a turn's first request: everything before its messages. The same bytes for every member of a role in a
 * workspace on one model and speed, and so what the model's cache is keyed by (system's two breakpoints end it). A turn
 * builds its requests on it and a warm sends it alone (warm.ts), so what a warm writes is what the next question reads.
 */
export function turnHead(model: AskModelProfile, role: MembershipRole, facts: WorkspaceFacts, shape: string | null) {
  return {
    model: model.id,
    ...(model.speed === "fast" ? { speed: "fast" as const } : {}),
    system: systemBlocks(stableSystem(facts, model.answerTool), shape),
    // The tools as the API takes them (registry.ts), and the answer tool where it is on. Their examples stay home (the
    // answer canvas, A4, 17 Oct 2026: the core cases 128/149 with them and 131/149 without, a tenth cheaper a turn).
    tools: toApiTools(role, false, true, model.answerTool),
    tool_choice: { type: "auto" as const },
    output_config: {
      effort: model.effort,
      format: { type: "json_schema" as const, schema: ASK_ANSWER_FORMAT as unknown as Record<string, unknown> },
    },
  };
}

/** The turn's own time ran out (budgetOf): ours to say, never the question's. */
const TIME_UP_WORDS = {
  en: "I ran out of time on that one. Try again, or ask about one thing at a time.",
  es: "Se me acabó el tiempo con esta. Inténtalo de nuevo, o pregunta por una cosa a la vez.",
};

/** The model's stream ends at the turn's own time, or at the person's Stop. */
const halted = (time: AbortSignal, stop: AbortSignal | undefined): AbortSignal =>
  stop ? AbortSignal.any([time, stop]) : time;

/**
 * A typed turn's whole budget (the operator, 15 Oct 2026: a plan of several cards over many reads); a spoken one keeps
 * the budget a listener waits through.
 */
const budgetOf = (input: TurnInput): number => (input.spoken ? ASK_SPOKEN_TURN_BUDGET_MS : ASK_TURN_BUDGET_MS);

/**
 * A server tool (the tool search, D11) paused the turn with no call of ours: the API resumes it from the response as
 * it came, so the round goes back whole, with nothing after it, and the next round carries on.
 */
const pausedByServer = (stopReason: string | null, calls: number, last: boolean): boolean =>
  stopReason === "pause_turn" && calls === 0 && !last;

export async function runAskTurn(input: TurnInput, ports: AskPorts = askPorts()): Promise<TurnResult> {
  const t0 = Date.now();
  const budgetMs = budgetOf(input);
  const model = askModel();
  const now = input.now ?? new Date();
  const es = input.language === "es";
  const tc = toolContextOf(input, now, t0 + budgetMs);
  const toolsUsed: string[] = [];
  const [proposals, planWords]: [AskProposal[], PlanSaid[]] = [[], []]; // its cards, and its plans' words (roundPlan)
  const unmade = turnUnmade(); // what was asked that no card carries, which the answer must say
  let reads = 0;
  // Where the time went and what the model was fed (AskTurnShape, turn-end.ts): only the loop sees all of it.
  const meter = turnMeter(t0);
  // How hard each round is asked: the turn's own effort, or a draft's, said in its messages (effort.ts).
  const effort = turnEffort(model, input, meter);

  // Before the model is asked, in parallel (the Phase 2 plan, PR 2.4): the page the person is on (context.ts: the
  // warm's build if it is kept, else a build now), the shape of the workspace, the reads the question names of another
  // page (cross-page.ts), and the row the scope names, read whole as its tool reads it. Each rides into the first round
  // as data, so its rows enter the read set and the answer can cite them. A failure costs that block, never the turn.
  const tCtx = Date.now();
  const plan = crossPagePlan(input.text, input.surface, input.context?.view ?? null);
  const scoped = scopedRead(input.scope, input.context?.route);
  const runRead = async (run: ToolRun) => {
    try {
      return { run, out: await ports.tool(tc, run) };
    } catch (e) {
      log.error("ask_cross_page_failed", { error: e, tenant_id: input.tenantId });
      return { run, out: { result: "", isError: true } };
    }
  };
  const [built, shape, preOuts, scopedOut] = await Promise.all([
    input.context
      ? ports.context(tc.rc, input.context).catch((e: unknown): BuiltContext | null => {
          log.error("ask_context_failed", { error: e, tenant_id: input.tenantId });
          return null;
        })
      : null,
    ports.shape(tc.rc).catch((e: unknown) => {
      log.error("ask_shape_failed", { error: e, tenant_id: input.tenantId });
      return "";
    }),
    Promise.all(plan.map(runRead)),
    scoped ? runRead(scoped) : null,
  ]);
  // The page's rows a citation may name enter the read set; the page counts as one read, so a figure answered from it
  // is grounded (isUngrounded) -- when something on it was read: not a page whose read failed, nor one that is its
  // address alone (other) and shows no row.
  if (built) noteRows(tc.read, built.refs);
  const pageRead =
    !!built && built.blocks.length > 0 && (built.rows > 0 || (!built.failed && input.context?.surface !== "other"));
  if (pageRead) reads++;
  const prefetched = preOuts.filter((p) => !p.out.isError);
  for (const p of prefetched) {
    toolsUsed.push(calledName(p.run.name, p.run.input));
    reads++;
  }
  const scopedRow = scopedOut && !scopedOut.out.isError ? scopedOut : null;
  // The scope's row is read for the model, not by it: it counts as a read, and stays off the turn's tools, as the
  // snapshot's scoped row did.
  if (scopedRow) reads++;
  const contextMs = Date.now() - tCtx;

  // Two cache breakpoints in system: the rules and facts for every turn in the workspace, and the shape of the
  // workspace, the same bytes for its people for five minutes. A third on the page's data, its last block (D10): this
  // turn's later rounds read it from the cache, and so does another first question on the same page within the
  // cache's life. A follow-up does not: its earlier turns come before the page, as text, so its prefix after the
  // shape is new bytes and the page is written to the cache again. The clock, the person and the question come after
  // it; the fourth is on each request's last block (withMarkers), so the next round reads all before it.
  const head = turnHead(model, input.role, input.facts, shape);
  const { system } = head;
  const pageBlocks: SearchResultBlock[] = [
    ...(built?.blocks ?? []),
    ...(scopedRow ? [readBlock(scopedRow.run, scopedRow.out.result)] : []),
  ];
  const crossBlocks = prefetched.map((p) => readBlock(p.run, p.out.result));
  // Whether the question still carries the data blocks: a request the API refuses for them is asked once more without
  // them (D14), and the words stop pointing at them (wordsBlock).
  let dataDropped = pageBlocks.length === 0 && crossBlocks.length === 0;
  const sayWords = wordsBlock(input, now, { built, crossBlocks, scopedRow, read: tc.read });
  const question = { type: "text", text: input.text };
  // The tools (registry.ts), the same bytes every round, and the answer's format, until the API refuses a part of the
  // offer: then it is let go (refusals.ts letGo) and the same round asked again. No tool is strict: the API takes twenty
  // strict tools and twenty-four optional parameters across them (26 tools, then 31 parameters in the act tools alone,
  // were refused on every operator turn, 23 Sep), and the tools ran as they always had without it.
  const offer: Offer = { search: true, format: true, words: true, answer: model.answerTool };
  let { tools } = head;
  // A round's request: its messages a copy with the cache's markers (withMarkers), at `at` and on its last block.
  const requestOf = (msgs: Msg[], at: unknown, noTool: boolean) => ({
    ...(head.speed ? { model: head.model, speed: head.speed } : { model: head.model }),
    ...effort.of(msgs),
    system,
    messages: withMarkers(msgs, at),
    tools,
    // A round that may call no tool: all that is left is the answer, as text.
    tool_choice: noTool ? { type: "none" as const } : head.tool_choice,
    output_config: offer.format ? head.output_config : { effort: model.effort },
  });
  // The earlier turns (memory.ts, the Phase 5 plan, D1–D4): replayed as the model was sent them while the thread is
  // warm, round one on the same model and prefix and within the bound (bpR where the last request ended); else the
  // rebuilt history, each answer one line, the question after it (bp3 on the page's last block).
  const cold = () => {
    const words = sayWords(false, dataDropped);
    const data = dataDropped ? [] : [...pageBlocks, ...crossBlocks];
    const messages = withWords(foldHistory(input.history, [...data, question]), words, offer.words);
    return { messages, anchor: pageBlocks.at(-1), words };
  };
  const asked = {
    data: [...pageBlocks, ...crossBlocks],
    words: sayWords(true, dataDropped),
    question,
    asSystem: offer.words,
  };
  const replayed = replayFor(input.chain, asked, (msgs, at) => requestOf(msgs, at, false));
  let { messages, anchor, words } = replayed ?? cold();
  // A replay the API refuses (D12) is asked again cold, once: the turn then keeps its words history, the next base.
  let live = !!replayed;
  // Where the question sits in every request of the turn, its words after it: a later round only appends.
  let questionAt = questionIn(messages);
  effort.open(messages);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);

  let answerIn: "tool" | "text" | null = null; // how the answer that ends the turn was written (AskTurnShape)
  const done = (r: TurnEnd): TurnResult => {
    clearTimeout(timer);
    return finishTurn(r, {
      answerIn,
      input,
      model,
      t0,
      built,
      contextMs,
      dataDropped,
      pageBlocks,
      crossBlocks,
      plan,
      meter,
      format: offer.format,
      toolsUsed,
      proposals,
      questionAt,
      live,
      promptHash: systemHash(system),
    });
  };
  let planOwed: PlanOwed | null = null; // a plan made, whose answer the next round writes (planAnswerOwed)
  /** A turn that could not be answered: its sentence, in the person's language, heads it; once a plan is made, its words. */
  const fail = (sentence: string, failure: string, rounds: number) =>
    done(
      planOwed
        ? planFallback(planOwed, input, rounds)
        : { answer: failedAnswer(sentence, input.language), failed: true, failure, rounds },
    );
  const signal = halted(controller.signal, input.signal); // what ends the model's stream: the turn's time, or the Stop
  /** A round ended by the person's Stop (turn.ts words it) or, where it `cut` the round, by the turn's own time. */
  const timedOut = (rounds: number) => fail(TIME_UP_WORDS[es ? "es" : "en"], "timeout", rounds);
  const endedEarly = (rounds: number, cut: boolean) =>
    input.signal?.aborted ? fail("", "stopped", rounds) : cut && controller.signal.aborted ? timedOut(rounds) : null;

  // Say while the answer is written (spec 7.4): read from the JSON so far --
  // the model may write it with the format refused too -- sent only when it
  // changed and at most every SAY_EVERY_MS. A preview: the final message is
  // the truth. With the format refused, words are said as they come; with it,
  // words before a call are the model thinking aloud, and are not said.
  let said = "";
  let saidAt = 0;
  let firstKey: string | null = null;
  const onText = (soFar: string) => {
    const json = soFar.trimStart().startsWith("{");
    if (json && firstKey === null) {
      const k = /^\s*\{\s*"([^"]*)"/.exec(soFar);
      if (k) {
        firstKey = k[1];
        if (firstKey !== "say")
          log.warn("ask_say_not_first", { first: firstKey.slice(0, 40), tenant_id: input.tenantId });
      }
    }
    // Drawn as the final message will draw it (contracts partialSay, proseAnswer): nothing past a tag, the leak seen on
    // production, the detail's lines kept, and Show's figures and rows once each closes (answerSoFar).
    const part = json ? partialSay(soFar) : offer.format ? null : proseAnswer(soFar, input.language).say;
    if (!part || (!part.headline && !part.detail)) return;
    const say = answerSoFar(part, json ? soFar : "", tc.read, input.language);
    const key = JSON.stringify(say);
    const at = Date.now();
    if (key === said || at - saidAt < SAY_EVERY_MS) return;
    said = key;
    saidAt = at;
    meter.said();
    input.emit({ t: "say", ...say });
  };
  /** An answer set aside after its Say was sent: an empty Say takes it back, and the Line shows the reads again. */
  const unsay = () => {
    if (!said) return;
    said = "";
    saidAt = 0;
    input.emit({ t: "say", headline: "", detail: "" });
  };

  /** A tool call's time, kept in the order the calls ran. */
  const timed = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    try {
      return await run();
    } finally {
      meter.toolsMs.push({ name, ms: Date.now() - t });
    }
  };

  const propose = async (b: RoundBlock) => {
    const args = argsOf(b);
    toolsUsed.push(calledName(b.name, args));
    if (!args) return cutOff(b, input.tenantId);
    return timed(calledName(b.name, args), async () => {
      const p = notAgain(await ports.propose(tc, b.name, args), [...(input.waiting ?? []), ...proposals]);
      proposals.push(...cardsOf(p));
      if (p.words) planWords.push({ words: p.words, lead: p.lead });
      unmade.heard(calledName(b.name, args), p);
      return { result: p.result, isError: p.isError, noted: !!p.noted };
    });
  };

  const read = async (b: RoundBlock) => {
    const args = argsOf(b);
    toolsUsed.push(calledName(b.name, args));
    if (!args) return cutOff(b, input.tenantId);
    return timed(calledName(b.name, args), async () => {
      const out = await ports.tool(tc, { name: b.name, input: args });
      if (!out.isError) reads++;
      return { result: out.result, isError: out.isError };
    });
  };

  // With the answer tool, calling it is how the last round answers: it may call tools, and a read it makes anyway is
  // answered before one closing round that may call none.
  let closing = false;
  try {
    for (let round = 1; round <= ASK_MAX_ROUNDS + Number(closing); round++) {
      const last = round >= ASK_MAX_ROUNDS;
      const noTool = model.answerTool ? closing : last;
      const request = { ...requestOf(messages, anchor, noTool), diagnostics: meter.follows(live, input.chain) };

      const roundAt = Date.now();
      let blocks: RoundBlock[];
      let stopReason: string | null;
      let streamError: string | null;
      try {
        const r = await ports.round(
          { tenantId: input.tenantId, userId: input.ctx.userId, request, signal },
          onText,
          answerInput(onText),
        );
        ({ blocks, stopReason, streamError } = r);
        meter.round(r, roundAt);
      } catch (e) {
        // The person's Stop, or the turn's own time run out: whatever the round threw for it (a gateway unreached).
        const early = endedEarly(round, true);
        if (early) return early;
        if (e instanceof GatewayRefused) {
          // Something the turn can do without, refused (refusals.ts): the same round is asked again without it, once
          // each. Without the page's data, their reads leave the count and the words stop pointing at them; without
          // the format, what comes back is read as JSON when it is, else as prose (D15).
          const m = e.refusal.kind === "bad_request" ? e.refusal.message : "";
          const drop = dropFor(m, { replay: live && round === 1, context: !dataDropped, ...offer });
          if (drop) {
            log.error(DROP_EVENTS[drop], { error: m.slice(0, 200), tenant_id: input.tenantId });
            if (drop === "replay") {
              ({ messages, anchor, words } = cold());
              live = false;
              questionAt = questionIn(messages);
              effort.open(messages);
            } else if (drop === "context") {
              dataDropped = true;
              reads -= (pageRead ? 1 : 0) + prefetched.length + (scopedRow ? 1 : 0);
              messages = withoutData(messages, questionAt, words, sayWords(live, dataDropped));
            } else ({ tools, messages } = letGo(offer, drop, input.role, { tools, messages }));
            round--;
            continue;
          }
          return fail(refusalSaid(e.refusal, es, { tenant_id: input.tenantId, round }), e.refusal.kind, round);
        }
        throw e;
      }

      // A stream the turn's own time cut is the time's, not a dropped connection.
      const ended = endedEarly(round, !!streamError);
      if (ended) return ended;

      if (streamError && !blocks.length) return fail(DROPPED_WORDS[es ? "es" : "en"], streamError, round);
      // The cap was reached: what the round wrote may be half-written, and it is recorded (turn-end.ts capped).
      meter.capped(stopReason, round, blocks, input.tenantId);
      if (stopReason === "refusal") {
        return fail(es ? "No puedo responder a eso aquí." : "I can't answer that here.", "refusal", round);
      }

      // The answer, if this round wrote one, and its calls with the answer tool's apart (tools/answer.ts).
      const split = roundAnswer(blocks, offer.format);
      const { used, answered, calls } = split;
      // A draft begun at the turn's own effort is set aside, its calls unrun, and the round asked again at the draft's
      // (effort.ts): the question did not say it was one.
      if (effort.redraft(calls, messages)) {
        unsay();
        round--;
        continue;
      }
      const acts = calls.filter((b) => ACT_TOOL_NAMES.has(b.name));
      let { written } = split;

      // An answer beside a read was written before its rows: it is set aside,
      // and the model answers next round with them.
      if (written && calls.length > acts.length) {
        log.warn("ask_answer_beside_read", {
          tools: calls.map((b) => calledName(b.name, argsOf(b))),
          tenant_id: input.tenantId,
        });
        written = "";
        unsay();
      }

      if (pausedByServer(stopReason, calls.length, last)) {
        messages.push({ role: "assistant", content: replayBlocks(blocks) });
        continue;
      }

      // A round that wrote nothing and called nothing is a glitch of ours, not an empty read.
      if (!written && !calls.length) {
        return fail(
          es ? "Perdí el hilo. Pregúntamelo de nuevo." : "I lost my train of thought. Ask me again.",
          stopReason === "max_tokens" ? "cap" : "no_tool_no_text",
          round,
        );
      }

      // Reads and proposals, in parallel; every result goes back at once.
      for (const b of calls) input.emit({ t: "trace", text: toolLabel(b.name, argsOf(b)) });
      const [before, saidBefore] = [proposals.length, planWords.length];
      const outcomes = await Promise.all(
        calls.map(async (b) => ({ block: b, out: ACT_TOOL_NAMES.has(b.name) ? await propose(b) : await read(b) })),
      );
      const refused = outcomes.some(({ out }) => out.isError);
      const leftOut = outcomes.some(({ out }) => "noted" in out && out.noted);

      const planned = roundPlan(calls, acts, refused, planWords.slice(saidBefore));
      written = besideActs(written, {
        refused,
        leftOut,
        planned,
        unsay,
        log: () =>
          log.warn("ask_answer_beside_refused_card", {
            tools: acts.map((b) => calledName(b.name, argsOf(b))),
            tenant_id: input.tenantId,
          }),
      });
      const ordered = everyCallAnswered(used, outcomes, answered, !!written);
      // The round as it went out and came back: a turn that ends on it keeps it as the turn it was (memory.ts).
      const lastRound: LastRound = { request, blocks, outcomes: ordered, roundAt, streamError };

      if (written) {
        answerIn = split.via;
        const from = { read: tc.read, proposals, format: offer.format, stopReason, streamError, owed: planOwed };
        const w = writtenAnswer(written, input, from);
        if (!w.ok) return fail(w.sentence, w.failure, round);
        const ungrounded = isUngrounded(answerWords(w.answer), reads + proposals.length);
        return done({ answer: w.answer, ungrounded, failed: false, failure: null, rounds: round, lastRound });
      }

      // Cards alone, every one of them made: they are the Do, said in a sentence (a plan's by the model, from its result,
      // in the round after it), with no second round -- unless part of what was asked is no card, which the next round
      // says (turn-end.ts turnUnmade).
      const alone = unmade.alone({ acts: acts.length, calls: calls.length, refused, made: proposals.slice(before) });
      if (planAnswerOwed(alone, planned, { last, leftMs: budgetMs - (Date.now() - t0) })) {
        planOwed = { cards: proposals.slice(before), plan: planned, lastRound };
        messages.push({ role: "assistant", content: replayBlocks(blocks) });
        messages.push({ role: "user", content: resultBlocks(ordered) });
        tellNext(messages, PLAN_ANSWER_WORDS);
        continue;
      }
      if (alone === "answer") {
        const answer = cardsAnswer(proposals.slice(before), input, planned);
        meter.said();
        input.emit({ t: "say", headline: answer.say.headline, detail: answer.say.detail });
        return done({ answer, failed: false, failure: null, rounds: round, lastRound });
      }
      messages.push({ role: "assistant", content: replayBlocks(blocks) });
      messages.push({ role: "user", content: resultBlocks(ordered) });
      if (alone === "owed") tellNext(messages, unmade.words());
      if (Date.now() - t0 > budgetMs - 8_000 && !last) {
        // Not enough time for another read: the next round is the last, and
        // answers with what there is.
        tellNext(messages, "Time is up for reads. Answer now with what you have.");
        round = ASK_MAX_ROUNDS - 1;
      } else if (model.answerTool && round + 1 === ASK_MAX_ROUNDS) tellNext(messages, LAST_ROUND_WORDS);
      closing = model.answerTool && last;
    }
    return fail(
      es ? "No llegué a una respuesta. Inténtalo de nuevo." : "I did not reach an answer. Try again.",
      "rounds_exhausted",
      ASK_MAX_ROUNDS,
    );
  } catch (e) {
    log.error("ask_turn_failed", { error: e, tenant_id: input.tenantId });
    return fail(
      es ? "Algo falló al responder. Inténtalo de nuevo." : "Something went wrong while answering. Try again.",
      e instanceof Error ? e.message : String(e),
      0,
    );
  }
}
