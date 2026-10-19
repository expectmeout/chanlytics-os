import { capitalize, plural } from "../shared/words.js";
export const APPOINTMENT_WORDS = ["appointment", "visit", "meeting", "session", "lesson"];
export function isAppointmentWord(value) {
  return typeof value === "string" && APPOINTMENT_WORDS.includes(value);
}
export function appointmentWordOf(o) {
  if (isAppointmentWord(o.stored)) return o.stored;
  return o.sellsBy === "proposal" ? "meeting" : "appointment";
}
const APPOINTMENT_WORD_QUESTION = "What you call a booking";
export const APPOINTMENT_WORD_REFUSAL = "What you call a booking: appointment, visit, meeting, session or lesson.";
export function appointmentWordVM(word) {
  return {
    question: APPOINTMENT_WORD_QUESTION,
    value: capitalize(word),
    act: "Change",
    name: `Change ${APPOINTMENT_WORD_QUESTION.toLowerCase()}`,
    choices: APPOINTMENT_WORDS.map((w) => {
      const W = appointmentWords(w);
      return { value: w, label: W.Title, hint: `${W.next} \xB7 ${W.before.name}` };
    }),
    word
  };
}
export function appointmentWordSaved(word) {
  return `Saved \u2014 it says \u201C${word}\u201D now.`;
}
const FORMS = {
  appointment: {
    a: "an appointment",
    has: "has an appointment",
    have: "have an appointment",
    had: "had an appointment"
  },
  visit: { a: "a visit", has: "visits", have: "visit", had: "visited" },
  // trade-word: the word's own forms, said once
  meeting: { a: "a meeting", has: "has a meeting", have: "have a meeting", had: "had a meeting" },
  session: { a: "a session", has: "has a session", have: "have a session", had: "had a session" },
  lesson: { a: "a lesson", has: "has a lesson", have: "have a lesson", had: "had a lesson" }
};
export function appointmentWords(word) {
  const f = FORMS[word];
  const Title = capitalize(word);
  const many = `${word}s`;
  const people = (n) => plural(n, "person", "people");
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
    offTomorrow: (n) => `Off \xB7 ${people(n)} ${n === 1 ? f.has : f.have} tomorrow`,
    offYesterday: (n) => `Off \xB7 ${people(n)} ${f.had} yesterday`,
    startsWith: `${f.a} tomorrow, ${f.a} yesterday`,
    byMany: `by ${many}`,
    needsCalendar: `${capitalize(many)} are read from your calendar, and none is connected. Connect one under Settings \u203A Hours & booking.`,
    cancelAsk: `Cancel this ${word}?`,
    cancelAct: `Cancel the ${word}\u2026`,
    bookingLink: (link) => `Here's the link to book your ${word}: ${link}`,
    nextLink: (link) => `Here's the link to book your next ${word}: ${link}`,
    newTimeLink: (link) => `Here's a link to pick a new time for your ${word}: ${link}`
  };
}
