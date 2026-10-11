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

const { crDur, crNotesWorth, crWhen } = await import("../../../../apps/dashboard/src/surfaces/calendar/words.ts");
const W = { crDur, crNotesWorth, crWhen };

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

test("what may be said of a visit, and when, by mark_visit's own rules (00397): the panel offers no act the door would refuse", async () => {
  const { visitActsOf, visitStateOf } = await import("@chanlytics/contracts");
  const H = 3_600_000;
  const now = Date.parse("2026-10-11T15:00:00Z");
  const at = (fromH) => [now + fromH * H, now + (fromH + 1) * H];
  const acts = (status, fromH) => visitActsOf({ id: "a1", status }, ...at(fromH), now);
  assert.deepEqual(acts("booked", 5), ["cancelled"], "ahead: only cancelled");
  assert.deepEqual(acts("booked", -0.5), ["kept", "missed", "cancelled"], "under way: any of the three");
  assert.deepEqual(acts("booked", -3), ["kept", "missed"], "over: whether they came, never cancelled");
  assert.deepEqual(acts("kept", -3), ["missed"], "a kept visit corrected to missed");
  assert.deepEqual(acts("missed", -3), ["kept"], "and back");
  assert.deepEqual(acts("missed", 5), [], "never of a visit that has not begun: the door refuses it");
  assert.deepEqual(acts("cancelled", 5), [], "a cancelled one is said nothing more of");
  assert.deepEqual(acts("proposed", 5), ["cancelled"], "a request may be cancelled");
  assert.deepEqual(acts("proposed", -3), [], "and never kept or missed: it was not booked");
  assert.deepEqual(visitActsOf(null, ...at(-3), now), [], "an event the record has not kept: nothing to say it on");

  const state = (visit, fromH) => visitStateOf(visit, at(fromH)[1], now)?.text ?? null;
  assert.equal(
    state({ id: "a1", status: "booked" }, -3),
    "Past",
    "REGRESSION: an ended visit said 'Done', as if they came",
  );
  assert.equal(state(null, -3), "Past");
  assert.equal(state({ id: "a1", status: "booked" }, 5), null, "nothing ahead");
  assert.equal(state({ id: "a1", status: "missed" }, -3), "Missed");
  assert.equal(state({ id: "a1", status: "kept" }, -3), "Kept");
  assert.equal(state({ id: "a1", status: "cancelled" }, 5), "Cancelled");
});
