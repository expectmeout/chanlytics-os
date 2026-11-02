/**
 * What Ask found learns (decision 0087): what the workspace's facts say with no model, what a morning is told of the
 * mornings before it, what Today leaves out, and what a member's rest keeps. Pure folds, read as the server and the page
 * read them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASK_FOUND_VIEW,
  askFindingsOf,
  dayAfterDays,
  findingCardId,
  ideasSeenOf,
  ideasWithResults,
  isFindingCard,
  isRested,
  latelyRows,
  latelySaid,
  repliesFellCard,
  restedOf,
  restedWith,
  settledTitles,
} from "@chanlytics/contracts";

const TODAY = "2026-11-02";
const sequence = (over = {}) => ({
  id: "seq-1",
  name: "Dentists in Austin",
  state: "on",
  mode: "ask",
  first: { id: "step-1" },
  ...over,
});
const batch = (day, sent, replied, state = "sent", sequence_id = "seq-1") => ({
  sequence_id,
  state,
  created_at: `2026-${day}T14:00:00.000Z`,
  counts: { sent, replied },
});
const card = (title, outcome) => ({ id: `p-${title}`, kind: "lead_search", title, ...(outcome ? { outcome } : {}) });

test("replies that fell by half are found, and only with enough sent on both sides to say so", () => {
  const fell = [batch("10-30", 20, 1), batch("10-23", 20, 5), batch("10-16", 20, 5), batch("10-09", 20, 4)];
  const [found] = askFindingsOf([sequence({ mode: "auto" })], fell);
  assert.deepEqual(found, {
    key: "fell-seq-1",
    kind: "replies_fell",
    sequenceId: "seq-1",
    name: "Dentists in Austin",
    last: { sent: 20, replied: 1 },
    before: { sent: 60, replied: 14 },
  });
  // A small last batch, too little before it, nothing replied before it, and a rate that held are no finding.
  const none = [
    [batch("10-30", 5, 0), batch("10-23", 40, 8)],
    [batch("10-30", 20, 1), batch("10-23", 10, 5)],
    [batch("10-30", 20, 0), batch("10-23", 40, 0)],
    [batch("10-30", 20, 4), batch("10-23", 40, 9)],
  ];
  for (const runs of none) assert.deepEqual(askFindingsOf([sequence({ mode: "auto" })], runs), []);
});

test("three batches in a row that all went out offer the step on, and a batch stopped among them does not", () => {
  const steady = [batch("10-30", 20, 2), batch("10-23", 20, 2), batch("10-16", 20, 2)];
  assert.deepEqual(askFindingsOf([sequence()], steady), [
    {
      key: "steady-seq-1",
      kind: "steady",
      sequenceId: "seq-1",
      name: "Dentists in Austin",
      stepId: "step-1",
      batches: 3,
    },
  ]);
  assert.deepEqual(askFindingsOf([sequence({ mode: "veto" })], steady), [], "it asks already no more");
  assert.deepEqual(askFindingsOf([sequence({ state: "paused" })], steady), [], "a paused sequence");
  assert.deepEqual(askFindingsOf([sequence()], steady.slice(0, 2)), [], "two are not enough");
  assert.deepEqual(
    askFindingsOf([sequence()], [batch("10-30", 20, 2), batch("10-23", 20, 0, "canceled"), batch("10-16", 20, 2)]),
    [],
    "one they stopped",
  );
  assert.deepEqual(
    askFindingsOf(
      [sequence()],
      steady.map((b) => ({ ...b, sequence_id: "seq-2" })),
    ),
    [],
    "another sequence's batches",
  );
});

test("what hurts results comes first, and a finding's card opens where the sequence is changed", () => {
  const runs = [batch("10-30", 20, 0), batch("10-23", 20, 6), batch("10-16", 20, 6)];
  const found = askFindingsOf([sequence()], runs);
  assert.deepEqual(
    found.map((f) => f.kind),
    ["replies_fell", "steady"],
  );
  const made = repliesFellCard(found[0]);
  assert.equal(made.kind, "fix");
  assert.equal(made.title, "Replies fell on Dentists in Austin");
  assert.equal(made.line, "0 of 20 replied to the last batch, 12 of 40 to those before it.");
  assert.equal(made.payload.to, "campaigns/sequences/seq-1");
  assert.equal(isFindingCard(made), true);
  assert.equal(isFindingCard({ id: "p-1" }), false);
});

test("what a morning is told holds every member's cards, newest first, and whose they were", () => {
  const seen = ideasSeenOf([
    { day: "2026-10-30", mine: true, proposals: [card("Find florists", { state: "dismissed", receipt: "Let go" })] },
    { day: TODAY, mine: false, proposals: [card("Find gyms")] },
    { day: "2026-10-29", mine: false, proposals: "not cards" },
  ]);
  assert.deepEqual(
    seen.map((s) => [s.title, s.day, s.mine, s.state]),
    [
      ["Find gyms", TODAY, false, "waiting"],
      ["Find florists", "2026-10-30", true, "dismissed"],
    ],
  );
  assert.equal(
    latelySaid(seen),
    "Find gyms (2026-11-02, a teammate's, not answered); Find florists (2026-10-30, set aside)",
  );
  assert.equal(latelySaid([]), "");
});

test("Today leaves out what was set aside or approved within a week, and offers it again after", () => {
  const seen = ideasSeenOf([
    { day: "2026-10-30", mine: true, proposals: [card("Set aside", { state: "dismissed", receipt: "" })] },
    { day: "2026-10-31", mine: false, proposals: [card("Done by a teammate", { state: "done", receipt: "Found 40" })] },
    { day: "2026-10-20", mine: true, proposals: [card("Long ago", { state: "dismissed", receipt: "" })] },
    { day: TODAY, mine: false, proposals: [card("Still open")] },
  ]);
  assert.deepEqual([...settledTitles(seen, TODAY)].sort(), ["Done by a teammate", "Set aside"]);
});

test("what came of an idea approved is what its sequence earned, else what the press did", () => {
  const made = { kind: "sequence", id: "seq-1" };
  const seen = ideasSeenOf([
    { day: "2026-10-30", mine: true, proposals: [card("Start it", { state: "done", receipt: "Started", made })] },
    { day: "2026-10-29", mine: true, proposals: [card("Find gyms", { state: "done", receipt: "Found 40" })] },
    { day: "2026-10-28", mine: true, proposals: [card("Not this", { state: "dismissed", receipt: "Let go" })] },
  ]);
  const earned = ideasWithResults(seen, [
    batch("10-20", 40, 9),
    batch("10-30", 20, 3),
    batch("10-31", 0, 0, "scheduled"),
  ]);
  assert.deepEqual(latelyRows(earned, TODAY), [
    { title: "Start it", said: "Last batch: 20 sent, 3 replied" },
    { title: "Find gyms", said: "Found 40" },
  ]);
  assert.match(latelySaid(earned), /Start it \(2026-10-30, approved: Last batch: 20 sent, 3 replied\)/);
});

test("a member's rest lasts a week, lets go of those run out, and a view that holds anything else is none", () => {
  const id = findingCardId({ key: "steady-seq-1" });
  assert.equal(id, "finding-steady-seq-1");
  const rested = restedWith({ old: "2026-10-01", kept: "2026-11-05" }, id, TODAY);
  assert.deepEqual(rested, { kept: "2026-11-05", [id]: dayAfterDays(TODAY, 7) });
  assert.equal(isRested(rested, id, TODAY), true);
  assert.equal(isRested(rested, id, dayAfterDays(TODAY, 7)), false);
  assert.equal(isRested(rested, "another", TODAY), false);
  assert.deepEqual(restedOf({ rested: { a: "2026-11-09", b: 3 } }), { a: "2026-11-09" });
  for (const nothing of [null, "x", {}, { rested: "x" }]) assert.deepEqual(restedOf(nothing), {});
  assert.equal(ASK_FOUND_VIEW, "ask_found");
});

test("a day after days crosses a month and goes back", () => {
  assert.equal(dayAfterDays("2026-10-30", 7), "2026-11-06");
  assert.equal(dayAfterDays(TODAY, -14), "2026-10-19");
});
