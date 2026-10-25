import { resumeDetailOf } from "../playbooks/lifecycle/lifecycle-tiles.js";
import { LIFECYCLE_WORDS } from "../playbooks/lifecycle/lifecycle-words.js";
import { campaignRunsOn } from "../playbooks/playbook-schedule.js";
import { leadDraftDockOf } from "./sequence-lead-build.js";
export const SEQUENCE_ACT_WORDS = {
  more: (name) => `More for ${name}`,
  /** The head's More where no act stands to carry it as a caret (Ruben, 20 Oct 2026: no three dots): its word. */
  moreWord: "More",
  askAbout: "Ask about it",
  runNow: "Run now",
  runNowTip: "Runs its first step now, as your decision: it goes without waiting for an OK, and outside the sending hours it goes when they open",
  rename: "Rename",
  /** A one-off that went, sent again: New's Send once, filled with what it sent (its message, who it went to, its values). */
  sendAgain: "Send it again",
  sendAgainTip: "A new one-off, filled with what this one sent: its message, who it went to and its values",
  name: "Name",
  save: "Save",
  cancel: "Cancel",
  resumeAsk: (name) => `Turn ${name} on?`,
  resumeYes: "Yes, turn it on"
};
export const SEQUENCE_ACTS = [
  "start",
  "pause",
  "turn_on",
  "end",
  "discard",
  "run_now",
  "rename",
  "cancel_send",
  "send_again"
];
export const SEQUENCE_ACT_REASONS = [
  "one_off",
  "not_a_one_off",
  "to_leads",
  "ended",
  "not_a_draft",
  "email_to_write",
  "not_on",
  "not_paused",
  "never_ran",
  "ran",
  "wrote",
  "unread",
  "batch_waiting",
  "not_today",
  "not_scheduled",
  "not_sent"
];
export const SEQUENCE_ACT_WHY = {
  one_off: "A one-off goes once, on its day.",
  not_a_one_off: "Only a one-off is cancelled or sent again.",
  to_leads: "A sequence to leads goes on its own days: it is paused, never ended or run by hand.",
  ended: "It has ended.",
  not_a_draft: "It has been on already.",
  email_to_write: "An email of it is still to write.",
  not_on: "It is not on.",
  not_paused: "It is not paused.",
  never_ran: "It never ran, so nothing of it would be kept.",
  ran: "It has run, and what it sent stays in its History.",
  wrote: "It has written to leads, and what it sent stays.",
  unread: "What it has sent could not be read just now.",
  batch_waiting: "A batch of it waits for your OK.",
  not_today: "It runs nothing today.",
  not_scheduled: "It is not waiting for its day any more.",
  not_sent: "It has not gone yet."
};
const OK = { ok: true };
const no = (because, instead) => instead ? { ok: false, because, instead } : { ok: false, because };
function runsToday(row, at) {
  return !!row.first && campaignRunsOn(row.first, { tz: at.tz, now: new Date(at.nowMs) });
}
export function sequenceActsOf(rec, at) {
  const row = rec.sequence;
  const draft = row.state === "draft";
  if (row.starts === "date")
    return {
      start: no("one_off"),
      pause: no("one_off"),
      turn_on: no("one_off"),
      end: no("one_off"),
      discard: draft && row.once ? OK : no("one_off"),
      run_now: no("one_off"),
      rename: no("one_off"),
      cancel_send: row.date?.state === "scheduled" ? OK : no("not_scheduled"),
      send_again: row.last ? OK : no("not_sent")
    };
  const leads = row.starts === "leads";
  const notOnce = no("not_a_one_off");
  if (row.state === "ended") {
    const ended = no("ended");
    return {
      start: ended,
      pause: ended,
      turn_on: ended,
      end: ended,
      discard: ended,
      run_now: ended,
      rename: ended,
      cancel_send: notOnce,
      send_again: notOnce
    };
  }
  const ran = draft ? false : rec.ran;
  const wrote = draft ? false : rec.wrote;
  const discard = leads ? wrote === void 0 ? no("unread") : wrote ? no("wrote", "pause") : OK : ran === void 0 ? no("unread") : ran ? no("ran", "end") : OK;
  return {
    start: !draft ? no("not_a_draft", row.state === "paused" ? "turn_on" : void 0) : leadDraftDockOf(row, rec.chain) ? no("email_to_write") : OK,
    pause: row.state === "on" ? OK : no("not_on"),
    turn_on: row.state === "paused" ? OK : no("not_paused", draft ? "start" : void 0),
    // One that never ran goes whole either way (its first step's trigger): it is offered as Discard, not End.
    end: leads ? no("to_leads", "pause") : ran === false ? no("never_ran", "discard") : OK,
    discard,
    run_now: leads ? no("to_leads") : row.needs.waiting > 0 ? no("batch_waiting") : runsToday(row, at) ? OK : no("not_today"),
    rename: OK,
    cancel_send: notOnce,
    send_again: notOnce
  };
}
export function sequenceResumeAsk(rec, reach, at) {
  const W = LIFECYCLE_WORDS.ledger.resume;
  const { name, starts, first, mode } = rec.sequence;
  const step = first && reach ? {
    run_hour: first.run_hour,
    last_run_for: rec.last_run_for ?? null,
    trigger: first.trigger,
    until: first.until,
    candidates: reach.candidates,
    cap_per_run: reach.cap_per_run,
    mode,
    words_ok_at: first.words_ok_at
  } : null;
  const detail = starts === "leads" ? W.chain : step ? resumeDetailOf(step, { ...at, paused: reach?.paused === true }) : null;
  return { question: SEQUENCE_ACT_WORDS.resumeAsk(name), detail, yes: SEQUENCE_ACT_WORDS.resumeYes };
}
