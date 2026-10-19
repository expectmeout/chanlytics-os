import {
  addToPeopleOf,
  ADD_TO_PEOPLE_WORDS,
  VISIT_ASK_WORDS,
  visitLineOfBlock
} from "../calendar-words.js";
import { BOOKING_REQUEST_WORDS } from "./booking-request.js";
import { leadsRoute } from "../../leads/lead-plan.js";
import { sequenceRoute } from "../../sequences/sequence-address.js";
import { shiftKey } from "../day-keys.js";
import { campaignEnded, campaignRunsOn } from "../../playbooks/playbook-schedule.js";
import { calendarPersonOf } from "./calendar-person-facts.js";
import { clockLabel } from "../calendar-words.js";
import { calendarPeekDeal } from "../../deals/sheet/deal-acts.js";
import { appointmentWords } from "../../journey/appointment-word.js";
import { UP_NEXT_WORDS } from "../../person-page/next.js";
import { PERSON_PEEK_WORDS } from "../../person-page/words.js";
import { personTabRoute } from "../../person-page/route.js";
import { formatPhoneDisplay } from "../../shared/phone.js";
export const CALENDAR_VISIT_SHEET_WORDS = {
  repeats: "Repeats",
  now: "Now",
  notInPeople: "Not in People",
  rows: {
    reminder: "Reminder",
    step: "Step",
    last: "Last in touch",
    /** Their person was found as a lead (00426), and the sequence that took it in. */
    origin: "Found as a lead",
    next: "Next",
    /** A booking tool's facts the title does not say (who with, what it costs): a request's as much as a booking's. */
    booked: "Booking",
    where: "Where",
    notes: "From the calendar"
  },
  reminder: {
    rule: (hour, name) => `Day before at ${clockLabel(hour)} \xB7 ${name}`,
    stopped: "None \xB7 asked to stop",
    off: (name) => `None \xB7 ${name} is off`
  },
  message: (first) => `Message ${first}`,
  link: "Send the booking link",
  newTime: "Ask for a new time",
  windowShut: "Their WhatsApp window is shut: the thread offers the approved message.",
  call: (first) => `Call ${first}`,
  more: "More",
  moreActs: {
    step: "Set a step",
    note: "Add a note",
    copy: "Copy number",
    deal: "Open the deal",
    kept: "Change to Kept",
    missed: "Change to Missed",
    cancelRequest: "Cancel the request\u2026",
    page: PERSON_PEEK_WORDS.page
  },
  foot: {
    feed: (source) => `On ${source} \xB7 change the time there`,
    tool: (tool) => `Booked in ${tool} \xB7 change it there`,
    requested: (tool) => `Requested in ${tool} \xB7 confirm it there`,
    stillThere: "Still on your calendar \xB7 delete it there to offer the time again",
    toolCancelled: (tool) => `Cancelled here \xB7 cancel it in ${tool} too`,
    nobody: (source) => `On ${source}`
  },
  /** The walk through the day's visits on a desk: "2 of 4". */
  walk: (at, of) => `${at} of ${of}`,
  previous: "Previous",
  following: "Next",
  close: "Close"
};
const SHEET_WORDS = CALENDAR_VISIT_SHEET_WORDS;
const firstOf = (name) => name.trim().split(/\s+/)[0] || name;
function initialsOfName(name) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("");
}
function sheetStateOf(b, line, nowMs) {
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
function personOf(i, line, facts) {
  const b = i.block;
  if (b.person) {
    const p = b.person;
    const deal = facts?.deal ? [facts.deal.word, facts.deal.service, facts.deal.since].filter(Boolean) : null;
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
      deal: deal?.length ? deal.join(" \xB7 ") : null,
      route: personTabRoute(p.id, "visits")
    };
  }
  const e164 = b.contacts.e164.at(0) ?? null;
  if (!e164 && !b.contacts.emails.length && !b.guess) return null;
  return {
    known: false,
    name: b.guess,
    initials: initialsOfName(b.guess),
    number: e164 ? formatPhoneDisplay(e164) ?? e164 : null,
    email: b.contacts.emails.at(0) ?? null
  };
}
function reminderOf(i, ended) {
  const b = i.block;
  if (ended || !b.person || !i.moments || b.visit?.status === "cancelled") return null;
  const name = appointmentWords(i.word).before.name;
  if (b.person.stopped) return SHEET_WORDS.reminder.stopped;
  const before = i.moments.find((m) => m.trigger === "visit_tomorrow");
  if (!before) return null;
  const runs = campaignRunsOn(before, { tz: i.tz, now: new Date(i.nowMs) }) && !campaignEnded(before, shiftKey(i.day.key, -1));
  return runs ? SHEET_WORDS.reminder.rule(before.run_hour, name) : SHEET_WORDS.reminder.off(name);
}
function originOf(b) {
  const o = b.origin;
  if (!o) return null;
  return o.sequence ? { value: o.sequence.name, route: sequenceRoute(o.sequence.id, "people") } : { value: o.lead.name, route: leadsRoute({ peek: o.lead.id }) };
}
function visitRowsOf(i, ended, facts) {
  const b = i.block;
  const booked = [b.staff ? `with ${b.staff}` : null, b.price].filter(Boolean).join(" \xB7 ");
  const origin = originOf(b);
  const rows = [
    ["reminder", reminderOf(i, ended)],
    ["step", facts?.step ? `${facts.step.words} \xB7 ${facts.step.day.words}` : null],
    ["last", facts?.last ?? null],
    ["origin", origin?.value ?? null, origin?.route],
    ["next", ended ? i.next : null],
    ["booked", b.tool && booked ? booked : null],
    ["where", b.location],
    ["notes", i.notes]
  ];
  return rows.flatMap(
    ([key, value, route]) => value ? [{ key, label: SHEET_WORDS.rows[key], value, ...route ? { route } : {} }] : []
  );
}
function footnoteOf(i, nobody) {
  const b = i.block;
  if (nobody) return SHEET_WORDS.foot.nobody(i.source);
  if (b.request)
    return b.request.open ? BOOKING_REQUEST_WORDS.foot : b.visit?.status === "cancelled" ? BOOKING_REQUEST_WORDS.footCant : BOOKING_REQUEST_WORDS.footBooked;
  const status = b.visit?.status;
  if (b.tool) {
    if (status === "proposed") return SHEET_WORDS.foot.requested(b.tool);
    if (status === "cancelled") return SHEET_WORDS.foot.toolCancelled(b.tool);
    return SHEET_WORDS.foot.tool(b.tool);
  }
  if (status === "cancelled") return SHEET_WORDS.foot.stillThere;
  return SHEET_WORDS.foot.feed(i.source);
}
const linkGoes = (i) => !!i.bookingLink && !!i.block.person?.threadId && !!i.block.person.bookingLinkAction.offered;
function primaryOf(i, line, proposal, proposalWords) {
  const b = i.block;
  if (b.request?.open) return { act: "booked", label: BOOKING_REQUEST_WORDS.booked_it, quiet: false };
  if (!b.person) return addToPeopleOf(b) ? { act: "add", label: ADD_TO_PEOPLE_WORDS.act, quiet: false } : null;
  const message = { act: "message", label: SHEET_WORDS.message(firstOf(b.person.name)), quiet: false };
  const status = b.visit?.status;
  if (status === "missed" || status === "cancelled")
    return linkGoes(i) ? { act: "new_time", label: SHEET_WORDS.newTime, quiet: false } : message;
  if (line.unmarked) return { ...message, quiet: true };
  if (proposal && proposalWords) return { act: "proposal", label: proposalWords, quiet: false };
  if (status === "kept") return linkGoes(i) ? { act: "link", label: SHEET_WORDS.link, quiet: false } : message;
  return message;
}
function visitMoreOf(i, line, phone) {
  const b = i.block;
  const M = SHEET_WORDS.moreActs;
  const out = [];
  const add = (act, label, danger = false) => out.push({ act, label, danger });
  if (b.person) {
    add("step", M.step);
    add("note", M.note);
  }
  if (phone) add("copy", M.copy);
  if (b.person?.facts?.deal) add("deal", M.deal);
  if (b.visit?.status === "kept" && line.acts.includes("missed")) add("missed", M.missed);
  if (b.visit?.status === "missed" && line.acts.includes("kept")) add("kept", M.kept);
  if (b.request?.open) add("cant", BOOKING_REQUEST_WORDS.cant_it, true);
  else if (line.acts.includes("cancelled"))
    add("cancel", b.visit?.status === "proposed" ? M.cancelRequest : appointmentWords(i.word).cancelAct, true);
  if (b.person) add("page", M.page);
  return out;
}
function proposalOf(i, facts) {
  const b = i.block;
  const rows = b.person && facts ? [{ id: b.person.id, deal: facts.deal, nextVisitMs: facts.nextVisitMs }] : [];
  const start = calendarPeekDeal(b, { rows }, i.nowMs).start;
  if (!start) return { proposal: null, words: null };
  return {
    proposal: { personId: start.personId, mode: start.act.mode ?? "propose", service: start.service },
    words: start.act.label
  };
}
function visitAskOf(i, line) {
  if (!line.unmarked || !line.asks.length || !line.mark?.id) return null;
  const name = i.block.person?.name ?? i.block.guess;
  const dayWord = i.rel ?? `${i.day.dow} ${i.day.date}`;
  return { question: name ? UP_NEXT_WORDS.didTheyCome(firstOf(name), dayWord) : VISIT_ASK_WORDS.question, line };
}
function circlesOf(b, primary, phone) {
  const first = b.person ? firstOf(b.person.name) : null;
  return {
    message: first && primary?.act !== "message" ? SHEET_WORDS.message(first) : null,
    // Their page's Call, which rings from the member's phone and asks how it went: only someone People holds has one.
    call: first && phone ? SHEET_WORDS.call(first) : null
  };
}
function shutOf(b, primary) {
  const carriesLink = primary?.act === "link" || primary?.act === "new_time";
  return carriesLink && b.person && !b.person.bookingLinkAction.ready ? SHEET_WORDS.windowShut : null;
}
export function visitSheetOf(i) {
  const b = i.block;
  const line = visitLineOfBlock(b, i.nowMs);
  const someone = !!b.person || !!b.contacts.e164.length || !!b.contacts.emails.length;
  const nobody = !someone && !b.guess;
  const ended = Date.parse(b.end) <= i.nowMs;
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
      repeats: b.series
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
    proposal
  };
}
