/**
 * The rules a time asked for on a form keeps (the Forms plan, F3; Ruben's call 8; decision 0061), pure: the way a form
 * asks follows the workspace's own booking setting, the chat's own rule (contracts takesBookingRequests); the open
 * times it offers are a finger wide and few, never an hour away or less; a time is kept as a slot on the business's
 * clock and said as one; and the owner's notice and the request's lines say the time asked for, never "booked".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formRequestNotice,
  formTimeHolds,
  formTimesOf,
  formTimeWayOf,
  localToUtcMs,
  readFormAnswers,
  requestLines,
  formSlotWords,
  takesBookingRequests,
} from "@chanlytics/contracts";

const TZ = "America/New_York";
const HOUR_MS = 3_600_000;
const at = (y, m, d, hh, mm = 0) => localToUtcMs(TZ, y, m, d, hh, mm);
/** Words as a person reads them: the narrow space some versions of the date data put before AM and PM, as a space. */
const plain = (words) => words.replace(/\u202f/g, " ");

test("the way a form asks for a time is the workspace's own: the chat's rule, and nothing of the form's", () => {
  // The reader asks the chat's own rule (takesBookingRequests) and hands its answer in.
  const way = (switchOn, bookingLink, held) =>
    formTimeWayOf({
      takesRequests: takesBookingRequests({ switchOn, linkInChat: !!bookingLink?.trim(), bookingHeld: held }),
      bookingLink,
      held,
    });
  // Requests on, and the team confirms: no booking page offered, or bookings held for a person (Ask me first).
  assert.equal(way(true, null, false), "requests");
  assert.equal(way(true, "https://book.example/luma", true), "requests");
  // A booking page it offers, bookings not held: there.
  assert.equal(way(true, "https://book.example/luma", false), "their_page");
  assert.equal(way(false, "https://book.example/luma", false), "their_page");
  // Requests off and no page, or a page held for a person with requests off: the form asks as it wrote it.
  assert.equal(way(false, null, false), "ask");
  assert.equal(way(false, "https://book.example/luma", true), "ask");
  assert.equal(way(false, "   ", false), "ask", "a blank page is none");
});

test("the times offered: a few a day, spread over it, the first days that have any, never an hour away or less", () => {
  const day = (d, windows) => ({ key: `2026-11-${d}`, weekday: "mon", label: "", windows });
  const openings = [
    day(23, [{ start: at(2026, 11, 23, 9), end: at(2026, 11, 23, 12) }]),
    day(24, [{ start: at(2026, 11, 24, 9), end: at(2026, 11, 24, 17) }]),
    day(25, [{ start: at(2026, 11, 25, 9), end: at(2026, 11, 25, 9, 30) }]),
    day(26, [
      { start: at(2026, 11, 26, 10), end: at(2026, 11, 26, 11) },
      { start: at(2026, 11, 26, 14), end: at(2026, 11, 26, 16) },
    ]),
    day(27, [{ start: at(2026, 11, 27, 9), end: at(2026, 11, 27, 17) }]),
    day(28, [{ start: at(2026, 11, 28, 9), end: at(2026, 11, 28, 17) }]),
  ];
  // It is 9:30 on the first day: 10:00 is half an hour away and is not offered.
  const nowMs = at(2026, 11, 23, 9, 30);
  const days = formTimesOf(openings, { tz: TZ, slotMin: 60, nowMs, lang: "en-US" });
  assert.deepEqual(
    days.map((d) => [d.key, d.label, d.times.map((t) => t.slot.slice(11))]),
    [
      ["2026-11-23", "Mon, Nov 23", ["11:00"]],
      // Eight starts, three kept (one row on a phone): the first, the last, and the middle.
      ["2026-11-24", "Tue, Nov 24", ["09:00", "13:00", "16:00"]],
      // A window shorter than a slot offers nothing, and its day is passed over.
      ["2026-11-26", "Thu, Nov 26", ["10:00", "14:00", "15:00"]],
      ["2026-11-27", "Fri, Nov 27", ["09:00", "13:00", "16:00"]],
    ],
  );
  assert.equal(days[1].times[0].slot, "2026-11-24 09:00");
  assert.equal(plain(days[1].times[0].label), "9:00 AM");
  for (const d of days) for (const t of d.times) assert.ok(at(...t.slot.split(/\D/).map(Number)) > nowMs + HOUR_MS);
  assert.deepEqual(formTimesOf([], { tz: TZ, slotMin: 60, nowMs, lang: "en-US" }), [], "no openings, no times");
});

test("a slot is said as its day and hour on the business's clock, in the form's language", () => {
  assert.equal(plain(formSlotWords("2026-11-28 11:00")), "Sat, Nov 28, 11:00 AM");
  assert.match(formSlotWords("2026-11-28 11:00", "es"), /sáb.*28.*nov.*11:00/i);
  assert.equal(formSlotWords("Mornings"), "Mornings", "what is no slot is said as it was kept");
});

test("a time still holds while it waits on its owner and its day has not passed", () => {
  const nowMs = Date.parse("2026-11-23T12:00:00Z");
  assert.equal(formTimeHolds({ status: "proposed", expiresAt: "2026-11-24T11:00:00Z" }, nowMs), true);
  assert.equal(formTimeHolds({ status: "proposed", expiresAt: "2026-11-23T11:00:00Z" }, nowMs), false);
  assert.equal(formTimeHolds({ status: "booked", expiresAt: null }, nowMs), false);
  assert.equal(formTimeHolds({ status: "cancelled", expiresAt: "2026-11-24T11:00:00Z" }, nowMs), false);
});

const FORM = {
  heading: "Colour consultation",
  lang: "en",
  thanks: "Thanks.",
  next: { chat: true, draft: true, follow_up: false },
  fields: [
    { id: "name", kind: "short", label: "Your name", needed: true },
    { id: "mail", kind: "email", label: "Email", needed: true },
    {
      id: "when",
      kind: "when",
      label: "When would you like to come?",
      needed: true,
      choices: [
        { id: "am", label: "Mornings" },
        { id: "sat", label: "Saturdays" },
      ],
    },
  ],
};

test("asked as open times, a when question is answered by a slot or by nothing; sent to a booking page, it asks nothing", () => {
  const base = { name: "Ana Ruiz", mail: "ana@example.com" };
  const asked = readFormAnswers(FORM, { ...base, when: "" });
  assert.deepEqual(
    asked.problems,
    { when: "needed" },
    "asked as the form wrote it, a needed question needs its answer",
  );
  const timed = readFormAnswers(FORM, { ...base, when: "2026-11-28 11:00" }, undefined, { when: "times" });
  assert.deepEqual(timed.problems, {});
  assert.equal(timed.answers.when, "2026-11-28 11:00");
  const none = readFormAnswers(FORM, { ...base, when: "" }, undefined, { when: "times" });
  assert.deepEqual(none.problems, {}, "None of these work is an answer too");
  assert.equal(none.answers.when, undefined);
  const choice = readFormAnswers(FORM, { ...base, when: "am" }, undefined, { when: "times" });
  assert.equal(choice.answers.when, undefined, "shown as times, a choice the page did not show is no answer");
  const away = readFormAnswers(FORM, { ...base, when: "" }, undefined, { when: "page" });
  assert.deepEqual(away.problems, {});
  // A slot sent where the page asked the question as written is no choice of it.
  assert.deepEqual(readFormAnswers(FORM, { ...base, when: "2026-11-28 11:00" }).problems, { when: "one_choice" });
});

test("the request's lines and the owner's notice say the time asked for, and never that it is booked", () => {
  const answers = { name: "Ana Ruiz", mail: "ana@example.com", when: "2026-11-28 11:00" };
  const line = requestLines(FORM, answers).find((one) => one.id === "when");
  assert.deepEqual(
    { ...line, words: plain(line.words) },
    {
      id: "when",
      kind: "when",
      label: "When would you like to come?",
      words: "Sat, Nov 28, 11:00 AM",
    },
  );
  const notice = formRequestNotice(FORM, answers, {
    entryId: "e1",
    contactId: "c1",
    reach: { name: "Ana Ruiz", email: "ana@example.com", phone: null },
    place: null,
  });
  assert.equal(plain(notice.subject), "Ana Ruiz asked for Sat, Nov 28, 11:00 AM: Colour consultation");
  assert.match(notice.body, /Nothing is booked: it waits in Inbox, in Needs you, for your Booked it or Can't\./);
  assert.doesNotMatch(notice.subject + notice.body, /you're booked|is booked for/i);
  const choice = formRequestNotice(
    FORM,
    { ...answers, when: "am" },
    { entryId: "e2", contactId: "c1", reach: { name: "Ana Ruiz", email: null, phone: null }, place: null },
  );
  assert.equal(choice.subject, "Ana Ruiz sent a request: Colour consultation");
});
