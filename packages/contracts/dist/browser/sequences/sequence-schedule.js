import { clockDate, clockTime, clockWhen } from "../shared/clock.js";
import { plural } from "../shared/words.js";
import {
  SEQUENCE_WORDS,
  batchWaitsUntilTonight,
  leadStepStand,
  momentStartsSentence,
  sequenceChannelsWords,
  sequenceNextOf,
  sequenceNextWords
} from "./sequence-words.js";
export const SCHEDULE_WORDS = {
  start: "Start",
  end: "End",
  date: "Date",
  /** A step's place on the rail: the first goes on day 1. */
  day: (n) => `Day ${n}`,
  step: (n) => `Step ${n}`,
  editStep: (n) => `Edit step ${n}`,
  /** What the figures on every box count, said once over their column. */
  per: "last 30 days",
  addStep: "Add a step",
  /** A step to leads has no words of its own: each email is its business's. */
  leadPreview: "Written for each business, and checked before it goes.",
  gone: "Its message isn\u2019t in Messages anymore, so this step sends nothing until it has one.",
  pick: "Pick a message for it",
  goneToAll: "Gone to everyone in it so far",
  stopNever: "never to anyone who said stop",
  oneOffNote: "To change its day or who gets it, cancel it and make it again.",
  nothingSent: "Nothing sent yet",
  sendsFrom: "Sends from",
  close: "Close",
  /** The door from a step's sheet to its message in Messages, where its words are changed for every step that sends it. */
  inMessages: "In Messages",
  /** How a step to leads goes, and a call: on its box and in its sheet. */
  byEmail: "Email",
  byTask: "A task for you, on Today",
  facts: { goes: "Goes", only: "Only to", by: "By", now: "Now", last30: "Last 30 days" }
};
const hourWords = (h) => clockTime(Date.UTC(2026, 0, 1, h), "UTC");
export function scheduleDays(steps) {
  const out = /* @__PURE__ */ new Map();
  let day = 1;
  for (const s of [...steps].sort((a, b) => a.place - b.place)) {
    if (s.place > 1) day += s.after_days ?? 0;
    out.set(s.place, day);
  }
  return out;
}
export function scheduleSpan(row, steps) {
  if (row.starts === "date")
    return { count: "One message", over: row.date ? `to ${plural(row.date.people, "person", "people")}` : null };
  const n = steps.length;
  const [one, many] = row.starts === "leads" ? ["step", "steps"] : ["message", "messages"];
  const days = Math.max(1, ...scheduleDays(steps).values()) - 1;
  return {
    count: n === 1 ? `One ${one}` : `${n} ${many}`,
    over: days > 0 ? `over ${plural(days, "day", "days")}` : null
  };
}
function dateStand(date) {
  const to = `to ${plural(date.people, "person", "people")}`;
  switch (date.state) {
    case "pending_approval":
      return `Waits for your OK, ${to}`;
    case "sending":
      return `Going out now, ${to}`;
    case "sent":
      return `Went ${to}`;
    case "canceled":
      return "Canceled \xB7 nothing went";
    case "failed":
      return "Didn\u2019t go";
    default:
      return `Goes on its own, ${to}`;
  }
}
export function scheduleStart(row, word, clock) {
  const f = row.first;
  const at = f ? `Sends at ${hourWords(f.run_hour)}` : "";
  if (row.starts === "date" && row.date) {
    const when = Date.parse(row.date.at);
    return {
      lead: `${clockDate(when, clock.tz, clock.nowMs)} \xB7 ${clockTime(when, clock.tz)}`,
      name: null,
      sub: dateStand(row.date)
    };
  }
  if (row.starts === "leads")
    return {
      lead: "When a lead joins ",
      name: f?.search_name ?? "the list",
      sub: "Each one is checked before it goes"
    };
  if (row.starts === "list") return { lead: "When someone joins ", name: f?.list_name ?? "the list", sub: at };
  return { lead: momentStartsSentence(f?.trigger ?? null, null, word), name: null, sub: at };
}
function keptFor(step) {
  const noBooking = step.only_if.includes("no_booking");
  const noReply = step.only_if.includes("no_reply") || step.kind === "reach_out";
  if (noBooking && noReply) return "haven\u2019t booked or written back";
  if (noBooking) return "haven\u2019t booked";
  if (noReply) return "haven\u2019t written back";
  return null;
}
export function scheduleWait(step) {
  const who = keptFor(step);
  return {
    wait: `Waits ${plural(step.after_days ?? 0, "day", "days")}`,
    only: who ? `Then only to those who ${who}` : null
  };
}
export function scheduleEnd(row, steps) {
  if (row.starts === "date") return null;
  if (row.starts === "leads") return { head: "Stops when they write back", sub: "or book, say no, bounce or say stop" };
  if (steps.length <= 1) return { head: "After this one message", sub: SCHEDULE_WORDS.stopNever };
  const asks = new Set(steps.flatMap((s) => s.only_if));
  const after = `or after the last step \xB7 ${SCHEDULE_WORDS.stopNever}`;
  if (asks.has("no_booking") && asks.has("no_reply")) return { head: "Stops when they book or write back", sub: after };
  if (asks.has("no_booking")) return { head: "Stops when they book", sub: after };
  if (asks.has("no_reply")) return { head: "Stops when they write back", sub: after };
  return { head: `After step ${steps.length}`, sub: SCHEDULE_WORDS.stopNever };
}
export function scheduleChannels(channels) {
  const WORD = { whatsapp: "WhatsApp", sms: "text", email: "email" };
  const named = channels.map((c) => WORD[c] ?? c);
  return named.length <= 1 ? named[0] ?? "" : `${named[0]}, else ${named.slice(1).join(", else ")}`;
}
export function scheduleInLine(people, place) {
  if (!people || place <= 1) return null;
  const all = people.rows.filter((r) => r.group === "in");
  const here = all.filter((r) => r.place === place - 1);
  if (here.length === 0) return null;
  const first = here.map((r) => r.at).filter((at) => !!at).sort()[0] ?? null;
  return { count: (people.counts.in ?? 0) === all.length ? here.length : null, first };
}
function leadStepNow(row, step, ctx) {
  const next = row.next;
  const going = next?.place === step.place;
  const ofStep = (g) => ctx.people ? ctx.people.rows.filter((r) => r.group === g && r.place === step.place).length : going ? row.needs[g] : 0;
  const held = ofStep("held");
  const toSend = ofStep("to_send");
  const parts = [held > 0 ? `${held} held by the check` : null, toSend > 0 ? `${toSend} for you to send` : null];
  if (going && next) {
    const when = clockWhen(Date.parse(next.at), ctx.tz, ctx.nowMs);
    parts.push(next.people > 0 ? `${next.people} go ${when}` : `goes ${when}`);
  }
  const said = parts.filter((p) => !!p);
  if (said.length === 0) return null;
  return { tone: held > 0 || toSend > 0 ? "need" : "next", words: said.join(" \xB7 ") };
}
function customerNext(row, step, ctx) {
  const made = row.next;
  if (made ? made.place !== step.place : step.place !== 1) return null;
  const next = sequenceNextOf(row, ctx.lastRunFor, ctx.tz, ctx.nowMs);
  return next ? { tone: "next", words: `${SEQUENCE_WORDS.next} ${sequenceNextWords(next, ctx.tz, ctx.nowMs)}` } : null;
}
export function scheduleStepState(row, step, ctx) {
  if (ctx.gone) return { tone: "need", words: SCHEDULE_WORDS.pick };
  const batch = row.needs.waiting > 0 ? row.needs.batches.find((b) => b.step_id === step.id) : void 0;
  if (batch) {
    const until = batchWaitsUntilTonight(batch) ? ` \xB7 ${SEQUENCE_WORDS.untilTonight}` : "";
    return { tone: "need", words: `${batch.people > 0 ? `${batch.people} wait` : "Waits"} for your OK${until}` };
  }
  if (row.starts === "leads") {
    const now = leadStepNow(row, step, ctx);
    if (now) return now;
    const stand = leadStepStand(step.place, step.sent, row.next?.place ?? null);
    return stand === "done" ? { tone: "done", words: SCHEDULE_WORDS.goneToAll } : null;
  }
  if (step.next_words?.status === "rejected")
    return { tone: "need", words: "New words turned down \xB7 it keeps sending these" };
  if (step.next_words) return { tone: "next", words: "New words in review \xB7 it keeps sending these" };
  const next = customerNext(row, step, ctx);
  if (next) return next;
  const line = scheduleInLine(ctx.people, step.place);
  if (!line) return null;
  const first = line.first ? Date.parse(line.first) : null;
  const day = first === null ? "" : first <= ctx.nowMs ? " \xB7 due now" : ` \xB7 the first on ${clockDate(first, ctx.tz, ctx.nowMs)}`;
  return { tone: "next", words: line.count !== null ? `${line.count} in line${day}` : `In line${day}` };
}
export function scheduleStepSub(row, step, day) {
  const hour = row.first && row.starts !== "leads" ? ` \xB7 ${hourWords(row.first.run_hour)}` : "";
  return `${SCHEDULE_WORDS.step(step.place)} \xB7 ${SCHEDULE_WORDS.day(day)}${hour}`;
}
function goesWords(row, step, word) {
  const hour = row.first ? hourWords(row.first.run_hour) : null;
  if (step.place > 1) {
    const after = `${plural(step.after_days ?? 0, "day", "days")} after step ${step.place - 1}`;
    return row.starts === "leads" || !hour ? after : `${after}, at ${hour}`;
  }
  if (row.starts === "leads") return "As each lead joins, in their hours";
  if (row.starts === "list") return hour ? `The day they join, at ${hour}` : "The day they join";
  return momentStartsSentence(row.first?.trigger ?? null, row.first?.run_hour ?? null, word);
}
export function scheduleStepFacts(row, step, word, ctx) {
  const F = SCHEDULE_WORDS.facts;
  const facts = [
    { label: F.goes, value: goesWords(row, step, word) }
  ];
  const who = step.place > 1 ? keptFor(step) : null;
  if (who) facts.push({ label: F.only, value: `Those who ${who}` });
  const by = step.hand ? SCHEDULE_WORDS.byTask : row.starts === "leads" ? row.first?.owner_sends ? "Email, from your own inbox" : "Email, from your connected mailboxes" : sequenceChannelsWords(step.channels);
  if (by) facts.push({ label: F.by, value: by });
  const state = scheduleStepState(row, step, ctx);
  if (state && state.tone !== "done")
    facts.push({ label: F.now, value: state.words, ...state.tone === "need" ? { tone: "warn" } : {} });
  if (!step.hand)
    facts.push({
      label: F.last30,
      value: step.sent > 0 ? `${plural(step.sent, "sent", "sent")} \xB7 ${plural(step.replied, "replied", "replied")}` : SCHEDULE_WORDS.nothingSent
    });
  return facts;
}
