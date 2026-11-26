/**
 * The Calendar surface's first read after a refresh on a day the address names, in a module nobody has read with.
 *
 * The boot always read the weeks around today, so a refresh on calendar/2026-12-01 read September first and the page
 * then read December for itself: two reads before December showed (the survey of 22 Sep). The boot reads the window
 * the address names now, the page's own read. Its own file, so the surface is fresh.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { windowFor } from "@chanlytics/contracts";
import { bridgeHolds } from "../shell/_bridge-holds.mjs";
import { until } from "../shared/_until.mjs";

const asked = [];
/** Every read as it was spelled: the path and its own query, the workspace aside. */
const spelled = [];
/** The weeks the route answers `around=today` with, by the business's clock: its to work out, not the page's. */
const AROUND = windowFor("2026-09-08");
bridgeHolds(
  { who: { workspaces: [{ id: "t1", timezone: "America/New_York" }], activeWorkspaceId: "t1" } },
  { fresh: true },
);
globalThis.window = {
  location: {
    pathname: "/w/harbor",
    hash: "#/calendar/2026-12-01",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
  },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  fetch: async (url) => {
    const at = new URL(String(url), "https://app.chanlytics.com");
    const q = Object.fromEntries(at.searchParams);
    asked.push(q.from);
    at.searchParams.delete("workspace");
    spelled.push(at.pathname.replace("/api/v1/", "") + at.search);
    const span = q.around === "today" ? AROUND : { from: q.from, days: Number(q.days) };
    const days = Array.from({ length: span.days }, () => ({ key: span.from, items: [], windows: [] }));
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          calendar: {
            timezone: "America/New_York",
            from: span.from,
            days,
            feed: { present: false, state: "none" },
            hours: [],
            closures: [],
            rules: {},
            services: [],
            booking_link: null,
            next_opening: null,
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  },
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type) {
    this.type = type;
  }
};
const { calendarOverride, getCalendarSpan, setCalendarSpan, setCalendarFresh, paintHeldCalendar } =
  await import("../../apps/dashboard/src/surfaces/calendar/surface.ts");

test("a refresh on a day reads the weeks around that day, not today's first", async () => {
  await calendarOverride.apply().catch(() => {});
  const w = windowFor("2026-12-01");
  assert.deepEqual(asked, [w.from], "REGRESSION: the weeks around today were read first, and December after them");
  assert.equal(getCalendarSpan().from, w.from, "the window the page will ask for is the one loaded");
  // Only the first read: a later one reads the window it is asked for, wherever the address has gone since.
  globalThis.window.location.hash = "#/calendar/2027-02-01";
  await calendarOverride.apply().catch(() => {});
  assert.equal(asked.at(-1), w.from, "the address is the boot's, not every read's");
});

test("the weeks around today are asked for by that word, before anyone knows the zone: the route works the days out", async () => {
  // The page asked by the first day of its window, which it could not say until it knew the business's zone: its first
  // read waited for who is looking, and the document's head, which knows no zone, could not start it (9 Oct 2026: the
  // Calendar's read left 600 ms into a load whose Inbox's had left at 150). Nobody has said who is looking here.
  bridgeHolds({ who: { workspaces: undefined } });
  setCalendarSpan(null);
  spelled.length = 0;
  await calendarOverride.apply();
  assert.deepEqual(spelled, ["calendar?around=today"], "one read, as the head spells it, and none for the zone first");
  // A Refresh is the same read with its own word after it.
  setCalendarFresh(true);
  await calendarOverride.apply();
  assert.equal(spelled.at(-1), "calendar?around=today&fresh=1");
  // Held under the weeks the answer covers: a move back to them by their day paints at once.
  setCalendarSpan(AROUND.from, AROUND.days);
  assert.equal(paintHeldCalendar(), true, "the window the route answered is the one held");
  setCalendarSpan("2027-06-07", 63);
  assert.equal(paintHeldCalendar(), false, "and weeks nobody read are not");
});

test("a span asked for is held to the board's 63 days, and its days are spelled on the read", async () => {
  // Pinned as surface.ts's text in calendar.test.mjs until 26 Nov 2026.
  const spanOf = (days) => (setCalendarSpan("2026-09-07", days), getCalendarSpan());
  assert.deepEqual(spanOf(500), { from: "2026-09-07", days: 63 }, "never more than the board's nine weeks");
  assert.deepEqual(spanOf(0), { from: "2026-09-07", days: 63 }, "no length is the whole window");
  assert.deepEqual(spanOf(-4), { from: "2026-09-07", days: 1 }, "at least a day");
  assert.deepEqual(spanOf(7.4), { from: "2026-09-07", days: 7 }, "whole days");
  setCalendarSpan("not a day", 7);
  assert.equal(getCalendarSpan().from, null, "a from that is no day is the weeks around today");
  spelled.length = 0;
  setCalendarSpan("2026-09-07", 7);
  await calendarOverride.apply();
  assert.deepEqual(spelled, ["calendar?from=2026-09-07&days=7"]);
});

test("two moves in a row: a read for a span the page has since left is dropped, never painted", async () => {
  const { surfaceValue, setSurfaceValue } = await import("../../apps/dashboard/src/surfaces/surface-values.ts");
  const answer = globalThis.window.fetch;
  const held = [];
  globalThis.window.fetch = (url, init) => new Promise((resolve) => held.push(() => resolve(answer(url, init))));
  try {
    setSurfaceValue("calendar", undefined);
    setCalendarSpan("2026-09-07", 7);
    const first = calendarOverride.apply();
    await until(() => held.length === 1);
    setCalendarSpan("2026-10-05", 7);
    const second = calendarOverride.apply();
    await until(() => held.length === 2);
    held[1]();
    await second;
    assert.equal(surfaceValue("calendar").vm.days[0].key, "2026-10-05", "the later move's weeks are on the board");
    held[0]();
    await first;
    assert.equal(surfaceValue("calendar").vm.days[0].key, "2026-10-05", "and the earlier answer, landing late, is not");
  } finally {
    globalThis.window.fetch = answer;
  }
});

test("the page keeps a view and a day, and reads only when the window does not cover the view: then the weeks around the day", async () => {
  // Pinned as verbs.ts's text in calendar.test.mjs until 26 Nov 2026.
  const { surfaceValue, setSurfaceValue } = await import("../../apps/dashboard/src/surfaces/surface-values.ts");
  const { calendar } = await import("../../apps/dashboard/src/surfaces/calendar/verbs.ts");
  const c = await import("@chanlytics/contracts");
  const { shiftKey } = c;
  // The arithmetic reaches the page, all of it, as contracts has it: each verb answers as its contracts function does.
  const asked = [
    ["spanFor", "spanForView", ["month", "2026-09-10"]],
    ["windowFor", "windowFor", ["2026-09-10"]],
    ["covers", "coversSpan", [[{ key: "2026-09-07" }], "2026-09-07", 1]],
    ["frameOf", "frameOf", ["2026-09-08", "2026-09-10"]],
    ["shiftKey", "shiftKey", ["2026-09-30", 2]],
    ["shiftMonth", "shiftMonth", ["2026-01-05", -1]],
    ["monthLabel", "monthLabelOf", ["2026-10-01"]],
    ["clockLabel", "clockLabel", [Date.parse("2026-09-08T18:30:00.000Z"), "America/New_York"]],
  ];
  for (const [verb, fn, args] of asked) assert.deepEqual(calendar[verb](...args), c[fn](...args), verb);
  const held = windowFor("2026-09-10");
  const days = Array.from({ length: held.days }, (_, i) => ({ key: shiftKey(held.from, i), items: [], windows: [] }));
  setCalendarSpan(held.from, held.days);
  setSurfaceValue("calendar", { ...surfaceValue("calendar"), vm: { ...surfaceValue("calendar")?.vm, days } });
  // The frame's runner, which reads what a page asks for; it wants a live feed to join, which none of this exercises.
  const { startSurfaces } = await import("../../apps/dashboard/src/bridge/surface-runner.ts");
  spelled.length = 0;
  const stop = startSurfaces([calendarOverride], () => () => {});
  try {
    await until(() => spelled.length > 0 && surfaceValue("calendar")?.vm, "the runner's first read landed");
    setCalendarSpan(held.from, held.days);
    setSurfaceValue("calendar", { ...surfaceValue("calendar"), vm: { ...surfaceValue("calendar").vm, days } });
    spelled.length = 0;
    for (const [view, day] of [
      ["week", "2026-09-10"],
      ["day", "2026-09-03"],
      ["month", "2026-09-30"],
      ["agenda", "2026-10-01"],
    ]) {
      assert.equal(await calendar.ensure(view, day), true, `${view} of ${day}`);
      assert.deepEqual(getCalendarSpan(), held, `${view} of ${day}: a slice of the weeks it holds, so the page stays`);
    }
    assert.deepEqual(spelled, [], "and nothing is read");
    const far = windowFor("2027-03-15");
    assert.equal(await calendar.ensure("month", "2027-03-15"), true, "a read that landed");
    assert.deepEqual(
      spelled.filter((s) => s.startsWith("calendar?")),
      [`calendar?from=${far.from}&days=63`],
      "a month the weeks do not cover: the weeks around it, read once",
    );
    assert.deepEqual(getCalendarSpan(), far, "and the page stands there");
  } finally {
    stop();
    setSurfaceValue("calendar", undefined);
  }
});
