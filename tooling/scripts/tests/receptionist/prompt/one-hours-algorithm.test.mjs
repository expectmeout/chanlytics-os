/**
 * The week is collapsed in exactly one place.
 *
 * The Settings card carried a hand-copied second implementation of the
 * run-collapsing loop, under a comment promising it matched the composer — "so
 * the owner reads the hours here exactly as the receptionist will state them".
 * A promise in a comment is not a guarantee, and two copies of "which days
 * share the same hours" is how the card and the receptionist start disagreeing
 * on the one screen an owner glances at to check.
 *
 * The algorithm is shared; the wording is not, because the two surfaces
 * genuinely differ — "Monday–Thursday: 09:30–18:00" in the prompt, "Mon–Thu
 * 09:30–18:00" on the card. So contracts returns the runs and each caller
 * writes its own sentence.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSystemPrompt, hoursRuns } from "@chanlytics/contracts";
import { readCode } from "../../_source.mjs";

const base = { business_name: "X", phone_display: "p", booking_link: "https://b.example" };
const LIVE = {
  mon: { open: "09:30", close: "18:00" },
  tue: { open: "09:30", close: "18:00" },
  wed: { open: "09:30", close: "18:00" },
  thu: { open: "09:30", close: "18:00" },
  fri: { open: "09:30", close: "19:00" },
  sat: { open: "09:30", close: "19:00" },
};

test("consecutive identical days collapse into one run", () => {
  assert.deepEqual(hoursRuns(LIVE), [
    { from: "mon", to: "thu", text: "09:30–18:00" },
    { from: "fri", to: "sat", text: "09:30–19:00" },
    { from: "sun", to: "sun", text: "Closed" },
  ]);
});

test("a day with no times is Closed, and an absent day is the same as an empty one", () => {
  assert.deepEqual(hoursRuns({ sun: {} }), [{ from: "mon", to: "sun", text: "Closed" }]);
  assert.deepEqual(hoursRuns(undefined), []);
  // Only the middle of the week open: the runs must break on both sides.
  const mid = hoursRuns({ wed: { open: "10:00", close: "16:00" } });
  assert.deepEqual(
    mid.map((r) => `${r.from}-${r.to}:${r.text}`),
    ["mon-tue:Closed", "wed-wed:10:00–16:00", "thu-sun:Closed"],
  );
});

test("the runs and the composed prompt cannot disagree — same source", () => {
  const runs = hoursRuns(LIVE).map((r) => r.text);
  const stated = composeSystemPrompt(base, { hours: LIVE }, "whatsapp")
    .split("\n")
    .filter((l) => l.startsWith("- ") && l.includes(":"))
    .slice(0, runs.length)
    .map((l) => l.slice(l.indexOf(": ") + 2));
  assert.deepEqual(stated, runs);
});

test("the Settings card no longer keeps its own copy of the loop", () => {
  // The card is the Business page since Task 3.7; the summary went with it, still a wrapper over the shared lines.
  const pane = readCode("apps/dashboard/src/legacy/pages/business-tab-open.jsx");
  assert.ok(pane.includes("window.__hoursLines(hours)"), "it asks for the shared lines, which collapse the same runs");
  assert.ok(!pane.includes("spans[j + 1].text === spans[i].text"), "the duplicated collapse loop must be gone");
  // The words are the Calendar's too: one clock for the card and the board (C3), rendered in settings-words.test.mjs.
});
