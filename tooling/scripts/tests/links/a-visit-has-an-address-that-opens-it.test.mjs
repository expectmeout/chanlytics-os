/**
 * A visit has an address that opens THE VISIT, not only its day (wiring/records-not-pages, task 1.6; findings A1 and
 * D1-visit-open): `calendar/<yyyy-mm-dd>:a-<id>`, written by contracts' `visitRoute` and read by the one parse the Calendar
 * takes its param with. `calendar/a-<id>`, the shape Settings > Activity wrote when it knew no day, keeps landing on the
 * board, and now opens the panel when the visit is among the days the board holds.
 *
 * The page's own behaviour (the panel opening once its block is drawn) is executed in calendar/calendar-honest.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarParamParts, movedAddress, routeOfPath, visitRoute } from "@chanlytics/contracts";

const S = "../../../../apps/dashboard/src";
const { calendarAddress, calendarParam } = await import(`${S}/surfaces/calendar/address.ts`);
const { SURFACE_ROUTES, routeHasPage } = await import(`${S}/surfaces/routes.ts`);

const ID = "3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c";

test("a visit is written with its day when the writer knows it, and read back whole", () => {
  assert.equal(visitRoute(ID, "2026-10-09"), `calendar/2026-10-09:a-${ID}`);
  assert.deepEqual(calendarParamParts(`2026-10-09:a-${ID}`), { day: "2026-10-09", visitId: ID });
});

test("a writer that knows no day writes the shape the Calendar has always read, which names the visit alone", () => {
  assert.equal(visitRoute(ID), `calendar/a-${ID}`);
  assert.equal(visitRoute(ID, null), `calendar/a-${ID}`);
  assert.equal(visitRoute(ID, "next-week"), `calendar/a-${ID}`, "a day that is not a date is no day");
  assert.deepEqual(calendarParamParts(`a-${ID}`), { day: null, visitId: ID });
  assert.deepEqual(calendarParamParts("a-priya"), { day: null, visitId: "priya" }, "the demo's seeded ids too");
});

test("a day alone, nothing, and anything the page does not parse name no visit", () => {
  assert.deepEqual(calendarParamParts("2026-10-09"), { day: "2026-10-09", visitId: null });
  assert.deepEqual(calendarParamParts(null), { day: null, visitId: null });
  assert.deepEqual(calendarParamParts(""), { day: null, visitId: null });
  for (const bad of [
    "2026-9-9",
    "next-week",
    "a-",
    "2026-10-09:a-",
    "2026-10-09:b-1",
    "x:a-1",
    "a-1:2026-10-09",
    "a-x:y",
  ])
    assert.deepEqual(calendarParamParts(bad), { day: null, visitId: null }, bad);
  assert.deepEqual(
    calendarParamParts("2026-13-45:a-1"),
    { day: null, visitId: null },
    "a day that is not on a calendar",
  );
});

test("the Calendar page is handed the day and the visit its address names", () => {
  assert.deepEqual(calendarAddress(`2026-10-09:a-${ID}`), { initialDay: "2026-10-09", initialVisitId: ID });
  assert.deepEqual(calendarAddress(`a-${ID}`), { initialDay: null, initialVisitId: ID });
  assert.deepEqual(calendarAddress("2026-09-10"), { initialDay: "2026-09-10", initialVisitId: null });
  assert.deepEqual(calendarAddress("2026-9-10"), { initialDay: null, initialVisitId: null });
  assert.deepEqual(calendarAddress(null), { initialDay: null, initialVisitId: null });
});

test("a path that carries a visit on its day is the Calendar's, takes the page whole, and is not moved", () => {
  const route = visitRoute(ID, "2026-10-09");
  const path = `/w/acme/${route}`;
  assert.equal(routeOfPath(path), route);
  assert.equal(calendarParam(routeOfPath(path)), `2026-10-09:a-${ID}`);
  assert.equal(movedAddress({ pathname: path }), null, "no door rewrites it");
  assert.equal(SURFACE_ROUTES.calendar.takes(`2026-10-09:a-${ID}`), true);
  assert.equal(routeHasPage(route), true);
});
