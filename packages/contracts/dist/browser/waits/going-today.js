import { addressOf } from "../activity/record-address.js";
import { isReachOutRun } from "../reach-out/reach-out-rules.js";
import { clockTime, zoneDayKey } from "../shared/clock.js";
import { HOUR_MS } from "../shared/time.js";
import { plural } from "../shared/words.js";
import { waitEndsWords } from "./wait-rules.js";
export const GOING_TODAY_WORDS = {
  title: "Going today",
  /** Beside the count: what each row does, and how many past the rows drawn are in Sent. */
  sub: (n, drawn) => [
    n === 1 ? "Goes on its own unless you stop it" : "Each goes on its own unless you stop it",
    n > drawn ? `${n - drawn} more in Sent` : ""
  ].filter(Boolean).join(" \xB7 "),
  stop: "Stop"
};
function goes(kind, atMs, tz) {
  const at = `at ${clockTime(atMs, tz)}`;
  return { at, ends: waitEndsWords(kind, at) };
}
export function goingTodayOf(input) {
  const { tz, nowMs } = input;
  const today = zoneDayKey(nowMs, tz);
  const rows = [];
  for (const r of input.runs) {
    const atMs = r.scheduled_for ? Date.parse(r.scheduled_for) : NaN;
    const soon = atMs - nowMs <= HOUR_MS;
    if (r.state !== "scheduled" || !(atMs > nowMs) || !soon && zoneDayKey(atMs, tz) !== today) continue;
    const reach = isReachOutRun(r.audience);
    const kind = r.playbook_id ? "batch" : "one_off";
    const g = goes(kind === "batch" ? "batch_hold" : "one_off", atMs, tz);
    const people = reach ? plural(r.recipient_count, "business", "businesses") : plural(r.recipient_count, "person", "people");
    const what = reach ? "To leads" : kind === "batch" ? "Campaign" : "Sent once";
    rows.push({
      key: `run-${r.id}`,
      kind,
      name: r.title,
      meta: `${what} \xB7 goes ${g.at}`,
      sentence: `${people}. ${g.ends}.`,
      atMs,
      stop: { kind: "run", id: r.id },
      to: addressOf({ kind: "send", id: r.id })
    });
  }
  return rows.sort((a, b) => a.atMs - b.atMs);
}
