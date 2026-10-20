import { clockDate, clockNear } from "../shared/clock.js";
import { capitalize, plural } from "../shared/words.js";
import { isReachOutHold } from "../reach-out/reach-out-words.js";
import { heldWhyOf } from "./sequence-held.js";
import { scheduleDays, scheduleWait } from "./sequence-schedule.js";
import { sequenceLeftWords } from "./sequence-words.js";
export const PLACE_WORDS = {
  waiting: "Waits for your OK",
  held: "Held",
  to_send: "Yours to send",
  replied: "Wrote back",
  next: "In it",
  queued: "In it",
  in: "In it",
  done: "Done",
  left: "Left"
};
const NEEDS_YOU = /* @__PURE__ */ new Set(["waiting", "held", "to_send", "replied"]);
const STANDS = /* @__PURE__ */ new Set(["waiting", "held", "to_send", "next", "queued", "in"]);
export const placeStands = (g) => STANDS.has(g);
export const placeToneOf = (g) => NEEDS_YOU.has(g) ? "warn" : STANDS.has(g) ? "ok" : "plain";
const queuedLine = (state) => state === "draft" ? "Joins when you start it" : state === "paused" ? "Waits until it's on" : "In its next batch";
const stepWordOf = (r) => `Step ${r.place ?? 1}`;
export function placeWordOf(r, seq, clock, named = true) {
  const at = r.at ? Date.parse(r.at) : NaN;
  const when = Number.isFinite(at) ? clockNear(at, clock.tz, clock.nowMs) : null;
  const tone = placeToneOf(r.group);
  const inIt = named ? `In ${seq.name}` : PLACE_WORDS.in;
  switch (r.group) {
    case "waiting":
    case "held":
    case "to_send":
      return { word: PLACE_WORDS[r.group], tone, line: `${stepWordOf(r)} \xB7 ${seq.name}` };
    case "replied":
      return { word: PLACE_WORDS.replied, tone, line: when ? `${seq.name} \xB7 ${when}` : seq.name };
    case "queued":
      return { word: inIt, tone, line: queuedLine(seq.state) };
    case "next":
      return { word: inIt, tone, line: when ? `${stepWordOf(r)} ${when}` : stepWordOf(r) };
    case "in":
      return { word: inIt, tone, line: when ? `Next step ${when}` : "Between steps" };
    case "done":
      return { word: PLACE_WORDS.done, tone, line: `${seq.name} \xB7 every step went` };
    case "left":
      return { word: PLACE_WORDS.left, tone, line: `${seq.name} \xB7 ${sequenceLeftWords(r.why) || "taken out"}` };
  }
}
const placeHeldWhy = (hold, detail) => isReachOutHold(hold) ? heldWhyOf(hold, detail) : null;
export const PLACE_RAIL_WORDS = {
  theirPlace: "Their place",
  ifAdded: "If you add them",
  joinsWhenAdded: "Joins when you add them",
  checked: "Each email is checked before it goes",
  addedOn: (date) => `You added them ${date}`,
  joinedOn: (date) => `Joined on its own ${date}`,
  added: "You added them",
  email: "Email",
  asTheyGet: "Email \xB7 as they'd get it",
  task: "A task for you",
  followUp: "Following up",
  stops: "Stops when they reply, book, bounce, unsubscribe or say no.",
  readFrom: "Replies are read from your connected mailbox.",
  toldBy: "Replies aren't read here: say so with They wrote back\u2026",
  takeOut: (name) => `Take out of ${name}`,
  afterOk: "Goes after your OK"
};
function sendStateOf(s, row, clock) {
  const at = (x) => x ? Date.parse(x) : NaN;
  if (s.state === "sent" || s.state === "handed") {
    const t2 = at(s.sent_at);
    return { tone: "done", words: Number.isFinite(t2) ? `Sent ${clockDate(t2, clock.tz, clock.nowMs)}` : "Sent" };
  }
  if (s.state === "held") {
    const why = placeHeldWhy(s.reason, s.hold_detail);
    return { tone: "need", words: why ? `Held: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : "Held by the check" };
  }
  if (s.state === "drafted") return { tone: "need", words: "Yours to send, from your own inbox" };
  if (s.state === "skipped")
    return { tone: "done", words: s.reason === "owner_skipped" ? "Skipped" : capitalize(sequenceLeftWords(s.reason)) };
  if (s.state === "failed") return { tone: "done", words: "Didn't go" };
  if (row && row.send_id === s.id && row.group === "waiting")
    return { tone: "need", words: "In today's batch \xB7 waits for your OK" };
  const t = at(s.send_at);
  return { tone: "next", words: Number.isFinite(t) ? `Goes ${clockNear(t, clock.tz, clock.nowMs)}` : "Goes next" };
}
function aheadStateOf(step, first, { row, seq, clock }) {
  if (!first || !row) return null;
  if (row.group === "queued") return { tone: "next", words: step.place === 1 ? queuedLine(seq) : "" };
  if (row.group === "in") {
    const t = row.at ? Date.parse(row.at) : NaN;
    return { tone: "next", words: Number.isFinite(t) ? `Goes ${clockNear(t, clock.tz, clock.nowMs)}` : "Next" };
  }
  return null;
}
export function placeRailOf(p) {
  const W = PLACE_RAIL_WORDS;
  const days = scheduleDays(p.steps);
  const sends = p.place ? p.place.sends : [];
  const row = p.place ? p.place.place : null;
  let ahead = false;
  const stateOf = (s) => {
    if (p.lens === "preview") return s.place === 1 ? { tone: "next", words: W.afterOk } : null;
    const own = sends.filter((x) => x.step_id === s.id).at(-1) ?? null;
    if (own) return sendStateOf(own, row, p.clock);
    const first = !ahead;
    ahead = true;
    return aheadStateOf(s, first, { row, seq: p.seq, clock: p.clock });
  };
  const steps = [...p.steps].sort((a, b) => a.place - b.place).map((s) => {
    const state = stateOf(s);
    const title = p.titles.get(s.place) ?? (s.hand ? s.hand.words : s.place === 1 ? W.email : W.followUp);
    return {
      id: s.id,
      place: s.place,
      day: days.get(s.place) ?? 1,
      title,
      how: s.hand ? W.task : p.lens === "preview" ? W.asTheyGet : W.email,
      state: state && state.words ? state : null,
      wait: s.place > 1 ? scheduleWait(s) : null,
      hand: !!s.hand
    };
  });
  const joined = p.place ? p.place.joined : null;
  const joinedAt = joined && joined.at ? Date.parse(joined.at) : NaN;
  const date = Number.isFinite(joinedAt) ? clockDate(joinedAt, p.clock.tz, p.clock.nowMs) : null;
  const start = p.lens === "preview" ? { head: W.joinsWhenAdded, sub: W.checked } : {
    head: date ? joined && joined.auto ? W.joinedOn(date) : W.addedOn(date) : W.added,
    sub: W.checked
  };
  return { start, steps, end: { head: W.stops, sub: p.readsReplies ? W.readFrom : W.toldBy } };
}
export function placeSpanOf(steps, days) {
  const n = plural(steps, "step", "steps");
  return days > 0 ? `${n} over ${plural(days, "day", "days")}` : n;
}
