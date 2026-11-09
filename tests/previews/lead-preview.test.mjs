/**
 * A lead's own receptionist's page, as contracts says it (decision 0079, L2): which page a preview is now, read against
 * its clock and its limit; its chat as the row keeps it; three questions to start from its own facts; what it knows and
 * where each fact was read; all of it at once. Made-up businesses only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_PREVIEW_WORDS as W,
  PREVIEW_LIMITS,
  previewKnowsOf,
  previewPageOf,
  previewStartersOf,
  previewStateOf,
  previewTurnsOf,
} from "@chanlytics/contracts";

const NOW = new Date("2026-11-02T15:00:00Z");
const LATER = "2026-12-01T00:00:00Z";
const WEEK = {
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "18:00" },
  sat: { open: "10:00", close: "14:00" },
  sun: {},
};
const PROFILE = {
  hours: WEEK,
  address: "12 Main St, Austin, TX 78701",
  website: "https://fixture-barbers.example.com/",
  services: [{ name: "Fade" }, { name: "Beard trim" }],
};
const FACTS = {
  state: "ready",
  ends_at: LATER,
  asked_count: 0,
  turns: [],
  business: "Fixture Barbers",
  logo_url: null,
  profile: PROFILE,
  phone_display: "+1 (512) 555-0142",
  call_seconds: 0,
};

test("which page: open, its twenty said, being set up, ended by its state or its clock, someone's own now", () => {
  const at = (over) => previewStateOf({ ...FACTS, ...over }, NOW);
  assert.equal(at({}), "ready");
  assert.equal(at({ asked_count: PREVIEW_LIMITS.messages }), "spent");
  assert.equal(at({ state: "building" }), "building");
  assert.equal(at({ state: "ended" }), "ended");
  assert.equal(at({ state: "failed" }), "ended", "one that could not be made is never shown as building");
  assert.equal(at({ ends_at: "2026-11-02T14:59:59Z" }), "ended", "past its thirty days before the sweep ends it");
  assert.equal(at({ state: "claimed" }), "taken");
});

test("the chat as the row keeps it: each turn read for what it is, an answer with what a live chat would do", () => {
  const turns = previewTurnsOf([
    { role: "user", content: "Are you open on Sunday?", at: "x" },
    {
      role: "assistant",
      content: "We're closed Sundays.",
      then: { words: "It would send this right away.", tone: "sends" },
    },
    { role: "assistant", content: "No then here" },
    { role: "user", content: "Odd", then: { words: "not an answer's", tone: "sends" } },
    { role: "system", content: "never drawn" },
    { role: "assistant", content: 7 },
    "a string",
  ]);
  assert.deepEqual(turns, [
    { role: "user", text: "Are you open on Sunday?", then: null },
    {
      role: "assistant",
      text: "We're closed Sundays.",
      then: { words: "It would send this right away.", tone: "sends" },
    },
    { role: "assistant", text: "No then here", then: null },
    { role: "user", text: "Odd", then: null },
  ]);
  assert.deepEqual(previewTurnsOf(null), []);
});

test("three questions from its own facts: a day it is closed, a time tomorrow, a service's price", () => {
  assert.deepEqual(previewStartersOf(PROFILE), [
    "Are you open on Sunday?",
    "Can I come in tomorrow at 2?",
    "How much is the fade?",
  ]);
  assert.deepEqual(
    previewStartersOf({ ...PROFILE, services: [{ name: "Swedish Massage" }] })[2],
    "How much is the Swedish Massage?",
  );
  const allWeek = Object.fromEntries(Object.keys(WEEK).map((d) => [d, { open: "08:00", close: "20:00" }]));
  assert.deepEqual(previewStartersOf({ hours: allWeek, services: [] }), [
    "What are your hours?",
    "Can I come in tomorrow at 2?",
  ]);
  assert.deepEqual(
    previewStartersOf(null),
    ["What are your hours?", "Can I come in tomorrow at 2?"],
    "never one twice",
  );
});

test("what it knows, each fact with where it was read: the listing's hours, address, number and site; the site's services", () => {
  const rows = previewKnowsOf(PROFILE, "+1 (512) 555-0142");
  assert.deepEqual(
    rows.map((r) => [r.key, r.value, r.from]),
    [
      ["hours", "Mon–Fri 9 AM – 6 PM · Sat 10 AM – 2 PM · Sun closed", W.from.google],
      ["address", "12 Main St, Austin, TX 78701", W.from.google],
      ["phone", "+1 (512) 555-0142", W.from.google],
      ["website", "fixture-barbers.example.com", W.from.google],
      ["services", "Fade, Beard trim", W.from.site],
    ],
  );
  const many = Array.from({ length: 9 }, (_, i) => ({ name: `S${i + 1}` }));
  assert.equal(previewKnowsOf({ services: many }, null).at(-1).value, "S1, S2, S3, S4, S5, S6 and 3 more");
  assert.deepEqual(previewKnowsOf(null, null), [], "nothing it does not know is said");
});

test("the page whole: starters only on an empty chat, the count left, and an ended page that shows nothing it kept", () => {
  const fresh = previewPageOf(FACTS, NOW);
  assert.equal(fresh.state, "ready");
  assert.equal(fresh.left, 20);
  assert.equal(fresh.starters.length, 3);
  assert.equal(fresh.knows.length, 5);
  const talked = previewPageOf(
    {
      ...FACTS,
      asked_count: 1,
      turns: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
    },
    NOW,
  );
  assert.deepEqual([talked.left, talked.starters, talked.turns.length], [19, [], 2]);
  const spent = previewPageOf({ ...FACTS, asked_count: 20 }, NOW);
  assert.deepEqual([spent.state, spent.left, spent.starters], ["spent", 0, []]);
  const ended = previewPageOf({ ...FACTS, state: "ended", turns: [{ role: "user", content: "Hi" }] }, NOW);
  assert.deepEqual([ended.state, ended.turns, ended.knows, ended.starters], ["ended", [], [], []]);
  assert.equal(previewPageOf({ ...FACTS, state: "building" }, NOW).knows.length, 0);
});

test("the page's words say the business by its name", () => {
  assert.equal(W.title("Fixture Barbers"), "Fixture Barbers' receptionist");
  assert.equal(W.title("Luna"), "Luna's receptionist");
  assert.equal(W.building.title("Luna"), "Setting up Luna's receptionist");
  assert.equal(W.setUp("Fixture Barbers"), "Chanlytics set this up for Fixture Barbers.");
  assert.equal(W.left(1), "1 message left");
  assert.equal(W.left(19), "19 messages left");
  assert.equal(W.taken.title("Fixture Barbers"), "Fixture Barbers is already set up.");
});
