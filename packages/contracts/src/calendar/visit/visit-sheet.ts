/**
 * One visit, opened on the Calendar (the Calendar's lane E, 13 Oct 2026): the kit's sheet on a phone and a peek at the
 * board's edge on a desk draw this, and work none of it out. What it is and when; how it stands, said once; who it is for,
 * with their standing, business and deal (the board's own read of them, calendar-person-facts.ts); the one question an
 * ended visit asks; the few rows that say something new; where it changes; and one act by how it stands, then a Message
 * and a Call circle, then More.
 *
 * Its acts are the ones the pages already have, each by the rule that already decides it: a visit's word is the visit
 * line's (visitLineOf: no act the door would refuse, nothing asked of an event that is nobody's), the booking link is the
 * person's own act (bookingLinkAction: none for someone who asked to stop), a proposal follows a consultation by the deal's
 * rule (calendarPeekDeal), and Add to People by addToPeopleOf. Every word is here or in the phrases the workspace's word
 * makes (appointmentWords), so a salon reads "appointment" and a studio that quotes reads "meeting".
 */
import {
  addToPeopleOf,
  ADD_TO_PEOPLE_WORDS,
  VISIT_ASK_WORDS,
  visitLineOfBlock,
  type VisitLineVM,
} from "../calendar-words";
import type { CalendarBlockVM } from "../calendar-vm";
import type { CalendarMomentDto } from "../calendar-runs";
import { calendarPersonOf, type CalendarPersonVM } from "./calendar-person-facts";
import { clockLabel } from "../calendar-words";
import { calendarPeekDeal } from "../../deals/sheet/deal-acts";
import { appointmentWords, type AppointmentWord } from "../../journey/appointment-word";
import { UP_NEXT_WORDS } from "../../person-page/next";
import { PERSON_PEEK_WORDS } from "../../person-page/words";
import { personTabRoute } from "../../person-page/route";
import { formatPhoneDisplay } from "../../shared/phone";
import type { PersonState } from "../../people/person-state";

/** The sheet's own words: its rows, its acts, its footnotes. */
export const CALENDAR_VISIT_SHEET_WORDS = {
  repeats: "Repeats",
  now: "Now",
  notInPeople: "Not in People",
  rows: {
    reminder: "Reminder",
    step: "Step",
    last: "Last in touch",
    next: "Next",
    /** A booking tool's facts the title does not say (who with, what it costs): a request's as much as a booking's. */
    booked: "Booking",
    where: "Where",
    notes: "From the calendar",
  },
  reminder: {
    rule: (hour: number, name: string) => `Day before at ${clockLabel(hour)} · ${name}`,
    stopped: "None · asked to stop",
    off: (name: string) => `None · ${name} is off`,
  },
  message: (first: string) => `Message ${first}`,
  link: "Send the booking link",
  newTime: "Ask for a new time",
  windowShut: "Their WhatsApp window is shut: the thread offers the approved message.",
  call: (first: string) => `Call ${first}`,
  more: "More",
  moreActs: {
    step: "Set a step",
    note: "Add a note",
    copy: "Copy number",
    deal: "Open the deal",
    kept: "Change to Kept",
    missed: "Change to Missed",
    cancelRequest: "Cancel the request…",
    page: PERSON_PEEK_WORDS.page,
  },
  foot: {
    feed: (source: string) => `On ${source} · change the time there`,
    tool: (tool: string) => `Booked in ${tool} · change it there`,
    requested: (tool: string) => `Requested in ${tool} · confirm it there`,
    stillThere: "Still on your calendar · delete it there to offer the time again",
    toolCancelled: (tool: string) => `Cancelled here · cancel it in ${tool} too`,
    nobody: (source: string) => `On ${source}`,
  },
  /** The walk through the day's visits on a desk: "2 of 4". */
  walk: (at: number, of: number) => `${at} of ${of}`,
  previous: "Previous",
  following: "Next",
  close: "Close",
} as const;

const SHEET_WORDS = CALENDAR_VISIT_SHEET_WORDS;

/** How the visit stands, as the sheet's one pill says it. */
export interface VisitSheetState {
  word: string;
  tone: "ok" | "warn" | "plain" | "accent";
  /** Requested: a dashed ring; not marked yet: a plain ring. */
  ring: "dashed" | "plain" | null;
}

/** The one act the foot leads with, by how the visit stands. */
export type VisitPrimaryAct = "message" | "link" | "new_time" | "proposal" | "add";

/** An act in More. */
export type VisitMoreAct = "step" | "note" | "copy" | "deal" | "kept" | "missed" | "cancel" | "page";

/** Who the visit is for, as the sheet's person line draws them. */
export type VisitSheetPerson =
  | {
      known: true;
      id: string;
      name: string;
      first: string;
      initials: string;
      state: PersonState | null;
      stateWord: string | null;
      business: string | null;
      stopped: boolean;
      /** Said only where it is a guess (a name, a business), as the person's page says a match. */
      match: string | null;
      /** "Proposal out · Balayage · since Oct 7": one muted door to the deal. */
      deal: string | null;
      route: string;
    }
  | {
      known: false;
      /** The name the calendar gives them, or null. */
      name: string | null;
      initials: string;
      /** The number the event carries, for the eye, and to copy; null for none. */
      number: string | null;
      email: string | null;
    };

/** One visit, as the sheet and the peek draw it. */
export interface VisitSheetVM {
  title: string;
  when: { rel: string | null; date: string; time: string; dur: string | null; repeats: boolean };
  state: VisitSheetState | null;
  /** Nobody's event (a lunch): no person, no ask, no foot; the title, the time and where it is from. */
  nobody: boolean;
  person: VisitSheetPerson | null;
  /** "Did Maria come yesterday?", with Kept and Missed, once the visit has begun and nobody has said. */
  ask: { question: string; line: VisitLineVM } | null;
  rows: Array<{ key: keyof typeof SHEET_WORDS.rows; label: string; value: string }>;
  footnote: string;
  primary: { act: VisitPrimaryAct; label: string; quiet: boolean } | null;
  /** The circles beside it: Message where it is not the lead act, Call where someone People holds has a number. */
  circles: { message: string | null; call: string | null };
  more: Array<{ act: VisitMoreAct; label: string; danger: boolean }>;
  /** Said under the foot where the link goes into a thread whose WhatsApp window is shut. */
  shut: string | null;
  /** The visit line it was made from: what a press of Kept, Missed or a correction is said on. */
  line: VisitLineVM;
  /** The number to call and copy, E.164, or null. */
  phone: string | null;
  /** A consultation's proposal, where the deal's rule offers one now (calendarPeekDeal). */
  proposal: { personId: string; mode: string; service: string | null } | null;
}

/** What the sheet is made from: the block, its day, the board's facts beside it, and the clock. */
export interface VisitSheetInput {
  block: CalendarBlockVM;
  day: { key: string; today: boolean; date: string; dow: string; long: string };
  /** "Today", "Tomorrow", "Yesterday", or null (words.ts crWhen). */
  rel: string | null;
  /** "1h 30m", or "" (words.ts crDur); none for all-day. */
  dur: string;
  nowMs: number;
  tz: string;
  word: AppointmentWord;
  /** Where the calendar is ("Google Calendar"), for the footnote. */
  source: string;
  bookingLink: string | null;
  dealsOn: boolean;
  /** What the notes say that the sheet does not (words.ts crNotesWorth), or null. */
  notes: string | null;
  /** Their next visit after this one in the days the board holds: "Tue, Oct 27 · 2 PM", or null. */
  next: string | null;
  /** The campaigns, for the reminder line (calendar_runs), or null before they are read. */
  moments: readonly CalendarMomentDto[] | null;
}

/** A name's first word, as an act says it ("Message Maria"). */
const firstOf = (name: string): string => name.trim().split(/\s+/)[0] || name;

/** Up to two initials of a name, for a face. */
function initialsOfName(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

/** How the visit stands, said once: a member's word, a request, not marked yet, under way now, else nothing. */
function sheetStateOf(b: CalendarBlockVM, line: VisitLineVM, nowMs: number): VisitSheetState | null {
  if (line.state) {
    const s = line.state;
    if (s.tone === "requested") return { word: s.text, tone: "plain", ring: "dashed" };
    if (s.tone === "past")
      return line.unmarked ? { word: VISIT_ASK_WORDS.unmarked, tone: "plain", ring: "plain" } : null;
    return { word: s.text, tone: s.pill, ring: null };
  }
  const started = Date.parse(b.start) <= nowMs && Date.parse(b.end) > nowMs;
  return started && (b.person || line.acts.length) ? { word: SHEET_WORDS.now, tone: "accent", ring: null } : null;
}

/** Who it is for: the person People matched, with what the board knows of them; else what the event says of them. */
function personOf(i: VisitSheetInput, line: VisitLineVM, facts: CalendarPersonVM | null): VisitSheetPerson | null {
  const b = i.block;
  if (b.person) {
    const p = b.person;
    const deal =
      facts?.deal && i.dealsOn ? [facts.deal.word, facts.deal.service, facts.deal.since].filter(Boolean) : null;
    return {
      known: true,
      id: p.id,
      name: p.name,
      first: firstOf(p.name),
      initials: initialsOfName(p.name),
      state: facts?.state ?? null,
      stateWord: facts?.stateWord ?? null,
      business: facts?.business ?? null,
      stopped: p.stopped,
      match: line.guess ? line.match : null,
      deal: deal?.length ? deal.join(" · ") : null,
      route: personTabRoute(p.id, "visits"),
    };
  }
  const e164 = b.contacts.e164.at(0) ?? null;
  if (!e164 && !b.contacts.emails.length && !b.guess) return null;
  return {
    known: false,
    name: b.guess,
    initials: initialsOfName(b.guess),
    number: e164 ? (formatPhoneDisplay(e164) ?? e164) : null,
    email: b.contacts.emails.at(0) ?? null,
  };
}

/** The reminder the visit gets, by the rule (version 1): the day-before campaign's hour and name, a stop, or that it is off. */
function reminderOf(i: VisitSheetInput, ended: boolean): string | null {
  const b = i.block;
  if (ended || !b.person || !i.moments || b.visit?.status === "cancelled") return null;
  const name = appointmentWords(i.word).before.name;
  if (b.person.stopped) return SHEET_WORDS.reminder.stopped;
  const before = i.moments.find((m) => m.trigger === "visit_tomorrow");
  if (!before) return null;
  return before.state === "running" ? SHEET_WORDS.reminder.rule(before.run_hour, name) : SHEET_WORDS.reminder.off(name);
}

/** The rows that say something the head does not: the reminder, their step, their last word, their next visit, the booking's facts, where, and the notes. */
function visitRowsOf(i: VisitSheetInput, ended: boolean, facts: CalendarPersonVM | null): VisitSheetVM["rows"] {
  const b = i.block;
  // The service is the sheet's title where the tool named one (visitSheetOf), so the row says the rest.
  const booked = [b.staff ? `with ${b.staff}` : null, b.price].filter(Boolean).join(" · ");
  const rows: Array<[keyof typeof SHEET_WORDS.rows, string | null]> = [
    ["reminder", reminderOf(i, ended)],
    ["step", facts?.step ? `${facts.step.words} · ${facts.step.day.words}` : null],
    ["last", facts?.last ?? null],
    ["next", ended ? i.next : null],
    ["booked", b.tool && booked ? booked : null],
    ["where", b.location],
    ["notes", i.notes],
  ];
  return rows.flatMap(([key, value]) => (value ? [{ key, label: SHEET_WORDS.rows[key], value }] : []));
}

/** Where the visit changes, by how it stands and where it came from. */
function footnoteOf(i: VisitSheetInput, nobody: boolean): string {
  const b = i.block;
  if (nobody) return SHEET_WORDS.foot.nobody(i.source);
  const status = b.visit?.status;
  if (b.tool) {
    if (status === "proposed") return SHEET_WORDS.foot.requested(b.tool);
    if (status === "cancelled") return SHEET_WORDS.foot.toolCancelled(b.tool);
    return SHEET_WORDS.foot.tool(b.tool);
  }
  if (status === "cancelled") return SHEET_WORDS.foot.stillThere;
  return SHEET_WORDS.foot.feed(i.source);
}

/** Whether the booking link may go to them now: a link on file, and their own act offered (nobody who asked to stop). */
const linkGoes = (i: VisitSheetInput): boolean =>
  !!i.bookingLink && !!i.block.person?.threadId && !!i.block.person.bookingLinkAction.offered;

/** The one act the foot leads with, by how the visit stands (each verb already exists). */
function primaryOf(
  i: VisitSheetInput,
  line: VisitLineVM,
  proposal: VisitSheetVM["proposal"],
  proposalWords: string | null,
): VisitSheetVM["primary"] {
  const b = i.block;
  if (!b.person) return addToPeopleOf(b) ? { act: "add", label: ADD_TO_PEOPLE_WORDS.act, quiet: false } : null;
  const message = { act: "message" as const, label: SHEET_WORDS.message(firstOf(b.person.name)), quiet: false };
  const status = b.visit?.status;
  if (status === "missed" || status === "cancelled")
    return linkGoes(i) ? { act: "new_time", label: SHEET_WORDS.newTime, quiet: false } : message;
  // Not marked: the ask leads, and the thread waits beside it as the quiet act; a proposal follows a Kept.
  if (line.unmarked) return { ...message, quiet: true };
  // A consultation over with no proposal since, kept or with no row to mark (the deal's rule, calendarPeekDeal).
  if (proposal && proposalWords) return { act: "proposal", label: proposalWords, quiet: false };
  if (status === "kept") return linkGoes(i) ? { act: "link", label: SHEET_WORDS.link, quiet: false } : message;
  return message;
}

/** What More holds for them: their step, a note, the number, their deal, a correction, a cancel, their page (their lists are there). */
function visitMoreOf(i: VisitSheetInput, line: VisitLineVM, phone: string | null): VisitSheetVM["more"] {
  const b = i.block;
  const M = SHEET_WORDS.moreActs;
  const out: VisitSheetVM["more"] = [];
  const add = (act: VisitMoreAct, label: string, danger = false) => out.push({ act, label, danger });
  if (b.person) {
    add("step", M.step);
    add("note", M.note);
  }
  if (phone) add("copy", M.copy);
  if (b.person?.facts?.deal && i.dealsOn) add("deal", M.deal);
  // A correction is a word about a visit that has been said (visitActsOf): Kept corrects to Missed, and Missed to Kept.
  if (b.visit?.status === "kept" && line.acts.includes("missed")) add("missed", M.missed);
  if (b.visit?.status === "missed" && line.acts.includes("kept")) add("kept", M.kept);
  if (line.acts.includes("cancelled"))
    add("cancel", b.visit?.status === "proposed" ? M.cancelRequest : appointmentWords(i.word).cancelAct, true);
  if (b.person) add("page", M.page);
  return out;
}

/**
 * A consultation over with no proposal since offers the deal sheet's own act (0008), where deals are on: the ask, and the
 * act's own words. A person the board's read carried no facts of (added between its two halves) has a deal it has not
 * read, never one it can say is missing: no row, so nothing is offered.
 */
function proposalOf(
  i: VisitSheetInput,
  facts: CalendarPersonVM | null,
): { proposal: VisitSheetVM["proposal"]; words: string | null } {
  const b = i.block;
  const rows = b.person && facts ? [{ id: b.person.id, deal: facts.deal }] : [];
  const start = calendarPeekDeal(b, { dealsOn: i.dealsOn, rows }, i.nowMs).start;
  if (!start) return { proposal: null, words: null };
  return {
    proposal: { personId: start.personId, mode: start.act.mode ?? "propose", service: start.service },
    words: start.act.label,
  };
}

/** "Did Maria come yesterday?", once the visit has begun and nobody has said, on a row the record keeps for it. */
function visitAskOf(i: VisitSheetInput, line: VisitLineVM): VisitSheetVM["ask"] {
  if (!line.unmarked || !line.asks.length || !line.mark?.id) return null;
  const name = i.block.person?.name ?? i.block.guess;
  const dayWord = i.rel ?? `${i.day.dow} ${i.day.date}`;
  return { question: name ? UP_NEXT_WORDS.didTheyCome(firstOf(name), dayWord) : VISIT_ASK_WORDS.question, line };
}

/** Message beside the lead act where it is not the lead, and Call where someone People holds has a number. */
function circlesOf(
  b: CalendarBlockVM,
  primary: VisitSheetVM["primary"],
  phone: string | null,
): VisitSheetVM["circles"] {
  const first = b.person ? firstOf(b.person.name) : null;
  return {
    message: first && primary?.act !== "message" ? SHEET_WORDS.message(first) : null,
    // Their page's Call, which rings from the member's phone and asks how it went: only someone People holds has one.
    call: first && phone ? SHEET_WORDS.call(first) : null,
  };
}

/** Said under the foot where the link goes into a thread whose WhatsApp window is shut. */
function shutOf(b: CalendarBlockVM, primary: VisitSheetVM["primary"]): string | null {
  const carriesLink = primary?.act === "link" || primary?.act === "new_time";
  return carriesLink && b.person && !b.person.bookingLinkAction.ready ? SHEET_WORDS.windowShut : null;
}

/** The sheet for one visit, at `nowMs`. Pure. */
export function visitSheetOf(i: VisitSheetInput): VisitSheetVM {
  const b = i.block;
  const line = visitLineOfBlock(b, i.nowMs);
  const someone = !!b.person || !!b.contacts.e164.length || !!b.contacts.emails.length;
  const nobody = !someone && !b.guess;
  const ended = Date.parse(b.end) <= i.nowMs;
  // What the board's read knows of them, said at this minute (calendar-person-facts.ts): worked out once for the sheet.
  const facts = b.person?.facts ? calendarPersonOf(b.person.facts, i.tz, i.nowMs) : null;
  const phone = facts?.phone ?? b.contacts.e164.at(0) ?? null;
  const { proposal, words } = proposalOf(i, facts);
  const primary = nobody ? null : primaryOf(i, line, proposal, words);
  return {
    title: b.service || appointmentWords(i.word).Title,
    when: {
      rel: i.rel,
      date: i.day.date,
      time: b.time,
      dur: b.time === "All day" ? null : i.dur || null,
      repeats: b.series,
    },
    state: sheetStateOf(b, line, i.nowMs),
    nobody,
    person: personOf(i, line, facts),
    ask: visitAskOf(i, line),
    rows: nobody ? [] : visitRowsOf(i, ended, facts),
    footnote: footnoteOf(i, nobody),
    primary,
    circles: circlesOf(b, primary, phone),
    more: nobody ? [] : visitMoreOf(i, line, phone),
    shut: shutOf(b, primary),
    line,
    phone,
    proposal,
  };
}
