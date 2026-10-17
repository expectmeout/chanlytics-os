/**
 * What a workspace calls an appointment (J1; decisions 40 to 42 of the spec of 9 Oct 2026): appointment, visit, meeting,
 * session or lesson. Derived now, stored later: `appointmentWordOf` reads what the workspace picked (`stored`, null until
 * the journey lane gives it a column beside `tenants.sells_by` and a Settings › Business row) and else how its customers
 * buy: a meeting where some get a proposal first (dealsAreOn, 0008), an appointment everywhere else. Words only: it
 * changes no moment, run, list or send, and the code keeps `visit` in its ids (`visit_tomorrow`, `visited`, the `visit`
 * kind). Every phrase the word makes is written once here (`appointmentWords`), so a page is handed the word and says
 * nothing of its own.
 *
 * Out on purpose: "call" (the glossary's Call, a phone conversation, and People's Calls), "consultation" (0004's
 * consult-first appointment and its list) and "booking" (the act and the link, `bookings.tool`). "Class" is not in the set.
 */
import { dealsAreOn } from "../deals/sells-by";
import { capitalize, plural } from "../shared/words";

/** The words a workspace may call an appointment, in the order a picker offers them. */
export const APPOINTMENT_WORDS = ["appointment", "visit", "meeting", "session", "lesson"] as const;

export type AppointmentWord = (typeof APPOINTMENT_WORDS)[number];

/** Whether a value is one of the five: a stored word read back is checked, never trusted. */
export function isAppointmentWord(value: unknown): value is AppointmentWord {
  return typeof value === "string" && (APPOINTMENT_WORDS as readonly string[]).includes(value);
}

/**
 * What the workspace calls an appointment: the word it picked, else a meeting where some of its customers get a proposal
 * first and an appointment everywhere else. The one derivation: GET playbooks, Ask's shape and core's names all ask it.
 * Nothing is backfilled, so a salon reads "appointment" until it picks.
 */
export function appointmentWordOf(o: { stored: string | null; sellsBy: string | null }): AppointmentWord {
  if (isAppointmentWord(o.stored)) return o.stored;
  return dealsAreOn(o.sellsBy) ? "meeting" : "appointment";
}

/**
 * What a page calls an appointment when all it knows of the workspace is whether deals are on (dealsAreOn): the same
 * derivation as GET playbooks' shape (appointmentWordOf with nothing stored), for the pages that read no playbooks -- the
 * person's page, People's table -- so a workspace whose customers get a proposal first reads "meeting" there as it does on
 * Campaigns (decision 0041, item 2).
 */
export function appointmentWordWhere(dealsOn: boolean): AppointmentWord {
  return appointmentWordOf({ stored: null, sellsBy: dealsOn ? "proposal" : null });
}

/** How each word takes an article and a verb. Visit is the one that is a verb itself: "visits tomorrow", "visited". */
const FORMS: Record<AppointmentWord, { a: string; has: string; have: string; had: string }> = {
  appointment: {
    a: "an appointment",
    has: "has an appointment",
    have: "have an appointment",
    had: "had an appointment",
  },
  visit: { a: "a visit", has: "visits", have: "visit", had: "visited" }, // trade-word: the word's own forms, said once
  meeting: { a: "a meeting", has: "has a meeting", have: "have a meeting", had: "had a meeting" },
  session: { a: "a session", has: "has a session", have: "have a session", had: "had a session" },
  lesson: { a: "a lesson", has: "has a lesson", have: "have a lesson", had: "had a lesson" },
};

/** Every phrase the word makes, as Campaigns, its drawer, its approval sheet, its composer and core's refusals say it. */
export interface AppointmentPhrases {
  word: AppointmentWord;
  /** "appointment", "appointments", "an appointment", "Appointment". */
  one: string;
  many: string;
  a: string;
  Title: string;
  /** "Appointments": a column's head. */
  Many: string;
  /** "Next appointment" and "Last appointment": the person's page, a fact and a line of its About rail each. */
  next: string;
  last: string;
  /** The Today brief's count: "1 appointment today", "3 appointments today". */
  today: (n: number) => string;
  /** The day before: the moment's caption, a new campaign's name on it, and the trigger's hint. */
  before: { caps: string; name: string; hint: string };
  /** The day after: the moment's caption, which is also a new campaign's name on it, and the trigger's hint. */
  after: { caps: string; hint: string };
  /** The win-back by appointments' hint. */
  lapsedHint: string;
  /** A schedule's who: "everyone with an appointment tomorrow", "everyone who had an appointment yesterday". */
  tomorrowWho: string;
  yesterdayWho: string;
  /** What "of 312" counts: "with an appointment tomorrow", "who had an appointment yesterday". */
  withTomorrow: string;
  whoYesterday: string;
  /** The approval sheet's rule lines. */
  eachTomorrow: string;
  eachYesterday: string;
  /** Coming up's line for an off moment with people waiting. */
  offTomorrow: (n: number) => string;
  offYesterday: (n: number) => string;
  /** Core's refusal names the two moments: "an appointment tomorrow, an appointment yesterday". */
  startsWith: string;
  /** "by appointments": how the win-back reads people where a calendar is connected. */
  byMany: string;
  /** Core's refusal of an appointment moment where no calendar is connected. */
  needsCalendar: string;
  /** The question before one is said cancelled (the visit line's Cancel): "Cancel this appointment?". */
  cancelAsk: string;
  /** The act that asks it, in the Calendar's More: "Cancel the appointment…". */
  cancelAct: string;
  /** The words a booking link is handed to the customer in, ready in their thread's box: "Here's the link to book your appointment: <link>". */
  bookingLink: (link: string) => string;
  /** After one they kept: "Here's the link to book your next appointment: <link>". */
  nextLink: (link: string) => string;
  /** After one they missed or that was cancelled: "Here's a link to pick a new time for your appointment: <link>". */
  newTimeLink: (link: string) => string;
}

export function appointmentWords(word: AppointmentWord): AppointmentPhrases {
  const f = FORMS[word];
  const Title = capitalize(word);
  const many = `${word}s`;
  const people = (n: number) => plural(n, "person", "people");
  return {
    word,
    one: word,
    many,
    a: f.a,
    Title,
    Many: capitalize(many),
    next: `Next ${word}`,
    last: `Last ${word}`,
    today: (n) => `${n} ${n === 1 ? word : many} today`,
    before: { caps: `${Title} tomorrow`, name: `${Title} reminder`, hint: `The day before ${f.a} on the calendar` },
    after: { caps: `After the ${word}`, hint: `The day after ${f.a}, when nothing is booked next` },
    lapsedHint: `No ${word} in 45 days, and nothing booked`,
    tomorrowWho: `everyone with ${f.a} tomorrow`,
    yesterdayWho: `everyone who ${f.had} yesterday`,
    withTomorrow: `with ${f.a} tomorrow`,
    whoYesterday: `who ${f.had} yesterday`,
    eachTomorrow: `each has ${f.a} tomorrow on the calendar`,
    eachYesterday: `each ${f.had} yesterday and has nothing booked next`,
    offTomorrow: (n) => `Off · ${people(n)} ${n === 1 ? f.has : f.have} tomorrow`,
    offYesterday: (n) => `Off · ${people(n)} ${f.had} yesterday`,
    startsWith: `${f.a} tomorrow, ${f.a} yesterday`,
    byMany: `by ${many}`,
    needsCalendar: `${capitalize(many)} are read from your calendar, and none is connected. Connect one under Settings › Hours & booking.`,
    cancelAsk: `Cancel this ${word}?`,
    cancelAct: `Cancel the ${word}…`,
    bookingLink: (link) => `Here's the link to book your ${word}: ${link}`,
    nextLink: (link) => `Here's the link to book your next ${word}: ${link}`,
    newTimeLink: (link) => `Here's a link to pick a new time for your ${word}: ${link}`,
  };
}
