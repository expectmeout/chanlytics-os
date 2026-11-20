/**
 * "2 done today", after how many need you in the page's head (Today, calm), is a time the page says, and wears the mark every such time wears
 * (kit/says-when.ts, decision 0101): a copy of a phone's screen some minutes old leaves out what is marked, since two may be
 * five by now. It wore none from the day it was drawn (#2204, 8 Nov 2026), so a kept copy went on saying it, and the nightly's
 * walk of the copy named it three nights running (e2e/shell/first-rows.spec.ts, "today: every time on the copy says so"). The
 * node walk of the rows (tests/shell/views/a-time-says-so.test.mjs) draws no head of Need you, so nothing here caught it.
 *
 * Run on the head as the page tells it, on the stub React, over a day with someone waiting and two things done.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEED_YOU_WORDS, toTodayVM, zoneDayKey, clockTime } from "@chanlytics/contracts";
import { installStubReact, fresh, again, byTestId, textOf } from "../../_stub-react.mjs";
import { timesSaid } from "../../shell/views/_unmarked-times.mjs";
import { NOW, ZONE, escalation, metrics, waiting } from "./_world.mjs";

installStubReact({
  __surfaceState: () => "live",
  appNavigate() {},
  usePPToast: () => [null, () => {}],
  canDo: () => true,
  gate: () => ({}),
  setInterval: () => 1,
  clearInterval() {},
  __clock: { zone: () => ZONE, dayKey: (ms) => zoneDayKey(ms, ZONE), time: (ms) => clockTime(ms, ZONE) },
});
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

/** Today with Ana waiting on a person, and so many things the team dealt with. */
const dayWith = (doneToday) => toTodayVM(metrics(), [waiting()], [escalation()], [], NOW, null, { doneToday });

/**
 * What the page's head says, as Today tells it to the frame's head (zones/head.tsx): since Today, calm (19 Nov 2026) how many
 * were done today follows how many need you there, where no list has a head of its own to say it.
 */
const { useZonesStanding } = await import("../../../apps/dashboard/src/surfaces/today/zones/head.tsx");
const { standingSaid } = await import("../../../apps/dashboard/src/surfaces/kit/head/standing.ts");
const HeadProbe = () => {
  useZonesStanding();
  return null;
};
const headSaid = () => {
  again(() => HeadProbe());
  return standingSaid()?.sentence ?? null;
};
/** The one count the head reads, with Ana waiting (surfaces/needs-you.ts reads it with the Inbox). */
const inboxWith = () => ({ THREADS: [], UNREAD_HOLDS: 0 });

test("REGRESSION: how many were done today wears the mark a time wears; a copy some minutes old went on saying it", () => {
  setSurfaceValue("today", dayWith(2));
  setSurfaceValue("inbox", inboxWith());
  try {
    fresh();
    const head = headSaid();
    const done = byTestId(head, "today-done");
    assert.ok(done, "the head says how many were done today");
    assert.equal(textOf(done), `${NEED_YOU_WORDS.doneToday(2)}.`);
    assert.notEqual(done.props["data-when"], undefined, "REGRESSION: it said a time and wore no mark");
    // The one time it says stands under its mark.
    const said = timesSaid(head);
    assert.deepEqual(
      said.map((t) => t.words),
      [`${NEED_YOU_WORDS.doneToday(2)}.`],
      "the fixture says the one time",
    );
    assert.deepEqual(
      said.filter((t) => !t.marked),
      [],
      "and none of the head's times stands unmarked",
    );
  } finally {
    setSurfaceValue("today", undefined);
    setSurfaceValue("inbox", undefined);
  }
});

test("a day with nothing done says no such line, so the head says no time at all", () => {
  setSurfaceValue("today", dayWith(0));
  setSurfaceValue("inbox", inboxWith());
  try {
    fresh();
    const head = headSaid();
    assert.ok(!byTestId(head, "today-done"), "no line where nothing was done");
    assert.deepEqual(timesSaid(head), []);
  } finally {
    setSurfaceValue("today", undefined);
    setSurfaceValue("inbox", undefined);
  }
});
