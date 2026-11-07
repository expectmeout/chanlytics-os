/**
 * The rest of the day on a desk (Today in three zones, 2 Nov 2026), the day drawn on the stub React over the board the
 * Calendar really draws (toCalendarVM): five lines, every one that asks for something among them, never cut for a seat.
 * On a busy evening an hour a cancellation freed, past the first five by time, was cut with its Offer it and nothing in
 * the foot (the re-check of the audit, 3 Nov 2026). With no calendar linked, the one row that links one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftKey, toCalendarVM } from "@chanlytics/contracts";
import { all, byTestId, classes, textOf } from "../../_stub-react.mjs";
import { unmarkedTimes } from "../../shell/views/_unmarked-times.mjs";
import { NOW, W, ZONE, dayWith, draw } from "./_world.mjs";

const { DayZone } = await import("../../../apps/dashboard/src/surfaces/today/zones/day.tsx");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

/** Friday 18 September 2026 in New York, at a time of the day, in UTC (EDT is four hours behind). */
const fri = (hh, mm = 0) => new Date(Date.UTC(2026, 8, 18, hh + 4, mm)).toISOString();
const ROSA = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";

/** A visit on Friday, half an hour from `hh:mm`. */
const visit = (id, name, hh, mm, facts) => ({
  id: `e-${id}`,
  start: fri(hh, mm),
  end: fri(hh, mm + 30),
  title: `${name} · Cut`,
  all_day: false,
  person: { id: `p-${id}`, name, ...(facts ? { facts } : {}) },
});

/**
 * The board at four on a busy Friday: seven visits from half past four, half an hour each, and Rosa's eight o'clock
 * cancelled, its time open again. The first two are Next and Then; the five after them, and Rosa's hour, are the lines.
 */
function busyEvening() {
  const from = "2026-09-14";
  const days = Array.from({ length: 7 }, (_, i) => ({ key: shiftKey(from, i), items: [], windows: [] }));
  days[4].items.push(
    visit("ana", "Ana Reyes", 16, 30, { last_visit_at: "2026-08-18T16:00:00Z" }),
    visit("ben", "Ben Cho", 17, 0),
    visit("cy", "Cy Tran", 17, 30),
    visit("di", "Di Moss", 18, 0),
    visit("ed", "Ed Park", 18, 30),
    visit("flo", "Flo Diaz", 19, 0),
    visit("gus", "Gus Lee", 19, 30),
    {
      id: "e-rosa",
      start: fri(20),
      end: fri(20, 45),
      title: "Rosa Mejia · Cut",
      all_day: false,
      person: { id: "p-rosa", name: "Rosa Mejia" },
      visit: { id: ROSA, status: "cancelled" },
    },
  );
  days[4].windows.push({ start: fri(20), end: fri(20, 45) });
  const open = { open: "09:00", close: "21:00" };
  return toCalendarVM(
    {
      timezone: ZONE,
      from,
      to: "2026-09-20",
      feed: { present: true, state: "ok", read_at: fri(15), events: 8, recurring_expanded: 0, skipped_recurring: 0 },
      hours: { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: {} },
      closures: [],
      rules: { lead_hours: 0, buffer_min: 0, max_days_ahead: 14 },
      booking_link: null,
      days,
    },
    NOW,
  );
}

/** The day drawn on a desk over a board, with the running Fill a cancellation step (four could take an hour). */
function dayOver(vm) {
  setSurfaceValue("today", dayWith([]));
  W.__CALENDAR = { vm };
  W.__PLAYBOOKS = {
    rows: [{ trigger: "slot_opened", state: "on", candidates: 4, next: "When a time frees", runs: true }],
    shape: { calendar: "feed", hasDeals: false, word: "appointment" },
  };
  return draw(DayZone);
}
/** The lines drawn: the elements themselves, never a part that draws one. */
const linesOf = (tree) =>
  all(byTestId(tree, "today-day-rest"), (n) => typeof n.type === "string" && classes(n).includes("tpd-li"));

test("a busy evening on a desk: Offer it stays among the five lines, the plain visits fill the seats left, and the foot says the one cut", () => {
  const tree = dayOver(busyEvening());
  assert.ok(
    byTestId(tree, "today-day-offer"),
    "REGRESSION: Rosa's freed hour, past the first five lines by time, was cut with its Offer it",
  );
  assert.equal(linesOf(tree).length, 5, "five lines on a desk");
  assert.ok(!textOf(byTestId(tree, "today-day-rest")).includes("Gus Lee"), "the last plain visit gives up its seat");
  assert.match(textOf(byTestId(tree, "today-day-foot")), /1 more/, "and the foot says it, the Calendar's");
});

test("every time the day says, says so: a copy some minutes old draws none of them (decision 0101)", () => {
  const tree = dayOver(busyEvening());
  assert.match(textOf(byTestId(tree, "today-day-first")), /Last here Aug 18/, "the fixture says a visit's one fact");
  assert.deepEqual(unmarkedTimes(tree), []);
});

test("what the day says of now says so too: each cell's word for where it stands, and the bar with now on it", () => {
  const tree = dayOver(busyEvening());
  const drawn = (name) => all(tree, (n) => typeof n.type === "string" && classes(n).includes(name));
  const words = drawn("tpd-eyebrow");
  assert.ok(words.length > 0, "the fixture draws the two cells");
  for (const word of words) assert.notEqual(word.props["data-when"], undefined, `"${textOf(word)}" over a blank time`);
  const [bar] = drawn("tpd-bar");
  assert.ok(all(bar, (n) => classes(n).includes("meter-mark")).length > 0, "the fixture's bar has now on it");
  assert.notEqual(bar.props["data-when"], undefined, "now would stand where it stood an hour ago");
});

test("no calendar linked: the one row that links one, and the day says so", () => {
  const vm = busyEvening();
  const tree = dayOver({ ...vm, feed: { ...vm.feed, state: "none" } });
  assert.ok(byTestId(tree, "today-day-link"), "the row that links a calendar");
  assert.equal(byTestId(tree, "today-day-offer"), null, "no board, so no hour to offer");
});
