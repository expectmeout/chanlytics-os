/**
 * A sequence's Steps as a schedule (the Steps redesign of 17 Oct 2026, his pick of A, refined): a rail of days, each step a
 * box on its day with what it is doing now, the wait and who it keeps going between two steps, where it starts and where
 * it stops, and what a step's sheet says of it. One colour, one meaning on the page that draws it: a state that needs you
 * is amber, one only coming is quiet. Pure: the clock, the workspace's word for an appointment and what the page has read
 * (who is in line, whether a step's message is still offered) are arguments.
 */
import { CONSENT_CHANNELS } from "../../consent/channels";
import { purposeOfPlaybook } from "../../consent/consent";
import { appointmentWords, type AppointmentWord } from "../../journey/appointment-word";
import { channelNeverCarries } from "../broadcasts/reach-for";
import { enrolPurpose } from "../playbooks/purpose";
import { triggerOf } from "../playbooks/triggers/notices";
import { isOneOf } from "../../shared/unknown";
import { clockAhead, clockDate, clockTime } from "../../shared/clock";
import { plural } from "../../shared/words";
import type { SequenceMessageOffDto, SequencePeopleDto, SequenceRowDto, SequenceStepDto } from "./dto";
import { MESSAGE_WAITS_WORDS, stepOffLine } from "./message-off";
import { oneOffPeople } from "./one-off";
import { SEQUENCE_WORDS, leadStepStand } from "./words/flow";
import {
  batchWaitsUntilTonight,
  momentStartsSentence,
  sequenceChannelsWords,
  sequenceNextOf,
  sequenceNextWords,
} from "./words/next";

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
  /** Under a freed time's start, where another moment says its hour (decision 0082). */
  freedTo: "To the people who asked and never booked",
  addStep: "Add a step",
  /** Where Add a step stood on a customer's rail that a call or a note closes (00465: nothing goes after one). */
  handLast: (kind: string) =>
    kind === "note"
      ? "A note is always the last step. To add a message, take the note away first."
      : "A call is always the last step. To add a message, take the call away first.",
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
  /**
   * A step whose message is an offer though its moment is not (stepAsOffer): whose word it is, then who gets it. On its
   * box where nothing else is said, and in its sheet's By row, which says text too: no text carries an offer.
   */
  asOffer: {
    whatsapp: "WhatsApp treats this message as an offer",
    own: "This message is an offer",
    who: "only people who said yes to offers get it",
    never: "and never by text",
    /**
     * Where the workspace's reply in the open chat is on (decision 0135, `in_chat`): who gets it there, then who gets it
     * otherwise, its box short and its sheet in full (Ruben approved the words, 16 Nov 2026).
     */
    inChat: "A reply on WhatsApp if they wrote in the last 24 hours",
    inChatFull:
      "If they wrote on WhatsApp in the 24 hours before it goes, it goes there as a reply, to anyone who said yes to messages.",
    otherwise: "Otherwise",
  },
  /** Start's Change: how a customer's sequence runs (the loop review's item 7), changed through the campaign's own verb. */
  settings: {
    title: "How it runs",
    hour: "Sends at",
    cap: "At most, each day",
    people: (n: number) => `${n} people`,
    gap: "Again to the same person after",
    every: "Runs every",
    days: (n: number) => `${n} days`,
    until: "Runs until",
    untilHint: "Leave it empty and it keeps running. On that day it stops.",
    onceEach: "It goes once to each person: who is on the list now, then each who joins.",
    /** A freed time's sequence (decision 0082): how many people each freed time goes to, and how far ahead it offers. */
    freedCap: "People per freed time",
    freedAhead: (n: number) => `Up to ${n} days ahead`,
    freedAheadHint: "The days ahead AI offers times: change it in Settings, under Booking rules.",
    save: "Save",
    cancel: "Cancel",
  },
} as const;

/** An hour as the schedule says it ("10:00 AM"), on the business's clock face. */
const hourWords = (h: number): string => clockTime(Date.UTC(2026, 0, 1, h), "UTC");

/**
 * What Start's Change offers beside the most each day and the last day: the days before the same person hears it again,
 * for a moment over a group of people (gone quiet, lapsed: its kind `list`); the days between runs, for the month's offer
 * (`cadence`). A visit's, a proposal's and a list's sequence have neither: each visit, each proposal, once each. A freed
 * time's (`freed`, decision 0082) runs when a cancellation frees a time, never at an hour: it offers how many people each
 * time goes to, and says how far ahead it offers. One an occasion starts (0119) goes to one person at a time, so it keeps
 * no most-each-day (`cap`), and only the follow-up to an ask keeps an hour (`hour`: the next day's); the two about a
 * visit go by the visit's own time.
 */
export function scheduleSettingsOf(row: Pick<SequenceRowDto, "first">): {
  gap: boolean;
  every: boolean;
  freed: boolean;
  hour: boolean;
  cap: boolean;
} {
  const kind = row.first ? triggerOf(row.first.trigger)?.kind : null;
  const occasion = kind === "occasion";
  return {
    gap: kind === "list",
    every: kind === "cadence",
    freed: kind === "freed",
    hour: kind !== "freed" && (!occasion || row.first?.trigger === "asked_no_booking"),
    cap: !occasion,
  };
}

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

/**
 * The line over the schedule: how many messages and the days they span, where they span any; steps, where not every one
 * is a message (to leads, or a customer's that closes on a call or a note).
 */
export function scheduleSpan(
  row: Pick<SequenceRowDto, "starts" | "date" | "last">,
  steps: readonly (Pick<SequenceStepDto, "place" | "after_days"> & { hand?: SequenceStepDto["hand"] })[],
): { count: string; over: string | null } {
  // A one-off is its one message, to the people it picked.
  if (row.starts === "date")
    return { count: "One message", over: row.date ? `to ${plural(oneOffPeople(row), "person", "people")}` : null };
  const length = steps.length;
  const notAllMessages = row.starts === "leads" || steps.some((s) => s.hand);
  const [one, many] = notAllMessages ? ["step", "steps"] : ["message", "messages"];
  const days = Math.max(1, ...scheduleDays(steps).values()) - 1;
  return {
    count: length === 1 ? `One ${one}` : `${length} ${many}`,
    over: days > 0 ? `over ${plural(days, "day", "days")}` : null,
  };
}

/** A one-off's day, by where its batch stands: how it goes, or how it went, and to how many. */
function dateStand(row: SequenceRowDto, date: NonNullable<SequenceRowDto["date"]>): string {
  const to = `to ${plural(oneOffPeople(row), "person", "people")}`;
  switch (date.state) {
    case "pending_approval":
      return `Waits for your approval, ${to}`;
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
  const first = row.first;
  const at = first ? `Sends at ${hourWords(first.run_hour)}` : "";
  if (row.starts === "date" && row.date) {
    const when = Date.parse(row.date.at);
    return {
      lead: `${clockDate(when, clock.tz, clock.nowMs)} · ${clockTime(when, clock.tz)}`,
      name: null,
      sub: dateStand(row, row.date),
    };
  }
  if (row.starts === "leads")
    return {
      lead: "When a lead joins ",
      name: first?.search_name ?? "the list",
      sub: "Each one is checked before it goes",
    };
  // Once to each person (the loop review's item 6): the list's people when it starts, then each who joins.
  if (row.starts === "list")
    return {
      lead: "When someone joins ",
      name: first?.list_name ?? "the list",
      sub: at ? `Once each · ${at.charAt(0).toLowerCase()}${at.slice(1)}` : "Once each",
    };
  // A freed time's runs when a cancellation frees one (decision 0082): no hour, and the people it goes to instead. One
  // an occasion starts about a visit (0119) goes by that visit's time: once for each, and no hour either.
  const takes = scheduleSettingsOf(row);
  const sub = takes.freed ? SCHEDULE_WORDS.freedTo : takes.hour ? at : `Once for each ${appointmentWords(word).one}`;
  return { lead: momentStartsSentence(first?.trigger ?? null, null, word), name: null, sub };
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
  const kept = keptFor(step);
  return {
    wait: `Waits ${plural(step.after_days ?? 0, "day", "days")}`,
    only: kept ? `Then only to those who ${kept}` : null,
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

/**
 * Whose word makes a step's message an offer where its moment is not one: WhatsApp's, where the message has a WhatsApp
 * version (its kind is the one WhatsApp filed it as), else its own versions'. `in_chat`: WhatsApp's, in a workspace whose
 * reply in the open chat is on (decision 0135), where the step goes there first as a reply and as the offer otherwise.
 */
export type StepOffer = "whatsapp" | "own" | "in_chat";

/**
 * A step's message as far as stepAsOffer reads it: its kind, and whether it has a WhatsApp version. Said here rather than
 * taken from campaign-message.ts, whose type would tie this module into its importers' circle (decision 0110).
 */
interface StepMessage {
  category: string | null;
  versions: { whatsapp: object | null };
}

/**
 * Whether a customer's step sends an offer though its moment is not one, and whose word that is; null where the step is
 * what its moment is, is a task for a person, or has no message in view. A run enrols by the stricter of the two
 * (playbooks/purpose.ts enrolPurpose), so such a step reaches only a yes to offers and never goes by text, and its
 * page must say so: the ready-made booking follow-up, filed with WhatsApp as a notice and approved as an offer, went
 * on saying "WhatsApp, else text, else email" with nothing under it (15 Nov 2026). `inChat`: the step replies in the open
 * chat (playbooks/in-chat.ts: the workspace's switch on, and inChatPurposeOfMessage of the message), said by the page.
 */
export function stepAsOffer(
  step: Pick<SequenceStepDto, "kind" | "hand"> & { policy_class?: string | null },
  message: StepMessage | null,
  inChat: boolean,
): StepOffer | null {
  if (!message || step.hand || step.kind !== "moment") return null;
  if (purposeOfPlaybook(step.policy_class) === "marketing") return null;
  if (enrolPurpose(step.policy_class, { category: message.category }) !== "marketing") return null;
  if (!message.versions.whatsapp) return "own";
  return inChat ? "in_chat" : "whatsapp";
}

/** A step's offer as its box says it, short, when nothing else is said: whose word, or where it replies, then who gets it. */
function offerLine(offer: StepOffer): string {
  const words = SCHEDULE_WORDS.asOffer;
  return offer === "in_chat" ? `${words.inChat} · else ${words.who}` : `${words[offer]} · ${words.who}`;
}

/** The same, in full, as the sheet's By row says it after the channels: an offer never goes by text. */
function offerSentence(offer: StepOffer): string {
  const words = SCHEDULE_WORDS.asOffer;
  const asOffer = (kind: "whatsapp" | "own") => `${words[kind]}, so ${words.who}, ${words.never}.`;
  return offer === "in_chat" ? `${words.inChatFull} ${words.otherwise} ${asOffer("whatsapp")}` : asOffer(offer);
}

/**
 * The channels a step names that its message may ever go by: all of them, but text for an offer (channelNeverCarries). Its
 * box, its sheet's By row and the tabs of its sheet's message read this one answer.
 */
export const stepChannelsCarried = (
  channels: readonly string[],
  offer: StepOffer | null | undefined,
): readonly string[] =>
  offer
    ? channels.filter((c) => !isOneOf(CONSENT_CHANNELS, c) || channelNeverCarries(c, "marketing") === null)
    : channels;

/**
 * A step's channels on its box, short: "WhatsApp", "WhatsApp, else email" (each person on the first that reaches them).
 * `offer` where its message is an offer though its moment is not (stepAsOffer): the box names no channel an offer
 * never goes by.
 */
export function scheduleChannels(channels: readonly string[], offer: StepOffer | null = null): string {
  const WORD: Record<string, string> = { whatsapp: "WhatsApp", sms: "text", email: "email" };
  const named = stepChannelsCarried(channels, offer).map((c) => WORD[c] ?? c);
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
  /** The step's message is an offer though its moment is not, and whose word that is (stepAsOffer); unsaid is no. */
  offer?: StepOffer | null;
  /**
   * Nothing can carry the step's message here now (templates/carried-nowhere.ts, Campaigns, one tab, call C13): it waits,
   * and goes by itself once a channel can. Unsaid is no.
   */
  waits?: boolean;
  /**
   * The step's message cannot go (message-off.ts sequenceMessageOff, call C3): WhatsApp refused it or paused it where the
   * step goes by WhatsApp. Its row is in Needs you for it, and the step says so. Unsaid is no.
   */
  off?: SequenceMessageOffDto | null;
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
    const when = clockAhead(Date.parse(next.at), ctx.tz, ctx.nowMs);
    parts.push(next.people > 0 ? `${next.people} go ${when}` : `goes ${when}`);
  }
  const phrases = parts.filter((p): p is string => !!p);
  if (phrases.length === 0) return null;
  return { tone: held > 0 || toSend > 0 ? "need" : "next", words: phrases.join(" · ") };
}

/** When a customer's step goes next: the batch made for it, or the first step's next run by its hour. */
function customerNext(row: SequenceRowDto, step: SequenceStepDto, ctx: ScheduleCtx): ScheduleState | null {
  const created = row.next;
  if (created ? created.place !== step.place : step.place !== 1) return null;
  const next = sequenceNextOf(row, ctx.lastRunFor, ctx.tz, ctx.nowMs);
  if (!next) return null;
  // A batch whose time has come is going out: said so, never "Next now".
  const words =
    next.soon || next.at > ctx.nowMs
      ? `${SEQUENCE_WORDS.next} ${sequenceNextWords(next, ctx.tz, ctx.nowMs)}`
      : SEQUENCE_WORDS.goingOut(next.people);
  return { tone: "next", words };
}

/**
 * What a step is doing now, the one line its box ends on: a message gone, a batch of it waiting for your OK, what the
 * check held of a lead's step, new words turned down; else what is coming (its next run, who is in line, new words in
 * review), or that a lead's step has gone to everyone. Null where it is doing nothing worth a line.
 */
export function scheduleStepState(row: SequenceRowDto, step: SequenceStepDto, ctx: ScheduleCtx): ScheduleState | null {
  if (ctx.gone) return { tone: "need", words: SCHEDULE_WORDS.pick };
  if (ctx.off) return { tone: "need", words: stepOffLine(ctx.off, "box") };
  const batch = row.needs.waiting > 0 ? row.needs.batches.find((b) => b.step_id === step.id) : undefined;
  if (batch) {
    // An OK sends it at once; a customer's waits only until its day is gone (batchWaitsUntilTonight).
    const until = batchWaitsUntilTonight(batch) ? ` · ${SEQUENCE_WORDS.untilTonight}` : "";
    return { tone: "need", words: `${batch.people > 0 ? `${batch.people} wait` : "Waits"} for your approval${until}` };
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
  // Nothing can carry its message: whatever comes next would not go, so the step says it waits, quietly.
  if (ctx.waits) return { tone: "next", words: MESSAGE_WAITS_WORDS.step };
  const next = customerNext(row, step, ctx);
  if (next) return next;
  const line = scheduleInLine(ctx.people, step.place);
  // Nothing coming to say: where its message is an offer though its moment is not, who gets it, quietly.
  if (!line) return ctx.offer ? { tone: "next", words: offerLine(ctx.offer) } : null;
  // Someone whose wait is over waits on the step itself (a step that could not reach them keeps them due): due now.
  const first = line.first ? Date.parse(line.first) : null;
  const day =
    first === null ? "" : first <= ctx.nowMs ? " · due now" : ` · the first on ${clockDate(first, ctx.tz, ctx.nowMs)}`;
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
  const factWords = SCHEDULE_WORDS.facts;
  const facts: { label: string; value: string; tone?: "warn" }[] = [
    { label: factWords.goes, value: goesWords(row, step, word) },
  ];
  const person = step.place > 1 ? keptFor(step) : null;
  if (person) facts.push({ label: factWords.only, value: `Those who ${person}` });
  const by = step.hand
    ? SCHEDULE_WORDS.byTask
    : row.starts === "leads"
      ? row.first?.owner_sends
        ? "Email, from your own inbox"
        : "Email, from your connected mailboxes"
      : sequenceChannelsWords(stepChannelsCarried(step.channels, ctx.offer));
  // An offer under a moment that is not one says so here whatever its box is saying: whose word, who gets it, never by text.
  const offer = ctx.offer && !step.hand ? offerSentence(ctx.offer) : null;
  if (by || offer)
    facts.push({ label: factWords.by, value: [by ? (offer ? `${by}.` : by) : null, offer].filter(Boolean).join(" ") });
  // What it is doing now, without the offer's line its box falls back on: the By row above has said it, once. Where its
  // message cannot go, what that holds back: the message the sheet opens on says WhatsApp's no itself.
  const state: ScheduleState | null = ctx.off
    ? { tone: "need", words: stepOffLine(ctx.off, "sheet") }
    : scheduleStepState(row, step, { ...ctx, offer: null });
  if (state && state.tone !== "done")
    facts.push({
      label: factWords.now,
      value: state.words,
      ...(state.tone === "need" ? { tone: "warn" as const } : {}),
    });
  if (!step.hand)
    facts.push({
      label: factWords.last30,
      value:
        step.sent > 0
          ? `${plural(step.sent, "sent", "sent")} · ${plural(step.replied, "replied", "replied")}`
          : SCHEDULE_WORDS.nothingSent,
    });
  return facts;
}
