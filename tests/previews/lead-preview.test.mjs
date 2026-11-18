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
  photo_url: null,
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
    {
      role: "assistant",
      content: "A fade is 30 dollars.",
      then: { words: "It would send this right away.", tone: "sends", taught: true, other: "never read" },
    },
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
    // An answer that said a thing they told it keeps its mark, and nothing else the row holds.
    {
      role: "assistant",
      text: "A fade is 30 dollars.",
      then: { words: "It would send this right away.", tone: "sends", taught: true },
    },
    { role: "user", text: "Odd", then: null },
  ]);
  assert.deepEqual(previewTurnsOf(null), []);
});

test("starters ask only what it knows: a service, a day it is closed, where it is; never a price, never a visit time", () => {
  assert.deepEqual(previewStartersOf(PROFILE), [
    "Can you tell me about the fade?",
    "Are you open on Sunday?",
    "Where are you located?",
    "Can someone call me back?",
  ]);
  assert.equal(
    previewStartersOf({ ...PROFILE, services: [{ name: "Swedish Massage" }] })[0],
    "Can you tell me about the Swedish Massage?",
  );
  // A plumber the finder found with services and a street, and no hours.
  assert.deepEqual(
    previewStartersOf({ address: "80 Made Up St, Brooklyn, NY 11225", services: [{ name: "Hydro Jetting" }] }),
    ["Can you tell me about the Hydro Jetting?", "Where are you located?", "Can someone call me back?"],
  );
  const allWeek = Object.fromEntries(Object.keys(WEEK).map((d) => [d, { open: "08:00", close: "20:00" }]));
  assert.deepEqual(previewStartersOf({ hours: allWeek, services: [] }), [
    "What are your hours?",
    "Can someone call me back?",
  ]);
  // Knows nothing: the one question every receptionist handles.
  assert.deepEqual(previewStartersOf(null), ["Can someone call me back?"]);
  for (const p of [PROFILE, { hours: allWeek }, null])
    for (const s of previewStartersOf(p)) assert.doesNotMatch(s, /how much|price|cost|come in/i, s);
});

test("it speaks first, as their business, and always says it is automated", () => {
  assert.equal(
    previewPageOf(FACTS, NOW).greeting,
    "Hi, this is Fixture Barbers. I'm the AI assistant. What can I help you with?",
  );
  assert.equal(
    previewPageOf({ ...FACTS, profile: { ...PROFILE, assistant_name: " Ava " } }, NOW).greeting,
    "Hi, this is Fixture Barbers. I'm Ava, the AI assistant. What can I help you with?",
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
  assert.equal(
    previewKnowsOf({ services: many }, null).find((r) => r.key === "services").value,
    "S1, S2, S3, S4, S5, S6 and 3 more",
  );
  // A long list is also said briefly, as how many it holds; a couple of services are their own names.
  assert.equal(previewKnowsOf({ services: many }, null).find((r) => r.key === "services").short, "9 services");
  assert.deepEqual(
    rows.map((r) => r.short),
    [null, null, null, null, null],
  );
  assert.deepEqual(previewKnowsOf(null, null), [], "nothing it does not know is said");
});

test("a fact the listing never had is a row the business can add: its hours first, then what it does", () => {
  // A plumber the finder found with a street and services, and no hours.
  const rows = previewKnowsOf(
    { address: "80 Made Up St, Brooklyn, NY 11225", services: [{ name: "Hydro Jetting" }] },
    null,
  );
  assert.deepEqual(
    rows.map((r) => [r.key, r.missing, r.fix]),
    [
      ["address", false, "value"],
      ["services", false, "say"],
      ["hours", true, "value"],
    ],
    "a list is put right by a sentence beside it; what it lacks comes last, and is typed as a value",
  );
  const hours = rows.at(-1);
  assert.deepEqual([hours.value, hours.from], [W.missingWhy.hours, W.missing.google]);
  const bare = previewKnowsOf({ address: "80 Made Up St" }, null).filter((r) => r.missing);
  assert.deepEqual(
    bare.map((r) => [r.key, r.from]),
    [
      ["hours", W.missing.google],
      ["services", W.missing.site],
    ],
  );
  assert.equal(
    previewKnowsOf(PROFILE, null).some((r) => r.missing),
    false,
    "a record with both lacks neither",
  );
});

test("the page whole: its questions while it is open to try, the count left, and an ended page that shows nothing it kept", () => {
  const fresh = previewPageOf(FACTS, NOW);
  assert.equal(fresh.state, "ready");
  assert.equal(fresh.left, 20);
  assert.equal(fresh.starters.length, 4);
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
  // Its questions stay offered once they have written: the page drops the ones already asked.
  assert.deepEqual([talked.left, talked.starters.length, talked.turns.length], [19, 4, 2]);
  const spent = previewPageOf({ ...FACTS, asked_count: 20 }, NOW);
  assert.deepEqual([spent.state, spent.left, spent.starters], ["spent", 0, []]);
  const ended = previewPageOf({ ...FACTS, state: "ended", turns: [{ role: "user", content: "Hi" }] }, NOW);
  assert.deepEqual([ended.state, ended.turns, ended.knows, ended.starters], ["ended", [], [], []]);
  assert.equal(previewPageOf({ ...FACTS, state: "building" }, NOW).knows.length, 0);
});

test("Make it mine leads once they have tried it: a few messages, a call, or a thing told", () => {
  assert.equal(previewPageOf(FACTS, NOW).leads, false);
  assert.equal(previewPageOf({ ...FACTS, asked_count: 2 }, NOW).leads, false);
  assert.equal(previewPageOf({ ...FACTS, asked_count: 3 }, NOW).leads, true);
  assert.equal(previewPageOf({ ...FACTS, call_seconds: 54, call_count: 1 }, NOW).leads, true);
  const told = { ...PROFILE, notes: [{ title: "The business told us", text: "Walk-ins until 5." }] };
  assert.equal(previewPageOf({ ...FACTS, profile: told }, NOW).leads, true);
  // What they did, as its sender reads it on the page they look at.
  assert.equal(previewPageOf(FACTS, NOW).did, "");
  assert.equal(
    previewPageOf({ ...FACTS, asked_count: 3, call_seconds: 54, call_count: 1 }, NOW).did,
    "3 messages · a call of a minute",
  );
});

test("the page's words say the business by its name", () => {
  assert.equal(W.title("Fixture Barbers"), "AI for Fixture Barbers");
  assert.equal(W.title(" Luna "), "AI for Luna");
  assert.equal(W.building.title("Luna"), "Setting up AI for Luna");
  assert.equal(W.madeFrom, "Set up by Chanlytics from your Google listing and website.");
  assert.equal(W.left(1), "1 message left");
  assert.equal(W.left(19), "19 messages left");
  assert.equal(W.taken.title("Fixture Barbers"), "Fixture Barbers is already set up.");
});

test("the page carries their Google photo, and nothing where the lead has none", () => {
  const photo = "https://lh3.googleusercontent.com/p/made-up";
  assert.equal(previewPageOf({ ...FACTS, photo_url: photo }, NOW).photo, photo);
  assert.equal(previewPageOf(FACTS, NOW).photo, null);
  // Only Google's own photos, over https: anything else is no photo (the page's CSP allows that host alone).
  assert.equal(previewPageOf({ ...FACTS, photo_url: "http://evil.example/x.jpg" }, NOW).photo, null);
  assert.equal(previewPageOf({ ...FACTS, photo_url: "http://lh3.googleusercontent.com/p/x" }, NOW).photo, null);
  // A page with nothing to try shows no photo.
  assert.equal(previewPageOf({ ...FACTS, photo_url: photo, state: "claimed" }, NOW).photo, null);
});

test("an answer's lit stretches are read for what each is: whole numbers, in order, inside the answer, on one marked taught alone", () => {
  const then = (over) => ({ words: "It would send this right away.", tone: "sends", ...over });
  const content = "A fade is 30 dollars.";
  const [marked, unmarked, unread] = previewTurnsOf([
    {
      role: "assistant",
      content,
      then: then({ taught: true, spans: [[10, 12], [3, "x"], [9, 4], [2, 999], "no", [0.5, 3]] }),
    },
    { role: "assistant", content, then: then({ spans: [[10, 12]] }) },
    { role: "assistant", content, then: then({ taught: true, spans: "never a list" }) },
  ]);
  assert.deepEqual(marked.then.spans, [[10, 12]]);
  assert.equal("spans" in unmarked.then, false);
  assert.equal("spans" in unread.then, false);
});

test("the calls it ended stand on a page open to try, oldest first, and on no other", () => {
  const calls = [
    { id: "r1", seconds: 42 },
    { id: "r2", seconds: 95 },
  ];
  assert.deepEqual(previewPageOf({ ...FACTS, calls }, NOW).calls, calls);
  assert.deepEqual(previewPageOf(FACTS, NOW).calls, [], "a reader that carries none");
  assert.deepEqual(previewPageOf({ ...FACTS, calls, state: "ended" }, NOW).calls, []);
});
