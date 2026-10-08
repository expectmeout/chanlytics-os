/**
 * What the calendar is fed by, said once.
 *
 * A workspace's calendar has two ways in (docs/plans/2026-10-07-bookings-arrive-by-email.md): the calendar link the
 * receptionist reads open times from, and the booking emails its tool sends, each of which becomes an appointment. A
 * business may have either, both, or neither, and may say it books by hand. Setup, Connections, the Calendar page, Ask,
 * Reports and People each worked the answer out for themselves, most from the link alone: a business whose bookings
 * arrive by email was told "Not connected" and to paste an address its tool does not have, on four pages, beside a
 * board that showed its bookings. This is the one answer, and each of them reads it.
 *
 * Pure, and it reads only what a caller already holds: the link's last read, the tool named, and what is known of its
 * emails. A reader that holds the settings alone (Ask's facts) leaves the emails out and is told the tool is named.
 */
import { DAY_MS } from "../shared/time";
import { bookingToolCalendar, bookingToolName, bookingToolOptions } from "../calendar/booking-notice";
import { CALENDAR_FEED_WORDS, type CalendarFeedHealth } from "../calendar/calendar-words";

/**
 * The Business row that holds all of it, as a route: Settings › Business with the row open (settings/frame/tabs.ts).
 * Every "set it up", "check it" and "look at them" about the calendar goes here, and nowhere else.
 */
export const CALENDAR_SETTING_ROUTE = "admin/workspace/calendar";

/**
 * How long Gmail's confirmation of a forward is asked for. Google's link is good for about that long, and a code nobody
 * confirmed in three days is one nobody is looking for: it is another account's, or an old try.
 */
const FORWARD_CONFIRM_SHOWN_MS = 3 * DAY_MS;

/** Whether a forward Gmail asked to be confirmed at `at` is still asked of the owner. */
export function forwardStillAsked(at: string | null | undefined, now: Date): boolean {
  return !!at && now.getTime() - Date.parse(at) <= FORWARD_CONFIRM_SHOWN_MS;
}

/** What is known of the tool's booking emails. */
export interface BookingEmailsFacts {
  /** The workspace has an address for the tool to send to. */
  address: boolean;
  /** Gmail waits on the owner to confirm a forward to that address. */
  forwarding: boolean;
  /** When the latest one became an appointment; null until one has. */
  lastAt: string | null;
  /** How many are held for a person to look at. */
  held: number;
}

export interface CalendarSourceFacts {
  /** The calendar link's last read: it read, it read but the latest try failed, it could not be read, or there is none. */
  link: CalendarFeedHealth;
  /** Why it could not be read, as a sentence (feedProblemWords); null or absent for no reason given. */
  problem?: string | null;
  /** The booking tool the owner named (config.bookings.tool), by its id; null for none. */
  tool: string | null;
  /** The owner said nothing books for them: they take bookings themselves (config.bookings.by_hand). */
  byHand?: boolean;
  /** What is known of the tool's emails; absent for a reader that holds only the settings. */
  emails?: BookingEmailsFacts | null;
  /** Whether the receptionist has a booking link to send (offersBookingLink). */
  bookingLink: boolean;
}

/**
 * Where it stands: `ready` works; `attention` worked and now needs a look (a link that stopped reading, emails held);
 * `needs_you` is set up as far as the owner has taken it (an address to make, a forward to confirm); `waiting` is the
 * tool's first email, which is nobody's to do; `hand` is a business that books by hand, by its own word; `none` is
 * nothing said yet.
 */
export type CalendarSourceState = "ready" | "attention" | "needs_you" | "waiting" | "hand" | "none";

export interface CalendarSourceVM {
  /** What feeds the calendar. */
  by: "link" | "emails" | "both" | "hand" | "nothing";
  state: CalendarSourceState;
  /** The mark's tone: ok where it works, warn where it is the owner's to do, plain otherwise. */
  tone: "ok" | "warn" | "plain";
  /** The state in a pill's few words. */
  words: string;
  /** What it means for the business, as a row says it under its name: `lead` and `rest` together. */
  sentence: string;
  /** The first sentence of it, which a card sets apart ("No calendar connected."). */
  lead: string;
  /** What follows the first sentence; "" when that is all. */
  rest: string;
  /** Whether the receptionist names open times: only from a calendar link that reads. */
  times: boolean;
  /** The next press, in a button's words, and the route it opens. */
  next: { label: string; to: string };
}

/** The first thing the tool's emails wait on, in the order an owner meets them; `working` once one became an appointment. */
export type BookingEmailsStep = "address" | "forwarding" | "held" | "waiting" | "working";

/**
 * Where a named tool's emails stand, the next thing to do first: an address to send to, then a forward Gmail waits on,
 * then emails held for a look (the owner's to see whether or not one has become an appointment yet), then the first
 * email, then working. The Business row's phrase (calendar/calendar.ts noticeRowOf) and every page's status ask this one rule.
 */
export function bookingEmailsStep(e: BookingEmailsFacts): BookingEmailsStep {
  if (!e.address) return "address";
  if (e.forwarding) return "forwarding";
  if (e.held > 0) return "held";
  return e.lastAt ? "working" : "waiting";
}

const TO_THE_ROW = (label: string) => ({ label, to: CALENDAR_SETTING_ROUTE });
const TO_THE_BOARD = { label: "Open Calendar", to: "calendar" };

/** A sentence in its two parts, and whole. */
const leadAndRest = (lead: string, rest = ""): Pick<CalendarSourceVM, "lead" | "rest" | "sentence"> => {
  const after = rest.trim();
  return { lead, rest: after, sentence: after ? `${lead} ${after}` : lead };
};

/** How many booking emails wait for a person, as a sentence: the status's lead and the fold's own line over its list. */
export const bookingEmailsHeldWords = (n: number): string =>
  n === 1 ? "One booking email needs a look." : `${n} booking emails need a look.`;

/** What the receptionist does about open times with no link to read them from. */
const noTimesWords = (bookingLink: boolean) =>
  bookingLink
    ? "The receptionist sends your booking link instead of naming open times."
    : "The receptionist does not name open times.";

/** The link could not be read: the owner's to check, whatever else arrives. */
function unreadLink(f: CalendarSourceFacts, by: CalendarSourceVM["by"], emailsWork: boolean): CalendarSourceVM {
  return {
    by,
    state: "attention",
    tone: "warn",
    words: CALENDAR_FEED_WORDS.unavailable,
    ...leadAndRest(
      "Your calendar could not be read.",
      `${f.problem ?? ""}${emailsWork ? " Booking emails still arrive." : ""}`,
    ),
    times: false,
    next: TO_THE_ROW("Check the link"),
  };
}

/** A named tool's emails that wait on the owner; null when none of them does. */
function emailsNeedYou(
  step: BookingEmailsStep,
  f: CalendarSourceFacts,
  e: BookingEmailsFacts,
  by: CalendarSourceVM["by"],
  times: boolean,
): CalendarSourceVM | null {
  const tool = bookingToolName(f.tool) ?? "Your booking tool";
  if (step === "address")
    return {
      by,
      state: "needs_you",
      tone: "warn",
      words: "Needs you",
      ...leadAndRest(`${tool} needs an address to send its booking emails to.`),
      times,
      next: TO_THE_ROW("Finish setting up"),
    };
  if (step === "forwarding")
    return {
      by,
      state: "needs_you",
      tone: "warn",
      words: "Needs you",
      ...leadAndRest("Gmail is waiting for you to confirm the forward."),
      times,
      next: TO_THE_ROW("Confirm the forward"),
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
      next: TO_THE_ROW(e.held === 1 ? "Look at it" : "Look at them"),
    };
  return null;
}

/** A link that reads, with whatever its tool's emails add. */
function readLink(f: CalendarSourceFacts, step: BookingEmailsStep | null): CalendarSourceVM {
  const tool = bookingToolName(f.tool);
  if (f.link === "stale")
    return {
      by: tool ? "both" : "link",
      state: "ready",
      tone: "ok",
      words: CALENDAR_FEED_WORDS.stale,
      ...leadAndRest("The latest read failed, so this is the last good one."),
      times: true,
      next: TO_THE_BOARD,
    };
  const emails =
    tool && step === "working"
      ? ` Booking emails from ${tool} add the client and the service.`
      : tool && step === "waiting"
        ? ` Waiting for the first booking email from ${tool}.`
        : "";
  return {
    by: tool ? "both" : "link",
    state: "ready",
    tone: "ok",
    words: CALENDAR_FEED_WORDS.ok,
    ...leadAndRest("The receptionist offers open times from it.", emails),
    times: true,
    next: TO_THE_BOARD,
  };
}

/** No link, and a tool named: its emails are the calendar. */
function emailsAlone(f: CalendarSourceFacts, step: BookingEmailsStep | null): CalendarSourceVM {
  const tool = bookingToolName(f.tool) ?? "your booking tool";
  if (step === "waiting")
    return {
      by: "emails",
      state: "waiting",
      tone: "plain",
      words: "Waiting for the first email",
      ...leadAndRest(`Waiting for the first booking email from ${tool}.`),
      times: false,
      next: TO_THE_ROW("See the steps"),
    };
  // When the last one came is the Business row's to say (calendar/calendar.ts noticeRowOf); here, what it means.
  return {
    by: "emails",
    state: "ready",
    tone: "ok",
    words: "By email",
    ...leadAndRest(`Bookings arrive by email from ${tool}.`, noTimesWords(f.bookingLink)),
    times: false,
    next: TO_THE_BOARD,
  };
}

/**
 * The one answer. In the order an owner would want to hear it: a link that stopped reading; then the tool's emails
 * where they wait on the owner; then what works (the link, with what the emails add; else the emails alone); then a
 * business that books by hand; then nothing set up.
 */
export function calendarSourceOf(f: CalendarSourceFacts): CalendarSourceVM {
  const linked = f.link !== "none";
  const named = !!f.tool;
  const by: CalendarSourceVM["by"] = linked && named ? "both" : linked ? "link" : named ? "emails" : "nothing";
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
      next: TO_THE_ROW("Change"),
    };
  return {
    by: "nothing",
    state: "none",
    tone: "plain",
    words: CALENDAR_FEED_WORDS.none,
    ...leadAndRest(
      "No calendar connected.",
      "Say what you book with, so your calendar fills and the receptionist knows what is taken.",
    ),
    times: false,
    next: TO_THE_ROW("Connect your calendar"),
  };
}

/** The same facts as a wire shape carries them (SetupDto's calendar, CalendarFeedDto), read into the rule's own. */
export function calendarSourceFacts(c: {
  state: "ok" | "unavailable" | "none";
  stale?: boolean;
  problem?: string | null;
  tool?: string | null;
  by_hand?: boolean;
  emails?: { address: boolean; forwarding: boolean; last_at: string | null; held: number } | null;
  booking_link?: boolean;
}): CalendarSourceFacts {
  return {
    link: c.state === "ok" ? (c.stale ? "stale" : "ok") : c.state,
    problem: c.problem ?? null,
    tool: c.tool ?? null,
    byHand: !!c.by_hand,
    emails: c.emails
      ? { address: c.emails.address, forwarding: c.emails.forwarding, lastAt: c.emails.last_at, held: c.emails.held }
      : null,
    bookingLink: !!c.booking_link,
  };
}

/**
 * What Reports says where there is no calendar link to count bookings from. It reads the link alone until the readers
 * move onto the record (docs/plans/2026-10-07-bookings-arrive-by-email.md, G), so it asks for a link by that name: a
 * business whose bookings arrive by email has a calendar, and "Connect your calendar" told it otherwise.
 */
export const BOOKED_NEEDS_A_LINK = "Add a calendar link under Settings › Business to see who booked.";

/* ---------------------------------------------------------------- the Business row that holds all of it */

/** What an owner books with, where it is no tool of the list: a calendar with no tool behind it, or their own hands. */
export const BOOKS_WITH_CALENDAR = "calendar";
export const BOOKS_BY_HAND = "hand";

/** The picker's choices: the tools, then the two answers that name none. */
export function booksWithOptions(): Array<{ value: string; label: string }> {
  return [
    ...bookingToolOptions(),
    { value: BOOKS_WITH_CALENDAR, label: "Google, Apple or Outlook calendar" },
    { value: BOOKS_BY_HAND, label: "I book by hand" },
  ];
}

/**
 * What the stored settings say the owner books with, as the picker holds it: the tool named; else a calendar, where a
 * link is stored; else their own hands, where they said so; else "" for nothing said yet. A link outranks "by hand":
 * a calendar that is read is what every page says (calendarSourceOf).
 */
export function booksWithOf(c: { tool?: string | null; by_hand?: boolean | null; ical_url?: string | null }): string {
  return c.tool || (c.ical_url ? BOOKS_WITH_CALENDAR : c.by_hand ? BOOKS_BY_HAND : "");
}

/** What the row states as its value: the tool's name, "Calendar link", "Booked by hand"; null for nothing said yet. */
export function booksWithName(withWhat: string): string | null {
  if (!withWhat) return null;
  if (withWhat === BOOKS_WITH_CALENDAR) return "Calendar link";
  if (withWhat === BOOKS_BY_HAND) return "Booked by hand";
  return bookingToolName(withWhat);
}

/** The row and its fold, in the words the product says them. */
export const BOOKING_TOOL_WORDS = {
  label: "Booking tool",
  hint: "What you book with. It fills your calendar and tells the receptionist what is taken.",
  empty: "Not set up",
  placeholder: "What do you book with?",
  link: {
    title: "Calendar link",
    why: "So the receptionist can offer open times.",
    anyway: "I have a calendar link",
    /** Under "I book by hand", where a link is kept: that answer has none, so saving it takes the link away. */
    goes: "Saving this removes your calendar link.",
  },
  emails: {
    title: "Booking emails",
    why: "So each booking shows who it is and what for.",
  },
} as const;

/**
 * Whether the fold draws the calendar link's box for what the owner books with: `shown` where the answer has a link to
 * give; `offered` behind one press where the tool is known to give none (an owner may still keep a calendar of their
 * own); `hidden` where there is nothing to read (by hand, or nothing said yet). A link already typed or stored is on
 * screen under every answer but one. "I book by hand" is the owner's word that nothing is read: it has no box, and
 * saving it takes a kept link away, which the fold says first (BOOKING_TOOL_WORDS.link.goes). It kept the box, and the
 * link with it, and a link outranks the word on the next read (booksWithOf): an owner who said "by hand" and saved
 * was told "Calendar link" (the review of 8 Oct 2026).
 */
export function calendarLinkShown(withWhat: string, held: boolean): "shown" | "offered" | "hidden" {
  if (withWhat === BOOKS_BY_HAND) return "hidden";
  if (held) return "shown";
  if (!withWhat) return "hidden";
  return bookingToolCalendar(withWhat) === "none" ? "offered" : "shown";
}

/**
 * What the fold says about the calendar link for what the owner books with: where to find it, for a tool whose calendar
 * is known (BookingToolCalendar); that there is none, and what the receptionist does then; or the question itself, for
 * a tool not verified. One sentence, in the tool's name.
 */
export function calendarLinkNote(withWhat: string, bookingLink: boolean): string {
  if (!withWhat) return "";
  if (withWhat === BOOKS_BY_HAND) return `Nothing to connect. ${noTimesWords(bookingLink)}`;
  if (withWhat === BOOKS_WITH_CALENDAR) return "Paste the private address of the calendar your appointments land in.";
  const tool = bookingToolName(withWhat) ?? "Your tool";
  const kind = bookingToolCalendar(withWhat);
  if (kind === "none") return `${tool} offers no calendar link. ${noTimesWords(bookingLink)}`;
  if (kind === "own") return `${tool} offers a calendar link of its own. Paste it here.`;
  if (kind === "writes")
    return `${tool} writes your appointments into your own calendar. Paste that calendar's private address here.`;
  return `If ${tool} offers a calendar link, or writes into your own calendar, paste that address here.`;
}
