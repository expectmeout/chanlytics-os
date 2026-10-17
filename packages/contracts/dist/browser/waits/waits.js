import { replyWaitsOnYou } from "../conversations/standing.js";
import { runApprovalRefusal } from "../playbooks/playbook-approval.js";
import { RUN_GOING_STATES } from "../broadcasts/broadcasts.js";
export function runWaitsOnYou(run, days) {
  if (runHeldEmails(run) > 0 || runDraftedEmails(run) > 0) return true;
  return run.state === "pending_approval" && runApprovalRefusal(runAsked(run), days) === null;
}
export function runHeldEmails(run) {
  const going = RUN_GOING_STATES.includes(run.state);
  return going && typeof run.held === "number" && run.held > 0 ? run.held : 0;
}
export function runDraftedEmails(run) {
  const going = RUN_GOING_STATES.includes(run.state);
  return going && typeof run.drafted === "number" && run.drafted > 0 ? run.drafted : 0;
}
export function runTooLate(run, days) {
  return run.state === "pending_approval" && runApprovalRefusal(runAsked(run), days) !== null;
}
export function runsThatWait(runs, days) {
  return runs.filter((r) => runWaitsOnYou(r, days));
}
const runAsked = (run) => ({
  playbook_id: run.playbook_id ?? null,
  run_for: run.run_for ?? null,
  audience: run.audience
});
export function threadWait(t, nowMs) {
  if (t.needsYou) return "hold";
  return t.send && replyWaitsOnYou({ endsAtMs: t.send.endsAtMs, held: t.send.held }, nowMs) ? "send" : null;
}
export function threadWaits(input) {
  let holds = input.unreadHolds;
  let sends = 0;
  for (const t of input.threads) {
    const wait = threadWait(t, input.nowMs);
    if (wait === "hold") holds += 1;
    else if (wait === "send") sends += 1;
  }
  return { holds, sends };
}
export function waitsOf(input) {
  return { ...threadWaits(input), runs: runsThatWait(input.runs, input.days).length };
}
export function needsYouCount(waits) {
  return waits.holds + waits.sends + waits.runs;
}
