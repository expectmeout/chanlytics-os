/**
 * The cards Ask proposes, one spec per kind (Ask Rewired, Phase 3, D6).
 *
 * An act tool never acts: it hands the person a card (AskProposal), and Approve commits it through the verb's own
 * route. What each kind does lives in its spec, once: the lowest role that may commit it and the gate the card checks
 * before Approve; the call its commit makes (the route by its key, its params and body), a refusal in words where the
 * tab cannot make it, and the second call a deal's next step makes on the first one's answer; the receipt; and its
 * undo -- the words on the button, how long it stays true, what the commit keeps for it and the call that reverses
 * it. The dashboard's walk (legacy-bridge/ask/commit.ts) makes the calls through the typed client; the act tools read
 * `needs`, the refusal and the undo's words from here; the gate (PROPOSAL_GATE), the undo window (askUndoOpen) and
 * where a card opens (cardOpenRoute, ask-answer.ts) are readings of the specs. Pure: nothing here sends, reads a
 * window or a clock.
 *
 * A spec's `needs` is its commit route's policy role (route-policy.json), and the refusal a member below it hears is
 * the route's rule: a partner's door, like an owner's, says owner (server/with-route.ts requireRole).
 *
 * One file per family beside this one: inbox.ts (reply, steer, thread_verb, whisper), person.ts (person_mode, deal),
 * workspace.ts (policy, settings, invite), campaigns.ts (broadcast, playbook), leads.ts (lead_search); spec.ts is
 * what a spec is.
 */
import { ASK_UNDO_MS, type AskProposal } from "../ask";
import { broadcastSpec, playbookSpec } from "./campaigns";
import { replySpec, steerSpec, threadVerbSpec, whisperSpec } from "./inbox";
import { leadSearchSpec } from "./leads";
import { dealSpec, personModeSpec } from "./person";
import type { ProposalGate, ProposalSpec, ProposalSpecAboveOperator } from "./spec";
import { inviteSpec, policySpec, settingsSpec } from "./workspace";

export { ASK_THREAD_ROUTES } from "./inbox";
export { PROPOSAL_WORDS } from "./spec";
export type {
  ProposalCall,
  ProposalEvent,
  ProposalGate,
  ProposalNeeds,
  ProposalRefusal,
  ProposalSpec,
  ProposalSpecAboveOperator,
  ProposalTab,
  ProposalThen,
  ProposalUndo,
} from "./spec";

/** Every kind's spec. Each keeps its own type, so the kinds above operator are known to say what they do. */
export const PROPOSAL_SPECS = {
  reply: replySpec,
  steer: steerSpec,
  thread_verb: threadVerbSpec,
  person_mode: personModeSpec,
  policy: policySpec,
  settings: settingsSpec,
  whisper: whisperSpec,
  invite: inviteSpec,
  broadcast: broadcastSpec,
  playbook: playbookSpec,
  lead_search: leadSearchSpec,
  deal: dealSpec,
} satisfies Record<AskProposal["kind"], ProposalSpec>;

/** The kinds above operator, whose refusal below `needs` is said in words (person_mode, settings, invite, lead_search). */
export type ProposalKindAboveOperator = {
  [K in keyof typeof PROPOSAL_SPECS]: (typeof PROPOSAL_SPECS)[K] extends ProposalSpecAboveOperator ? K : never;
}[keyof typeof PROPOSAL_SPECS];

/** The spec for a kind, or null for a kind no card has. */
export function proposalSpec(kind: string): ProposalSpec | null {
  return Object.prototype.hasOwnProperty.call(PROPOSAL_SPECS, kind)
    ? PROPOSAL_SPECS[kind as AskProposal["kind"]]
    : null;
}

/**
 * What the model is told when the member's role may not commit this kind: the route's rule, in its words. A partner's
 * door says owner as an owner's does (requireRole): until a workspace can say whether it has a partner, "owner" is
 * what is true of every workspace.
 */
export function proposalBelowNeeds(kind: ProposalKindAboveOperator): string {
  return `only an owner can ${PROPOSAL_SPECS[kind].doing}; say so, and that an owner can ask`;
}

/* ------------------------------------------------------------ the readings */

/**
 * The client gate (data-bits `gate`) a card of this kind checks before Approve; the route re-checks the role. Marked
 * pure, as the repo's other derived tables are: a bare call at the top level is kept by every bundle that inlines
 * contracts (db, core, channels, jobs), and would carry every spec and its words in with it.
 */
export const PROPOSAL_GATE = /* @__PURE__ */ (() =>
  Object.fromEntries(Object.entries(PROPOSAL_SPECS).map(([kind, spec]) => [kind, spec.gate])) as Record<
    AskProposal["kind"],
    ProposalGate
  >)();

/**
 * Whether a committed card's undo is still true to offer: its spec's window, and ten minutes for a kind with none.
 *
 * A reply's undo cancels the send, so it lives exactly as long as the send's own cancel window. A settings undo
 * writes the whole earlier config, so it is safe only while nobody has saved since -- the version the card wrote is
 * still the version loaded. Everything else reverses cleanly for a while, then not. An undo used to be offered
 * forever, and to survive reopening a thread days later.
 */
export function askUndoOpen(
  kind: string,
  undo: Record<string, unknown> | null | undefined,
  atMs: number,
  nowMs: number,
  settingsVersion: number | null,
): boolean {
  if (!undo) return false;
  const lasts = proposalSpec(kind)?.undo?.window ?? "ten_minutes";
  if (lasts === "cancelable") {
    const until = typeof undo.cancelable_until === "string" ? Date.parse(undo.cancelable_until) : NaN;
    return Number.isFinite(until) && nowMs < until;
  }
  if (nowMs - atMs > ASK_UNDO_MS) return false;
  if (lasts === "version") return typeof undo.version_after === "number" && settingsVersion === undo.version_after;
  return true;
}
