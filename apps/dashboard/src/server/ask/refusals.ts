import "server-only";
import type { MembershipRole } from "@chanlytics/contracts";
import type { DashboardLogEvent } from "@/server/log";
import type { GatewayRefused } from "./gateway";
import { toApiTools } from "./tools";
import { featureRejected } from "./sse";

/**
 * What a turn gives up when the API refuses its request for it, once each and in this order: the replay of the
 * thread's turns as sent (the Phase 5 plan, D12), the page's data blocks (the Phase 2 plan, D14), the tools' examples
 * (the Phase 3 plan, D9), tool search (the operator, D11: every tool is then loaded up front), then the answer's format
 * (D15). The same round is asked again without it; a refusal that names none of them, or one already given up, is the
 * turn's.
 */
type Dropped = "replay" | "context" | "examples" | "search" | "format";

/** The line each drop logs, once a turn: typed as the dashboard's log names, so tsc holds each to that set. */
export const DROP_EVENTS: Record<Dropped, DashboardLogEvent> = {
  replay: "ask_replay_rejected",
  context: "ask_context_rejected",
  examples: "ask_examples_rejected",
  search: "ask_tool_search_rejected",
  format: "ask_format_rejected",
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

/** A refusal of the request for its tools' `input_examples` (D9). */
function examplesRefused(message: string): boolean {
  return /^400\b/.test(message) && /input_examples/.test(message);
}

/** A refusal of the request for its tool search: the search tool, a deferred tool, or a reference to one (D11). */
function searchRefused(message: string): boolean {
  return /^400\b/.test(message) && /tool_search|defer_loading|tool_reference/i.test(message);
}

/**
 * What to give up for this refusal, given what the turn still carries. A second examples refusal, with them already
 * gone, is the turn's -- never the format's, whose predicate would match the "input_schema" the real refusal names. The
 * replay is given up first, and only while the turn still replays (a live turn's round one).
 */
export function dropFor(message: string, still: Record<Dropped, boolean>): Dropped | null {
  if (!message) return null;
  if (still.replay && replayRefused(message)) return "replay";
  if (still.context && blocksRefused(message)) return "context";
  if (examplesRefused(message)) return still.examples ? "examples" : null;
  if (searchRefused(message)) return still.search ? "search" : null;
  return still.format && featureRejected(message) ? "format" : null;
}

/** What a turn offers the API that it can do without: the tools' examples, the tool search and the answer's format. */
export interface Offer {
  examples: boolean;
  search: boolean;
  format: boolean;
}

/** A refused part of the offer let go (dropFor): its flag off, and the tools as the API takes them now. */
export function letGo(
  offer: Offer,
  drop: "examples" | "search" | "format",
  role: MembershipRole,
): ReturnType<typeof toApiTools> {
  offer[drop] = false;
  return toApiTools(role, offer.examples, offer.search);
}

/** What a turn the gateway refused says, in the person's language, by why it was refused. */
export function refusalText(r: GatewayRefused["refusal"], es: boolean): string {
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
        ? "El modelo rechazó la pregunta. Inténtalo de otra forma."
        : "The model refused the question. Try it another way.";
  }
}
