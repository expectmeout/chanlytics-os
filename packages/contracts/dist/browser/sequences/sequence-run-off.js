import { addressOf } from "../activity/record-address.js";
import { clockDate } from "../shared/clock.js";
const RUN_OFF_REASONS = [
  "no_calendar",
  "no_list",
  "list_uncounted",
  "template_not_approved",
  "number_flagged",
  "never",
  "ended"
];
const isRunOffReason = (why) => RUN_OFF_REASONS.includes(why);
const RUN_OFF_WORDS = {
  no_calendar: { said: "no calendar is connected", act: "Connect", mends: "door" },
  no_list: { said: "its list is gone", act: null, mends: null },
  list_uncounted: { said: "its list couldn\u2019t be counted", act: null, mends: null },
  template_not_approved: { said: "WhatsApp hasn\u2019t approved its message", act: "Open it", mends: "door" },
  number_flagged: { said: "WhatsApp has limited your number", act: "Channels", mends: "door" },
  never: { said: "this kind of message is set to Never", act: "Who approves", mends: "autonomy" },
  ended: { said: "its last day has passed", act: "End it", mends: "end" }
};
export function sequenceRunOff(row, lastRun, clock) {
  const why = lastRun.off;
  if (row.state !== "on" || row.starts === "leads" || row.starts === "date" || !why || !isRunOffReason(why))
    return null;
  const w = RUN_OFF_WORDS[why];
  const day = lastRun.for ? clockDate(Date.parse(`${lastRun.for}T12:00:00Z`), clock.tz, clock.nowMs) : null;
  const line = why === "ended" ? "Its last day has passed" : "Its last run did nothing";
  const fact = why === "ended" ? "It sends nothing more" : `${w.said.charAt(0).toUpperCase()}${w.said.slice(1)}`;
  const to = w.mends !== "door" ? null : why === "template_not_approved" && row.first?.template_name ? addressOf({ kind: "template", name: row.first.template_name }) : addressOf({ kind: "channel" });
  return {
    reason: why,
    words: why === "ended" ? "Its last day has passed: it sends nothing more" : `Its last run${day ? ` (${day})` : ""} did nothing: ${w.said}`,
    line,
    fact,
    act: w.act,
    mends: w.mends,
    to
  };
}
