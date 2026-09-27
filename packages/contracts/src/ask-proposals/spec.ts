/**
 * What a card's spec is (Ask Rewired, Phase 3, D6), and the few helpers every family of specs shares. The specs
 * themselves are one file per family beside this one; index.ts puts them together and derives the readings.
 */
import type { AskProposal, AskProposalOutcome } from "../ask";
import type { ApiRouteKey } from "../route-keys.generated";

/** The lowest role that may commit a card: its commit route's policy role. A viewer commits nothing. */
export type ProposalNeeds = "operator" | "partner" | "owner";
/** The client gate (data-bits `gate`, ROLE_PERMS) a card checks before Approve; the route re-checks the role. */
export type ProposalGate = "approve" | "autonomy" | "settings" | "team" | "find";

/** A window event, sent once the call that carries it lands: the surfaces a page repaints from. */
export interface ProposalEvent {
  type: string;
  detail?: Record<string, unknown>;
}

/** One request a card makes: the route by its key, its params and body as the route takes them. */
export interface ProposalCall {
  route: ApiRouteKey;
  params?: Record<string, string>;
  body?: unknown;
  /** The reply's: the card's id, so a second press on Approve queues no second message (D8). */
  idempotencyKey?: string;
  /** "behind": answered when the server accepts, the surfaces read again behind it (client/api.ts). */
  refresh?: "behind";
  /** What the window is told once this call lands. */
  events?: ProposalEvent[];
}

/** A call the card cannot make from this tab, in the person's words; nothing is sent. */
export interface ProposalRefusal {
  refused: string;
}

/** What the tab holds that a card reads: the settings Settings loaded (`__SETTINGS`), which a settings card writes over. */
export interface ProposalTab {
  settings: { config?: Record<string, unknown> | null; version?: number } | null;
}

/** How the second call went, for the receipt: the first one stands either way. */
export type ProposalThen = { ok: true } | { ok: false; message: string };

export interface ProposalUndo {
  /** The undo button's words, written onto the card by its builder; null where this card has none. */
  label(p: Pick<AskProposal, "payload">): string | null;
  /**
   * How long it stays true (askUndoOpen): `cancelable` while the send's own cancel window is open; `ten_minutes`
   * for ASK_UNDO_MS; `version` for ASK_UNDO_MS and only while nobody has saved the settings since.
   */
  window: "cancelable" | "ten_minutes" | "version";
  /** What the commit keeps for the undo, from the card, the route's answer and the tab at Approve; null for none. */
  record(p: AskProposal, data: unknown, tab: ProposalTab): Record<string, unknown> | null;
  /** The call that reverses it, from what the commit kept and what the tab holds now. */
  call(record: Record<string, unknown>, tab: ProposalTab): ProposalCall | ProposalRefusal;
  receipt(data: unknown): string;
}

export interface ProposalSpec {
  needs: ProposalNeeds;
  /** What the card does, for the refusal a member below `needs` hears: every kind above operator says it. */
  doing?: string;
  gate: ProposalGate;
  /** The call Approve makes; `tab` is what the tab held when Approve was pressed. */
  commit(p: AskProposal, tab: ProposalTab): ProposalCall | ProposalRefusal;
  /**
   * A second call on the first one's answer, or null for none: a deal's next step names the row the door wrote. A
   * refusal sends nothing and is said on the receipt as the second call's failure; the first call stands.
   */
  then?(p: AskProposal, data: unknown): ProposalCall | ProposalRefusal | null;
  receipt(p: AskProposal, data: unknown, then?: ProposalThen): string;
  undo?: ProposalUndo;
  /** Where the card's Open goes, or null; `outcome` is what became of it. */
  open(p: Pick<AskProposal, "payload">, outcome: AskProposalOutcome | null): string | null;
}

/** A kind above operator: a member below it is refused in words, so its spec says what the card does. */
export interface ProposalSpecAboveOperator extends ProposalSpec {
  needs: "partner" | "owner";
  doing: string;
}

/** The words the walk says where no spec answers. */
export const PROPOSAL_WORDS = {
  cannotApprove: "This card cannot be approved from here.",
  noUndo: "This one has no undo.",
} as const;

/* ------------------------------------------------------------ shared by the families */

/** A payload field as the route's string param: the proposal carries ids as JSON, the route takes them as text. */
export const asText = (v: unknown): string => (v == null ? "" : String(v));
/** A route's answer as a record to read fields from. */
export const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
/** A ledger row id the route answered with, or null when it answered none. */
export const decisionOf = (data: unknown): string | null => {
  const id = rec(data).decision_id;
  return typeof id === "string" && id ? id : null;
};
/** A payload id that names something, or null: a route with a hole in it is no route. */
export const idIn = (pl: Record<string, unknown> | undefined, k: string): string | null =>
  typeof pl?.[k] === "string" && pl[k] ? (pl[k] as string) : null;
export const refuseWith = (words: string): ProposalRefusal => ({ refused: words });
/** A map's own entry, never one its prototype lends ("constructor"). */
export const ownEntry = <T>(m: Partial<Record<string, T>>, k: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(m, k) ? m[k] : undefined;
/** People repaint (the People surface, a person's page) once a person's card lands. */
export const PEOPLE_CHANGED: ProposalEvent = { type: "surface:clients" };
