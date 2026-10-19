import { joinWords, plural } from "../shared/words.js";
import { RUN_WAITING_WORDS } from "../shell/campaign-rooms.js";
import { toSendAllOf, toSendRunsOf } from "../reach-out/reach-out-approval.js";
import { runHeldEmails } from "./waits.js";
function toSendOf(waiting, open) {
  const folded = toSendRunsOf(waiting);
  if (folded || !open) return folded;
  const all = toSendAllOf(waiting.filter((r) => runHeldEmails(r) === 0));
  return all ? { runs: all.runs, count: all.count, from: all.from } : null;
}
export function waitRowsOf(waiting, late = [], toSendOpen = false) {
  const toSend = toSendOf(waiting, toSendOpen);
  const rest = waiting.filter((r) => !toSend || !toSend.runs.includes(r));
  const asks = rest.filter((r) => r.state === "pending_approval");
  const folded = asks.length > 1 ? asks : [];
  const rows = toSend ? [{ kind: "to_send", ...toSend }] : [];
  for (const r of rest) {
    if (!folded.includes(r)) rows.push({ kind: "run", run: r, late: false });
    else if (r === folded[0]) rows.push({ kind: "approvals", runs: folded });
  }
  for (const r of late) rows.push({ kind: "run", run: r, late: true });
  return rows;
}
const approvalsSentence = (names) => `${joinWords(names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} more`] : names)}. Each one you answer opens the next.`;
export const WAIT_ROW_WORDS = {
  approvals: {
    name: (n) => `${plural(n, "run waits", "runs wait")} for your OK`,
    meta: "Campaigns \xB7 ready",
    sentence: approvalsSentence,
    status: [RUN_WAITING_WORDS],
    open: "Open",
    /** Today's brief, saying the folded row once (contracts todayBriefWords): "4 runs wait for your OK: …". */
    brief: (names) => ({
      label: plural(names.length, "run", "runs"),
      says: names.length === 1 ? "waits for your OK" : "wait for your OK",
      sentence: approvalsSentence(names)
    })
  }
};
