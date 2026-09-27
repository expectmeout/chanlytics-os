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
    const q = Object.fromEntries(new URL(String(url), "https://app.chanlytics.com").searchParams);
    asked.push(q.from);
    const days = Array.from({ length: Number(q.days) }, () => ({ key: q.from, items: [], windows: [] }));
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          calendar: {
            timezone: "America/New_York",
            from: q.from,
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
const { calendarOverride, getCalendarSpan } =
  await import("../../../../apps/dashboard/src/legacy-bridge/surface-data.ts");

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
