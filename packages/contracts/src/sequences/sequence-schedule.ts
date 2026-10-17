/**
 * A sequence's Steps as a schedule (the Steps redesign of 17 Oct 2026, his pick of A, refined): a rail of days, each step a
 * box on its day with what it is doing now, the wait and who it keeps going between two steps, where it starts and where
 * it stops, and what a step's sheet says of it. One colour, one meaning on the page that draws it: a state that needs you
 * is amber, one only coming is quiet. Pure: the clock, the workspace's word for an appointment and what the page has read
 * (who is in line, whether a step's message is still offered) are arguments.
 */
import type { AppointmentWord } from "../journey/appointment-word";
import { clockDate, clockTime, clockWhen } from "../shared/clock";
import { plural } from "../shared/words";
import type { SequencePeopleDto, SequenceRowDto, SequenceStepDto } from "./sequence-dto";
import {
  SEQUENCE_WORDS,
  leadStepStand,
  momentStartsSentence,
  sequenceChannelsWords,
  sequenceNextOf,
  sequenceNextWords,
} from "./sequence-words";

/** The schedule's own words, said once. */
export const SCHEDULE_WORDS = {
  start: "Start",
  end: "End",
  date: "Date",
  /** A step's place on the rail: the first goes on day 1. */
  day: (n: number) => `Day ${n}`,
  step: (n: number) => `Step ${n}`,
  editStep: (n: number) => `Edit step ${n}`,
  /** What the figures on every box count, said once over their column. */
  per: "last 30 days",
  addStep: "Add a step",
  /** A step to leads has no words of its own: each email is its business's. */
  leadPreview: "Written for each business, and checked before it goes.",
  gone: "Its message isn’t in Messages anymore, so this step sends nothing until it has one.",
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
  facts: { goes: "Goes", only: "Only to", by: "By", now: "Now", last30: "Last 30 days" },
} as const;

/** An hour as the schedule says it ("10:00 AM"), on the business's clock face. */
const hourWords = (h: number): string => clockTime(Date.UTC(2026, 0, 1, h), "UTC");

/** Each step's day on the rail: the first on day 1, each after it on the day its wait lands. */
export function scheduleDays(steps: readonly Pick<SequenceStepDto, "place" | "after_days">[]): Map<number, number> {
  const out = new Map<number, number>();
  let day = 1;
  for (const s of [...steps].sort((a, b) => a.place - b.place)) {
    if (s.place > 1) day += s.after_days ?? 0;
    out.set(s.place, day);
  }
  return out;
}

/** The line over the schedule: how many messages (steps, to leads) and the days they span, where they span any. */
export function scheduleSpan(
  row: Pick<SequenceRowDto, "starts" | "date">,
  steps: readonly Pick<SequenceStepDto, "place" | "after_days">[],
): { count: string; over: string | null } {
  // A one-off is its one message, to the people it picked.
  if (row.starts === "date")
    return { count: "One message", over: row.date ? `to ${plural(row.date.people, "person", "people")}` : null };
  const n = steps.length;
  const [one, many] = row.starts === "leads" ? ["step", "steps"] : ["message", "messages"];
  const days = Math.max(1, ...scheduleDays(steps).values()) - 1;
  return {
    count: n === 1 ? `One ${one}` : `${n} ${many}`,
    over: days > 0 ? `over ${plural(days, "day", "days")}` : null,
  };
}

/** A one-off's day, by where its batch stands: how it goes, or how it went, and to how many. */
function dateStand(date: NonNullable<SequenceRowDto["date"]>): string {
  const to = `to ${plural(date.people, "person", "people")}`;
  switch (date.state) {
    case "pending_approval":
      return `Waits for your OK, ${to}`;
    case "sending":
      return `Going out now, ${to}`;
    case "sent":
      return `Went ${to}`;
    case "canceled":
      return "Canceled · nothing went";
    case "failed":
      return "Didn’t go";
    default:
      return `Goes on its own, ${to}`;
  }
}

/**
 * Where a sequence starts, in its parts: the words before what it starts on, that thing's name (a list, a search: the
 * page makes it a door), and the line under them (its hour, how a lead's email goes, a one-off's state).
 */
export function scheduleStart(
  row: SequenceRowDto,
  word: AppointmentWord,
  clock: { tz: string; nowMs: number },
): { lead: string; name: string | null; sub: string } {
  const f = row.first;
  const at = f ? `Sends at ${hourWords(f.run_hour)}` : "";
  if (row.starts === "date" && row.date) {
    const when = Date.parse(row.date.at);
    return {
      lead: `${clockDate(when, clock.tz, clock.nowMs)} · ${clockTime(when, clock.tz)}`,
      name: null,
      sub: dateStand(row.date),
    };
  }
  if (row.starts === "leads")
    return {
      lead: "When a lead joins ",
      name: f?.search_name ?? "the list",
      sub: "Each one is checked before it goes",
    };
  if (row.starts === "list") return { lead: "When someone joins ", name: f?.list_name ?? "the list", sub: at };
  return { lead: momentStartsSentence(f?.trigger ?? null, null, word), name: null, sub: at };
}

/** Who a step keeps going to after its wait, by its conditions; null where it goes to everyone still in. */
function keptFor(step: Pick<SequenceStepDto, "only_if" | "kind">): string | null {
  const noBooking = step.only_if.includes("no_booking");
  const noReply = step.only_if.includes("no_reply") || step.kind === "reach_out";
  if (noBooking && noReply) return "haven’t booked or written back";
  if (noBooking) return "haven’t booked";
  if (noReply) return "haven’t written back";
  return null;
}

/** The wait before a step, as the rail says it between two steps: how long, then who it keeps going. */
export function scheduleWait(step: Pick<SequenceStepDto, "after_days" | "only_if" | "kind">): {
  wait: string;
  only: string | null;
} {
  const who = keptFor(step);
  return {
    wait: `Waits ${plural(step.after_days ?? 0, "day", "days")}`,
    only: who ? `Then only to those who ${who}` : null,
  };
}

/** Where a sequence stops, as the rail ends: what stops it, and the line under. None for a one-off, its one message. */
export function scheduleEnd(
  row: Pick<SequenceRowDto, "starts">,
  steps: readonly Pick<SequenceStepDto, "only_if">[],
): { head: string; sub: string } | null {
  if (row.starts === "date") return null;
  if (row.starts === "leads") return { head: "Stops when they write back", sub: "or book, say no, bounce or say stop" };
  if (steps.length <= 1) return { head: "After this one message", sub: SCHEDULE_WORDS.stopNever };
  const asks = new Set(steps.flatMap((s) => s.only_if));
  const after = `or after the last step · ${SCHEDULE_WORDS.stopNever}`;
  if (asks.has("no_booking") && asks.has("no_reply")) return { head: "Stops when they book or write back", sub: after };
  if (asks.has("no_booking")) return { head: "Stops when they book", sub: after };
  if (asks.has("no_reply")) return { head: "Stops when they write back", sub: after };
  return { head: `After step ${steps.length}`, sub: SCHEDULE_WORDS.stopNever };
}

/** A step's channels on its box, short: "WhatsApp", "WhatsApp, else email" (each person on the first that reaches them). */
export function scheduleChannels(channels: readonly string[]): string {
  const WORD: Record<string, string> = { whatsapp: "WhatsApp", sms: "text", email: "email" };
  const named = channels.map((c) => WORD[c] ?? c);
  return named.length <= 1 ? (named[0] ?? "") : `${named[0]}, else ${named.slice(1).join(", else ")}`;
}

/**
 * Who waits for a step after the first: the people its step before reached, in line for their day (00447 sequence_people,
 * `in`, at the place they last got). Counted only where the read holds every row of the group; the first one's day
 * either way. Null for the first step, and where nobody waits.
 */
export function scheduleInLine(
  people: SequencePeopleDto | null,
  place: number,
): { count: number | null; first: string | null } | null {
  if (!people || place <= 1) return null;
  const all = people.rows.filter((r) => r.group === "in");
  const here = all.filter((r) => r.place === place - 1);
  if (here.length === 0) return null;
  const first =
    here
      .map((r) => r.at)
      .filter((at): at is string => !!at)
      .sort()[0] ?? null;
  return { count: (people.counts.in ?? 0) === all.length ? here.length : null, first };
}

/** What a step is doing now, on its box and in its sheet: amber where it needs you, quiet where it is only coming. */
export interface ScheduleState {
  tone: "need" | "next" | "done";
  words: string;
}

/** What the page has read beside the record, and the clock, which a step's state is said from. */
export interface ScheduleCtx {
  tz: string;
  nowMs: number;
  /** The day the first step last ran (the record's `last_run_for`): its next run where no batch is made yet. */
  lastRunFor?: string | null;
  /** Who is in it (the People tab's read), for who is in line and what the check held; null until it is read. */
  people: SequencePeopleDto | null;
  /** The step's message is no longer offered (the settings read): it sends nothing until it has one. */
  gone: boolean;
}

/** A sequence to leads' step going now: what the check held of it and what is for you to send, then when the rest go. */
function leadStepNow(row: SequenceRowDto, step: SequenceStepDto, ctx: ScheduleCtx): ScheduleState | null {
  const next = row.next;
  const going = next?.place === step.place;
  const ofStep = (g: "held" | "to_send") =>
    ctx.people
      ? ctx.people.rows.filter((r) => r.group === g && r.place === step.place).length
      : going
        ? row.needs[g]
        : 0;
  const held = ofStep("held");
  const toSend = ofStep("to_send");
  const parts = [held > 0 ? `${held} held by the check` : null, toSend > 0 ? `${toSend} for you to send` : null];
  if (going && next) {
    const when = clockWhen(Date.parse(next.at), ctx.tz, ctx.nowMs);
    parts.push(next.people > 0 ? `${next.people} go ${when}` : `goes ${when}`);
  }
  const said = parts.filter((p): p is string => !!p);
  if (said.length === 0) return null;
  return { tone: held > 0 || toSend > 0 ? "need" : "next", words: said.join(" · ") };
}

/** When a customer's step goes next: the batch made for it, or the first step's next run by its hour. */
function customerNext(row: SequenceRowDto, step: SequenceStepDto, ctx: ScheduleCtx): ScheduleState | null {
  const made = row.next;
  if (made ? made.place !== step.place : step.place !== 1) return null;
  const next = sequenceNextOf(row, ctx.lastRunFor, ctx.tz, ctx.nowMs);
  return next ? { tone: "next", words: `${SEQUENCE_WORDS.next} ${sequenceNextWords(next, ctx.tz, ctx.nowMs)}` } : null;
}

/**
 * What a step is doing now, the one line its box ends on: a message gone, a batch of it waiting for your OK, what the
 * check held of a lead's step, new words turned down; else what is coming (its next run, who is in line, new words in
 * review), or that a lead's step has gone to everyone. Null where it is doing nothing worth a line.
 */
export function scheduleStepState(row: SequenceRowDto, step: SequenceStepDto, ctx: ScheduleCtx): ScheduleState | null {
  if (ctx.gone) return { tone: "need", words: SCHEDULE_WORDS.pick };
  const batch = row.needs.waiting > 0 ? row.needs.batches.find((b) => b.step_id === step.id) : undefined;
  if (batch) {
    const when = clockWhen(Date.parse(batch.at), ctx.tz, ctx.nowMs);
    return {
      tone: "need",
      words: batch.people > 0 ? `${batch.people} wait for your OK · goes ${when}` : `Waits for your OK · goes ${when}`,
    };
  }
  if (row.starts === "leads") {
    const now = leadStepNow(row, step, ctx);
    if (now) return now;
    const stand = leadStepStand(step.place, step.sent, row.next?.place ?? null);
    return stand === "done" ? { tone: "done", words: SCHEDULE_WORDS.goneToAll } : null;
  }
  if (step.next_words?.status === "rejected")
    return { tone: "need", words: "New words turned down · it keeps sending these" };
  if (step.next_words) return { tone: "next", words: "New words in review · it keeps sending these" };
  const next = customerNext(row, step, ctx);
  if (next) return next;
  const line = scheduleInLine(ctx.people, step.place);
  if (!line) return null;
  const day = line.first ? ` · the first on ${clockDate(Date.parse(line.first), ctx.tz, ctx.nowMs)}` : "";
  return { tone: "next", words: line.count !== null ? `${line.count} in line${day}` : `In line${day}` };
}

/** The line under a step's sheet's title: its place, its day and its hour. */
export function scheduleStepSub(row: SequenceRowDto, step: Pick<SequenceStepDto, "place">, day: number): string {
  const hour = row.first && row.starts !== "leads" ? ` · ${hourWords(row.first.run_hour)}` : "";
  return `${SCHEDULE_WORDS.step(step.place)} · ${SCHEDULE_WORDS.day(day)}${hour}`;
}

/** When a step goes, as its sheet says it: the first by what starts it, each after by its wait after the one before. */
function goesWords(row: SequenceRowDto, step: SequenceStepDto, word: AppointmentWord): string {
  const hour = row.first ? hourWords(row.first.run_hour) : null;
  if (step.place > 1) {
    const after = `${plural(step.after_days ?? 0, "day", "days")} after step ${step.place - 1}`;
    return row.starts === "leads" || !hour ? after : `${after}, at ${hour}`;
  }
  if (row.starts === "leads") return "As each lead joins, in their hours";
  if (row.starts === "list") return hour ? `The day they join, at ${hour}` : "The day they join";
  return momentStartsSentence(row.first?.trigger ?? null, row.first?.run_hour ?? null, word);
}

/** What a step's sheet says of it, row by row: when it goes, who it keeps going, how, what it is doing, and what it did. */
export function scheduleStepFacts(
  row: SequenceRowDto,
  step: SequenceStepDto,
  word: AppointmentWord,
  ctx: ScheduleCtx,
): { label: string; value: string; tone?: "warn" }[] {
  const F = SCHEDULE_WORDS.facts;
  const facts: { label: string; value: string; tone?: "warn" }[] = [
    { label: F.goes, value: goesWords(row, step, word) },
  ];
  const who = step.place > 1 ? keptFor(step) : null;
  if (who) facts.push({ label: F.only, value: `Those who ${who}` });
  const by = step.hand
    ? SCHEDULE_WORDS.byTask
    : row.starts === "leads"
      ? row.first?.owner_sends
        ? "Email, from your own inbox"
        : "Email, from your connected mailboxes"
      : sequenceChannelsWords(step.channels);
  if (by) facts.push({ label: F.by, value: by });
  const state = scheduleStepState(row, step, ctx);
  if (state && state.tone !== "done")
    facts.push({ label: F.now, value: state.words, ...(state.tone === "need" ? { tone: "warn" as const } : {}) });
  if (!step.hand)
    facts.push({
      label: F.last30,
      value:
        step.sent > 0
          ? `${plural(step.sent, "sent", "sent")} · ${plural(step.replied, "replied", "replied")}`
          : SCHEDULE_WORDS.nothingSent,
    });
  return facts;
}
