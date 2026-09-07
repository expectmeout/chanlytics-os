import "server-only";
import {
  ASK_MAX_ROUNDS,
  ASK_TURN_BUDGET_MS,
  citationRoute,
  groundCitations,
  isUngrounded,
  normalizeNavigate,
  parseAskFinish,
  type AskFinish,
  type AskLanguage,
  type AskMessageVM,
  type AskProposal,
  type AskScope,
} from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";
import { GatewayRefused, featureRejected } from "./gateway";
import { FINISH_TOOL, READ_TOOLS, newToolContext, runTool, toolLabel, type ToolContext } from "./tools";
import { ACT_TOOLS, ACT_TOOL_NAMES, buildProposal, proposalLabel } from "./proposals";
import { stableSystem, turnSystem, type WorkspaceFacts } from "./prompt";
import { snapshotFor } from "./snapshot";
import { parseInput, runRound, type RoundBlock } from "./round";

/**
 * One turn of the assistant.
 *
 * The day rides in first (the snapshot), then the model is asked with the
 * read tools, the act tools and the finish tool, and must call one or more
 * each round. Reads run as the person, in parallel, and go back as one
 * message. An act tool never acts: it checks and proposes, and may share a
 * round with the finish call. The finish call is the answer, streamed as it
 * is written; the last allowed round forces it, so a turn always ends in an
 * answer or a stated failure.
 */

/**
 * The model for the turn: choosing a tool and writing sixty words. On the
 * eval set (2026-09-07, 28 cases, all passing either way) Opus 5 answered in
 * a 7.2 s median with a one-round turn at 4.7–8 s; the answer's length, not
 * its difficulty, was the cost. Sonnet 5 writes it faster at the same
 * grounding. The eval set decides if this stays.
 */
export const ASK_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1200;
const MAX_HISTORY = 12;
const HISTORY_CHARS = 1200;
/**
 * Choosing a tool is not writing an answer. The rounds run at low effort:
 * the receptionist's replies run there too and hold on the eval set, and a
 * round is three and a half seconds of a turn. The eval set decides if this
 * stays.
 */
const EFFORT: "low" | "medium" = "low";

export interface TurnEvent {
  t: "trace" | "delta" | "final" | "error";
  text?: string;
  message?: AskMessageVM;
}

export interface TurnInput {
  ctx: RouteContext;
  tenantId: string;
  role: "owner" | "operator" | "viewer";
  facts: WorkspaceFacts;
  timezone: string;
  personLabel: string;
  language: AskLanguage;
  scope: AskScope | null;
  surface: string | null;
  /** Prior turns of this thread, oldest first, as plain text. */
  history: Array<{ role: "user" | "assistant"; text: string }>;
  text: string;
  emit: (ev: TurnEvent) => void;
  now?: Date;
}

export interface TurnResult {
  finish: AskFinish | null;
  answer: string;
  citations: AskMessageVM["citations"];
  navigate: AskMessageVM["navigate"];
  followups: string[];
  language: AskLanguage;
  ungrounded: boolean;
  tools: string[];
  proposals: AskProposal[];
  latencyMs: number;
  failed: boolean;
  /** Why it failed, for the log; the answer text already says it to the person. */
  failure: string | null;
  rounds: number;
}

type Msg = { role: "user" | "assistant"; content: unknown };

function refusalText(r: GatewayRefused["refusal"], es: boolean): string {
  switch (r.kind) {
    case "preview": return es ? "Ask solo responde en el panel de producción." : "Ask only answers on the production dashboard.";
    case "budget": return es ? "Ask usó su presupuesto diario. Vuelve mañana; las páginas siguen funcionando." : "Ask has used its daily budget. Try again tomorrow; the pages still work.";
    case "no_key": return es ? "Ask no está conectado a un modelo todavía." : "Ask is not connected to a model yet.";
    case "unreachable": return es ? "No pude llegar al modelo. Inténtalo de nuevo en un momento." : "I could not reach the model. Try again in a moment.";
    default: return es ? "El modelo rechazó la pregunta. Inténtalo de otra forma." : "The model refused the question. Try it another way.";
  }
}

/**
 * The answer when a round proposed and nothing else: the cards are the
 * answer, and a second round of the model to say so cost more than the
 * proposal did. The model's own prose beside the call is kept when it
 * wrote any; otherwise each card's title and change, and what a card is.
 */
export function proposalsAnswer(ps: ReadonlyArray<Pick<AskProposal, "title" | "summary">>, es: boolean): string {
  const lines = ps.map((p) => (p.summary && p.summary !== p.title ? `${p.title}: ${p.summary}` : p.title).trim());
  const tail = es
    ? (ps.length === 1 ? "Es una tarjeta: apruébala, cámbiala o descártala." : "Son tarjetas: aprueba, cambia o descarta cada una.")
    : (ps.length === 1 ? "It's a card: approve it, change it or dismiss it." : "They're cards: approve, change or dismiss each.");
  return [...lines, tail].join("\n");
}

/** The thread's prior turns, folded so no two neighbours share a role, starting with the person. */
export function foldHistory(history: TurnInput["history"], text: string): Msg[] {
  const messages: Msg[] = [
    ...history.slice(-MAX_HISTORY).map((h) => ({ role: h.role, content: h.text.slice(0, HISTORY_CHARS) })),
    { role: "user", content: text },
  ];
  for (let i = messages.length - 2; i >= 0; i--) {
    if (messages[i].role === messages[i + 1].role) {
      messages[i] = { role: messages[i].role, content: `${messages[i].content}\n${messages[i + 1].content}` };
      messages.splice(i + 1, 1);
    }
  }
  if (messages[0]?.role !== "user") messages.shift();
  return messages;
}

export async function runAskTurn(input: TurnInput): Promise<TurnResult> {
  const t0 = Date.now();
  const now = input.now ?? new Date();
  const es = input.language === "es";
  const tc: ToolContext = newToolContext(input.ctx, input.tenantId, input.role, now);
  const toolsUsed: string[] = [];
  const proposals: AskProposal[] = [];
  let reads = 0;

  // The day, before the model is asked. Its rows enter the read set, so the
  // answer can cite them; a failure here costs the snapshot, never the turn.
  let snapshot = "";
  const tSnap = Date.now();
  try {
    snapshot = await snapshotFor(tc, input.timezone, input.scope);
    reads++;
  } catch (e) {
    console.error("ask_snapshot_failed", JSON.stringify({ error: e instanceof Error ? e.message : String(e), tenant: input.tenantId }));
  }
  const snapshotMs = Date.now() - tSnap;

  // Two cache breakpoints: the stable block for every turn in the workspace,
  // and the snapshot for this turn's later rounds and a quick follow-up. The
  // clock sits between them and is rewritten each turn without touching
  // either cache.
  const system = [
    { type: "text", text: stableSystem(input.facts), cache_control: { type: "ephemeral" } },
    { type: "text", text: turnSystem({ role: input.role, personLabel: input.personLabel, scope: input.scope, surface: input.surface, language: input.language, timezone: input.timezone, closures: input.facts.closures, now }) },
    ...(snapshot ? [{ type: "text", text: snapshot, cache_control: { type: "ephemeral" } }] : []),
  ];
  const messages = foldHistory(input.history, input.text);
  const baseTools = [...READ_TOOLS, ...(input.role === "viewer" ? [] : ACT_TOOLS), FINISH_TOOL];
  let strict = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASK_TURN_BUDGET_MS);

  const done = (partial: Partial<TurnResult> & { answer: string; failed: boolean; failure: string | null; rounds: number }): TurnResult => {
    clearTimeout(timer);
    console.log(JSON.stringify({ level: "info", event: "ask_turn_shape", tenant: input.tenantId, snapshot_ms: snapshotMs, snapshot: !!snapshot, rounds: partial.rounds, tools: toolsUsed }));
    return { finish: null, citations: [], navigate: null, followups: [], language: input.language, ungrounded: false, tools: toolsUsed, proposals, latencyMs: Date.now() - t0, ...partial };
  };

  const propose = async (b: RoundBlock) => {
    toolsUsed.push(b.name);
    input.emit({ t: "trace", text: proposalLabel(b.name) });
    const p = await buildProposal(tc, b.name, parseInput(b.json));
    if (p.proposal) proposals.push(p.proposal);
    return { result: p.result, isError: p.isError };
  };

  const read = async (b: RoundBlock) => {
    toolsUsed.push(b.name);
    const out = await runTool(tc, { name: b.name, input: parseInput(b.json) });
    if (!out.isError) reads++;
    return { result: out.result, isError: out.isError };
  };

  try {
    for (let round = 1; round <= ASK_MAX_ROUNDS; round++) {
      const last = round === ASK_MAX_ROUNDS;
      const tools = baseTools.map((d) => ({ name: d.name, description: d.description, input_schema: d.input_schema, ...(d.strict && strict ? { strict: true } : {}) }));
      const request = { model: ASK_MODEL, max_tokens: MAX_TOKENS, system, messages, tools, tool_choice: last ? { type: "tool", name: "finish" } : { type: "any" }, output_config: { effort: EFFORT } };

      let blocks: RoundBlock[];
      let stopReason: string | null;
      let streamError: string | null;
      try {
        ({ blocks, stopReason, streamError } = await runRound(
          { tenantId: input.tenantId, userId: input.ctx.userId, request, signal: controller.signal },
          (delta) => input.emit({ t: "delta", text: delta }),
        ));
      } catch (e) {
        if (e instanceof GatewayRefused) {
          if (e.refusal.kind === "bad_request" && strict && featureRejected(e.refusal.message)) {
            console.error("ask_strict_rejected", JSON.stringify({ error: e.refusal.message.slice(0, 200) }));
            strict = false;
            round--;
            continue;
          }
          console.error("ask_gateway_refused", JSON.stringify({ kind: e.refusal.kind, tenant: input.tenantId, message: "message" in e.refusal ? String(e.refusal.message).slice(0, 300) : undefined }));
          return done({ answer: refusalText(e.refusal, es), failed: true, failure: e.refusal.kind, rounds: round });
        }
        if (controller.signal.aborted) {
          return done({ answer: es ? "Tardé demasiado en leer. Pregunta algo más concreto." : "That took too long to read. Ask something more specific.", failed: true, failure: "timeout", rounds: round });
        }
        throw e;
      }

      if (streamError && !blocks.length) {
        return done({ answer: es ? "Se cortó la conexión con el modelo. Inténtalo de nuevo." : "The connection to the model dropped. Try again.", failed: true, failure: streamError, rounds: round });
      }
      if (stopReason === "refusal") {
        return done({ answer: es ? "No puedo responder a eso aquí." : "I can't answer that here.", failed: true, failure: "refusal", rounds: round });
      }

      let finish = blocks.find((b) => b.type === "tool_use" && b.name === "finish");
      const calls = blocks.filter((b) => b.type === "tool_use" && b.name !== "finish");
      const prose = blocks.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();

      // A proposal and the answer in one round: the act tools run first (they
      // only check and propose), then the finish call stands. A read beside a
      // finish is different: that answer was written before its read, so the
      // finish is set aside and the model answers next round with the rows.
      if (finish && calls.length && calls.every((b) => ACT_TOOL_NAMES.has(b.name))) {
        for (const b of calls) await propose(b);
        calls.length = 0;
      } else if (finish && calls.length) {
        console.warn("ask_finish_beside_read", JSON.stringify({ tools: calls.map((b) => b.name), tenant: input.tenantId }));
        finish = undefined;
      }

      if (finish) {
        const parsed = parseAskFinish(finish.json || "{}");
        if (!parsed.ok) {
          console.error("ask_finish_unparsed", JSON.stringify({ error: parsed.error, tenant: input.tenantId }));
          return done({ answer: prose || (es ? "No pude dar forma a la respuesta. Pregunta de nuevo." : "I could not shape the answer. Ask again."), failed: !prose, failure: `finish: ${parsed.error}`, rounds: round });
        }
        const f = parsed.value;
        const { kept, dropped } = groundCitations(f.citations, tc.read);
        if (dropped) console.warn("ask_citations_dropped", JSON.stringify({ dropped, tenant: input.tenantId }));
        const navTo = f.navigate ? normalizeNavigate(f.navigate.to, tc.read) : null;
        if (f.navigate && !navTo) console.warn("ask_navigate_dropped", JSON.stringify({ to: f.navigate.to.slice(0, 120), tenant: input.tenantId }));
        return done({
          finish: f,
          answer: f.answer,
          citations: kept.slice(0, 4).map((c) => ({ ...c, to: citationRoute(c) })),
          navigate: f.navigate && navTo ? { ...f.navigate, to: navTo } : null,
          followups: f.followups.slice(0, 2),
          language: f.language === "other" ? input.language : f.language,
          ungrounded: isUngrounded(f.answer, reads + proposals.length),
          failed: false,
          failure: null,
          rounds: round,
        });
      }

      if (!calls.length) {
        // Prose instead of a tool call (tool_choice any should prevent it):
        // taken as the answer, unverified.
        return done({ answer: prose || (es ? "No encontré nada que leer para esa pregunta." : "I found nothing to read for that question."), ungrounded: isUngrounded(prose, reads + proposals.length), failed: !prose, failure: prose ? null : "no_tool_no_text", rounds: round });
      }

      // Reads and proposals, in parallel; every result goes back at once.
      for (const b of calls) input.emit({ t: "trace", text: ACT_TOOL_NAMES.has(b.name) ? proposalLabel(b.name) : toolLabel(b.name) });
      const before = proposals.length;
      const outcomes = await Promise.all(calls.map(async (b) => ({ block: b, out: ACT_TOOL_NAMES.has(b.name) ? await propose(b) : await read(b) })));
      // Proposals alone, every one of them made: the cards are the answer.
      // A refused or failed proposal keeps the round — the model must say why
      // and what the person can do instead.
      if (calls.every((b) => ACT_TOOL_NAMES.has(b.name)) && outcomes.every(({ out }) => !out.isError) && proposals.length > before) {
        const answer = prose || proposalsAnswer(proposals.slice(before), es);
        input.emit({ t: "delta", text: answer });
        return done({ answer, citations: [], navigate: null, followups: [], ungrounded: false, failed: false, failure: null, rounds: round });
      }
      messages.push({ role: "assistant", content: blocks.map((b) => (b.type === "text" ? { type: "text", text: b.text || " " } : { type: "tool_use", id: b.id, name: b.name, input: parseInput(b.json) })) });
      messages.push({ role: "user", content: outcomes.map(({ block, out }) => ({ type: "tool_result", tool_use_id: block.id, content: out.result, is_error: out.isError })) });
      if (Date.now() - t0 > ASK_TURN_BUDGET_MS - 8_000 && !last) {
        // Not enough time for another read: answer with what there is.
        messages[messages.length - 1] = { role: "user", content: [...(messages[messages.length - 1].content as unknown[]), { type: "text", text: "Time is up for reads. Call finish now with what you have." }] };
        round = ASK_MAX_ROUNDS - 1;
      }
    }
    return done({ answer: es ? "No llegué a una respuesta. Inténtalo de nuevo." : "I did not reach an answer. Try again.", failed: true, failure: "rounds_exhausted", rounds: ASK_MAX_ROUNDS });
  } catch (e) {
    console.error("ask_turn_failed", JSON.stringify({ error: e instanceof Error ? e.message : String(e), tenant: input.tenantId }));
    return done({ answer: es ? "Algo falló al responder. Inténtalo de nuevo." : "Something went wrong while answering. Try again.", failed: true, failure: e instanceof Error ? e.message : String(e), rounds: 0 });
  }
}
