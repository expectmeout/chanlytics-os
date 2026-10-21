/**
 * The verbs the pages press, one spec per kind, and the readings every card and press takes of a spec: which spec a
 * kind has, the gate a card checks before Approve, how long its undo stays true, and where its Open goes.
 *
 * Every page's route loads this (the browser entry), so it holds only the kinds a page presses. The kinds only Ask's
 * cards commit (ask-only.ts) join the lookups by addProposalSpecs: on the server and in the tests from the start
 * (proposals.ts), in the browser once their own entry has loaded (legacy-bridge/verbs, moreSpecs), which Ask's bridge
 * waits for before it hands over a turn or a thread with cards in it. Until then a lookup of one of them finds nothing.
 */
import { ASK_UNDO_MS, type AskProposal } from "../ask/ask";
import type { AskOnlyKind } from "./ask-only";
import { bookingRequestSpec } from "./inbox";
import { factSuggestionSpec } from "./autonomy";
import { reviewReplyStopSpec } from "./reviews";
import { answerStyleSpec } from "./follow-up";
import { listMemberSpec } from "./lists";
import {
  answerManySpec,
  answerSpec,
  noteManySpec,
  personAddSpec,
  personMergeSpec,
  personModeManySpec,
} from "./people-verbs";
import { dealSpec, noteSpec, personModeSpec } from "./person";
import { playbookChangeSpec, playbookRunSpec, runSpec } from "./campaigns";
import {
  leadSearchAimSpec,
  sequenceAddSpec,
  sequenceMoveSpec,
  sequenceDiscardSpec,
  sequenceEndSpec,
  sequenceDraftSpec,
  sequenceLeaveSpec,
  sequenceMakeSpec,
  sequenceNewSpec,
  sequenceSendDecideSpec,
  sequenceSendSaidSpec,
  sequenceStartSpec,
  sequenceStepRemoveSpec,
  sequenceStepSpec,
  sequenceTestSpec,
  sequenceWordsSpec,
} from "./sequences";
import type { ProposalGate, ProposalSpec } from "./spec";
import { settingsSpec } from "./workspace";

/**
 * The verbs a page presses (commitVerb, legacy-bridge/verbs), each a card Ask may propose too. Each keeps its own type,
 * so the kinds above operator are known.
 */
export const PAGE_SPECS = {
  // People's: a person's answers, mode, notes and deal, many at once, added and merged, and a list's members.
  answer: answerSpec,
  answer_many: answerManySpec,
  person_mode: personModeSpec,
  person_mode_many: personModeManySpec,
  note: noteSpec,
  note_many: noteManySpec,
  deal: dealSpec,
  person_add: personAddSpec,
  person_merge: personMergeSpec,
  list_member: listMemberSpec,
  // The Sequences page's own (decision 0060, ask-proposals/sequences.ts), with a campaign's change and a batch's run.
  sequence_step: sequenceStepSpec,
  sequence_step_remove: sequenceStepRemoveSpec,
  sequence_words: sequenceWordsSpec,
  sequence_leave: sequenceLeaveSpec,
  // One road from a lead to a sequence (00459): Add, Move to, and where a search's Add goes.
  sequence_add: sequenceAddSpec,
  sequence_move: sequenceMoveSpec,
  lead_search_aim: leadSearchAimSpec,
  sequence_send_decide: sequenceSendDecideSpec,
  sequence_send_said: sequenceSendSaidSpec,
  sequence_draft: sequenceDraftSpec,
  sequence_make: sequenceMakeSpec,
  sequence_new: sequenceNewSpec,
  sequence_start: sequenceStartSpec,
  sequence_discard: sequenceDiscardSpec,
  sequence_end: sequenceEndSpec,
  // A step's message mailed to the member who pressed Send me a test, and to nobody else.
  sequence_test: sequenceTestSpec,
  playbook_change: playbookChangeSpec,
  run: runSpec,
  // A campaign run now at the member's request: Run now, under a sequence's More.
  playbook_run: playbookRunSpec,
  // A booking the receptionist asked for, answered on Today, in the Inbox and on the Calendar (decision 0061).
  booking_request: bookingRequestSpec,
  // A note suggested from an owner's correction, kept or dismissed on Settings › Autonomy (decision 0063).
  fact_suggestion: factSuggestionSpec,
  // A reply the receptionist holds under a review, stopped before it posts, on Reports' Reviews (decision 0064).
  review_reply_stop: reviewReplyStopSpec,
  // How a member likes Ask's answers, kept by Ask's card or on Settings › Profile (the answer canvas, D).
  answer_style: answerStyleSpec,
  // A setting put in where it is missing: the booking link, from a sequence to leads' step sheet (the lead-to-sequence
  // canvas: "a field in the step sheet, saved to Settings").
  settings: settingsSpec,
} satisfies Record<Exclude<AskProposal["kind"], AskOnlyKind>, ProposalSpec>;

/** A verb a page presses: commitVerb takes no other. */
export type VerbKind = keyof typeof PAGE_SPECS;

/** The kinds only Ask's cards commit, once addProposalSpecs has them. */
const more: Partial<Record<AskProposal["kind"], ProposalSpec>> = {};

/** The spec for a kind, or null for a kind no card has (or one only Ask's cards commit, before its entry has loaded). */
export function proposalSpec(kind: string): ProposalSpec | null {
  if (Object.prototype.hasOwnProperty.call(PAGE_SPECS, kind)) return PAGE_SPECS[kind as keyof typeof PAGE_SPECS];
  return Object.prototype.hasOwnProperty.call(more, kind) ? (more[kind as AskProposal["kind"]] ?? null) : null;
}

/** The spec for a verb a sheet or a card commits: every kind is both (the operator, 15 Oct 2026). */
export function verbSpec(kind: string): ProposalSpec | null {
  return proposalSpec(kind);
}

/**
 * The client gate (data-bits `gate`) a card of this kind checks before Approve; the route re-checks the role. Marked
 * pure, as the repo's other derived tables are: a bare call at the top level is kept by every bundle that inlines
 * contracts (db, core, channels, jobs), and would carry every spec and its words in with it. Ask's own kinds join it
 * as they are added, in place, so a reader holding it (window.PROPOSAL_GATE) sees them.
 */
export const PROPOSAL_GATE = /* @__PURE__ */ (() =>
  Object.fromEntries(Object.entries(PAGE_SPECS).map(([kind, spec]) => [kind, spec.gate])) as Partial<
    Record<AskProposal["kind"], ProposalGate>
  >)();

/** The kinds only Ask's cards commit, into every lookup above: the server's table at once, the browser's once loaded. */
export function addProposalSpecs(specs: Readonly<Record<AskOnlyKind, ProposalSpec>>): void {
  for (const [kind, spec] of Object.entries(specs) as [AskOnlyKind, ProposalSpec][]) {
    more[kind] = spec;
    PROPOSAL_GATE[kind] = spec.gate;
  }
}

/**
 * Where a card's Open goes, or null for the kinds that have none (a reply, a rewrite, a whisper, an invite): its
 * spec's `open`. A lead search's, once approved, is the search the commit made. A kind no card has opens the thread
 * its payload names, as a thread card does; before the kinds only Ask's cards commit are in, a kind not a page's has
 * none.
 */
export function cardOpenRoute(p: Pick<AskProposal, "kind" | "payload" | "outcome">): string | null {
  const card = { payload: p.payload ?? {} };
  const spec = proposalSpec(p.kind) ?? proposalSpec("thread_verb");
  return spec ? spec.open(card, p.outcome ?? null) : null;
}

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
