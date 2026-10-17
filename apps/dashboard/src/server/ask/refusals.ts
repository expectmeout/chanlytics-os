import "server-only";
import { foldWordsMessages, type MembershipRole } from "@chanlytics/contracts";
import { log, type DashboardLogEvent } from "@/server/log";
import type { GatewayRefusal } from "./gateway";
import { toApiTools } from "./tools";
import { featureRejected } from "./sse";

/**
 * A refusal the turn could not do without, as the person is told it in their language, and logged. A request refused
 * (bad_request) is one we built, or an edge that would not take it: our fault, never the question's, so it is said as
 * ours and logged loudly under its own name (ask_request_refused); the rest are the gateway's (ask_gateway_refused).
 */
export function refusalSaid(r: GatewayRefusal, es: boolean, at: { tenant_id: string; round: number }): string {
  const said = { kind: r.kind, ...at, message: "message" in r ? String(r.message).slice(0, 300) : undefined };
  if (r.kind === "bad_request") log.error("ask_request_refused", said);
  else log.error("ask_gateway_refused", said);
  switch (r.kind) {
    case "preview":
      return es ? "Ask solo responde en el panel de producción." : "Ask only answers on the production dashboard.";
    case "budget":
      return es
        ? "Ask usó su presupuesto diario. Vuelve mañana; las páginas siguen funcionando."
        : "Ask has used its daily budget. Try again tomorrow; the pages still work.";
    case "no_key":
      return es ? "Ask no está conectado a un modelo todavía." : "Ask is not connected to a model yet.";
    case "paused":
      return es
        ? "Ask está apagado mientras este espacio de trabajo está en pausa. Reactívalo en Ajustes › Facturación."
        : "Ask is off while this workspace is paused. Resume it from Settings › Billing.";
    case "unreachable":
      return es
        ? "No pude llegar al modelo. Inténtalo de nuevo en un momento."
        : "I could not reach the model. Try again in a moment.";
    default:
      return es
        ? "Algo falló de nuestro lado, no con tu pregunta. Inténtalo de nuevo."
        : "Something went wrong on our side, not with your question. Try again.";
  }
}

/**
 * What a turn gives up when the API refuses its request for it, once each and in this order: the replay of the
 * thread's turns as sent (the Phase 5 plan, D12), the page's data blocks (the Phase 2 plan, D14), tool search (the
 * operator, D11: every tool is then loaded up front), the answer's format
 * (D15), and the turn's words as the operator's system message (the answer canvas, A3), which an edge from before it
 * refuses and a model without one cannot take: they are said in the question again. The same round is asked again
 * without it; a refusal that names none of them, or one already given up, is the turn's.
 */
type Dropped = "replay" | "context" | "search" | "format" | "words";

/** The line each drop logs, once a turn: typed as the dashboard's log names, so tsc holds each to that set. */
export const DROP_EVENTS: Record<Dropped, DashboardLogEvent> = {
  replay: "ask_replay_rejected",
  context: "ask_context_rejected",
  search: "ask_tool_search_rejected",
  format: "ask_format_rejected",
  words: "ask_words_rejected",
};

/**
 * A refusal of a replayed thinking block (D12): its signature invalid, or bound to a different conversation -- the
 * API decides it before any output, so the round is asked again with the words instead.
 */
function replayRefused(message: string): boolean {
  return /^400\b/.test(message) && /signature|bound to a different conversation/i.test(message);
}

/** A refusal of the request for its search_result blocks, or their cache marks (D14). */
function blocksRefused(message: string): boolean {
  return /^400\b/.test(message) && /search_result|citation|cache_control/i.test(message);
}

/**
 * A refusal of the turn's words as a system message: the edge's before it took them (its own words, "a system message
 * carries an effort alone"), or the API's for a model that takes none.
 */
function wordsRefused(message: string): boolean {
  return /a system message carries an effort alone|role 'system' is not supported/i.test(message);
}

/** A refusal of the request for its tool search: the search tool, a deferred tool, or a reference to one (D11). */
function searchRefused(message: string): boolean {
  return /^400\b/.test(message) && /tool_search|defer_loading|tool_reference/i.test(message);
}

/**
 * What to give up for this refusal, given what the turn still carries. The replay is given up first, and only while
 * the turn still replays (a live turn's round one).
 */
export function dropFor(message: string, still: Record<Dropped, boolean>): Dropped | null {
  if (!message) return null;
  if (wordsRefused(message)) return still.words ? "words" : null;
  if (still.replay && replayRefused(message)) return "replay";
  if (still.context && blocksRefused(message)) return "context";
  if (searchRefused(message)) return still.search ? "search" : null;
  return still.format && featureRejected(message) ? "format" : null;
}

/**
 * What a turn offers the API that it can do without: the tool search, the answer's format and its words as the
 * operator's system message; and the answer tool (ASK_ANSWER_TOOL), which is never let go, so the tools it rebuilds
 * keep it. The tools' examples are never sent (the answer canvas, A4, 17 Oct 2026: the core cases did as well without
 * them, a tenth cheaper a turn).
 */
export interface Offer {
  search: boolean;
  format: boolean;
  words: boolean;
  readonly answer: boolean;
}

/** The tools as the API takes them (registry.ts). */
type Tools = ReturnType<typeof toApiTools>;

/**
 * A refused part of the offer let go (dropFor): its flag off, and the request as the API takes it now: for a tool's
 * part, the tools rebuilt; for the words, the messages with each said in the question again (contracts
 * foldWordsMessages), where the edge or the model takes no system message of them.
 */
export function letGo<M>(
  offer: Offer,
  drop: "search" | "format" | "words",
  role: MembershipRole,
  now: { tools: Tools; messages: M[] },
): { tools: Tools; messages: M[] } {
  offer[drop] = false;
  if (drop === "words")
    return { tools: now.tools, messages: foldWordsMessages({ messages: now.messages }).messages as M[] };
  return { tools: toApiTools(role, false, offer.search, offer.answer), messages: now.messages };
}
