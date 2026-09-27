import "server-only";
import {
  ASK_ANSWER_FORMAT,
  ASK_MAX_ROUNDS,
  ASK_MAX_TOKENS,
  ASK_TURN_BUDGET_MS,
  answerForCards,
  answerText,
  answerWords,
  cacheHitOf,
  cleanAnswer,
  failedAnswer,
  isUngrounded,
  normalizeAnswer,
  partialSay,
  proseAnswer,
  type AskAnswer,
  type AskLanguage,
  type AskMessageVM,
  type AskModelId,
  type AskProposal,
  type AskScope,
  type AskTurnShape,
  type PageContext,
} from "@chanlytics/contracts";
import type { MembershipRole } from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";
import { load, type ReaderContext } from "../readers";
import { GatewayRefused, featureRejected } from "./gateway";
import {
  ACT_TOOLS,
  ACT_TOOL_NAMES,
  READ_TOOLS,
  buildProposal,
  newToolContext,
  proposalLabel,
  runTool,
  toolLabel,
  type ToolContext,
  type ToolRun,
} from "./tools";
import { stableSystem, turnWords, type WorkspaceFacts } from "./prompt";
import { buildContext, shapeBlock, type BuiltContext, type SearchResultBlock } from "./context";
import { crossPagePlan, readBlock } from "./cross-page";
import { shape as shapeReader } from "../readers/shape";
import { replayBlocks, runRound, type RoundBlock } from "./round";
import { askModel } from "./model";

/**
 * One turn of the assistant.
 *
 * The page the person is on rides in first, as data before their words
 * (context.ts), with the reads the question names of another page and the
 * row the scope names (cross-page.ts); then the model is asked with the
 * read tools and the act tools, and either calls them or writes the answer:
 * the answer is text in the Line's shape (ASK_ANSWER_FORMAT, structured
 * output), so no tool is called to answer. Reads run as the person, in
 * parallel, and go back as one message. An act tool never acts: it checks
 * and proposes, and may share a round with the answer. Say streams as the
 * answer is written; the last allowed round may call no tool, so a turn
 * always ends in an answer or a stated failure. "How a turn ends" in
 * docs/superpowers/plans/2026-09-23-ask-the-line-3-the-answer.md is this loop.
 */

// The whole round -- the model's thinking, every tool call it makes and, when
// it answers in the same round, the answer itself -- fits in ASK_MAX_TOKENS
// (contracts), the one number the edge also clamps Ask to. An act tool's
// arguments are long -- propose_lead_search alone writes a who, a where, up to
// five terms, six criteria and six exclusions -- and at 1200 the stream reached
// the cap in the MIDDLE of that JSON. A cut-off tool call is not a smaller tool
// call: it does not parse at all (see `argsOf`). The loop then asked for 2400,
// but the edge clamped every round to 2000, so 2000 was the real ceiling; it is
// one number now, raised only when an eval case stops at it. A cap is not a
// spend, only a ceiling on what may be generated.
const MAX_HISTORY = 12;
const HISTORY_CHARS = 1200;
/** Say is sent at most this often while it is written (spec 7.4). */
const SAY_EVERY_MS = 50;

export interface TurnEvent {
  t: "trace" | "say" | "final" | "error";
  /** A trace's words, or an error's. */
  text?: string;
  /** Say as written so far: a preview, replaced by the final message's. */
  headline?: string;
  detail?: string;
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
  /** Prior turns of this thread, oldest first, as plain text. */
  history: Array<{ role: "user" | "assistant"; text: string }>;
  text: string;
  /** From the palette opening to the question being sent, as the tab measured it; null from an older tab or a script. */
  openedMs?: number | null;
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
  model: AskModelId;
  /** Where the time went and what the model was fed (ask-shape.ts): logged, and stored on the turn's row. */
  shape: AskTurnShape;
}

type Msg = { role: "user" | "assistant"; content: unknown };

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

/** A refusal of the request for its search_result blocks, or their cache marks (D14). */
export function blocksRefused(message: string): boolean {
  return /^400\b/.test(message) && /search_result|citation|cache_control/i.test(message);
}

function refusalText(r: GatewayRefused["refusal"], es: boolean): string {
  switch (r.kind) {
    case "preview":
      return es ? "Ask solo responde en el panel de producción." : "Ask only answers on the production dashboard.";
    case "budget":
      return es
        ? "Ask usó su presupuesto diario. Vuelve mañana; las páginas siguen funcionando."
        : "Ask has used its daily budget. Try again tomorrow; the pages still work.";
    case "no_key":
      return es ? "Ask no está conectado a un modelo todavía." : "Ask is not connected to a model yet.";
    case "unreachable":
      return es
        ? "No pude llegar al modelo. Inténtalo de nuevo en un momento."
        : "I could not reach the model. Try again in a moment.";
    default:
      return es
        ? "El modelo rechazó la pregunta. Inténtalo de otra forma."
        : "The model refused the question. Try it another way.";
  }
}

/**
 * The thread's prior turns, folded so no two neighbours share a role, starting with the person. The history is words;
 * the question may be blocks (the page's data, then the words): two neighbours of one role are joined as words, or, where
 * either is blocks, as one list of blocks with the words first.
 */
export function foldHistory(history: TurnInput["history"], last: string | unknown[]): Msg[] {
  const messages: Msg[] = [
    ...history.slice(-MAX_HISTORY).map((h) => ({ role: h.role, content: h.text.slice(0, HISTORY_CHARS) })),
    { role: "user", content: last },
  ];
  const asBlocks = (c: unknown): unknown[] => (Array.isArray(c) ? c : [{ type: "text", text: String(c) }]);
  for (let i = messages.length - 2; i >= 0; i--) {
    if (messages[i].role === messages[i + 1].role) {
      const [a, b] = [messages[i].content, messages[i + 1].content];
      messages[i] = {
        role: messages[i].role,
        content: typeof a === "string" && typeof b === "string" ? `${a}\n${b}` : [...asBlocks(a), ...asBlocks(b)],
      };
      messages.splice(i + 1, 1);
    }
  }
  if (messages[0]?.role !== "user") messages.shift();
  return messages;
}

/**
 * The row the scope names, read whole by the tool that reads it, to ride in with the page (as the snapshot's scoped row
 * did): a call, a person, a thread or a conversation. A lead, a search or a run is read by no tool until Phase 4, and a
 * page needs no read: none.
 */
export function scopedRead(scope: AskScope | null): ToolRun | null {
  if (scope?.kind === "call") return { name: "get_call", input: { call_id: scope.id } };
  if (scope?.kind === "person") return { name: "get_person", input: { contact_id: scope.id } };
  if (scope?.kind === "thread" || scope?.kind === "conversation")
    return { name: "get_thread", input: { conversation_id: scope.id, more: false } };
  return null;
}

export async function runAskTurn(input: TurnInput, ports: AskPorts = askPorts()): Promise<TurnResult> {
  const t0 = Date.now();
  const model = askModel();
  const now = input.now ?? new Date();
  const es = input.language === "es";
  const tc: ToolContext = newToolContext(input.ctx, input.tenantId, input.role, input.timezone, now, input.rc);
  const toolsUsed: string[] = [];
  const proposals: AskProposal[] = [];
  let reads = 0;
  // Where the time went (AskTurnShape): the first byte of the model's stream,
  // its first text token, the first Say the person sees, each round's time,
  // each tool's, and what the model was fed by cache or not. Measured here
  // because only the loop sees all of it; the route stores it on the turn.
  let firstByteMs: number | null = null;
  let firstTextMs: number | null = null;
  let firstSayMs: number | null = null;
  const roundsMs: number[] = [];
  const toolsMs: Array<{ name: string; ms: number }> = [];
  const tokens = { input: 0, cache_read: 0, cache_creation: 0, output: 0 };
  let capHits = 0;

  // Before the model is asked, in parallel (the Phase 2 plan, PR 2.4): the page the person is on (context.ts: the
  // warm's build if it is kept, else a build now), the shape of the workspace, the reads the question names of another
  // page (cross-page.ts), and the row the scope names, read whole as its tool reads it. Each rides into the first round
  // as data, so its rows enter the read set and the answer can cite them. A failure costs that block, never the turn.
  const tCtx = Date.now();
  const plan = crossPagePlan(input.text, input.surface, input.context?.view ?? null);
  const scoped = scopedRead(input.scope);
  const guard =
    <T>(what: string, fallback: T) =>
    (e: unknown): T => {
      console.error(
        what,
        JSON.stringify({ error: e instanceof Error ? e.message : String(e), tenant: input.tenantId }),
      );
      return fallback;
    };
  const runRead = async (run: ToolRun) => {
    try {
      return { run, out: await ports.tool(tc, run) };
    } catch (e) {
      guard("ask_cross_page_failed", null)(e);
      return { run, out: { result: "", isError: true } };
    }
  };
  const [built, shape, preOuts, scopedOut] = await Promise.all([
    input.context
      ? ports.context(tc.rc, input.context).catch(guard<BuiltContext | null>("ask_context_failed", null))
      : null,
    ports.shape(tc.rc).catch(guard("ask_shape_failed", "")),
    Promise.all(plan.map(runRead)),
    scoped ? runRead(scoped) : null,
  ]);
  // The page's rows a citation may name enter the read set; the page counts as one read, so a figure answered from it
  // is grounded (isUngrounded) -- when something on it was read: not a page whose read failed, nor one that is its
  // address alone (other) and shows no row.
  if (built) for (const r of built.refs) if (r.kind !== "page") tc.read[r.kind].add(r.id);
  const pageRead =
    !!built && built.blocks.length > 0 && (built.rows > 0 || (!built.failed && input.context?.surface !== "other"));
  if (pageRead) reads++;
  const prefetched = preOuts.filter((p) => !p.out.isError);
  for (const p of prefetched) {
    toolsUsed.push(p.run.name);
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
  // the breakpoint, uncached, so the cache holds.
  const system = [
    { type: "text", text: stableSystem(input.facts), cache_control: { type: "ephemeral" } },
    ...(shape ? [{ type: "text", text: shape, cache_control: { type: "ephemeral" } }] : []),
  ];
  const pageBlocks: SearchResultBlock[] = [
    ...(built?.blocks ?? []),
    ...(scopedRow ? [readBlock(scopedRow.run, scopedRow.out.result)] : []),
  ];
  const cached = pageBlocks.map((b, i) =>
    i === pageBlocks.length - 1 ? { ...b, cache_control: { type: "ephemeral" } } : b,
  );
  const crossBlocks = prefetched.map((p) => readBlock(p.run, p.out.result));
  const wordsFacts = {
    role: input.role,
    personLabel: input.personLabel,
    scope: input.scope,
    surface: input.surface,
    language: input.language,
    timezone: input.timezone,
    closures: input.facts.closures,
    now,
  };
  const words = {
    type: "text",
    text: turnWords({
      ...wordsFacts,
      context: (built?.blocks.length ?? 0) > 0,
      crossPage: crossBlocks.length > 0,
      scopeRead: !!scopedRow,
    }),
  };
  const question = { type: "text", text: input.text };
  const withData = [...cached, ...crossBlocks, words, question];
  const messages = foldHistory(input.history, withData);
  // Where the question sits, and whether it still carries the data blocks: a request the API refuses for them is asked
  // once more without them (D14).
  const questionAt = messages.length - 1;
  let dataDropped = pageBlocks.length === 0 && crossBlocks.length === 0;
  const baseTools = [...READ_TOOLS, ...(input.role === "viewer" ? [] : ACT_TOOLS)];
  // The answer has its format until the API refuses it: then it is dropped and
  // the same round is asked again. No tool is strict: the API takes twenty
  // strict tools and twenty-four optional parameters across them (26 tools,
  // then 31 parameters in the act tools alone, were refused on every operator
  // turn, 23 Sep), and the tools ran as they always had without it.
  let format = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASK_TURN_BUDGET_MS);

  const done = (r: {
    answer: AskAnswer;
    failed: boolean;
    failure: string | null;
    rounds: number;
    ungrounded?: boolean;
  }): TurnResult => {
    clearTimeout(timer);
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
      cross_page: plan.map((p) => p.name),
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
  };
  /** A turn that could not be answered: its sentence, in the person's language, is the answer's headline. */
  const fail = (sentence: string, failure: string, rounds: number) =>
    done({ answer: failedAnswer(sentence, input.language), failed: true, failure, rounds });

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
          console.warn("ask_say_not_first", JSON.stringify({ first: firstKey.slice(0, 40), tenant: input.tenantId }));
      }
    }
    const part = json ? partialSay(soFar) : format ? null : { headline: "", detail: soFar };
    if (!part) return;
    // Nothing past a tag, even in a preview: the leak seen on production (cleanAnswer).
    const say = { headline: cleanAnswer(part.headline), detail: cleanAnswer(part.detail) };
    if (!say.headline && !say.detail) return;
    const key = `${say.headline}\n${say.detail}`;
    const at = Date.now();
    if (key === said || at - saidAt < SAY_EVERY_MS) return;
    said = key;
    saidAt = at;
    if (firstSayMs === null) firstSayMs = Date.now() - t0;
    input.emit({ t: "say", headline: say.headline, detail: say.detail });
  };
  /** An answer set aside after its Say was sent: an empty Say takes it back, and the Line shows the reads again. */
  const unsay = () => {
    if (!said) return;
    said = "";
    saidAt = 0;
    input.emit({ t: "say", headline: "", detail: "" });
  };

  /**
   * A tool call's arguments, or null when they did not arrive whole.
   *
   * `parseInput` answers {} for JSON it cannot read, which is the right shape
   * but the wrong fact: every required field then looks missing, and the model
   * is told "the plan is not complete: looking_for Required" about a field it
   * had just written. It reads that as its own mistake -- on the lead finder it
   * told the owner it "hit a formatting snag" and gave up -- when what happened
   * is that the round hit max_tokens mid-argument. Say that instead, so the
   * retry is a shorter call rather than a guess at a field that was never wrong.
   */
  const argsOf = (b: RoundBlock): Record<string, unknown> | null => {
    if (!b.json) return {};
    try {
      return JSON.parse(b.json) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  const cutOff = (b: RoundBlock) => {
    console.error(
      "ask_tool_input_cut_off",
      JSON.stringify({ tool: b.name, bytes: b.json.length, tenant: input.tenantId }),
    );
    return {
      result: JSON.stringify({
        error:
          "your call was cut off before its arguments were complete, so nothing was read; call it again with shorter values",
      }),
      isError: true,
    };
  };

  /** A tool call's time, kept in the order the calls ran. */
  const timed = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    try {
      return await run();
    } finally {
      toolsMs.push({ name, ms: Date.now() - t });
    }
  };

  const propose = async (b: RoundBlock) => {
    toolsUsed.push(b.name);
    const args = argsOf(b);
    if (!args) return cutOff(b);
    return timed(b.name, async () => {
      const p = await ports.propose(tc, b.name, args);
      if (p.proposal) proposals.push(p.proposal);
      return { result: p.result, isError: p.isError };
    });
  };

  const read = async (b: RoundBlock) => {
    toolsUsed.push(b.name);
    const args = argsOf(b);
    if (!args) return cutOff(b);
    return timed(b.name, async () => {
      const out = await ports.tool(tc, { name: b.name, input: args });
      if (!out.isError) reads++;
      return { result: out.result, isError: out.isError };
    });
  };

  try {
    for (let round = 1; round <= ASK_MAX_ROUNDS; round++) {
      const last = round === ASK_MAX_ROUNDS;
      const request = {
        model: model.id,
        max_tokens: ASK_MAX_TOKENS,
        system,
        messages,
        tools: baseTools.map((d) => ({ name: d.name, description: d.description, input_schema: d.input_schema })),
        // The last round may call no tool: all that is left is the answer.
        tool_choice: last ? { type: "none" } : { type: "auto" },
        output_config: format
          ? {
              effort: model.effort,
              format: { type: "json_schema" as const, schema: ASK_ANSWER_FORMAT as unknown as Record<string, unknown> },
            }
          : { effort: model.effort },
      };

      const roundAt = Date.now();
      let blocks: RoundBlock[];
      let stopReason: string | null;
      let streamError: string | null;
      try {
        const r = await ports.round(
          { tenantId: input.tenantId, userId: input.ctx.userId, request, signal: controller.signal },
          onText,
        );
        ({ blocks, stopReason, streamError } = r);
        roundsMs.push(r.timing?.totalMs ?? Date.now() - roundAt);
        if (r.timing) {
          if (firstByteMs === null && r.timing.firstEventMs !== null)
            firstByteMs = roundAt - t0 + r.timing.firstEventMs;
          if (firstTextMs === null && r.timing.firstTextMs !== null) firstTextMs = roundAt - t0 + r.timing.firstTextMs;
        }
        if (r.usage) {
          tokens.input += r.usage.inputTokens;
          tokens.cache_read += r.usage.cacheReadTokens;
          tokens.cache_creation += r.usage.cacheCreationTokens;
          tokens.output += r.usage.outputTokens ?? 0;
        }
      } catch (e) {
        if (e instanceof GatewayRefused) {
          // The format refused: the same round is asked again without it, and
          // what comes back is read as JSON when it is, else as prose (D15).
          const m = e.refusal.kind === "bad_request" ? e.refusal.message : "";
          // The page's data refused (D14): nothing in the repo sent a search_result block before this phase, so a 400
          // that names the blocks is asked once more without them, before the answer's format is ever given up for it.
          // Any other refusal -- the format's, an overload, a size -- is not theirs, and the page stays. Their reads
          // leave the count; the words stop pointing at them.
          if (m && !dataDropped && blocksRefused(m)) {
            console.error("ask_context_rejected", JSON.stringify({ error: m.slice(0, 200), tenant: input.tenantId }));
            dataDropped = true;
            reads -= (pageRead ? 1 : 0) + prefetched.length + (scopedRow ? 1 : 0);
            const bare = {
              ...words,
              text: turnWords({ ...wordsFacts, context: false, crossPage: false, scopeRead: false }),
            };
            messages[questionAt] = {
              role: "user",
              content: (messages[questionAt].content as Array<{ type?: string }>)
                .filter((b) => b.type !== "search_result")
                .map((b) => (b === words ? bare : b)),
            };
            round--;
            continue;
          }
          if (m && format && featureRejected(m)) {
            console.error("ask_format_rejected", JSON.stringify({ error: m.slice(0, 200), tenant: input.tenantId }));
            format = false;
            round--;
            continue;
          }
          console.error(
            "ask_gateway_refused",
            JSON.stringify({
              kind: e.refusal.kind,
              tenant: input.tenantId,
              message: "message" in e.refusal ? String(e.refusal.message).slice(0, 300) : undefined,
            }),
          );
          return fail(refusalText(e.refusal, es), e.refusal.kind, round);
        }
        if (controller.signal.aborted) {
          return fail(
            es
              ? "Tardé demasiado en leer. Pregunta algo más concreto."
              : "That took too long to read. Ask something more specific.",
            "timeout",
            round,
          );
        }
        throw e;
      }

      if (streamError && !blocks.length) {
        return fail(
          es
            ? "Se cortó la conexión con el modelo. Inténtalo de nuevo."
            : "The connection to the model dropped. Try again.",
          streamError,
          round,
        );
      }
      // The cap was reached. Whatever this round produced may be half-written,
      // and a tool call or an answer that is half-written does not parse at
      // all; it is caught where it is used (argsOf, normalizeAnswer), but it is
      // recorded here, because a turn that keeps hitting the cap is a budget
      // that is too small and not a model that keeps changing its mind.
      if (stopReason === "max_tokens") {
        capHits++;
        console.error(
          "ask_round_hit_cap",
          JSON.stringify({
            round,
            tools: blocks.filter((b) => b.type === "tool_use").map((b) => b.name),
            tenant: input.tenantId,
          }),
        );
      }
      if (stopReason === "refusal") {
        return fail(es ? "No puedo responder a eso aquí." : "I can't answer that here.", "refusal", round);
      }

      const calls = blocks.filter((b) => b.type === "tool_use");
      const acts = calls.filter((b) => ACT_TOOL_NAMES.has(b.name));
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      // The answer, if this round wrote one: its JSON -- written even with the
      // format refused, since the rules ask for it -- or words where no call
      // stands beside them or the format was refused. Words beside a call,
      // where the format asks for JSON, are the model thinking aloud.
      let written = text && (text.startsWith("{") || !format || !calls.length) ? text : "";

      // An answer beside a read was written before its rows: it is set aside,
      // and the model answers next round with them.
      if (written && calls.length > acts.length) {
        console.warn(
          "ask_answer_beside_read",
          JSON.stringify({ tools: calls.map((b) => b.name), tenant: input.tenantId }),
        );
        written = "";
        unsay();
      }

      if (!written && !calls.length) {
        return fail(
          es ? "No encontré nada que leer para esa pregunta." : "I found nothing to read for that question.",
          stopReason === "max_tokens" ? "cap" : "no_tool_no_text",
          round,
        );
      }

      // Reads and proposals, in parallel; every result goes back at once.
      for (const b of calls)
        input.emit({ t: "trace", text: ACT_TOOL_NAMES.has(b.name) ? proposalLabel(b.name) : toolLabel(b.name) });
      const before = proposals.length;
      const outcomes = await Promise.all(
        calls.map(async (b) => ({ block: b, out: ACT_TOOL_NAMES.has(b.name) ? await propose(b) : await read(b) })),
      );
      const refused = outcomes.some(({ out }) => out.isError);

      // Beside acts, the answer stands when every card was made: an act only
      // checks and proposes. A card refused or cut off would leave an answer
      // claiming a card that is not there, so the answer goes back with the
      // round, and the model answers again knowing why.
      if (written && refused) {
        console.warn(
          "ask_answer_beside_refused_card",
          JSON.stringify({ tools: acts.map((b) => b.name), tenant: input.tenantId }),
        );
        written = "";
        unsay();
      }

      if (written) {
        let answer: AskAnswer;
        if (written.startsWith("{")) {
          const shaped = normalizeAnswer(written, tc.read, input.language);
          if (!shaped.ok) {
            console.error(
              "ask_answer_unparsed",
              JSON.stringify({ error: shaped.error.slice(0, 200), stop: stopReason, tenant: input.tenantId }),
            );
            // An answer cut off by a broken stream says so: the connection dropped, not the shape.
            if (streamError)
              return fail(
                es
                  ? "Se cortó la conexión con el modelo. Inténtalo de nuevo."
                  : "The connection to the model dropped. Try again.",
                streamError,
                round,
              );
            return fail(
              es ? "No pude dar forma a la respuesta. Pregunta de nuevo." : "I could not shape the answer. Ask again.",
              `answer: ${shaped.error}`,
              round,
            );
          }
          if (shaped.dropped)
            console.warn("ask_sources_dropped", JSON.stringify({ dropped: shaped.dropped, tenant: input.tenantId }));
          answer = shaped.answer;
        } else {
          // Words with no shape: the format was refused (D15), or words came where the JSON should have.
          if (format)
            console.warn("ask_answer_not_json", JSON.stringify({ chars: written.length, tenant: input.tenantId }));
          answer = proseAnswer(written, input.language);
        }
        return done({
          answer,
          ungrounded: isUngrounded(answerWords(answer), reads + proposals.length),
          failed: false,
          failure: null,
          rounds: round,
        });
      }

      // Cards alone, every one of them made: they are the Do, said in a
      // sentence, with no second round. A refused or failed proposal keeps the
      // round -- the model must say why and what the person can do instead.
      if (acts.length === calls.length && !refused && proposals.length > before) {
        const answer = answerForCards(proposals.slice(before), input.language);
        if (firstSayMs === null) firstSayMs = Date.now() - t0;
        input.emit({ t: "say", headline: answer.say.headline, detail: answer.say.detail });
        return done({ answer, failed: false, failure: null, rounds: round });
      }
      messages.push({ role: "assistant", content: replayBlocks(blocks) });
      messages.push({
        role: "user",
        content: outcomes.map(({ block, out }) => ({
          type: "tool_result",
          tool_use_id: block.id,
          content: out.result,
          is_error: out.isError,
        })),
      });
      if (Date.now() - t0 > ASK_TURN_BUDGET_MS - 8_000 && !last) {
        // Not enough time for another read: the next round is the last, and
        // answers with what there is. Appended to the newest message, never an
        // edit to an earlier one.
        messages[messages.length - 1] = {
          role: "user",
          content: [
            ...(messages[messages.length - 1].content as unknown[]),
            { type: "text", text: "Time is up for reads. Answer now with what you have." },
          ],
        };
        round = ASK_MAX_ROUNDS - 1;
      }
    }
    return fail(
      es ? "No llegué a una respuesta. Inténtalo de nuevo." : "I did not reach an answer. Try again.",
      "rounds_exhausted",
      ASK_MAX_ROUNDS,
    );
  } catch (e) {
    console.error(
      "ask_turn_failed",
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), tenant: input.tenantId }),
    );
    return fail(
      es ? "Algo falló al responder. Inténtalo de nuevo." : "Something went wrong while answering. Try again.",
      e instanceof Error ? e.message : String(e),
      0,
    );
  }
}
