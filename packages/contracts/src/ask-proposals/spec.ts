/**
 * What a card's spec is (Ask Rewired, Phase 3, D6), and the few helpers every family of specs shares. The specs
 * themselves are one file per family beside this one; index.ts puts them together and derives the readings.
 */
import type { AskProposal, AskProposalOutcome } from "../ask/ask";
import type { ApiRouteKey } from "../route-keys.generated";

/**
 * What a spec reads of what it commits: a card of Ask's, or the same act pressed on a sheet (the dashboard's
 * legacy-bridge/verbs), which is a card with no plan and no summary of its own (the sheets as verbs, 14 Oct 2026).
 */
export type VerbCard = Pick<AskProposal, "id" | "payload" | "step" | "summary" | "plan"> & { kind: string };

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
  /**
   * An undo's call whose row may already be gone (deleted by an earlier press of Undo whose later call was refused, or by
   * hand): its route's 404 counts as done, since what it undoes is not there, and the walk goes on. A row-scoped write
   * reads its row before its key (server/route.ts), so a pressed-again delete is never answered from the key.
   */
  goneIsDone?: true;
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
  record(p: VerbCard, data: unknown, tab: ProposalTab): Record<string, unknown> | null;
  /**
   * The call that reverses it, from what the commit kept and what the tab holds now; or the calls, made in order and
   * stopping at the first refused, where what the commit made is several rows each with its own door (a message's
   * versions).
   */
  call(record: Record<string, unknown>, tab: ProposalTab): ProposalCall | readonly ProposalCall[] | ProposalRefusal;
  /** What the undo did: from the last call's answer, and what the commit kept. */
  receipt(data: unknown, record: Record<string, unknown>): string;
  /**
   * What an undo of several calls says when one after the first is refused: what the `landed` calls before it did, then
   * the refusal, so a person is never told only of the refusal after part of it went. Absent, the refusal alone.
   */
  partial?(record: Record<string, unknown>, landed: number, refused: string): string;
}

export interface ProposalSpec {
  needs: ProposalNeeds;
  /** What the card does, for the refusal a member below `needs` hears: every kind above operator says it. */
  doing?: string;
  gate: ProposalGate;
  /** The call Approve makes; `tab` is what the tab held when Approve was pressed. */
  commit(p: VerbCard, tab: ProposalTab): ProposalCall | ProposalRefusal;
  /**
   * A second call on the first one's answer, or null for none: a deal's next step names the row the door wrote. A
   * refusal sends nothing and is said on the receipt as the second call's failure; the first call stands.
   */
  then?(p: VerbCard, data: unknown): ProposalCall | ProposalRefusal | null;
  receipt(p: VerbCard, data: unknown, then?: ProposalThen): string;
  /**
   * The id of what the commit made, from the route's answer, that a later step of a plan names by its token
   * (`@step:n`, contracts resolveSteps): a message's version, which a send names the message by. Absent, or null, where
   * the card makes nothing a step names.
   */
  made?(p: VerbCard, data: unknown): string | null;
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
  /** A card past ASK_CARD_FRESH_MS (askCardLapsed): nothing is sent, and asking again makes it from what is true now. */
  lapsed:
    "This card is more than a day old, and what it would change may have moved since. Ask again and it is made from how things stand now.",
  /** A plan's card past its week (askCardLapsed): the same, in the plan's words. */
  planLapsed:
    "This plan is more than a week old, and what it would change may have moved since. Ask again and it is made from how things stand now.",
  /** A plan's card naming a step that was undone: what that step made is gone, so nothing is sent to it. */
  planUndone:
    "A step this one builds on was undone, so what it would use is gone and nothing is sent. Ask again and the plan is made from how things stand now.",
  /** A plan's card naming a step that has made nothing yet: that step is approved first. */
  waitsForStep: (n: number): string => `This waits for step ${n}: approve step ${n} first, then this one.`,
  /**
   * A plan's card naming a step that was approved and made nothing it can use (a message whose every version was
   * refused): waiting would never help, so the plan is asked for again.
   */
  stepMadeNothing: (n: number): string =>
    `Step ${n} made nothing this one can use, so nothing is sent. Ask again and the plan is made from how things stand now.`,
  /** A plan's silent steps, stopped at step n by its refusal (`why`, in the refusal's own words): nothing after it was done. */
  planStopped: (n: number, why: string): string =>
    `Stopped at step ${n}: ${/[.!?…]$/.test(why.trim()) ? why.trim() : `${why.trim()}.`} The steps after it were not done.`,
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
/**
 * What a field held when the commit's route wrote it (its answer's `was`), or undefined when the route answered none
 * for that field. An undo puts back what was there at the commit, never what the card read when it was proposed: a
 * teammate's edit between the two was overwritten by an undo of a card that never saw it. Undefined is an older
 * route's answer, and the card's own reading stands in for it.
 */
export const wasIn = (data: unknown, k: string): unknown => {
  const was = rec(rec(data).was);
  return Object.prototype.hasOwnProperty.call(was, k) ? was[k] : undefined;
};
/** A payload id that names something, or null: a route with a hole in it is no route. */
export const idIn = (pl: Record<string, unknown> | undefined, k: string): string | null =>
  typeof pl?.[k] === "string" && pl[k] ? (pl[k] as string) : null;
export const refuseWith = (words: string): ProposalRefusal => ({ refused: words });
/** A map's own entry, never one its prototype lends ("constructor"). */
export const ownEntry = <T>(m: Partial<Record<string, T>>, k: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(m, k) ? m[k] : undefined;
/**
 * People repaint (the People surface, a person's page) once a person's card lands. The one event a card says (0047): a note's
 * card said `note:saved` too, which only the person's page and the Pipeline's peek heard and now follow this one. For a call
 * answered "behind" it is also what repaints the person's page before People's read, which follows it, has landed.
 */
export const PEOPLE_CHANGED: ProposalEvent = { type: "surface:clients" };
