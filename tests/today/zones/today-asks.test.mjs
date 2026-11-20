/**
 * The questions AI opens on from Today (Today, calm, 19 Nov 2026, D10): each written from a line the page shows, in the
 * order the lines stand, three at most, none said twice; a page with no line to ask about hands AI none. The page's parts
 * say them as they draw (bridge/ask/page-asks.ts), AI offers them as its own, and a phone's home draws them as rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TODAY_ASKS_MAX, TODAY_LINE_WORDS, buildAskSuggestions, todayAsksOf } from "@chanlytics/contracts";

const { setTodayAsks, todayAsks } = await import("../../../apps/dashboard/src/bridge/ask/page-asks.ts");

const ask = (words) => ({ label: words, q: words });
const A = TODAY_LINE_WORDS.asks;

test("the questions are the lines' own, in the lines' order, three at most, none said twice", () => {
  const lines = [
    ask(A.person("Ana Reyes")),
    null,
    ask(A.day),
    ask(A.day),
    ask("Who are the 11 people gone quiet?"),
    ask(A.videos),
  ];
  assert.equal(TODAY_ASKS_MAX, 3);
  assert.deepEqual(
    todayAsksOf(lines).map((a) => a.label),
    ["What does Ana Reyes want?", "What is left of today?", "Who are the 11 people gone quiet?"],
  );
  assert.deepEqual(todayAsksOf([]), [], "a page with no line to ask about hands AI none");
  assert.deepEqual(todayAsksOf([null, { label: "  ", q: "" }]), [], "a line with nothing to ask is left out");
});

test("each line asks in a person's words", () => {
  assert.equal(A.person("Ana Reyes"), "What does Ana Reyes want?");
  assert.equal(A.day, "What is left of today?");
  assert.equal(A.tomorrow, "What is on tomorrow?");
  assert.equal(A.videos, "Which video should I post first?");
  assert.equal(A.pieces, "What should I post first?");
  assert.equal(A.did, "What did AI answer today?");
});

test("Today's parts say their questions in the page's order, and take them back as they leave", () => {
  setTodayAsks("did", [ask(A.did)]);
  setTodayAsks("found", [ask("Who are the 11 people gone quiet?"), ask("Is my calendar the right one?")]);
  setTodayAsks("waits", [ask(A.person("Ana Reyes"))]);
  assert.deepEqual(
    todayAsks().map((a) => a.label),
    ["What does Ana Reyes want?", "Who are the 11 people gone quiet?", "Is my calendar the right one?"],
    "who waits first, then what AI found, whichever part said its own first",
  );
  setTodayAsks("waits", []);
  setTodayAsks("found", []);
  assert.deepEqual(
    todayAsks().map((a) => a.label),
    [A.did],
  );
  setTodayAsks("did", []);
  assert.deepEqual(todayAsks(), [], "Today left: nothing is held");
});

test("AI offers Today's questions as its own, first, and only on Today", () => {
  const quiet = { language: "en", needsYou: 0, heldDrafts: 0, missedToday: 0, liveNow: 0, hasCalendar: false };
  const pageAsks = [
    ask(A.person("Ana Reyes")),
    { label: "Who are the 11 people gone quiet?", q: "11 people. Why is that?" },
  ];
  const today = buildAskSuggestions({ ...quiet, surface: "today", pageAsks });
  assert.deepEqual(
    today.filter((s) => s.own).map((s) => [s.label ?? s.q, s.q]),
    [
      ["What does Ana Reyes want?", "What does Ana Reyes want?"],
      ["Who are the 11 people gone quiet?", "11 people. Why is that?"],
    ],
  );
  assert.equal(today[0].own, true, "the page's own lead what AI offers");
  assert.deepEqual(
    buildAskSuggestions({ ...quiet, surface: "inbox", pageAsks }).filter((s) => s.own),
    [],
    "another page's home keeps its own questions",
  );
  assert.deepEqual(
    buildAskSuggestions({ ...quiet, surface: "today" }).filter((s) => s.own),
    [],
    "a Today with no line to ask about offers none of its own",
  );
});

test("a run waiting asks about itself, in its own words: who waits, what the emails say, why some were held", async () => {
  const { todayRunWords } = await import("@chanlytics/contracts");
  const run = { state: "pending_approval", recipient_count: 2, when: "today 9:00 AM", counts: { sent: 0, replied: 0 } };
  assert.equal(todayRunWords(run).waiting.question, "Who are the 2 people waiting for my approval?");
  assert.equal(todayRunWords({ ...run, recipient_count: 1 }).waiting.question, "Who is waiting for my approval?");
  assert.equal(todayRunWords({ ...run, state: "sending", drafted: 16 }).drafted.question, "What do the 16 emails say?");
  assert.equal(todayRunWords({ ...run, state: "sending", drafted: 1 }).drafted.question, "What does the email say?");
  assert.equal(todayRunWords({ ...run, state: "sending", held: 3 }).held.question, "Why were 3 emails held?");
});

test("in Spanish AI opens on its own home: Today's lines, and so its questions, are English", () => {
  const quiet = { needsYou: 0, heldDrafts: 0, missedToday: 0, liveNow: 0, hasCalendar: false };
  const pageAsks = [ask(A.day)];
  assert.deepEqual(
    buildAskSuggestions({ ...quiet, surface: "today", language: "es", pageAsks }).filter((s) => s.own),
    [],
  );
});
