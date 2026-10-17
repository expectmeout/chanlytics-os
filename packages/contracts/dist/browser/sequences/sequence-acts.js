import { resumeDetailOf, workspacePausedOf } from "../playbooks/lifecycle/lifecycle-tiles.js";
import { LIFECYCLE_WORDS } from "../playbooks/lifecycle/lifecycle-words.js";
import { campaignRunsOn } from "../playbooks/playbook-schedule.js";
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
  return campaignRunsOn(first, { tz: at.tz, now: new Date(at.nowMs), dealsOn: true });
}
export function sequenceResumeAsk(row, playbooks, at) {
  const W = LIFECYCLE_WORDS.ledger.resume;
  const id = row.first?.id;
  const first = id ? playbooks?.rows.find((p) => p.id === id) : void 0;
  const paused = workspacePausedOf({ playbooks: playbooks ?? void 0, broadcasts: void 0 });
  const detail = row.starts === "leads" ? W.chain : first ? resumeDetailOf(first, { ...at, paused }) : null;
  return { question: SEQUENCE_ACT_WORDS.resumeAsk(row.name), detail, yes: SEQUENCE_ACT_WORDS.resumeYes };
}
