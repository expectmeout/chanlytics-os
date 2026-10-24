import { addressOf } from "../activity/record-address.js";
import { initialsOf } from "../conversations/thread-contact.js";
import { NOTE_WORDS } from "../notes/person-notes.js";
import { TODAY_STEPS_MAX, todayStepsDue } from "../notes/steps.js";
import { plural } from "../shared/words.js";
const STEPS_DUE_ROUTE = "clients/seg:steps_due";
export function todayStepsSub(n) {
  return `${plural(n, "step")} due`;
}
export function todayStepsFoot(n) {
  return `${todayStepsSub(n)} in People`;
}
export function todaySteps(rows, nowMs, tz, max = TODAY_STEPS_MAX) {
  const due = todayStepsDue(rows ?? [], nowMs, tz, max);
  if (!due.count) return null;
  return {
    items: due.rows.map(({ row, step }) => ({
      personId: row.id,
      name: row.name,
      noteId: step.id,
      words: step.words,
      when: step.day.words,
      due: step.due,
      forWho: step.forWho,
      forUserId: step.forUserId,
      dealId: step.dealId
    })),
    count: due.count,
    to: STEPS_DUE_ROUTE
  };
}
const STEP_ROW = {
  rest: (n) => `${plural(n, "more step")} due`,
  restSentence: "Their next step's day has come, or gone by.",
  restState: [NOTE_WORDS.stepsDue, "in People"],
  open: "Open"
};
function stepRow(s) {
  return {
    id: `q-step-${s.noteId}`,
    kind: "step",
    conversationId: null,
    callId: null,
    person_id: s.personId,
    who: s.name,
    initials: initialsOf(s.name),
    channel: NOTE_WORDS.next,
    when: "",
    sentence: s.words,
    quoted: false,
    status: [s.when, ...s.forWho ? [s.forWho] : []],
    tone: "warn",
    warn: s.due === "past",
    cta: { label: NOTE_WORDS.done, to: addressOf({ kind: "step", personId: s.personId }) },
    also: null,
    step: { person_id: s.personId, note_id: s.noteId, deal_id: s.dealId, for_user_id: s.forUserId },
    waitedMs: Number.NEGATIVE_INFINITY
  };
}
function restRow(count, to) {
  return {
    id: "q-steps-more",
    kind: "steps",
    conversationId: null,
    callId: null,
    person_id: null,
    who: STEP_ROW.rest(count),
    initials: `+${count}`,
    channel: NOTE_WORDS.next,
    when: "",
    sentence: STEP_ROW.restSentence,
    quoted: false,
    status: [...STEP_ROW.restState],
    tone: "warn",
    warn: false,
    cta: { label: STEP_ROW.open, to },
    also: null,
    waitedMs: Number.NEGATIVE_INFINITY
  };
}
export function withSteps(rows, steps) {
  if (!steps) return rows;
  const mine = steps.items.map(stepRow);
  const rest = steps.count - steps.items.length;
  if (rest > 0) mine.push(restRow(rest, steps.to));
  const firstCall = rows.findIndex((r) => r.kind === "call");
  const at = firstCall < 0 ? rows.length : firstCall;
  return [...rows.slice(0, at), ...mine, ...rows.slice(at)];
}
