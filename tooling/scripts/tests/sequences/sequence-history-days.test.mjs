/**
 * A sequence's History, as its record draws it (sequences/history.tsx): History is the end of a sequence's own pages
 * (Ruben, 21 Oct 2026). A day that went (or stopped) opens its report in Reports, its campaign narrowed to it over that day;
 * one still to decide opens its run at its home under the sequence, where it is approved or skipped; a canceled one opens
 * nothing. A day that went opened in place once, and a run had three views. And a period in which nothing went out says so
 * in one line, not four figures of nothing. Run here on the stub React, through the real
 * component, with the record's history read answered by the test.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { SEQUENCE_HISTORY_WORDS, campaignReportRoute, runRoute } from "@chanlytics/contracts";
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

test("a day that went opens its report in Reports over that day; one waiting for an OK its run; one canceled nothing -- never a day that opens in place", async () => {
  historyIs([
    batch("b-wait", "pending_approval"),
    batch("b-went", "sent", { at: at(-60_000) }),
    batch("b-failed", "failed", { at: at(-120_000), failure: "after_hours" }),
    batch("b-off", "canceled", { at: at(-180_000) }),
  ]);
  const tree = await draw();
  const hrefOf = (id) => byTestId(tree, `sq-batch-${id}`)?.props.href;
  const day = { from: today(), to: today() };
  const report = campaignReportRoute(day, { kind: "sequence", id: "q-1" });
  for (const id of ["b-went", "b-failed"]) {
    assert.ok(hrefOf(id)?.endsWith(report), `${id} opens its campaign in Reports over its day: ${hrefOf(id)}`);
  }
  assert.ok(hrefOf("b-wait")?.endsWith(runRoute("b-wait", "q-1")), "one waiting for an OK opens where it is decided");
  assert.ok(byTestId(tree, "sq-batch-b-off"), "a canceled day is drawn");
  assert.equal(hrefOf("b-off"), undefined, "and opens nothing");
  for (const id of ["b-wait", "b-went"])
    assert.equal(
      byTestId(tree, `sq-batch-${id}`).props["aria-expanded"],
      undefined,
      "a link, never a day that opens in place",
    );
  assert.equal(byTestId(tree, "sq-day-run"), null, "and no door inside it to press a second time");
  // Its own report over History's days is the head's door: Reports narrowed to it.
  assert.match(
    byTestId(tree, "sq-history-reports").props.href,
    /reports\/campaigns:\d{4}-\d\d-\d\d~\d{4}-\d\d-\d\d:seq:q-1$/,
  );
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
