import { ASK_UNDO_MS } from "../ask/ask.js";
import { bookingRequestSpec } from "./inbox.js";
import { factSuggestionSpec } from "./autonomy.js";
import { answerStyleSpec } from "./follow-up.js";
import { listMemberSpec } from "./lists.js";
import {
  answerManySpec,
  answerSpec,
  noteManySpec,
  personAddSpec,
  personMergeSpec,
  personModeManySpec
} from "./people-verbs.js";
import { dealSpec, noteSpec, personModeSpec } from "./person.js";
import { playbookChangeSpec, playbookRunSpec, runSpec } from "./campaigns.js";
import {
  sequenceDiscardSpec,
  sequenceDraftSpec,
  sequenceLeaveSpec,
  sequenceMakeSpec,
  sequenceSendDecideSpec,
  sequenceSendSaidSpec,
  sequenceStartSpec,
  sequenceStepRemoveSpec,
  sequenceStepSpec,
  sequenceTestSpec,
  sequenceWordsSpec
} from "./sequences.js";
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
  sequence_send_decide: sequenceSendDecideSpec,
  sequence_send_said: sequenceSendSaidSpec,
  sequence_draft: sequenceDraftSpec,
  sequence_make: sequenceMakeSpec,
  sequence_start: sequenceStartSpec,
  sequence_discard: sequenceDiscardSpec,
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
  // How a member likes Ask's answers, kept by Ask's card or on Settings › Profile (the answer canvas, D).
  answer_style: answerStyleSpec
};
const more = {};
export function proposalSpec(kind) {
  if (Object.prototype.hasOwnProperty.call(PAGE_SPECS, kind)) return PAGE_SPECS[kind];
  return Object.prototype.hasOwnProperty.call(more, kind) ? more[kind] ?? null : null;
}
export function verbSpec(kind) {
  return proposalSpec(kind);
}
export const PROPOSAL_GATE = /* @__PURE__ */ (() => Object.fromEntries(Object.entries(PAGE_SPECS).map(([kind, spec]) => [kind, spec.gate])))();
export function addProposalSpecs(specs) {
  for (const [kind, spec] of Object.entries(specs)) {
    more[kind] = spec;
    PROPOSAL_GATE[kind] = spec.gate;
  }
}
export function cardOpenRoute(p) {
  const card = { payload: p.payload ?? {} };
  const spec = proposalSpec(p.kind) ?? proposalSpec("thread_verb");
  return spec ? spec.open(card, p.outcome ?? null) : null;
}
export function askUndoOpen(kind, undo, atMs, nowMs, settingsVersion) {
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
