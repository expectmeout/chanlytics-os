/**
 * A day in words is read in one table (contracts calendar/day-keys.ts: weekdayOf, dayWordIn, onOrAfter, dayKeyNamed).
 * Five tables read it before 29 October 2026, and they disagreed: Ask's calendar read "sábado" and "this friday" as
 * today, the openings asked for on "miércoles" were every day's, and Ask's reads before its first round took "el lunes
 * por la mañana" (Monday morning) for tomorrow. Each reader is run here on the same words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  dayFromQuestion,
  dayKeyNamed,
  dayWordIn,
  filterOpenings,
  onOrAfter,
  weekHoursOf,
  weekdayOf,
} from "@chanlytics/contracts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("a weekday is one word of the one table, English or Spanish, whole or cut short, with its accent or without", () => {
  const forms = {
    mon: ["mon", "Monday", "LUNES"],
    tue: ["tue", "tues", "Tuesday", "martes"],
    wed: ["wed", "weds", "wednesday", "miércoles", "miercoles"],
    thu: ["thu", "thur", "thurs", "Thursday", "jueves"],
    fri: ["fri", "friday", "viernes"],
    sat: ["sat", "Saturday", "Sábado", "sabado"],
    sun: ["sun", "sunday", "domingo"],
  };
  for (const [key, words] of Object.entries(forms)) for (const w of words) assert.equal(weekdayOf(w), key, w);
  for (const w of ["", "we", "sa", "mar", "today", "constructor", "toString", "monday morning"])
    assert.equal(weekdayOf(w), null, `"${w}" is no weekday`);
});

test("the day a sentence names: tomorrow before today before a weekday, and mañana is the morning after la", () => {
  const said = {
    "what do I have tomorrow?": "tomorrow",
    "¿qué tengo mañana?": "tomorrow",
    "hasta manana": "tomorrow",
    "any calls today?": "today",
    "¿qué hay hoy?": "today",
    "¿quién llamó esta mañana?": "today",
    "¿qué tengo el sábado?": "sat",
    "what's on this friday": "fri",
    "el lunes por la mañana": "mon",
    "mañana por la mañana": "tomorrow",
    "friday or monday": "fri",
    "today, or tomorrow at the latest": "tomorrow",
    "what's on the calendar": null,
    "is the mailbox set up?": null,
  };
  for (const [q, day] of Object.entries(said)) assert.equal(dayWordIn(q), day, q);
});

test("a day named is a key from the business's today: a date as written, and a weekday its next, today when it is today", () => {
  // Saturday 31 October 2026.
  const today = "2026-10-31";
  assert.equal(onOrAfter(today, "sat"), "2026-10-31", "Saturday asked on a Saturday is that day");
  assert.equal(onOrAfter(today, "sun"), "2026-11-01");
  assert.equal(onOrAfter(today, "fri"), "2026-11-06");
  assert.equal(dayKeyNamed("sábado", today), "2026-10-31");
  assert.equal(dayKeyNamed("this friday", today), "2026-11-06");
  assert.equal(dayKeyNamed("mañana", today), "2026-11-01");
  assert.equal(dayKeyNamed("today", today), today);
  assert.equal(dayKeyNamed(" 2026-12-24 ", today), "2026-12-24");
  assert.equal(dayKeyNamed("next week", today), null, "a day it cannot read is none, for its caller's own default");
});

test("each reader reads the same words: the fast paths, the openings, a listing's hours and Ask's cross-page reads", async () => {
  const noon = Date.parse("2026-10-30T16:00:00.000Z");
  assert.equal(dayFromQuestion("what's open el miércoles?", noon, "America/Chicago"), "wed");
  assert.equal(dayFromQuestion("what's open tomorrow?", noon, "America/Chicago"), "2026-10-31");
  assert.equal(dayFromQuestion("¿qué hay libre el lunes por la mañana?", noon, "America/Chicago"), "mon");

  const opening = (key, weekday) => ({ key, weekday, label: key, windows: [{ start: 0, end: 3_600_000 }] });
  const week = [opening("2026-11-03", "tue"), opening("2026-11-04", "wed"), opening("2026-11-11", "wed")];
  assert.deepEqual(
    filterOpenings(week, { day: "Miércoles" }).map((o) => o.key),
    ["2026-11-04"],
    "a weekday in Spanish is the next one, never every day",
  );
  assert.deepEqual(
    filterOpenings(week, { day: "constructor" }).map((o) => o.key),
    week.map((o) => o.key),
    "a word that is no day asks for none",
  );

  const hours = weekHoursOf([
    { day: "Mo", hours: "9 AM to 5 PM" },
    { day: "Weds.", hours: "10 AM to 2 PM" },
    { day: "Saturday (Halloween)", hours: "Closed" },
  ]);
  assert.equal(hours.read, true);
  assert.deepEqual(hours.week.mon, [{ from: 540, to: 1020 }], "a listing's own two letters");
  assert.deepEqual(hours.week.wed, [{ from: 600, to: 840 }]);
  assert.deepEqual(hours.week.sat, []);

  const { crossPagePlan } = await import(
    pathToFileURL(path.join(here, "../../../../apps/dashboard/src/server/ask/cross-page.ts")).href
  );
  const dayOf = (q) => crossPagePlan(q, "people").find((r) => r.name === "calendar")?.input.day;
  assert.equal(dayOf("¿qué tengo el sábado?"), "sat");
  assert.equal(dayOf("what's on the calendar this friday?"), "fri");
  assert.equal(dayOf("¿qué tengo el lunes por la mañana?"), "mon", "Monday morning, not tomorrow");
  assert.equal(dayOf("what's on the calendar?"), "today");
});
