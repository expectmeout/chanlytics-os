/**
 * What a workspace calls an appointment (J1; decisions 40 to 42 of the spec of 9 Oct 2026, and 0041 J4): appointment,
 * visit, meeting, session or lesson. Stored now (`tenants.appointment_word`, 00458), picked on Settings › Details:
 * `appointmentWordOf` reads what the workspace picked and, where it never did, the word the retired `tenants.sells_by`
 * gave it (a meeting where some customers got a proposal first, 0008), until that column goes. Words only: it changes no
 * moment, run, list or send, and the code keeps `visit` in its ids (`visit_tomorrow`, `visited`, the `visit` kind). Every
 * phrase the word makes is written once here (`appointmentWords`), so a page is handed the word and says nothing of its
 * own.
 *
 * Out on purpose: "call" (the glossary's Call, a phone conversation, and People's Calls), "consultation" (0004's
 * consult-first appointment and its list) and "booking" (the act and the link, `bookings.tool`). "Class" is not in the set.
 */
import { capitalize, plural } from "../shared/words";

/** The words a workspace may call an appointment, in the order a picker offers them. */
export const APPOINTMENT_WORDS = ["appointment", "visit", "meeting", "session", "lesson"] as const;

export type AppointmentWord = (typeof APPOINTMENT_WORDS)[number];

/** Whether a value is one of the five: a stored word read back is checked, never trusted. */
export function isAppointmentWord(value: unknown): value is AppointmentWord {
  return typeof value === "string" && (APPOINTMENT_WORDS as readonly string[]).includes(value);
}

/**
 * What the workspace calls an appointment: the word it picked, else the word its retired answer to how its customers
 * buy gave it (a meeting where some got a proposal first, which 00458 stored for each of them), else an appointment.
 * The one derivation: the server reads it once for a workspace and hands the pages the word (0041: one page, one word).
 */
export function appointmentWordOf(o: { stored: string | null; sellsBy: string | null }): AppointmentWord {
  if (isAppointmentWord(o.stored)) return o.stored;
  // The retired column's one remaining reading, for a database 00458 has not reached: it goes with the column.
  return o.sellsBy === "proposal" ? "meeting" : "appointment";
}

/** What Settings › Details asks of the word (0041 J4; 0008, amended 18 Oct 2026). */
const APPOINTMENT_WORD_QUESTION = "What you call a booking";

/** What PATCH workspaces answers for anything but the five. */
// trade-word: the five a workspace may pick, each named
export const APPOINTMENT_WORD_REFUSAL = "What you call a booking: appointment, visit, meeting, session or lesson.";

/** The word's row on Details: what it says, and the five to choose from. */
export interface AppointmentWordVM {
  question: string;
  /** The word as the row states it: "Appointment". */
  value: string;
  /** The row's act, and what a screen reader hears it as. */
  act: string;
  name: string;
  /** The five, each with two of the phrases it makes, as the pages say them. */
  choices: { value: AppointmentWord; label: string; hint: string }[];
  word: AppointmentWord;
}

export function appointmentWordVM(word: AppointmentWord): AppointmentWordVM {
  return {
    question: APPOINTMENT_WORD_QUESTION,
    value: capitalize(word),
    act: "Change",
    name: `Change ${APPOINTMENT_WORD_QUESTION.toLowerCase()}`,
    choices: APPOINTMENT_WORDS.map((w) => {
      const W = appointmentWords(w);
      return { value: w, label: W.Title, hint: `${W.next} · ${W.before.name}` };
    }),
    word,
  };
}

/** The toast once a word is saved. */
export function appointmentWordSaved(word: AppointmentWord): string {
  return `Saved — it says “${word}” now.`;
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
