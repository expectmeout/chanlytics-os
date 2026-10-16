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
 * where a card opens (cardOpenRoute) are readings of the specs, in page-specs.ts. Pure: nothing here sends, reads a
 * window or a clock.
 *
 * Two halves, so a page carries only what a page presses: page-specs.ts, the verbs the pages press, in the browser
 * entry; ask-only.ts, the kinds only Ask's cards commit, its own entry the browser loads when Ask is installed. This
 * table is both, the server's and the tests' (the browser entry leaves it out: PAGE_ONLY).
 *
 * A spec's `needs` is its commit route's policy role (route-policy.json), and the refusal a member below it hears is
 * the route's rule: a partner's door, like an owner's, says owner (server/with-route.ts requireRole).
 *
 * Every verb a page presses is a kind here too (the operator, 15 Oct 2026, decision 0062): Ask proposes what a page
 * does, and a page's press walks the same spec. One file per family beside this one: inbox.ts (reply, steer,
 * thread_verb, whisper, call_hand_over), person.ts (person_mode, deal, note, person_details), people-verbs.ts (answer,
 * the many-person kinds, person_add, person_merge, person_message), workspace.ts (policy, settings, invite),
 * campaigns.ts (broadcast, playbook, playbook_channels, playbook_change, run, message), sequences.ts (the sequence_*
 * kinds), lists.ts (list and its member, change and delete), leads.ts (lead_search, people_search, reach_out_add),
 * lead-work.ts (a lead's stage, mark, later, the bulk and check, the addressee, a list of leads, a search's more, a cold
 * email made and said), reviews.ts (review_reply), follow-up.ts (follow_up); spec.ts is what a spec is.
 */
import type { AskProposal } from "../ask/ask";
import { ASK_ONLY_SPECS } from "./ask-only";
import { PAGE_SPECS, addProposalSpecs } from "./page-specs";
import type { ProposalSpec, ProposalSpecAboveOperator } from "./spec";

/**
 * Every kind's spec. Each keeps its own type, so the kinds above operator are known to say what they do. Built, the
 * kinds only Ask's cards commit join page-specs' lookups, so proposalSpec, cardOpenRoute and the gate read every kind
 * wherever this table is (the server, the tests). Marked pure, as PROPOSAL_GATE is: a bundle that inlines contracts
 * and reads no spec keeps neither.
 */
export const PROPOSAL_SPECS = /* @__PURE__ */ (() => {
  addProposalSpecs(ASK_ONLY_SPECS);
  return { ...PAGE_SPECS, ...ASK_ONLY_SPECS } satisfies Record<AskProposal["kind"], ProposalSpec>;
})();

/** The kinds a plan presses on their own, as the server names them: spec.ts holds them, beside a plan's count. */
export { ASK_SENDS } from "./spec";

/** The kinds above operator, whose refusal below `needs` is said in words (person_mode, settings, invite, lead_search). */
export type ProposalKindAboveOperator = {
  [K in keyof typeof PROPOSAL_SPECS]: (typeof PROPOSAL_SPECS)[K] extends ProposalSpecAboveOperator ? K : never;
}[keyof typeof PROPOSAL_SPECS];

/**
 * What the model is told when the member's role may not commit this kind, by the role the kind needs: a partner's
 * card names the owner and the workspace's partner (the lead search's words since #1159, decision 0012); an owner's
 * names the owner alone. One derivation, for every kind above operator.
 */
export function proposalBelowNeeds(kind: ProposalKindAboveOperator): string {
  const { needs, doing } = PROPOSAL_SPECS[kind];
  return needs === "partner"
    ? `only an owner or the workspace's partner can ${doing}; say so, and that one of them can ask`
    : `only an owner can ${doing}; say so, and that an owner can ask`;
}
