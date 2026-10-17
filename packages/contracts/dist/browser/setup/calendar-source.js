import { DAY_MS } from "../shared/time.js";
import { bookingToolCalendar, bookingToolName, bookingToolOptions } from "../calendar/booking-notice.js";
import { CALENDAR_FEED_WORDS } from "../calendar/calendar-words.js";
import { SETUP_STATE_WORDS } from "./setup.js";
export const CALENDAR_OWED_WORD = SETUP_STATE_WORDS.waiting_you;
export const CALENDAR_SETTING_ROUTE = "admin/workspace/calendar";
const FORWARD_CONFIRM_SHOWN_MS = 3 * DAY_MS;
export function forwardStillAsked(at, now) {
  return !!at && now.getTime() - Date.parse(at) <= FORWARD_CONFIRM_SHOWN_MS;
}
export function bookingEmailsStep(e) {
  if (!e.address) return "address";
  if (e.forwarding) return "forwarding";
  if (e.held > 0) return "held";
  return e.lastAt ? "working" : "waiting";
}
const TO_THE_ROW = (label) => ({ label, to: CALENDAR_SETTING_ROUTE });
const TO_THE_BOARD = { label: "Open Calendar", to: "calendar" };
const leadAndRest = (lead, rest = "") => {
  const after = rest.trim();
  return { lead, rest: after, sentence: after ? `${lead} ${after}` : lead };
};
export const bookingEmailsHeldWords = (n) => n === 1 ? "One booking email needs a look." : `${n} booking emails need a look.`;
const noTimesWords = (bookingLink) => bookingLink ? "The receptionist sends your booking link instead of naming open times." : "The receptionist does not name open times.";
function unreadLink(f, by, emailsWork) {
  return {
    by,
    state: "attention",
    tone: "warn",
    words: CALENDAR_FEED_WORDS.unavailable,
    ...leadAndRest(
      "Your calendar could not be read.",
      `${f.problem ?? ""}${emailsWork ? " Booking emails still arrive." : ""}`
    ),
    times: false,
    next: TO_THE_ROW("Check the link")
  };
}
function emailsNeedYou(step, f, e, by, times) {
  const tool = bookingToolName(f.tool) ?? "Your booking tool";
  if (step === "address")
    return {
      by,
      state: "needs_you",
      tone: "warn",
      words: CALENDAR_OWED_WORD,
      ...leadAndRest(`${tool} needs an address to send its booking emails to.`),
      times,
      next: TO_THE_ROW("Finish setting up")
    };
  if (step === "forwarding")
    return {
      by,
      state: "needs_you",
      tone: "warn",
      words: CALENDAR_OWED_WORD,
      ...leadAndRest("Gmail is waiting for you to confirm the forward."),
      times,
      next: TO_THE_ROW("Confirm the forward")
    };
  if (step === "held")
    return {
      by,
      // Held before any became an appointment is setting up still; held after is a thing that works asking for a look.
      state: e.lastAt || times ? "attention" : "needs_you",
      tone: "warn",
      words: `${e.held} to look at`,
      ...leadAndRest(bookingEmailsHeldWords(e.held)),
      times,
      next: TO_THE_ROW(e.held === 1 ? "Look at it" : "Look at them")
    };
  return null;
}
function readLink(f, step) {
  const tool = bookingToolName(f.tool);
  if (f.link === "stale")
    return {
      by: tool ? "both" : "link",
      state: "ready",
      tone: "ok",
      words: CALENDAR_FEED_WORDS.stale,
      ...leadAndRest("The latest read failed, so this is the last good one."),
      times: true,
      next: TO_THE_BOARD
    };
  const emails = tool && step === "working" ? ` Booking emails from ${tool} add the client and the service.` : tool && step === "waiting" ? ` Waiting for the first booking email from ${tool}.` : "";
  return {
    by: tool ? "both" : "link",
    state: "ready",
    tone: "ok",
    words: CALENDAR_FEED_WORDS.ok,
    ...leadAndRest("The receptionist offers open times from it.", emails),
    times: true,
    next: TO_THE_BOARD
  };
}
function emailsAlone(f, step) {
  const tool = bookingToolName(f.tool) ?? "your booking tool";
  if (step === "waiting")
    return {
      by: "emails",
      state: "waiting",
      tone: "plain",
      words: "Waiting for the first email",
      ...leadAndRest(`Waiting for the first booking email from ${tool}.`),
      times: false,
      next: TO_THE_ROW("See the steps")
    };
  return {
    by: "emails",
    state: "ready",
    tone: "ok",
    words: "By email",
    ...leadAndRest(`Bookings arrive by email from ${tool}.`, noTimesWords(f.bookingLink)),
    times: false,
    next: TO_THE_BOARD
  };
}
export function calendarSourceOf(f) {
  const linked = f.link !== "none";
  const named = !!f.tool;
  const by = linked && named ? "both" : linked ? "link" : named ? "emails" : "nothing";
  const step = named && f.emails ? bookingEmailsStep(f.emails) : null;
  if (f.link === "unavailable") return unreadLink(f, by, step === "working" || step === "held");
  const times = f.link === "ok" || f.link === "stale";
  if (step && f.emails) {
    const owed = emailsNeedYou(step, f, f.emails, by, times);
    if (owed) return owed;
  }
  if (linked) return readLink(f, step);
  if (named) return emailsAlone(f, step);
  if (f.byHand)
    return {
      by: "hand",
      state: "hand",
      tone: "plain",
      words: "Booked by hand",
      ...leadAndRest("You take bookings yourself, so there is nothing to connect.", noTimesWords(f.bookingLink)),
      times: false,
      next: TO_THE_ROW("Change")
    };
  return {
    by: "nothing",
    state: "none",
    tone: "plain",
    words: CALENDAR_FEED_WORDS.none,
    ...leadAndRest(
      "No calendar connected.",
      "Say what you book with, so your calendar fills and the receptionist knows what is taken."
    ),
    times: false,
    next: TO_THE_ROW("Connect your calendar")
  };
}
export function calendarSourceFacts(c) {
  return {
    link: c.state === "ok" ? c.stale ? "stale" : "ok" : c.state,
    problem: c.problem ?? null,
    tool: c.tool ?? null,
    byHand: !!c.by_hand,
    emails: c.emails ? { address: c.emails.address, forwarding: c.emails.forwarding, lastAt: c.emails.last_at, held: c.emails.held } : null,
    bookingLink: !!c.booking_link
  };
}
export const BOOKED_NEEDS_A_LINK = "Add a calendar link under Settings \u203A Business to see who booked.";
export const BOOKS_WITH_CALENDAR = "calendar";
export const BOOKS_BY_HAND = "hand";
export function booksWithOptions() {
  return [
    ...bookingToolOptions(),
    { value: BOOKS_WITH_CALENDAR, label: "Google, Apple or Outlook calendar" },
    { value: BOOKS_BY_HAND, label: "I book by hand" }
  ];
}
export function booksWithOf(c) {
  return c.tool || (c.ical_url ? BOOKS_WITH_CALENDAR : c.by_hand ? BOOKS_BY_HAND : "");
}
export function booksWithName(withWhat) {
  if (!withWhat) return null;
  if (withWhat === BOOKS_WITH_CALENDAR) return "Calendar link";
  if (withWhat === BOOKS_BY_HAND) return "Booked by hand";
  return bookingToolName(withWhat);
}
export const BOOKING_TOOL_WORDS = {
  label: "Booking tool",
  empty: "Not set up",
  placeholder: "What do you book with?",
  link: {
    title: "Calendar link",
    why: "So the receptionist can offer open times.",
    anyway: "I have a calendar link",
    /** Under "I book by hand", where a link is kept: that answer has none, so saving it takes the link away. */
    goes: "Saving this removes your calendar link."
  },
  emails: {
    title: "Booking emails",
    why: "So each booking shows who it is and what for."
  }
};
export function calendarLinkShown(withWhat, held) {
  if (withWhat === BOOKS_BY_HAND) return "hidden";
  if (held) return "shown";
  if (!withWhat) return "hidden";
  return bookingToolCalendar(withWhat) === "none" ? "offered" : "shown";
}
export function calendarLinkNote(withWhat, bookingLink) {
  if (!withWhat) return "";
  if (withWhat === BOOKS_BY_HAND) return `Nothing to connect. ${noTimesWords(bookingLink)}`;
  if (withWhat === BOOKS_WITH_CALENDAR) return "Paste the private address of the calendar your bookings land in.";
  const tool = bookingToolName(withWhat) ?? "Your tool";
  const kind = bookingToolCalendar(withWhat);
  if (kind === "none") return `${tool} offers no calendar link. ${noTimesWords(bookingLink)}`;
  if (kind === "own") return `${tool} offers a calendar link of its own. Paste it here.`;
  if (kind === "writes")
    return `${tool} writes your bookings into your own calendar. Paste that calendar's private address here.`;
  return `If ${tool} offers a calendar link, or writes into your own calendar, paste that address here.`;
}
