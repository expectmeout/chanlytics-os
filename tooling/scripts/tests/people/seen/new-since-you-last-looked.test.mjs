/**
 * New since you last looked (decision 0052, canvas A's History): a person's page marks the rows of their history the reader
 * has not seen, with a dot on each and on the History tab, and nothing else.
 *
 * What the reader had seen is their own mark on the person (00349) as the visit began: their words and calls after what the
 * mark had seen of them (seen_at), everything else after the mark was last written (marked_at), which the page writes on
 * every open so the team's rows are measured too. Nothing the visit itself brought, and nothing on a first open.
 *
 * Run against the contracts (the rule, People's row carrying the mark) and the page's two parts that draw it (the History,
 * the kit's sub-tabs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEW_SINCE_WORDS, newSinceOf, toPersonRowVM } from "@chanlytics/contracts";
import { installLegacyReact, fresh, all, find, byTestId, classes } from "../../_legacy-react.mjs";
import { personDto } from "../../consent/_person-row.mjs";

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
const S = "../../../../../apps/dashboard/src";
const { PersonTimeline } = await import(`${S}/surfaces/people/person/timeline.tsx`);
const { SubTabs } = await import(`${S}/surfaces/kit/sub-tabs/sub-tabs.tsx`);

const h = (type, props, ...kids) => globalThis.React.createElement(type, props, ...kids);
const MIN = 60_000;
const NOW = Date.parse("2026-10-12T18:00:00Z");
const ago = (min) => NOW - min * MIN;

/** A History row, as the timeline's view model has it. */
const row = (id, kind, minAgo, over = {}) => ({
  id,
  ts: ago(minAgo),
  time: "",
  day: "Today",
  kind,
  who: kind === "customer" ? "Leah" : "Team",
  text: id,
  ...over,
});
const ITEMS = [
  row("their-new", "customer", 30),
  row("their-call-new", "call", 25),
  row("reply-new", "receptionist", 20),
  row("team-before", "team", 300),
  row("their-old", "customer", 400),
  row("during-visit", "customer", -5),
];
/** They had seen up to 6 hours ago; the reader last opened them 4 hours ago; this visit began now. */
const LOOKED = { seenAtMs: ago(360), markedAtMs: ago(240), visitAtMs: NOW };

test("new is their own moments after what the reader had seen of them, everything else after their last open, and never the visit's own", () => {
  assert.deepEqual([...newSinceOf(ITEMS, LOOKED)].sort(), ["reply-new", "their-call-new", "their-new"]);
  // Their own words between what was seen and the last open are new too: seen_at is how far the mark had seen of them.
  assert.ok(newSinceOf([row("between", "customer", 300)], LOOKED).has("between"));
  // The team's between the two are not: the reader opened the person after them.
  assert.ok(!newSinceOf([row("team-between", "team", 300)], LOOKED).has("team-between"));
});

test("a first open marks nothing: with no mark there is nothing to be new against", () => {
  assert.equal(newSinceOf(ITEMS, null).size, 0);
  assert.equal(newSinceOf(ITEMS, { seenAtMs: 0, markedAtMs: 0, visitAtMs: NOW }).size, 0);
});

test("People's row carries the reader's mark as the read had it: how far they had seen, and when it was written", () => {
  const seen = new Date(ago(360)).toISOString();
  const marked = new Date(ago(240)).toISOString();
  const r = toPersonRowVM(personDto({ seen_at: seen, marked_at: marked }), "America/New_York", new Date(NOW));
  assert.deepEqual([r.seenAtMs, r.markAtMs], [ago(360), ago(240)]);
  const none = toPersonRowVM(personDto({}), "America/New_York", new Date(NOW));
  assert.deepEqual([none.seenAtMs, none.markAtMs], [0, 0], "no mark: nothing, never a clock");
});

test("the History draws a dot on each new row, named for a screen reader, and the History tab one of its own", () => {
  fresh();
  const tree = h(PersonTimeline, {
    items: ITEMS,
    initials: "LB",
    name: "Leah Brooks",
    fresh: newSinceOf(ITEMS, LOOKED),
  });
  const dots = all(tree, (n) => n.props?.["data-testid"] === "timeline-new");
  assert.equal(dots.length, 3, "one dot a new row");
  assert.ok(dots.every((d) => d.props["aria-label"] === NEW_SINCE_WORDS));
  fresh();
  const plain = h(PersonTimeline, { items: ITEMS, initials: "LB", name: "Leah Brooks" });
  assert.equal(byTestId(plain, "timeline-new"), null, "a page that says nothing new draws no dot");

  fresh();
  const strip = h(SubTabs, {
    label: "Their record",
    value: "overview",
    onSelect() {},
    tabs: [
      { id: "overview", label: "Overview" },
      { id: "history", label: "History", count: 6, fresh: NEW_SINCE_WORDS },
    ],
  });
  const dot = find(strip, (n) => classes(n).includes("subtab-dot"));
  assert.ok(dot, "the tab's dot");
  assert.equal(dot.props["aria-label"], NEW_SINCE_WORDS);
  assert.equal(all(strip, (n) => classes(n).includes("subtab-dot")).length, 1, "on History alone");
});
