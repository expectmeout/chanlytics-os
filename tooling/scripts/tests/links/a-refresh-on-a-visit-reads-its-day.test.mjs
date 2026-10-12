/**
 * The Calendar's first read after a refresh on a visit's own address (calendar/<day>:a-<id>, contracts visitRoute) reads the
 * weeks around the visit's day, as a refresh on the day alone does (calendar/calendar-cold-boot.test.mjs): the visit's panel
 * opens once its block is drawn, and a block outside the weeks read could not be. A module of its own, so the surface is fresh.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { windowFor } from "@chanlytics/contracts";

const asked = [];
globalThis.window = {
  location: {
    pathname: "/w/harbor",
    hash: "#/calendar/2026-12-01:a-3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c",
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
  await import("../../../../apps/dashboard/src/surfaces/calendar/surface.ts");

test("a refresh on a visit reads the weeks around the visit's day, not today's", async () => {
  await calendarOverride.apply().catch(() => {});
  const w = windowFor("2026-12-01");
  assert.deepEqual(asked, [w.from], "the weeks around the visit's day were the first read");
  assert.equal(getCalendarSpan().from, w.from, "and the window the page will ask for is the one loaded");
});
