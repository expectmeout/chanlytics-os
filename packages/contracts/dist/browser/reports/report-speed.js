import { durationWords } from "../shared/clock.js";
const REPLY_BUCKETS = [
  { id: "lt15", label: "under 15s", max: 14 },
  { id: "lt60", label: "15s \u2013 1m", max: 60 },
  { id: "lt300", label: "1 \u2013 5m", max: 300 },
  { id: "lt1800", label: "5 \u2013 30m", max: 1800 },
  { id: "gte1800", label: "over 30m", max: Infinity }
];
const LATER_BUCKETS = [
  { id: "lt60", label: "up to 1m later", max: 60 },
  { id: "lt300", label: "1 \u2013 5m later", max: 300 },
  { id: "gte300", label: "over 5m later", max: Infinity }
];
const HOLD_SLACK_S = 10;
const holdWords = (s) => s < 60 ? `${s}-second` : s % 60 === 0 && s < 3600 ? `${s / 60}-minute` : durationWords(s);
const heldSeconds = (r) => r.hold !== void 0 && r.hold > 0 ? r.hold : 0;
function classOf(r) {
  const hold = heldSeconds(r);
  if (!hold) return { kind: "unheld" };
  const past = r.s - hold;
  return past > HOLD_SLACK_S ? { kind: "later", past } : { kind: "atEnd" };
}
function classified(replies) {
  const rs = (replies ?? []).filter((r) => Number.isFinite(r.s));
  if (!rs.some((r) => r.hold !== void 0)) return null;
  const all = rs.map((r) => ({ hold: r.hold ?? 0, c: classOf(r) }));
  return all.some((x) => x.c.kind !== "unheld") ? all : null;
}
const countOf = (all, kind) => all.filter((x) => x.c.kind === kind).length;
const pastOf = (all) => all.flatMap((x) => x.c.kind === "later" ? [x.c.past] : []);
export function holdOf(replies) {
  const all = classified(replies);
  if (!all) return null;
  const counts = /* @__PURE__ */ new Map();
  for (const x of all) if (x.c.kind !== "unheld") counts.set(x.hold, (counts.get(x.hold) ?? 0) + 1);
  const [seconds] = [...counts].reduce((a, b) => b[1] > a[1] || b[1] === a[1] && b[0] < a[0] ? b : a);
  const past = pastOf(all);
  return {
    seconds,
    label: holdWords(seconds),
    atEnd: countOf(all, "atEnd"),
    unheld: countOf(all, "unheld"),
    later: past.length,
    laterMost: past.length ? Math.max(...past) : null
  };
}
function spanCounts(spans, seconds) {
  const rounded = seconds.map(Math.round);
  const rows = [];
  let lo = -Infinity;
  for (const { id, label, max } of spans) {
    rows.push([id, label, rounded.filter((s) => s > lo && s <= max).length]);
    lo = max;
  }
  return rows;
}
export function holdBuckets(replies) {
  const all = classified(replies);
  if (!all) return null;
  return [
    ["unheld", "with no hold", countOf(all, "unheld")],
    ["atEnd", "as the hold ended", countOf(all, "atEnd")],
    ...spanCounts(LATER_BUCKETS, pastOf(all))
  ];
}
export const absoluteBuckets = (sortedReply) => spanCounts(REPLY_BUCKETS, sortedReply);
export const replyHoldDtoOf = (hold) => hold ? { label: hold.label, at_end: hold.atEnd, later: hold.later, unheld: hold.unheld } : null;
const repliesSeen = (hold) => hold.unheld + hold.atEnd + hold.later;
const waitedHold = (hold) => (hold.atEnd + hold.later) * 2 > repliesSeen(hold);
const endedWithHold = (hold) => hold.atEnd >= hold.later;
const againstHold = (hold) => endedWithHold(hold) ? `as your ${hold.label} hold ended` : `later than your ${hold.label} hold`;
const heldCount = (hold) => endedWithHold(hold) ? hold.atEnd : hold.later;
export function heroSpeed(replies, medianLabel, hold) {
  if (!replies) return "";
  if (!hold || !waitedHold(hold)) return ` Half of its replies went out within ${medianLabel}.`;
  return ` ${heldCount(hold)} of ${repliesSeen(hold)} went out ${againstHold(hold)}.`;
}
export function receptionistSpeed(hold) {
  return hold && waitedHold(hold) ? `, ${heldCount(hold)} ${againstHold(hold)}` : "";
}
const REPLY_DOTS_MOST = 500;
export function replyDotsOf(replies, most = REPLY_DOTS_MOST) {
  const dots = (replies ?? []).filter((r) => Number.isFinite(r.s)).map((r) => ({
    day: r.day,
    past: Math.round(Math.max(0, r.s - heldSeconds(r))),
    held: heldSeconds(r) > 0
  }));
  return dots.slice(Math.max(0, dots.length - most));
}
export function replySpeedOf(median, hold) {
  if (median === null) return null;
  const counts = hold && {
    label: hold.label,
    atEnd: hold.at_end,
    later: hold.later,
    unheld: hold.unheld
  };
  if (!counts || !waitedHold(counts)) return { held: false, seconds: median };
  return {
    held: true,
    words: againstHold(counts)
  };
}
export function holdLine(hold) {
  if (hold.laterMost !== null) {
    const more = durationWords(hold.laterMost);
    return `${hold.later} ${hold.later === 1 ? "reply" : "replies"} took longer than the hold, at most ${more} more.`;
  }
  return hold.unheld ? `None waited longer than your hold; ${hold.unheld} had no hold.` : "None waited longer than your hold.";
}
export const holdNote = (hold) => hold ? ` \xB7 includes your ${hold.label} hold` : "";
