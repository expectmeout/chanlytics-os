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
 * Every verb a page presses is a kind here too (the operator, 15 Oct 2026, decision 0062): Ask proposes what a page
 * does, and a page's press walks the same spec. One file per family beside this one: inbox.ts (reply, steer,
 * thread_verb, whisper, call_hand_over), person.ts (person_mode, deal, note, person_details), people-verbs.ts (answer,
 * the many-person kinds, person_add, person_merge, person_message), workspace.ts (policy, settings, invite),
 * campaigns.ts (broadcast, playbook, playbook_channels, playbook_change, run, message), sequences.ts (the sequence_*
 * kinds), lists.ts (list and its member, change and delete), leads.ts (lead_search, people_search, reach_out_add),
 * lead-work.ts (a lead's stage, mark, later, the bulk and check, the addressee, a list of leads, a search's more, a cold
 * email made and said), reviews.ts (review_reply), follow-up.ts (follow_up); spec.ts is what a spec is.
 */
import { ASK_UNDO_MS, type AskProposal } from "../ask/ask";
import {
  broadcastSpec,
  messageSpec,
  playbookChangeSpec,
  playbookChannelsSpec,
  playbookSpec,
  runSpec,
} from "./campaigns";
import { bookingRequestSpec, callHandOverSpec, replySpec, steerSpec, threadVerbSpec, whisperSpec } from "./inbox";
import {
  leadAddresseeSpec,
  leadLaterSpec,
  leadListSpec,
  leadMarkSpec,
  leadSearchMoreSpec,
  leadStageSpec,
  leadsBulkSpec,
  leadsCheckSpec,
  reachOutMakeSpec,
  reachOutSaidSpec,
} from "./lead-work";
import { leadSearchSpec, peopleSearchSpec, reachOutAddSpec } from "./leads";
import { listChangeSpec, listDeleteSpec, listMemberSpec, listSpec } from "./lists";
import {
  answerManySpec,
  answerSpec,
  noteManySpec,
  personAddSpec,
  personMergeSpec,
  personMessageSpec,
  personModeManySpec,
} from "./people-verbs";
import { followUpSpec } from "./follow-up";
import { reviewReplySpec } from "./reviews";
import { dealSpec, noteSpec, personDetailsSpec, personModeSpec } from "./person";
import {
  sequenceDiscardSpec,
  sequenceDraftSpec,
  sequenceLeaveSpec,
  sequenceSendDecideSpec,
  sequenceSendSaidSpec,
  sequenceMakeSpec,
  sequenceStartSpec,
  sequenceStepRemoveSpec,
  sequenceStepSpec,
  sequenceWordsSpec,
} from "./sequences";
import type { ProposalGate, ProposalSpec, ProposalSpecAboveOperator } from "./spec";
import { inviteSpec, policySpec, settingsSpec } from "./workspace";

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
  people_search: peopleSearchSpec,
  reach_out_add: reachOutAddSpec,
  deal: dealSpec,
  note: noteSpec,
  person_details: personDetailsSpec,
  list: listSpec,
  run: runSpec,
  playbook_channels: playbookChannelsSpec,
  playbook_change: playbookChangeSpec,
  message: messageSpec,
  // The verbs the pages' sheets committed alone until the operator (15 Oct 2026): every verb is a card Ask may propose,
  // in one table, so a page's press and a card make the same call through one walk (the sheets as verbs, 14 Oct 2026).
  answer: answerSpec,
  answer_many: answerManySpec,
  person_mode_many: personModeManySpec,
  note_many: noteManySpec,
  person_add: personAddSpec,
  person_merge: personMergeSpec,
  person_message: personMessageSpec,
  list_member: listMemberSpec,
  list_change: listChangeSpec,
  list_delete: listDeleteSpec,
  // The Sequences page's own (decision 0060, ask-proposals/sequences.ts).
  sequence_step: sequenceStepSpec,
  sequence_step_remove: sequenceStepRemoveSpec,
  sequence_words: sequenceWordsSpec,
  sequence_leave: sequenceLeaveSpec,
  sequence_send_decide: sequenceSendDecideSpec,
  sequence_send_said: sequenceSendSaidSpec,
  sequence_draft: sequenceDraftSpec,
  sequence_make: sequenceMakeSpec,
  sequence_start: sequenceStartSpec,
  sequence_discard: sequenceDiscardSpec,
  // A booking the receptionist asked for, answered on Today, in the Inbox and on the Calendar (decision 0061).
  booking_request: bookingRequestSpec,
  // Live's, Leads' and Reach out's, and a review's (lead-work.ts, inbox.ts, reviews.ts).
  call_hand_over: callHandOverSpec,
  lead_stage: leadStageSpec,
  lead_mark: leadMarkSpec,
  lead_later: leadLaterSpec,
  leads_bulk: leadsBulkSpec,
  leads_check: leadsCheckSpec,
  lead_addressee: leadAddresseeSpec,
  lead_list: leadListSpec,
  lead_search_more: leadSearchMoreSpec,
  reach_out_make: reachOutMakeSpec,
  reach_out_said: reachOutSaidSpec,
  review_reply: reviewReplySpec,
  // Ask's own: a follow-up it comes back to when something happens (follow-up.ts).
  follow_up: followUpSpec,
} satisfies Record<AskProposal["kind"], ProposalSpec>;

/** A verb a sheet or a card commits: every kind is both (the operator, 15 Oct 2026). */
export type VerbKind = keyof typeof PROPOSAL_SPECS;

/** The spec for a verb, or null for a verb no table has. */
export function verbSpec(kind: string): ProposalSpec | null {
  return proposalSpec(kind);
}

/**
 * The kinds whose Approve reaches outside the workspace's own records -- a message to a customer, a post on Google, money
 * spent on a search or an address, a call handed over, something that starts sending on its own -- each pressed on its own
 * in a plan, never among its silent steps (the marketing manager's spec §5.4; the operator, 15 Oct 2026). Every other
 * kind changes only what the workspace keeps (a list, a note, a draft, a setting), and a plan approves those together.
 */
export const ASK_SENDS: ReadonlySet<AskProposal["kind"]> = /* @__PURE__ */ (() =>
  new Set<AskProposal["kind"]>([
    "reply",
    "whisper",
    "broadcast",
    "playbook",
    "run",
    "lead_search",
    "people_search",
    "person_message",
    "sequence_start",
    "call_hand_over",
    "leads_check",
    "lead_addressee",
    "lead_search_more",
    "reach_out_make",
    "review_reply",
  ]))();

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
