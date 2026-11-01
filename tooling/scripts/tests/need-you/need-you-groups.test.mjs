/**
 * Need you's groups (the redesign of 1 Nov 2026), run as contracts runs them: what each row asks of you, which one thing is
 * Up next, who waits on you, what waits for your OK, what is folded past a week, and what is Ask found's and nobody's wait;
 * and how long a row has waited, in the few words beside its name. The page and the strip over it read these, so a row
 * is in one group and has one verb wherever it is drawn.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  HOUR_MS,
  MIN_MS,
  NEED_YOU_CLOCK_MS,
  NEED_YOU_OLD_MS,
  SECOND_MS,
  clockIsNear,
  needYouGroupsOf,
  needYouVerbOf,
  needYouWaitOf,
} from "@chanlytics/contracts";

/** A queue row with the facts the groups read, and an id to tell them apart. */
const row = (id, kind, over = {}) => ({
  id,
  kind,
  act: undefined,
  clock_ms: null,
  waitedMs: HOUR_MS,
  when: "",
  ...over,
});
const ids = (rows) => rows.map((r) => r.id);

test("what a row asks of you: a call back, or a hold that asks for one, is a call; a search is yours to approve; nobody waits on a call worth a listen", () => {
  assert.equal(needYouVerbOf(row("a", "callback")), "call");
  assert.equal(needYouVerbOf(row("b", "handoff", { act: "call_back" })), "call", "a hold whose reason asks for a call");
  assert.equal(needYouVerbOf(row("c", "handoff", { act: "reply" })), "reply");
  for (const kind of ["handoff", "window", "reply", "held"])
    assert.equal(needYouVerbOf(row(kind, kind)), "reply", kind);
  assert.equal(needYouVerbOf(row("s", "search")), "approve", "a question waits for your OK, as a run does");
  for (const kind of ["call", "tried", "step", "visit"]) assert.equal(needYouVerbOf(row(kind, kind)), null, kind);
});

test("a clock is near within two hours, never without one", () => {
  assert.equal(clockIsNear({ clock_ms: NEED_YOU_CLOCK_MS }), true, "two hours is near");
  assert.equal(clockIsNear({ clock_ms: NEED_YOU_CLOCK_MS + 1 }), false);
  assert.equal(clockIsNear({ clock_ms: 0 }), true, "a clock that has run out is nearest of all");
  assert.equal(clockIsNear({ clock_ms: null }), false, "no clock is not a near one");
  assert.equal(clockIsNear({}), false);
});

test("Up next is a reply that goes on its own, else the nearest clock, else the oldest under a week; the rest wait on you, a week and over folded at the end", () => {
  const old = row("old", "handoff", { waitedMs: 9 * DAY_MS });
  const long = row("long", "handoff", { waitedMs: 2 * DAY_MS });
  const window = row("window", "window", { clock_ms: HOUR_MS, waitedMs: 3 * HOUR_MS });
  const held = row("held", "held", { clock_ms: 30 * SECOND_MS, waitedMs: 0 });
  const call = row("call", "call");
  const search = row("search", "search");
  const tried = row("tried", "tried");
  // In the queue's own order (todayQueue): near clocks first, then the longest wait.
  const rows = [window, old, long, call, search, tried];
  const g = needYouGroupsOf(rows);
  assert.deepEqual(ids(g.next), ["window"], "a window that shuts within two hours cannot be answered later");
  assert.deepEqual(ids(g.waiting), ["long"]);
  assert.deepEqual(ids(g.old), ["old"], "a wait past a week is folded, where Mark all done lets it go");
  assert.deepEqual(ids(g.ok), ["search"]);
  assert.deepEqual(ids(g.found), ["call", "tried"], "worth a look, and nobody waiting on you");
  // A reply the receptionist sends on its own is first, whatever else has a clock.
  assert.deepEqual(ids(needYouGroupsOf([window, held, long]).next), ["held"]);
  // No clock: the oldest under a week, never the one past it.
  assert.deepEqual(ids(needYouGroupsOf([old, long]).next), ["long"]);
  // Everyone past a week: the first of them is still the next one to do.
  const older = row("older", "handoff", { waitedMs: 12 * DAY_MS });
  const g2 = needYouGroupsOf([older, old]);
  assert.deepEqual([ids(g2.next), ids(g2.old)], [["older"], ["old"]]);
  // An old wait whose window shuts soon is not folded away.
  const closing = row("closing", "window", { clock_ms: HOUR_MS, waitedMs: 8 * DAY_MS });
  assert.deepEqual(ids(needYouGroupsOf([long, closing]).waiting), ["long"]);
  assert.deepEqual(ids(needYouGroupsOf([long, closing]).next), ["closing"]);
});

test("every row is in one group at most, and the groups ask again answer the same", () => {
  const rows = [
    row("a", "handoff", { waitedMs: 8 * DAY_MS }),
    row("b", "callback", { waitedMs: 3 * HOUR_MS }),
    row("c", "window", { clock_ms: 5 * HOUR_MS }),
    row("d", "search"),
    row("e", "call"),
    row("f", "step"),
  ];
  const g = needYouGroupsOf(rows);
  const seen = [...g.next, ...g.waiting, ...g.ok, ...g.old, ...g.found].map((r) => r.id);
  assert.equal(new Set(seen).size, seen.length, "no row twice");
  assert.ok(!seen.includes("f"), "a step is To do's, in none of Need you's groups");
  assert.deepEqual(needYouGroupsOf(rows), g, "the same rows, the same groups");
  assert.deepEqual(needYouGroupsOf([]), { next: [], waiting: [], ok: [], old: [], found: [] });
});

test("how long a row has waited, in the few words beside its name: amber past a day or on a near clock", () => {
  const goes = "Goes in 30s";
  assert.deepEqual(needYouWaitOf(row("h", "handoff", { when: "waited 3h", waitedMs: 3 * HOUR_MS }), goes), {
    words: "3h",
    long: false,
  });
  assert.deepEqual(needYouWaitOf(row("h", "handoff", { when: "waited 2d", waitedMs: 2 * DAY_MS }), goes), {
    words: "2d",
    long: true,
  });
  assert.deepEqual(
    needYouWaitOf(row("w", "window", { when: "closes 11:52 AM · in 1h 38m", clock_ms: 98 * MIN_MS }), goes),
    { words: "closes 11:52 AM", long: true },
    "a window says when it shuts, amber when it is near",
  );
  assert.deepEqual(needYouWaitOf(row("w", "window", { when: "closes 6:00 PM · in 5h", clock_ms: 5 * HOUR_MS }), goes), {
    words: "closes 6:00 PM",
    long: false,
  });
  assert.deepEqual(needYouWaitOf(row("held", "held"), goes), { words: goes, long: true }, "its seconds are its own");
  assert.deepEqual(needYouWaitOf(row("s", "step", { when: "today" }), goes), { words: "today", long: false });
  assert.equal(needYouWaitOf(row("x", "call", { when: "" }), goes), null, "nothing to say there");
  assert.ok(NEED_YOU_OLD_MS > DAY_MS, "a week is past a day");
});
