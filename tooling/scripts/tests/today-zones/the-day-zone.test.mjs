/**
 * Today's second zone, the day (Today in three zones, 2 Nov 2026), executed over the board the Calendar really draws:
 * the week in the route's shape through the real toCalendarVM, so the day's closing band, its open times and its visits
 * are the Calendar's own, then todayDay and todayZoneDay as the page reads them (zones/day-vm.ts). The canvas's moments,
 * each at its clock: the morning's Next and Then with a fact each, the shift's Now, an hour a cancellation freed with how
 * many could take it and its Offer it until it begins, who comes back from Not now and where they open, what is over
 * folded, and the turn to tomorrow at closing time with its bar, its first two and its first open hour (the audit of
 * 3 Nov 2026, items 21-32).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shiftKey,
  toCalendarVM,
  todayBackOf,
  todayDay,
  todayDayFoot,
  todayWentFoot,
  todayWentLine,
  todayZoneDay,
} from "@chanlytics/contracts";

const TZ = "America/New_York";
/** Tuesday 8 September 2026 in New York, at a time of the day: the instant, in UTC (EDT is four hours behind). */
const tue = (hh, mm = 0) => new Date(Date.UTC(2026, 8, 8, hh + 4, mm));
const wed = (hh, mm = 0) => new Date(Date.UTC(2026, 8, 9, hh + 4, mm));
const iso = (d) => d.toISOString();

const person = (id, name, last) => ({ id, name, ...(last === undefined ? {} : { facts: factsOf(last) }) });
/** What the board's read says of a person (calendar-person-facts.ts), with the one fact the day reads. */
const factsOf = (last) => ({
  state: "active",
  business: null,
  deal: null,
  step: null,
  last: { at: null, by: "No contact recorded" },
  phone: null,
  email: null,
  next_visit_at: null,
  ...(last === "unknown" ? {} : { last_visit_at: last }),
});
const item = (id, from, to, title, who, visit = null) => ({
  id,
  start: iso(from),
  end: iso(to),
  title,
  all_day: false,
  person: who,
  ...(visit ? { visit } : {}),
});

/**
 * The week as GET calendar answers it: Tuesday's visits (Noor last in on 12 August, Elena on her first, Joy last in on
 * 1 September, Rosa's 2:30 cancelled, Ines at four), the receptionist's open time where Rosa's was, and Wednesday's two
 * first visits and an open hour. Tuesday's hours end at six, Wednesday's at seven, so the board's grid runs past six.
 */
function week() {
  const from = "2026-09-07";
  const days = Array.from({ length: 7 }, (_, i) => ({ key: shiftKey(from, i), items: [], windows: [] }));
  days[1].items.push(
    item("e-noor", tue(9), tue(10), "Noor Haddad · Cut", person("p-noor", "Noor Haddad", "2026-08-12T15:00:00.000Z"), {
      id: "v-noor",
      status: "booked",
    }),
    item("e-elena", tue(11), tue(12, 30), "Elena Vega · Color", person("p-elena", "Elena Vega", null), {
      id: "v-elena",
      status: "kept",
    }),
    item(
      "e-joy",
      tue(12, 45),
      tue(13, 45),
      "Joy Lin · Blow-dry",
      person("p-joy", "Joy Lin", "2026-09-01T14:00:00.000Z"),
    ),
    item("e-rosa", tue(14, 30), tue(15, 15), "Rosa Mejia · Cut", person("p-rosa", "Rosa Mejia", "unknown"), {
      id: "v-rosa",
      status: "cancelled",
    }),
    item("e-ines", tue(16), tue(17), "Ines Mora · Fringe trim", person("p-ines", "Ines Mora", "unknown")),
  );
  days[1].windows.push({ start: iso(tue(14, 30)), end: iso(tue(15, 15)) });
  days[2].items.push(
    item("e-tove", wed(9), wed(10), "Tove Lind · Cut", person("p-tove", "Tove Lind", null)),
    item(
      "e-camila",
      wed(10, 30),
      wed(11, 30),
      "Camila Ortiz · Color",
      person("p-camila", "Camila Ortiz", "2026-09-01T14:00:00.000Z"),
    ),
  );
  days[2].windows.push({ start: iso(wed(15, 30)), end: iso(wed(16, 30)) });
  return {
    timezone: TZ,
    from,
    to: "2026-09-13",
    feed: { present: true, state: "ok", read_at: iso(tue(7)), events: 7, recurring_expanded: 0, skipped_recurring: 0 },
    hours: {
      mon: { open: "09:00", close: "18:00" },
      tue: { open: "09:00", close: "18:00" },
      wed: { open: "09:00", close: "19:00" },
      thu: { open: "09:00", close: "18:00" },
      fri: { open: "09:00", close: "18:00" },
      sat: { open: "10:00", close: "16:00" },
      sun: {},
    },
    closures: [],
    rules: { lead_hours: 2, buffer_min: 0, max_days_ahead: 14 },
    booking_link: null,
    days,
  };
}

/** The running Fill a cancellation step, as the playbooks surface's card says it: four people could take an hour. */
const FILL = { trigger: "slot_opened", state: "on", candidates: 4, next: "When a time frees", runs: true };

/**
 * The zone at a moment, as the page reads it (zones/day-vm.ts): the board at that clock, every entry of its day with the
 * playbooks' cards and the workspace's word, and the zone of both.
 */
function zoneAt(now, back = [], rows = [FILL]) {
  const cal = toCalendarVM(week(), now);
  const day = todayDay(cal, { rows, word: "visit" }, { rows: [], word: "visit" }, Number.POSITIVE_INFINITY);
  return todayZoneDay(cal, day, back, now.getTime());
}
const cellsOf = (z) => z.cells.map((c) => [c.eyebrow, c.when, c.what, c.fact]);
const linesOf = (z) => z.lines.map((l) => [l.time, l.title, l.sub]);

test("the morning: Next and Then with one fact each, when they were last in or that it is their first; then the rest of the day at its times", () => {
  const z = zoneAt(tue(8));
  assert.equal(z.title, "The day");
  assert.equal(z.tomorrow, false);
  assert.deepEqual(cellsOf(z), [
    ["Next", "9 AM", "Noor Haddad · Cut", "Last here Aug 12"],
    ["Then", "11 AM", "Elena Vega · Color", "First visit"],
  ]);
  assert.deepEqual(linesOf(z), [
    ["12:45 PM", "Joy Lin", "Blow-dry · 1h"],
    ["2:30 PM", "Open · 45 min", "Rosa cancelled. 4 people could take it"],
    ["4 PM", "Ines Mora", "Fringe trim · 1h"],
  ]);
  const freed = z.lines.find((l) => l.kind === "open");
  assert.deepEqual(freed.freed, { visitId: "v-rosa" }, "Offer it offers the visit that was cancelled");
  assert.equal(z.earlier, 0);
  assert.notEqual(z.bar, null, "the bar, with now on it");
});

test("the shift: the visit under way is Now, its span said, the next beside it, and what is over folded into 'N earlier'", () => {
  const z = zoneAt(tue(11, 30));
  assert.deepEqual(
    cellsOf(z).map(([e, , what, fact]) => [e, what, fact]),
    [
      ["Now", "Elena Vega · Color", "First visit"],
      ["Next", "Joy Lin · Blow-dry", "Last here Sep 1"],
    ],
  );
  assert.equal(z.cells[0].now, true);
  assert.match(z.cells[0].when, /^11( AM)? – 12:30 PM$/, "the span of the one under way");
  assert.equal(z.earlier, 1, "Noor's nine o'clock is over: '1 earlier', never drawn as a row");
  assert.ok(!z.lines.some((l) => l.title === "Noor Haddad"));
  assert.equal(todayDayFoot(z.earlier, z.more, "visit"), "1 earlier");
});

test("an hour a cancellation freed: offered until it begins, then said and no longer offered, and gone once it is over", () => {
  const begun = zoneAt(tue(14, 45)).lines.find((l) => l.kind === "open");
  assert.equal(begun.title, "Open · 45 min", "the open part, as the receptionist would book it");
  assert.equal(begun.freed, null, "under way: nobody can be offered it");
  assert.equal(begun.sub, "Rosa cancelled.", "REGRESSION: an hour under way said how many could take it");
  assert.equal(
    zoneAt(tue(15, 30)).lines.find((l) => l.kind === "open"),
    undefined,
    "over: nothing left to fill",
  );
  // Without a running Fill a cancellation step, the line says who cancelled and nothing more: no count nobody holds.
  assert.equal(zoneAt(tue(8), [], []).lines.find((l) => l.kind === "open").sub, "Rosa cancelled.");
  assert.equal(
    zoneAt(tue(8), [], [{ ...FILL, runs: false }]).lines.find((l) => l.kind === "open").sub,
    "Rosa cancelled.",
    "a step that does not run reaches nobody",
  );
});

/** The zone over a week changed first (`change` edits the GET calendar answer), at a moment. */
function zoneOver(change, now) {
  const dto = week();
  change(dto);
  const cal = toCalendarVM(dto, now);
  const day = todayDay(cal, { rows: [FILL], word: "visit" }, { rows: [], word: "visit" }, Number.POSITIVE_INFINITY);
  return todayZoneDay(cal, day, [], now.getTime());
}

test("the freed part is what the receptionist could book: the open part of the visit, at least one of its slots, said whole for someone known by number", () => {
  // A window that opens a quarter into Rosa's visit: the part from then, as the edge's freedTimeOf offers it.
  const mid = zoneOver((dto) => {
    dto.days[1].windows = [{ start: iso(tue(14, 45)), end: iso(tue(16)) }];
  }, tue(8)).lines.find((l) => l.kind === "open");
  assert.deepEqual([mid.time, mid.title], ["2:45 PM", "Open · 30 min"], "the open part, not the whole visit");
  // Hour-long slots: thirty minutes free no time anyone could book, and the edge would offer none of it.
  const slots = zoneOver((dto) => {
    dto.rules = { ...dto.rules, slot_min: 60 };
    dto.days[1].windows = [{ start: iso(tue(14, 45)), end: iso(tue(16)) }];
  }, tue(8));
  assert.equal(
    slots.lines.find((l) => l.kind === "open"),
    undefined,
    "REGRESSION: Offer it stood on a part shorter than a slot, and its press was refused",
  );
  // Someone the book knows only by their number is said by it whole, never "+1".
  const number = zoneOver((dto) => {
    dto.days[1].items[3].person = person("p-rosa", "+1 (305) 555-0188", "unknown");
  }, tue(8)).lines.find((l) => l.kind === "open");
  assert.equal(number.sub, "+1 (305) 555-0188 cancelled. 4 people could take it");
});

test("who comes back from Not now today stands at their time and opens their thread in the Inbox; tomorrow's, or one already back, does not", () => {
  const back = [
    { conversationId: "c-dana", who: "Dana Ruiz", until: iso(tue(14)) },
    { conversationId: "c-later", who: "Lee Park", until: iso(wed(9)) },
    { conversationId: "c-gone", who: "Mo Diaz", until: iso(tue(7)) },
  ];
  const z = zoneAt(tue(8), back);
  const comes = z.lines.filter((l) => l.kind === "back");
  assert.deepEqual(
    comes.map((l) => [l.time, l.title, l.sub, l.to]),
    [["2 PM", "Dana Ruiz comes back", "From Not now", "inbox/th-c-dana"]],
    "REGRESSION: it opened inbox/<id>, an address the Inbox does not read",
  );
  assert.deepEqual(
    linesOf(z).map(([time, title]) => [time, title]),
    [
      ["12:45 PM", "Joy Lin"],
      ["2 PM", "Dana Ruiz comes back"],
      ["2:30 PM", "Open · 45 min"],
      ["4 PM", "Ines Mora"],
    ],
    "among the day's lines at its time",
  );
});

test("the day turns to tomorrow at closing time, by the business's hours, not where the board's grid ends: its first two, its bar, its first open hour, and today's visits left to mark", () => {
  const before = zoneAt(tue(17, 30));
  assert.equal(before.title, "The day", "half past five: still today");
  const z = zoneAt(tue(18, 30));
  assert.equal(z.tomorrow, true, "REGRESSION: it turned only at the grid's end, an hour after Tuesday closed");
  assert.equal(z.title, "Tomorrow");
  assert.deepEqual(cellsOf(z), [
    ["First", "9 AM", "Tove Lind · Cut", "First visit"],
    ["Then", "10:30 AM", "Camila Ortiz · Color", "Last here Sep 1"],
  ]);
  assert.notEqual(z.bar, null, "REGRESSION: tomorrow was drawn without its bar");
  assert.deepEqual(linesOf(z), [["3:30 PM", "Open · 1h", "Nothing booked yet"]]);
  assert.equal(z.earlier, 0, "tomorrow has nothing over");
  assert.equal(z.toMark, 1, "Noor's visit is over and nobody said whether she came; Elena's was said kept");
});

test("closing time is the business's hours on any grid: open nine to five turns at five and not a minute before; open late is today at half past nine; no hours turns after the last visit, and a day with neither never turns", () => {
  const withHours = (tueHours, nowAt, over = {}) => {
    const w = { ...week(), hours: { ...week().hours, tue: tueHours }, ...over };
    const cal = toCalendarVM(w, nowAt);
    return todayZoneDay(cal, todayDay(cal, null, null, Number.POSITIVE_INFINITY), [], nowAt.getTime());
  };
  const nineToFive = { open: "09:00", close: "17:00" };
  assert.equal(withHours(nineToFive, tue(16, 59)).tomorrow, false, "4:59 PM: still today");
  assert.equal(withHours(nineToFive, tue(17)).tomorrow, true, "5 PM: closed, and the day turns");
  assert.equal(
    withHours({ open: "09:00", close: "20:00" }, tue(9, 30)).tomorrow,
    false,
    "REGRESSION: a business open till eight read as closed at half past nine, and today's visits were gone",
  );
  const noHours = { ...week(), hours: {} };
  const at = (nowAt, w) => {
    const cal = toCalendarVM(w, nowAt);
    return todayZoneDay(cal, todayDay(cal, null, null, Number.POSITIVE_INFINITY), [], nowAt.getTime());
  };
  assert.equal(at(tue(16, 30), noHours).tomorrow, false, "no hours set: Ines's four o'clock is not over");
  assert.equal(at(tue(17), noHours).tomorrow, true, "no hours set: the day turns once its last visit has ended");
  const empty = { ...noHours, days: noHours.days.map((d, i) => (i === 1 ? { ...d, items: [], windows: [] } : d)) };
  assert.equal(at(tue(23), empty).tomorrow, false, "no hours and no visits: nothing says the day is over");
});

test("the turned day's foot says how today went, and the head's line after closing says what was booked and answered", () => {
  const now = tue(18, 30);
  const cal = toCalendarVM(week(), now);
  const day = todayDay(cal, { rows: [FILL], word: "visit" }, null, Number.POSITIVE_INFINITY);
  const z = todayZoneDay(cal, day, [], now.getTime());
  const today = day.frames.find((f) => f.today);
  assert.equal(
    todayWentFoot(today, z.toMark, { value: 31, of: 34 }, "visit"),
    "Today: 4 visits, 1 to mark · 31 of 34 answered",
    "Rosa's cancelled visit is none of the day's",
  );
  assert.equal(todayWentFoot(today, 0, null, "visit"), "Today: 4 visits", "nothing to mark, nothing counted answered");
  assert.equal(
    todayWentLine([
      { id: "booked", value: 4 },
      { id: "answered", value: 31, of: 34 },
    ]),
    "Today: 4 booked, 31 of 34 answered by the receptionist.",
  );
  assert.equal(todayWentLine([{ id: "answered", value: null }]), null, "nothing counted: nothing said");
});

test("who comes back is read from the threads put off, soonest first: only a snooze, only one that ends within the day", () => {
  const conv = (id, state, until, name) => ({
    id,
    state,
    snooze_until: until ? iso(until) : null,
    contact: { display_name: name },
  });
  const back = todayBackOf(
    [
      conv("c-late", "snoozed", tue(16), "Lee Park"),
      conv("c-soon", "snoozed", tue(10), "Dana Ruiz"),
      conv("c-open", "open", tue(11), "Ana Ruiz"),
      conv("c-past", "snoozed", tue(7), "Mo Diaz"),
      conv("c-far", "snoozed", new Date(tue(8).getTime() + 30 * 3_600_000), "Bo Chen"),
    ],
    tue(8),
  );
  assert.deepEqual(
    back.map((b) => b.conversationId),
    ["c-soon", "c-late"],
  );
});

test("a fact the read does not hold is not said: nobody matched, or whether they were in before not known", () => {
  const z = zoneAt(tue(15, 30));
  assert.deepEqual(
    cellsOf(z).map(([e, , what, fact]) => [e, what, fact]),
    [["Next", "Ines Mora · Fringe trim", null]],
    "Ines's visits were read and the record was not asked of before the season: no 'First visit'",
  );
});
