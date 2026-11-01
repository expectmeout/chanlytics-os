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
  type AskAnswer,
  type AskColumn,
  type AskLanguage,
  type AskMessageVM,
  type AskProposal,
  type AskRowRef,
  type AskScope,
  type AskShowPreview,
  type AskTurnShape,
  type PageContext,
} from "@chanlytics/contracts";
import type { AskModelProfile, EffortMessage, MembershipRole, WordsMessage } from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";
import type { ReaderContext } from "../readers";
import { log } from "@/server/log";
import { GatewayRefused, type GatewayRefusal } from "./gateway";
import { DROP_EVENTS, dropFor, letGo, refusalSaid, type Offer } from "./refusals";
import {
  ACT_TOOL_NAMES,
  buildProposal,
  calledName,
  cardsOf,
  newToolContext,
  runTool,
  toApiTools,
  toolLabel,
  type ToolContext,
} from "./tools";
import { stableSystem, systemBlocks, systemHash, type WorkspaceFacts } from "./prompt";
import { buildContext, type BuiltContext, type SearchResultBlock } from "./context";
import { readBlock } from "./cross-page";
import { firstReads, readsIn, shapeOf, type FirstReads } from "./loop/first-reads";
import { sayAsWritten } from "./loop/say";
import { wordsBlock } from "./loop/words";
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
  /** The column the Line draws the answer in (contracts AskColumn): said in the turn's words; none, nothing. */
  column?: AskColumn | null;
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
  /**
   * The shape of the workspace, as the second system block (readers/shape.ts, kept five minutes), and after it what Ask
   * remembers (companion/remembered.ts, read every turn): a memory that cannot be read costs its lines, never the shape.
   */
  shape: (rc: ReaderContext) => Promise<string>;
  tool: typeof runTool;
  propose: typeof buildProposal;
}
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

/** What a round's request is built from, and a cold opening's messages (requestFor, coldOf). */
interface TurnRequests {
  input: TurnInput;
  model: AskModelProfile;
  head: ReturnType<typeof turnHead>;
  /** How hard each round is asked: the turn's own effort, or a draft's, said in its messages (effort.ts). */
  effort: ReturnType<typeof turnEffort>;
  pageBlocks: SearchResultBlock[];
  crossBlocks: SearchResultBlock[];
  /**
   * Whether the question still carries the data blocks: a request the API refuses for them is asked once more without
   * them (D14), and the words stop pointing at them (wordsBlock).
   */
  dataDropped: boolean;
  sayWords: ReturnType<typeof wordsBlock>;
  question: { type: string; text: string };
  /** What the requests offer that the turn can do without, until the API refuses it (refusals.ts letGo). */
  offer: Offer;
  tools: ReturnType<typeof turnHead>["tools"];
}

/**
 * A turn as its rounds share it (openTurn): what it was asked and read first, its requests as they stand, and what its
 * rounds made. A refusal changes the requests -- a part of the offer, the page's data or the replay let go -- and the
 * same round is asked again (letGoOf); a later round only appends to its messages.
 */
interface TurnState extends TurnRequests {
  ports: AskPorts;
  t0: number;
  budgetMs: number;
  es: boolean;
  tc: ToolContext;
  /** Where the time went and what the model was fed (AskTurnShape, turn-end.ts): only the loop sees all of it. */
  meter: ReturnType<typeof turnMeter>;
  first: FirstReads;
  messages: Msg[];
  anchor: unknown;
  words: ReturnType<TurnRequests["sayWords"]>;
  /** A replay the API refuses (D12) is asked again cold, once: the turn then keeps its words history, the next base. */
  live: boolean;
  /** Where the question sits in every request of the turn, its words after it: a later round only appends. */
  questionAt: number;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
  /** What ends the model's stream: the turn's time, or the Stop. */
  signal: AbortSignal;
  say: ReturnType<typeof sayAsWritten>;
  reads: number;
  toolsUsed: string[];
  /** Its cards, and its plans' words (roundPlan). */
  proposals: AskProposal[];
  planWords: PlanSaid[];
  /** What was asked that no card carries, which the answer must say. */
  unmade: ReturnType<typeof turnUnmade>;
  /** How the answer that ends the turn was written (AskTurnShape). */
  answerIn: "tool" | "text" | null;
  /** A plan made, whose answer the next round writes (planAnswerOwed). */
  planOwed: PlanOwed | null;
}

/**
 * A turn opened: what it reads first (loop/first-reads.ts), then its first request's messages, and its own time
 * started.
 */
async function openTurn(input: TurnInput, ports: AskPorts): Promise<TurnState> {
  const t0 = Date.now();
  const budgetMs = budgetOf(input);
  const model = askModel();
  const now = input.now ?? new Date();
  const tc = toolContextOf(input, now, t0 + budgetMs);
  const unmade = turnUnmade();
  const meter = turnMeter(t0);
  const effort = turnEffort(model, input, meter);
  const first = await firstReads(input, ports, tc);
  const { built, prefetched, scopedRow } = first;

  // Two cache breakpoints in system: the rules and facts for every turn in the workspace, and the shape of the
  // workspace, the same bytes for its people for five minutes. A third on the page's data, its last block (D10): this
  // turn's later rounds read it from the cache, and so does another first question on the same page within the
  // cache's life. A follow-up does not: its earlier turns come before the page, as text, so its prefix after the
  // shape is new bytes and the page is written to the cache again. The clock, the person and the question come after
  // it; the fourth is on each request's last block (withMarkers), so the next round reads all before it.
  const head = turnHead(model, input.role, input.facts, first.shape);
  const pageBlocks: SearchResultBlock[] = [
    ...(built?.blocks ?? []),
    ...(scopedRow ? [readBlock(scopedRow.run, scopedRow.out.result)] : []),
  ];
  const crossBlocks = prefetched.map((p) => readBlock(p.run, p.out.result));
  const requests: TurnRequests = {
    input,
    model,
    head,
    effort,
    pageBlocks,
    crossBlocks,
    dataDropped: pageBlocks.length === 0 && crossBlocks.length === 0,
    sayWords: wordsBlock(input, now, { built, crossBlocks, scopedRow, read: tc.read }),
    question: { type: "text", text: input.text },
    // The tools (registry.ts), the same bytes every round, and the answer's format, until the API refuses a part of the
    // offer: then it is let go (refusals.ts letGo) and the same round asked again. No tool is strict: the API takes twenty
    // strict tools and twenty-four optional parameters across them (26 tools, then 31 parameters in the act tools alone,
    // were refused on every operator turn, 23 Sep), and the tools ran as they always had without it.
    offer: { search: true, format: true, words: true, answer: model.answerTool },
    tools: head.tools,
  };
  // The earlier turns (memory.ts, the Phase 5 plan, D1–D4): replayed as the model was sent them while the thread is
  // warm, round one on the same model and prefix and within the bound (bpR where the last request ended); else the
  // rebuilt history, each answer one line, the question after it (bp3 on the page's last block).
  const asked = {
    data: [...pageBlocks, ...crossBlocks],
    words: requests.sayWords(true, requests.dataDropped),
    question: requests.question,
    asSystem: requests.offer.words,
  };
  const replayed = replayFor(input.chain, asked, (msgs, at) => requestFor(requests, msgs, at, false));
  const { messages, anchor, words } = replayed ?? coldOf(requests);
  const questionAt = questionIn(messages);
  effort.open(messages);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  return {
    ...requests,
    ports,
    t0,
    budgetMs,
    es: input.language === "es",
    tc,
    meter,
    first,
    messages,
    anchor,
    words,
    live: !!replayed,
    questionAt,
    controller,
    timer,
    signal: halted(controller.signal, input.signal),
    say: sayAsWritten(input, tc, requests.offer, meter),
    reads: readsIn(first),
    toolsUsed: prefetched.map((p) => calledName(p.run.name, p.run.input)),
    proposals: [],
    planWords: [],
    unmade,
    answerIn: null,
    planOwed: null,
  };
}

/** A round's request: its messages a copy with the cache's markers (withMarkers), at `at` and on its last block. */
function requestFor(turn: TurnRequests, msgs: Msg[], at: unknown, noTool: boolean) {
  const { head, model, offer } = turn;
  return {
    ...(head.speed ? { model: head.model, speed: head.speed } : { model: head.model }),
    ...turn.effort.of(msgs),
    system: head.system,
    messages: withMarkers(msgs, at),
    tools: turn.tools,
    // A round that may call no tool: all that is left is the answer, as text.
    tool_choice: noTool ? { type: "none" as const } : head.tool_choice,
    output_config: offer.format ? head.output_config : { effort: model.effort },
  };
}

/** A turn opened cold: the rebuilt history, then the data while the question still carries it, and the question. */
function coldOf(turn: TurnRequests) {
  const words = turn.sayWords(false, turn.dataDropped);
  const data = turn.dataDropped ? [] : [...turn.pageBlocks, ...turn.crossBlocks];
  const messages = withWords(foldHistory(turn.input.history, [...data, turn.question]), words, turn.offer.words);
  return { messages, anchor: turn.pageBlocks.at(-1), words };
}

/** The turn as it returns (turn-end.ts finishTurn), its own time stopped. */
function done(turn: TurnState, r: TurnEnd): TurnResult {
  clearTimeout(turn.timer);
  const { answerIn, input, model, t0, first, dataDropped, pageBlocks, crossBlocks, meter } = turn;
  return finishTurn(r, {
    answerIn,
    input,
    model,
    t0,
    built: first.built,
    contextMs: first.contextMs,
    dataDropped,
    pageBlocks,
    crossBlocks,
    plan: first.plan,
    meter,
    format: turn.offer.format,
    toolsUsed: turn.toolsUsed,
    proposals: turn.proposals,
    questionAt: turn.questionAt,
    live: turn.live,
    promptHash: systemHash(turn.head.system),
  });
}

/** A turn that could not be answered: its sentence, in the person's language, heads it; once a plan is made, its words. */
function fail(turn: TurnState, sentence: string, failure: string, rounds: number): TurnResult {
  return done(
    turn,
    turn.planOwed
      ? planFallback(turn.planOwed, turn.input, rounds)
      : { answer: failedAnswer(sentence, turn.input.language), failed: true, failure, rounds },
  );
}

/** A round ended by the person's Stop (turn.ts words it) or, where it `cut` the round, by the turn's own time. */
const endedEarly = (turn: TurnState, rounds: number, cut: boolean): TurnResult | null =>
  turn.input.signal?.aborted
    ? fail(turn, "", "stopped", rounds)
    : cut && turn.controller.signal.aborted
      ? fail(turn, TIME_UP_WORDS[turn.es ? "es" : "en"], "timeout", rounds)
      : null;

/** A tool call's time, kept in the order the calls ran. */
async function timed<T>(turn: TurnState, name: string, run: () => Promise<T>): Promise<T> {
  const t = Date.now();
  try {
    return await run();
  } finally {
    turn.meter.toolsMs.push({ name, ms: Date.now() - t });
  }
}

/** An act tool's call: it checks and proposes, never acts; its cards, its plan's words and what it left are the turn's. */
async function proposeCall(turn: TurnState, b: RoundBlock) {
  const { input, ports, tc, proposals } = turn;
  const args = argsOf(b);
  turn.toolsUsed.push(calledName(b.name, args));
  if (!args) return cutOff(b, input.tenantId);
  return timed(turn, calledName(b.name, args), async () => {
    const p = notAgain(await ports.propose(tc, b.name, args), [...(input.waiting ?? []), ...proposals]);
    proposals.push(...cardsOf(p));
    if (p.words) turn.planWords.push({ words: p.words, lead: p.lead });
    turn.unmade.heard(calledName(b.name, args), p);
    return { result: p.result, isError: p.isError, noted: !!p.noted };
  });
}

/** A read tool's call, as the person: one that comes back is a read the answer is grounded on (isUngrounded). */
async function readCall(turn: TurnState, b: RoundBlock) {
  const { input, ports, tc } = turn;
  const args = argsOf(b);
  turn.toolsUsed.push(calledName(b.name, args));
  if (!args) return cutOff(b, input.tenantId);
  return timed(turn, calledName(b.name, args), async () => {
    const out = await ports.tool(tc, { name: b.name, input: args });
    if (!out.isError) turn.reads++;
    return { result: out.result, isError: out.isError };
  });
}

/**
 * Something the turn can do without, refused (refusals.ts): let go, so the same round is asked again without it, once
 * each (true). Without the page's data, their reads leave the count and the words stop pointing at them; without the
 * format, what comes back is read as JSON when it is, else as prose (D15). False when nothing it names can be let go.
 */
function letGoOf(turn: TurnState, refusal: GatewayRefusal, round: number): boolean {
  const m = refusal.kind === "bad_request" ? refusal.message : "";
  const drop = dropFor(m, { replay: turn.live && round === 1, context: !turn.dataDropped, ...turn.offer });
  if (!drop) return false;
  log.error(DROP_EVENTS[drop], { error: m.slice(0, 200), tenant_id: turn.input.tenantId });
  if (drop === "replay") {
    Object.assign(turn, coldOf(turn));
    turn.live = false;
    turn.questionAt = questionIn(turn.messages);
    turn.effort.open(turn.messages);
  } else if (drop === "context") {
    turn.dataDropped = true;
    turn.reads -= readsIn(turn.first);
    turn.messages = withoutData(turn.messages, turn.questionAt, turn.words, turn.sayWords(turn.live, turn.dataDropped));
  } else Object.assign(turn, letGo(turn.offer, drop, turn.input.role, { tools: turn.tools, messages: turn.messages }));
  return true;
}

/** A round as the model's stream brought it back, with the request it answered and when that went out. */
interface RoundCame {
  request: LastRound["request"];
  roundAt: number;
  blocks: RoundBlock[];
  stopReason: string | null;
  streamError: string | null;
}

/**
 * What a round leaves the turn: its end; the same round asked again ("again": a part of the offer let go, or a draft
 * begun at the turn's own effort); the next round after the model's blocks went back ("on"); or the next round after
 * the round's results went back too ("answered"), which runAskTurn may make the last.
 */
type RoundStep = { end: TurnResult } | "again" | "on" | "answered";

/** A round asked: its request out, its stream back; or, where the round threw, its end or the round asked again. */
async function askRound(turn: TurnState, round: number, noTool: boolean): Promise<RoundCame | RoundStep> {
  const { input, ports, meter, signal } = turn;
  const request = {
    ...requestFor(turn, turn.messages, turn.anchor, noTool),
    diagnostics: meter.follows(turn.live, input.chain),
  };
  const roundAt = Date.now();
  try {
    const r = await ports.round(
      { tenantId: input.tenantId, userId: input.ctx.userId, request, signal },
      turn.say.onText,
      answerInput(turn.say.onText),
    );
    meter.round(r, roundAt);
    return { request, roundAt, blocks: r.blocks, stopReason: r.stopReason, streamError: r.streamError };
  } catch (e) {
    // The person's Stop, or the turn's own time run out: whatever the round threw for it (a gateway unreached).
    const early = endedEarly(turn, round, true);
    if (early) return { end: early };
    if (!(e instanceof GatewayRefused)) throw e;
    if (letGoOf(turn, e.refusal, round)) return "again";
    const said = refusalSaid(e.refusal, turn.es, { tenant_id: input.tenantId, round });
    return { end: fail(turn, said, e.refusal.kind, round) };
  }
}

/**
 * One round: asked (askRound), and what it wrote judged -- an answer, calls, both, or neither -- and its calls run,
 * reads and proposals in parallel; then the turn ends on its answer, or on its cards alone, or goes on.
 */
async function roundOf(
  turn: TurnState,
  { round, last, noTool }: { round: number; last: boolean; noTool: boolean },
): Promise<RoundStep> {
  const { input, meter, es, proposals } = turn;
  const came = await askRound(turn, round, noTool);
  if (typeof came === "string" || "end" in came) return came;
  const { request, roundAt, blocks, stopReason, streamError } = came;

  // A stream the turn's own time cut is the time's, not a dropped connection.
  const ended = endedEarly(turn, round, !!streamError);
  if (ended) return { end: ended };

  if (streamError && !blocks.length) return { end: fail(turn, DROPPED_WORDS[es ? "es" : "en"], streamError, round) };
  // The cap was reached: what the round wrote may be half-written, and it is recorded (turn-end.ts capped).
  meter.capped(stopReason, round, blocks, input.tenantId);
  if (stopReason === "refusal") {
    return { end: fail(turn, es ? "No puedo responder a eso aquí." : "I can't answer that here.", "refusal", round) };
  }

  // The answer, if this round wrote one, and its calls with the answer tool's apart (tools/answer.ts).
  const split = roundAnswer(blocks, turn.offer.format);
  const { used, answered, calls } = split;
  // A draft begun at the turn's own effort is set aside, its calls unrun, and the round asked again at the draft's
  // (effort.ts): the question did not say it was one.
  if (turn.effort.redraft(calls, turn.messages)) {
    turn.say.unsay();
    return "again";
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
    turn.say.unsay();
  }

  if (pausedByServer(stopReason, calls.length, last)) {
    turn.messages.push({ role: "assistant", content: replayBlocks(blocks) });
    return "on";
  }

  // A round that wrote nothing and called nothing is a glitch of ours, not an empty read.
  if (!written && !calls.length) {
    return {
      end: fail(
        turn,
        es ? "Perdí el hilo. Pregúntamelo de nuevo." : "I lost my train of thought. Ask me again.",
        stopReason === "max_tokens" ? "cap" : "no_tool_no_text",
        round,
      ),
    };
  }

  // Reads and proposals, in parallel; every result goes back at once.
  for (const b of calls) input.emit({ t: "trace", text: toolLabel(b.name, argsOf(b)) });
  const [before, saidBefore] = [proposals.length, turn.planWords.length];
  const outcomes = await Promise.all(
    calls.map(async (b) => ({
      block: b,
      out: ACT_TOOL_NAMES.has(b.name) ? await proposeCall(turn, b) : await readCall(turn, b),
    })),
  );
  const refused = outcomes.some(({ out }) => out.isError);
  const leftOut = outcomes.some(({ out }) => "noted" in out && out.noted);

  const planned = roundPlan(calls, acts, refused, turn.planWords.slice(saidBefore));
  written = besideActs(written, {
    refused,
    leftOut,
    planned,
    unsay: turn.say.unsay,
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
    turn.answerIn = split.via;
    const from = {
      read: turn.tc.read,
      proposals,
      format: turn.offer.format,
      stopReason,
      streamError,
      owed: turn.planOwed,
    };
    const w = writtenAnswer(written, input, from);
    if (!w.ok) return { end: fail(turn, w.sentence, w.failure, round) };
    const ungrounded = isUngrounded(answerWords(w.answer), turn.reads + proposals.length);
    return {
      end: done(turn, { answer: w.answer, ungrounded, failed: false, failure: null, rounds: round, lastRound }),
    };
  }

  // Cards alone, every one of them made: they are the Do, said in a sentence (a plan's by the model, from its result,
  // in the round after it), with no second round -- unless part of what was asked is no card, which the next round
  // says (turn-end.ts turnUnmade).
  const alone = turn.unmade.alone({ acts: acts.length, calls: calls.length, refused, made: proposals.slice(before) });
  if (planAnswerOwed(alone, planned, { last, leftMs: turn.budgetMs - (Date.now() - turn.t0) })) {
    turn.planOwed = { cards: proposals.slice(before), plan: planned, lastRound };
    turn.messages.push({ role: "assistant", content: replayBlocks(blocks) });
    turn.messages.push({ role: "user", content: resultBlocks(ordered) });
    tellNext(turn.messages, PLAN_ANSWER_WORDS);
    return "on";
  }
  if (alone === "answer") {
    const answer = cardsAnswer(proposals.slice(before), input, planned);
    meter.said();
    input.emit({ t: "say", headline: answer.say.headline, detail: answer.say.detail });
    return { end: done(turn, { answer, failed: false, failure: null, rounds: round, lastRound }) };
  }
  turn.messages.push({ role: "assistant", content: replayBlocks(blocks) });
  turn.messages.push({ role: "user", content: resultBlocks(ordered) });
  if (alone === "owed") tellNext(turn.messages, turn.unmade.words());
  return "answered";
}

export async function runAskTurn(input: TurnInput, ports: AskPorts = askPorts()): Promise<TurnResult> {
  const turn = await openTurn(input, ports);
  const { model, es } = turn;
  // With the answer tool, calling it is how the last round answers: it may call tools, and a read it makes anyway is
  // answered before one closing round that may call none.
  let closing = false;
  try {
    for (let round = 1; round <= ASK_MAX_ROUNDS + Number(closing); round++) {
      const last = round >= ASK_MAX_ROUNDS;
      const step = await roundOf(turn, { round, last, noTool: model.answerTool ? closing : last });
      if (step === "again") round--;
      else if (step === "answered") {
        if (Date.now() - turn.t0 > turn.budgetMs - 8_000 && !last) {
          // Not enough time for another read: the next round is the last, and
          // answers with what there is.
          tellNext(turn.messages, "Time is up for reads. Answer now with what you have.");
          round = ASK_MAX_ROUNDS - 1;
        } else if (model.answerTool && round + 1 === ASK_MAX_ROUNDS) tellNext(turn.messages, LAST_ROUND_WORDS);
        closing = model.answerTool && last;
      } else if (step !== "on") return step.end;
    }
    return fail(
      turn,
      es ? "No llegué a una respuesta. Inténtalo de nuevo." : "I did not reach an answer. Try again.",
      "rounds_exhausted",
      ASK_MAX_ROUNDS,
    );
  } catch (e) {
    log.error("ask_turn_failed", { error: e, tenant_id: input.tenantId });
    return fail(
      turn,
      es ? "Algo falló al responder. Inténtalo de nuevo." : "Something went wrong while answering. Try again.",
      e instanceof Error ? e.message : String(e),
      0,
    );
  }
}
