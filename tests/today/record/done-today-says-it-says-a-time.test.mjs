/**
 * "2 done today", by Need you's name on a desk, is a time the page says, and wears the mark every such time wears
 * (kit/says-when.ts, decision 0101): a copy of a phone's screen some minutes old leaves out what is marked, since two may be
 * five by now. It wore none from the day it was drawn (#2204, 8 Nov 2026), so a kept copy went on saying it, and the nightly's
 * walk of the copy named it three nights running (e2e/shell/first-rows.spec.ts, "today: every time on the copy says so"). The
 * node walk of the rows (tests/shell/views/a-time-says-so.test.mjs) draws no head of Need you, so nothing here caught it.
 *
 * Run on the list as the page draws it, on the stub React, over a day with someone waiting and two things done.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEED_YOU_WORDS, toTodayVM, zoneDayKey, clockTime } from "@chanlytics/contracts";
import { installStubReact, fresh, again, byTestId, find, textOf } from "../../_stub-react.mjs";
import { timesSaid } from "../../shell/views/_unmarked-times.mjs";
import { NOW, ZONE, escalation, metrics, waiting } from "./_world.mjs";

installStubReact({
  __DEMO_MODE: false,
  __surfaceState: () => "live",
  appNavigate() {},
  usePPToast: () => [null, () => {}],
  canDo: () => true,
  gate: () => ({}),
  setInterval: () => 1,
  clearInterval() {},
  __clock: { zone: () => ZONE, dayKey: (ms) => zoneDayKey(ms, ZONE), time: (ms) => clockTime(ms, ZONE) },
});
const { NeedYou } = await import("../../../apps/dashboard/src/surfaces/today/zones/need-you.tsx");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

/** Today with Ana waiting on a person, and so many things the team dealt with. */
const dayWith = (doneToday) => toTodayVM(metrics(), [waiting()], [escalation()], [], NOW, null, { doneToday });

/** Need you's head, as the list draws it. */
const headOf = (tree) => find(tree, (n) => String(n.props?.className ?? "").includes("tq-head"));

test("REGRESSION: how many were done today wears the mark a time wears; a copy some minutes old went on saying it", () => {
  setSurfaceValue("today", dayWith(2));
  try {
    fresh();
    const tree = again(() => NeedYou());
    const done = byTestId(tree, "today-done");
    assert.ok(done, "the head says how many were done today");
    assert.equal(textOf(done), NEED_YOU_WORDS.doneToday(2));
    assert.notEqual(done.props["data-when"], undefined, "REGRESSION: it said a time and wore no mark");
    // The head whole: its name is a name ("Need you"), and the one time it says stands under its mark.
    const said = timesSaid(headOf(tree));
    assert.deepEqual(
      said.map((t) => t.words),
      [NEED_YOU_WORDS.doneToday(2)],
      "the fixture says the one time",
    );
    assert.deepEqual(
      said.filter((t) => !t.marked),
      [],
      "and none of the head's times stands unmarked",
    );
  } finally {
    setSurfaceValue("today", undefined);
  }
});

test("a day with nothing done says no such line, so the head says no time at all", () => {
  setSurfaceValue("today", dayWith(0));
  try {
    fresh();
    const tree = again(() => NeedYou());
    assert.ok(!byTestId(tree, "today-done"), "no line where nothing was done");
    assert.deepEqual(timesSaid(headOf(tree)), []);
  } finally {
    setSurfaceValue("today", undefined);
  }
});
