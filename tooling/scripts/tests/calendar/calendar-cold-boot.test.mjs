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

const asked = [];
/** Every read as it was spelled: the path and its own query, the workspace aside. */
const spelled = [];
/** The weeks the route answers `around=today` with, by the business's clock: its to work out, not the page's. */
const AROUND = windowFor("2026-09-08");
globalThis.window = {
  location: {
    pathname: "/w/harbor",
    hash: "#/calendar/2026-12-01",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
  },
  __WORKSPACES: [{ id: "t1", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
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
  await import("../../../../apps/dashboard/src/surfaces/calendar/surface.ts");

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
  delete globalThis.window.__WORKSPACES;
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
