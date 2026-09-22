/**
 * The appointment dialog's decisions, EXECUTED. Opening a block on the board used to give a title, a long
 * date, a sentence, and a bordered box that looked like a field but was the event's own notes — and when a
 * booking tool had written the person's name and number into those notes, the box repeated what the two
 * lines above it already said.
 *
 * These are the three judgements the redesigned panel makes: how long it runs, which day it is in the words
 * a person asks in, and whether the notes say anything new.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "./_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
const L = "../../../apps/dashboard/src/legacy";
await import(`${L}/pages/calendar-real.jsx`);
const W = globalThis.window;

test("how long it runs, in the words the day's rows use", () => {
  assert.equal(W.crDur(45), "45m");
  assert.equal(W.crDur(60), "1h");
  assert.equal(W.crDur(90), "1h 30m");
  assert.equal(W.crDur(120), "2h");
  // An all-day block and a broken one say nothing rather than "0m".
  for (const bad of [0, -5, null, undefined, NaN]) assert.equal(W.crDur(bad), "", String(bad));
});

test("which day, as a person asks it", () => {
  const TODAY = "2026-09-20";
  assert.equal(
    W.crWhen({ today: true, key: TODAY }, TODAY),
    "Today",
    "the board says which day is today; no second clock is consulted",
  );
  assert.equal(W.crWhen({ today: false, key: "2026-09-21" }, TODAY), "Tomorrow");
  assert.equal(W.crWhen({ today: false, key: "2026-09-19" }, TODAY), "Yesterday");
  // Further out, the date itself is the clearer thing to read.
  assert.equal(W.crWhen({ today: false, key: "2026-09-22" }, TODAY), null);
  assert.equal(W.crWhen({ today: false, key: "2026-09-27" }, TODAY), null);
  // Across a month and a year, where adding one to the number is wrong.
  assert.equal(W.crWhen({ today: false, key: "2026-10-01" }, "2026-09-30"), "Tomorrow");
  assert.equal(W.crWhen({ today: false, key: "2027-01-01" }, "2026-12-31"), "Tomorrow");
  assert.equal(W.crWhen({ today: false, key: "2026-12-31" }, "2027-01-01"), "Yesterday");
  assert.equal(
    W.crWhen({ today: false, key: "2026-09-21" }, null),
    null,
    "without the board's today, nothing relative is claimed",
  );
});

test("the notes are shown only when they say something the panel has not", () => {
  const person = { name: "Priya Nair" };
  const contacts = { phones: ["+1 917 555 0103"], e164: ["+19175550103"], emails: [] };
  // What a booking tool wrote, and what the two lines above already say.
  assert.equal(
    W.crNotesWorth("Priya Nair · +1 917 555 0103", person, contacts),
    null,
    "the name and the number are both above",
  );
  assert.equal(W.crNotesWorth("Priya Nair", person, contacts), null);
  assert.equal(W.crNotesWorth("+1 917 555 0103", person, contacts), null);
  // The same number written another way is the same number.
  assert.equal(
    W.crNotesWorth("Priya Nair (917) 555-0103", person, contacts),
    null,
    "a number is its digits, however it is punctuated",
  );
  // Anything an owner has not read yet stays.
  assert.equal(
    W.crNotesWorth("Priya Nair · +1 917 555 0103 · allergic to ammonia", person, contacts),
    "Priya Nair · +1 917 555 0103 · allergic to ammonia",
  );
  assert.equal(W.crNotesWorth("Deposit paid", person, contacts), "Deposit paid");
  // Nothing to say, and nobody matched: the notes stand on their own.
  assert.equal(W.crNotesWorth(null, person, contacts), null);
  assert.equal(W.crNotesWorth("", person, contacts), null);
  assert.equal(W.crNotesWorth("Walk-in", null, { phones: [], emails: [] }), "Walk-in");
  // Punctuation alone is not something to read.
  assert.equal(W.crNotesWorth("Priya Nair ·  —  ", person, contacts), null);
});
