import { resumeDetailOf } from "../playbooks/lifecycle/lifecycle-tiles.js";
import { LIFECYCLE_WORDS } from "../playbooks/lifecycle/lifecycle-words.js";
import { campaignRunsOn } from "../playbooks/playbook-schedule.js";
export const SEQUENCE_ACT_WORDS = {
  more: (name) => `More for ${name}`,
  /** The head's More where no act stands to carry it as a caret (Ruben, 20 Oct 2026: no three dots): its word. */
  moreWord: "More",
  askAbout: "Ask about it",
  runNow: "Run now",
  runNowTip: "Runs its first step now, as your decision: it goes without waiting for an OK, and outside the sending hours it goes when they open",
  rename: "Rename",
  name: "Name",
  save: "Save",
  cancel: "Cancel",
  resumeAsk: (name) => `Turn ${name} on?`,
  resumeYes: "Yes, turn it on"
};
export function sequenceRunsNow(row, at) {
  const first = row.first;
  if (!first || row.starts !== "moment" && row.starts !== "list" || row.needs.waiting > 0) return false;
  return campaignRunsOn(first, { tz: at.tz, now: new Date(at.nowMs) });
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
