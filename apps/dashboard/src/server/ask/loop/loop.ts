/** Loop: loop. */

import "server-only";
import { ASK_MAX_ROUNDS, answerWords, isUngrounded } from "@chanlytics/contracts";
import { log } from "@/server/shared/log";
import { GatewayRefused, type GatewayRefusal } from "../../shared/model/gateway";
import { DROP_EVENTS, answerHasItsWay, dropFor, letGo, refusalSaid } from "../refusals";
import { ACT_TOOL_NAMES, calledName, toolLabel } from "../tools";
import { readsIn } from "./first-reads";
import { argsOf, replayBlocks, resultBlocks, type CallOutcome, type RoundBlock } from "../round";
import { questionIn, tellNext, type LastRound, withoutData } from "../memory";
import {
  DROPPED_WORDS,
  PLAN_ANSWER_WORDS,
  besideActs,
  cardsAnswer,
  planAnswerOwed,
  roundPlan,
  writtenAnswer,
} from "../turn-end";
import { LAST_ROUND_WORDS, answerInput, everyCallAnswered, roundAnswer } from "../tools/answer";
import {
  askPorts,
  coldOf,
  done,
  endedEarly,
  fail,
  openTurn,
  pausedByServer,
  proposeCall,
  readCall,
  requestFor,
  type AskPorts,
  type TurnInput,
  type TurnResult,
  type TurnState,
} from "./turn-head";

/** Pictures came back this round: the rounds after it judge what they see, at the draft's effort (effort.ts lookHarder). */
function lookedHarder(turn: TurnState, outcomes: readonly CallOutcome[]): void {
  if (outcomes.some(({ out }) => out.pictures?.length)) turn.effort.lookHarder(turn.messages);
}

/**
 * Something the turn can do without, refused (refusals.ts): let go, so the same round is asked again without it, once
 * each (true). Without the page's data, their reads leave the count and the words stop pointing at them; without the
 * format, what comes back is read as JSON when it is, else as prose (D15). False when nothing it names can be let go.
 */
function letGoOf(turn: TurnState, refusal: GatewayRefusal, round: number): boolean {
  const items = refusal.kind === "bad_request" ? refusal.message : "";
  const drop = dropFor(items, { replay: turn.live && round === 1, context: !turn.dataDropped, ...turn.offer });
  if (!drop) return false;
  log.error(DROP_EVENTS[drop], { error: items.slice(0, 200), tenant_id: turn.input.tenantId });
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
    const sentence = refusalSaid(e.refusal, turn.es, { tenant_id: input.tenantId, round });
    return { end: fail(turn, sentence, e.refusal.kind, round) };
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
  const arrived = await askRound(turn, round, noTool);
  if (typeof arrived === "string" || "end" in arrived) return arrived;
  const { request, roundAt, blocks, stopReason, streamError } = arrived;

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
  const split = roundAnswer(blocks, answerHasItsWay(turn.offer));
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
  // An act answered with a picture to look at and no card (a post drawn, act/files/post.ts): the model looks first.
  const looking = outcomes.some(
    ({ block, out }) => ACT_TOOL_NAMES.has(block.name) && "pictures" in out && !!out.pictures?.length,
  );

  const planned = roundPlan(calls, acts, refused, turn.planWords.slice(saidBefore));
  written = besideActs(written, {
    refused,
    leftOut,
    looking,
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
    const result = writtenAnswer(written, input, from);
    if (!result.ok) return { end: fail(turn, result.sentence, result.failure, round) };
    const ungrounded = isUngrounded(answerWords(result.answer), turn.reads + proposals.length);
    return {
      end: done(turn, { answer: result.answer, ungrounded, failed: false, failure: null, rounds: round, lastRound }),
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
    lookedHarder(turn, ordered);
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
  lookedHarder(turn, ordered);
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
