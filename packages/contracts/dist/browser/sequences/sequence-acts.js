import { resumeDetailOf } from "../playbooks/lifecycle/lifecycle-tiles.js";
import { LIFECYCLE_WORDS } from "../playbooks/lifecycle/lifecycle-words.js";
import { campaignRunsOn, trialDayWords } from "../playbooks/playbook-schedule.js";
export const SEQUENCE_ACT_WORDS = {
  more: (name) => `More for ${name}`,
  askAbout: "Ask about it",
  runNow: "Run now",
  runNowTip: "Runs its first step now, at your request: it waits for your OK where you approve its batches, and outside the sending hours it goes when they open",
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
  const { name, starts, first } = rec.sequence;
  const step = first && reach ? {
    run_hour: first.run_hour,
    last_run_for: rec.last_run_for ?? null,
    trigger: first.trigger,
    until: first.until,
    candidates: reach.candidates,
    cap_per_run: reach.cap_per_run,
    trial: trialDayWords(first, at.tz, new Date(at.nowMs))
  } : null;
  const detail = starts === "leads" ? W.chain : step ? resumeDetailOf(step, { ...at, paused: reach?.paused === true }) : null;
  return { question: SEQUENCE_ACT_WORDS.resumeAsk(name), detail, yes: SEQUENCE_ACT_WORDS.resumeYes };
}
