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
    needsCalendar: `${capitalize(many)} are read from your calendar, and none is connected. Connect one under Settings › Business.`,
  };
}
