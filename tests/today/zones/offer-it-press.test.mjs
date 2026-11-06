/**
 * Offer it, pressed (Today in three zones, 2 Nov 2026; decision 0082): the day drawn on the stub React over the board the
 * Calendar really draws (toCalendarVM), with an hour a cancellation freed later today. The press sends the visit it
 * offers; what came of it replaces the line's words, the button gone once it is offered ("Offered · in To decide" where
 * the batch waits for the owner, "Offered to 4 people" where it went), and kept with the reason in the owner's words
 * where it was not, so it can be pressed again. The canvas's DAY_MORNING row c.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftKey, toCalendarVM, TODAY_PHONE_WORDS } from "@chanlytics/contracts";
import { again, byTestId, press, textOf } from "../../_legacy-react.mjs";
import { until } from "../../shared/_until.mjs";
import { NOW, W, ZONE, answerWith, dayWith, draw, json, wire } from "./_world.mjs";

const { DayZone } = await import("../../../apps/dashboard/src/surfaces/today/zones/day.tsx");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

/** Friday 18 September 2026 in New York, at a time of the day, in UTC (EDT is four hours behind). */
const fri = (hh, mm = 0) => new Date(Date.UTC(2026, 8, 18, hh + 4, mm)).toISOString();
const VISIT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";

/** The board at four on Friday: Rosa's five o'clock cancelled, its time open again, and Ines at half past six. */
function board() {
  const from = "2026-09-14";
  const days = Array.from({ length: 7 }, (_, i) => ({ key: shiftKey(from, i), items: [], windows: [] }));
  days[4].items.push(
    {
      id: "e-rosa",
      start: fri(17),
      end: fri(17, 45),
      title: "Rosa Mejia · Cut",
      all_day: false,
      person: { id: "p-rosa", name: "Rosa Mejia" },
      visit: { id: VISIT, status: "cancelled" },
    },
    {
      id: "e-ines",
      start: fri(18, 30),
      end: fri(19),
      title: "Ines Mora · Fringe trim",
      all_day: false,
      person: { id: "p-ines", name: "Ines Mora" },
    },
  );
  days[4].windows.push({ start: fri(17), end: fri(17, 45) });
  const open = { open: "09:00", close: "20:00" };
  return toCalendarVM(
    {
      timezone: ZONE,
      from,
      to: "2026-09-20",
      feed: { present: true, state: "ok", read_at: fri(15), events: 2, recurring_expanded: 0, skipped_recurring: 0 },
      hours: { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: {} },
      closures: [],
      rules: { lead_hours: 0, buffer_min: 0, max_days_ahead: 14 },
      booking_link: null,
      days,
    },
    NOW,
  );
}

/** The day with its calendar, the running Fill a cancellation step (four could take it), and the workspace's word. */
function dayDrawn() {
  setSurfaceValue("today", dayWith([]));
  W.__CALENDAR = { vm: board() };
  W.__PLAYBOOKS = {
    rows: [{ trigger: "slot_opened", state: "on", candidates: 4, next: "When a time frees", runs: true }],
    shape: { calendar: "feed", hasDeals: false, word: "appointment" },
  };
  return draw(DayZone);
}
const openLine = (tree) => byTestId(tree, "today-day-open");
const redrawn = () => again(() => W.React.createElement(DayZone, {}));

test("Offer it sends the visit; once offered the line says where the batch waits, and the button is gone", async () => {
  wire.length = 0;
  answerWith(() => json(200, { ok: true, data: { offered: true, people: 4, waits: true } }));
  const tree = dayDrawn();
  assert.match(textOf(openLine(tree)), /Rosa cancelled\. 4 people could take it/);
  await press(byTestId(tree, "today-day-offer"));
  await until(() => wire.some((w) => w.path === "/api/v1/calendar/freed"), "the press reached the route");
  const sent = wire.find((w) => w.path === "/api/v1/calendar/freed");
  assert.equal(sent.method, "POST");
  assert.deepEqual(JSON.parse(sent.body), { visit_id: VISIT }, "the visit alone: the edge reads its time from it");
  await until(() => textOf(openLine(redrawn())).includes(TODAY_PHONE_WORDS.offer.done), "the receipt: in To decide");
  assert.equal(byTestId(redrawn(), "today-day-offer"), null, "offered: nothing left to press");

  // A sequence that sends on its own: the batch went, to how many.
  answerWith(() => json(200, { ok: true, data: { offered: true, people: 4, waits: false } }));
  const again2 = dayDrawn();
  await press(byTestId(again2, "today-day-offer"));
  await until(() => textOf(openLine(redrawn())).includes("Offered to 4 people"), "the receipt says how many");
  setSurfaceValue("today", undefined);
});

test("refused: the reason in the owner's words replaces the line's, and Offer it stays to be pressed again", async () => {
  const why = "Nothing was offered: WhatsApp hasn’t approved its message.";
  answerWith(() => json(200, { ok: true, data: { offered: false, people: 0, why } }));
  const tree = dayDrawn();
  await press(byTestId(tree, "today-day-offer"));
  await until(() => textOf(openLine(redrawn())).includes(why), "the reason is said");
  assert.notEqual(byTestId(redrawn(), "today-day-offer"), null, "still there to press");
  setSurfaceValue("today", undefined);
  delete W.__CALENDAR;
  delete W.__PLAYBOOKS;
});
