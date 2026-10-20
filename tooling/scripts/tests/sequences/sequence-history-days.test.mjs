/**
 * A sequence's History, as its record draws it (sequences/history.tsx): each day is its run, a door to the run's one
 * screen at its home under the sequence (the Campaigns wiring review's lane 2), whatever the run is -- decided there while
 * it waits for an OK, its report once it went. A day that went opened in place, and a run had three views. And a period in
 * which nothing went out says so in one line, not four figures of nothing. Run here on the stub React, through the real
 * component, with the record's history read answered by the test.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { SEQUENCE_HISTORY_WORDS, runRoute } from "@chanlytics/contracts";
import { again, byTestId, fresh, installLegacyReact, settle, textOf, unmount } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
// use-record.ts makes the record foot's context as it loads, and "react" under this runner's react-server condition has no
// createContext: the stub gives it one that holds its value, which nothing here draws.
const reactOfDashboard = createRequire(new URL("../../../../apps/dashboard/src/legacy-bridge/_.js", import.meta.url))(
  "react",
);
reactOfDashboard.createContext ??= (value) => ({ Provider: "Provider", Consumer: "Consumer", _currentValue: value });
// The shell's link to a route (frame-globals routeDoor), which a day's door spreads.
(await import("../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();

const S = "../../../../apps/dashboard/src";
const values = await import(`${S}/surfaces/surface-values.ts`);
await import(`${S}/surfaces/campaigns/sequences/surface.ts`);
const { sequenceVerbs } = await import(`${S}/surfaces/campaigns/sequences/verbs.ts`);
const { SequenceHistory } = await import(`${S}/surfaces/campaigns/sequences/history.tsx`);

const TZ = "UTC";
const at = (ms) => new Date(Date.now() + ms).toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const batch = (id, state, over = {}) => ({
  id,
  state,
  run_for: today(),
  at: at(0),
  scheduled_for: at(0),
  finished_at: state === "sent" ? at(0) : null,
  people: 4,
  failure: null,
  place: null,
  counts: state === "sent" ? { sent: 4, delivered: 4, read: 2, replied: 1 } : {},
  ...over,
});
// A sequence that is off: no batch to come over the days, so the rows are the days alone.
const rec = {
  sequence: { id: "q-1", state: "off", starts: "moment", next: null, first: null },
  last_run_for: null,
  timezone: TZ,
  mode: "ask",
  steps: [{}],
};

/** The record's history read, answered at once from the tab's cache, as a record opened before is. */
const historyIs = (batches) => {
  const answer = { ok: true, status: 200, data: { batches, more: false } };
  sequenceVerbs.history = async () => answer;
  sequenceVerbs.peekHistory = () => answer;
};
const draw = async () => {
  const el = () => globalThis.React.createElement(SequenceHistory, { rec, again: 0, moved: () => {} });
  again(el);
  await settle();
  return again(el);
};

beforeEach(() => {
  unmount();
  fresh();
  values.setSurfaceValue("sequences", { sequences: [], timezone: TZ, word: "appointment" });
});

test("a day is the door to its run at its home, waiting for an OK or gone, never a day that opens in place", async () => {
  historyIs([batch("b-wait", "pending_approval"), batch("b-went", "sent", { at: at(-60_000) })]);
  const tree = await draw();
  for (const id of ["b-wait", "b-went"]) {
    const day = byTestId(tree, `sq-batch-${id}`);
    assert.ok(day, `${id} is drawn`);
    assert.ok(day.props.href.endsWith(runRoute(id, "q-1")), `its door is the run's home: ${day.props.href}`);
    assert.equal(day.props["aria-expanded"], undefined, "it is a link, never a day that opens in place");
  }
  assert.equal(byTestId(tree, "sq-day-run"), null, "and no door inside it to press a second time");
});

test("a period in which nothing went out says so once, not four figures of nothing; a day that went is counted", async () => {
  historyIs([batch("b-wait", "pending_approval")]);
  let tree = await draw();
  assert.equal(textOf(byTestId(tree, "sq-history-none")), SEQUENCE_HISTORY_WORDS.nothingIn);
  assert.equal(byTestId(tree, "sq-figure-sent"), null, "no zeros under it");

  unmount();
  fresh();
  historyIs([batch("b-wait", "pending_approval"), batch("b-went", "sent", { at: at(-60_000) })]);
  tree = await draw();
  assert.equal(byTestId(tree, "sq-history-none"), null);
  assert.ok(byTestId(tree, "sq-figure-sent"), "what went is counted");
});
