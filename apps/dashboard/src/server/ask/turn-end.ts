import "server-only";

/**
 * How a turn ends: where the time went and what the model was fed (AskTurnShape), measured while the turn runs
 * (turnMeter) and said as it returns (finishTurn), beside the turn as the model was sent it (memory.ts rawTurn), which
 * no log line carries. runAskTurn's; memory.ts never reads it.
 */

import {
  answerForCards,
  answerText,
  cacheHitOf,
  claimsWrite,
  messageLanguagesNext,
  normalizeAnswer,
  proseAnswer,
  type AskAnswer,
  type AskModelProfile,
  type AskProposal,
  type AskReadSet,
  type AskTurnShape,
  type ModelSpeed,
  type PlanLead,
} from "@chanlytics/contracts";
import { calledName, cardsOf, type ProposalOutcome, type ToolRun } from "./tools";
import type { BuiltContext, SearchResultBlock } from "./context";
import { argsOf, type RoundBlock, type RoundResult } from "./round";
import { chainEnd, rawTurn, type LastRound, type TurnEnd } from "./memory";
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
 * and action makes its card, and what a card says beside it (ProposalOutcome.noted: a part already so, a change to a
 * paused campaign that waits for its resume). While
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
      const parts = [...[...refused].map(([name, why]) => `${name} was refused (${why})`), ...noted];
      return `Part of what they asked is no card: ${parts.join("; ")}. Propose what you still can, then answer: what the cards do and, in a short clause each, what was not made and why, or what already holds, and what they can do instead. Never leave one out.`;
    },
  };
}

/* --------------------------------------------------- what a turn of cards says */

/** Whether two cards make the same change: the same kind and the same payload, whatever their ids. */
const sameChange = (a: AskProposal, b: AskProposal): boolean =>
  a.kind === b.kind && JSON.stringify(a.payload) === JSON.stringify(b.payload);

/**
 * A call whose every card the thread already holds, waiting for the person's press (memory.ts threadForTurn): nothing is
 * made again, and the model is told which are above, to name them (the evals, 16 Oct 2026: "set up my campaigns" asked
 * twice in one thread proposed its Win-back card a second time, 6 times in 8, on the rules before and after their
 * sections). A call with any card that is new keeps all of them: a plan's steps name each other, so none is taken out.
 */
export function notAgain(o: ProposalOutcome, waiting: readonly AskProposal[] | undefined): ProposalOutcome {
  const cards = cardsOf(o);
  if (o.isError || !cards.length || !cards.every((c) => waiting?.some((w) => sameChange(c, w)))) return o;
  const titles = cards.map((c) => `“${c.title}”`).join(", ");
  return {
    proposal: null,
    result: `Already above in this thread, waiting for their press: ${titles}. Nothing new was made: name each by its title and say it is one press above, with what still comes first.`,
    isError: false,
  };
}

/**
 * An answer beside the turn's cards that claims a write (contracts claimsWrite: "I've set up", "I paused"): nothing is
 * done until a person presses a card, so its headline is the cards' own count sentence and its detail stays. Logged,
 * since the rule the model is told did not hold (the moment spec, A4). An answer with no card beside it is left as it
 * is: the eval judges it (`no_write`).
 */
function withoutClaimedWrite(
  answer: AskAnswer,
  input: Pick<TurnInput, "language" | "tenantId">,
  made: readonly AskProposal[],
): AskAnswer {
  if (made.length === 0 || !claimsWrite(answer.say.headline)) return answer;
  log.warn("ask_answer_claimed_write", { cards: made.length, tenant_id: input.tenantId });
  return { ...answer, say: { ...answer.say, headline: answerForCards(made, input.language, null, null).say.headline } };
}

/** A plan's words as its call said them (ProposalOutcome), and what a setup's answer leads with (PlanLead). */
export type PlanSaid = { words: string; lead?: PlanLead };

/** A round of cards alone, every one made, that made a plan: its words, its answer; a lone plan's lead leads it. */
export const roundPlan = (calls: unknown[], acts: unknown[], refused: boolean, said: PlanSaid[]): PlanSaid | null =>
  acts.length === calls.length && !refused && said.length > 0
    ? { words: said.map((s) => s.words).join(" "), lead: said.length === 1 ? said.at(0)?.lead : undefined }
    : null;

/** The answer of cards alone: a plan's words and lead where it made one; messages alone ask for other languages. */
export function cardsAnswer(cards: readonly AskProposal[], input: TurnInput, plan: PlanSaid | null) {
  const answer = answerForCards(cards, input.language, plan?.words ?? null, plan?.lead ?? null);
  const next = messageLanguagesNext(cards, input.facts.languages, input.language);
  return next.length ? { ...answer, do: { ...answer.do, next } } : answer;
}

/**
 * An answer beside a round's acts, which stands where every card was made (an act only checks), or "" where it is set
 * aside, its Say taken back: beside a card refused or cut off it claims a card that is not there, so the model answers
 * again knowing why (logged); beside a plan's cards it was written before the plan's words came back (roundPlan); beside
 * a card that leaves out a part asked because it already holds (ProposalOutcome.noted), before it knew that.
 */
export function besideActs(
  written: string,
  r: { refused: boolean; leftOut: boolean; planned: PlanSaid | null; unsay(): void; log(): void },
) {
  if (!written || (!r.refused && !r.leftOut && r.planned === null)) return written;
  if (r.refused) r.log();
  r.unsay();
  return "";
}

/**
 * A plan's answer as the model wrote it from the plan's result (the answer canvas, phase B: every sentence a person reads
 * as Ask's is the model's, in their language), with what the server decides kept: a setup that waits on something opens
 * where that is set (PlanLead), in the model's words where its own Open went there, and message cards ask for the other
 * language. The questions next are the model's, the lead's only where it wrote none: the lead's are English or Spanish,
 * and a Portuguese setup's answer stood over "How do I connect my calendar in Settings?" (16 Oct 2026).
 */
function withPlanFacts(answer: AskAnswer, cards: readonly AskProposal[], input: TurnInput, plan: PlanSaid) {
  const lead = plan.lead;
  const own = answer.do.open;
  const asked = messageLanguagesNext(cards, input.facts.languages, input.language);
  const next = asked.length ? asked : answer.do.next.length ? answer.do.next : (lead?.next ?? []);
  if (!lead) return { ...answer, do: { open: own, next } };
  const label = own?.to === lead.open.to ? own.label : lead.open.label;
  return { ...answer, do: { open: { to: lead.open.to, label, now: false }, next } };
}

/**
 * Said after a plan's result, for the round that writes its answer: the plan's facts are its result's, the words the
 * model's, in the person's language. The room a turn keeps for it: with less, the plan's own words answer.
 */
export const PLAN_ANSWER_WORDS =
  "The plan above is proposed as its cards. Now write the answer, in the person's language, from its result alone: the headline says what the plan does, and the detail says first what no card carries (what must be connected or turned on first, a campaign paused, the room, the day a reminder goes) before anything the cards already show; where something must come first, the first question next asks how to do it. Never say any of it is done, sent or set up.";
const PLAN_ANSWER_ROOM_MS = 12_000;

/** A plan made, its answer owed by the round after it (PLAN_ANSWER_WORDS): its cards, its words, the round that made it. */
export interface PlanOwed {
  cards: AskProposal[];
  plan: PlanSaid;
  lastRound: LastRound;
}

/**
 * Whether a round of cards alone that made a plan leaves its answer to the model, written from the plan's result in one
 * more round with no tool: where there is that round, and the time for it. The answer tool's turn keeps the plan's own
 * words, as it always did.
 */
export const planAnswerOwed = (
  alone: "answer" | "owed" | null,
  planned: PlanSaid | null,
  turn: { answerTool: boolean; last: boolean; leftMs: number },
): planned is PlanSaid =>
  alone === "answer" && planned !== null && !turn.answerTool && !turn.last && turn.leftMs > PLAN_ANSWER_ROOM_MS;

/** A plan's answer round that failed or was stopped: the plan's cards stand, and its own words answer, as before. */
export const planFallback = (owed: PlanOwed, input: TurnInput, rounds: number): TurnEnd => ({
  answer: cardsAnswer(owed.cards, input, owed.plan),
  failed: false,
  failure: null,
  rounds,
  lastRound: owed.lastRound,
});

/** The model's stream broke: the connection's, never the question's. */
export const DROPPED_WORDS = {
  en: "The connection to the model dropped. Try again.",
  es: "Se cortó la conexión con el modelo. Inténtalo de nuevo.",
};

/**
 * The answer a round wrote, as the turn ends on it: its JSON shaped (normalizeAnswer), or words with no shape read as
 * prose (the format refused, D15, or words where the JSON should have been); a write it claims beside cards taken back
 * (withoutClaimedWrite), and the plan's facts kept where it answers a plan (withPlanFacts). Or why it cannot be read:
 * the sentence the person is told, and the failure kept.
 */
export function writtenAnswer(
  written: string,
  input: TurnInput,
  from: {
    read: AskReadSet;
    proposals: readonly AskProposal[];
    format: boolean;
    stopReason: string | null;
    streamError: string | null;
    owed: PlanOwed | null;
  },
): { ok: true; answer: AskAnswer } | { ok: false; sentence: string; failure: string } {
  const es = input.language === "es";
  if (!written.startsWith("{")) {
    if (from.format) log.warn("ask_answer_not_json", { chars: written.length, tenant_id: input.tenantId });
    return { ok: true, answer: withoutClaimedWrite(proseAnswer(written, input.language), input, from.proposals) };
  }
  const shaped = normalizeAnswer(written, from.read, input.language);
  if (!shaped.ok) {
    log.error("ask_answer_unparsed", {
      error: shaped.error.slice(0, 200),
      stop: from.stopReason,
      tenant_id: input.tenantId,
    });
    // An answer cut off by a broken stream says so: the connection dropped, not the shape.
    if (from.streamError) return { ok: false, sentence: DROPPED_WORDS[es ? "es" : "en"], failure: from.streamError };
    return {
      ok: false,
      sentence: es
        ? "No pude dar forma a la respuesta. Pregunta de nuevo."
        : "I could not shape the answer. Ask again.",
      failure: `answer: ${shaped.error}`,
    };
  }
  if (shaped.dropped) log.warn("ask_sources_dropped", { dropped: shaped.dropped, tenant_id: input.tenantId });
  const answer = withoutClaimedWrite(shaped.answer, input, from.proposals);
  return { ok: true, answer: from.owed ? withPlanFacts(answer, from.owed.cards, input, from.owed.plan) : answer };
}
