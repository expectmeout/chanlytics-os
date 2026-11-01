/**
 * Today's day is built from the record's word on each visit (decision 0002, 0047; D1-visit-today-mark of the wiring plan, task 1.3).
 *
 * The mark and the struck block were built in #1549 and the readers that treat a cancelled visit as none (People, Reports, the
 * moments) in #1551; Today's strip and brief date from #1357 and were touched by neither. A member who says a visit is cancelled
 * saw the Calendar strike it and Today go on counting it, name it as the next one and call a day of them "all done" (the word
 * decision 0002 chose never to use for a visit). Today's day now takes the mark from the calendar's block: a cancelled visit is
 * none, a missed one is never under way or next, a kept one says Kept, and a day that is over says it is past.
 *
 * Run on todayDay, todayBriefWords and todayDayNext over the blocks the calendar surface publishes, and on the top bar's
 * Next (frame/topbar/status-bars.tsx NextVisitBar), the strip's next appointment since 31 Oct 2026, drawn on the stub React.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { HOUR_MS, todayBriefWords, todayDay, todayDayNext } from "@chanlytics/contracts";
import { installLegacyReact, fresh, all, byTestId, textOf } from "../_legacy-react.mjs";
import { handoffDay } from "./_world.mjs";

installLegacyReact({
  __DEMO_MODE: false,
  __surfaceState: () => "live",
  appNavigate: () => {},
  canDo: () => true,
  setInterval: () => 1,
  clearInterval() {},
});
const W = globalThis.window;
const { NextVisitBar } = await import("../../../../apps/dashboard/src/surfaces/frame/topbar/status-bars.tsx");
const { setSurfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");

/** A visit on the board: [id, hour, what it is for, the record's word on it, the person]. One hour long. */
const visit = (id, t, service, status = "booked", person = null) => ({
  id,
  t,
  dur: 60,
  time: `${t}:00`,
  title: person ? `${service} · ${person}` : service,
  service,
  person: person ? { id: `p-${id}`, name: person, via: "phone" } : null,
  visit: { id: `ap-${id}`, status },
});
const day = (key, over = {}) => ({
  key,
  dow: "Fri",
  date: "Sep 18",
  long: "Friday, September 18",
  dayNum: "18",
  today: false,
  past: false,
  closed: { yes: false, note: null },
  bands: [],
  blocks: [],
  allDay: [],
  windows: [],
  ...over,
});
/** The calendar surface's view model, with the clock at `now` hours. */
const calendar = (blocks, now = 16) => ({
  timezone: "America/New_York",
  from: "2026-09-18",
  to: "2026-11-19",
  rangeLabel: "",
  monthLabel: "",
  hours: { start: 8, end: 20 },
  days: [day("2026-09-18", { today: true, blocks }), day("2026-09-19", { long: "Saturday, September 19" })],
  today: "2026-09-18",
  now,
  feed: { present: true, state: "ok", line: "", events: blocks.length, source: "Google Calendar" },
  stats: { events: blocks.length, windows: 0, next: "Mon 9:30 AM" },
  rules: "",
  hoursLines: [],
  closuresAhead: [],
  services: [],
  bookingLink: null,
});
const todayOf = (cal) => todayDay(cal, null).frames.find((f) => f.today);
/** The day's sentence in the brief, as one string. */
const briefDay = (cal) => {
  const words = todayBriefWords(handoffDay(), todayDay(cal, null), []);
  const lines = words.sentences.map((s) => s.map((x) => x.text).join(""));
  return lines.find((l) => /appointment|calendar today|Closed today/.test(l)) ?? null;
};

/**
 * A working afternoon at four: Gloss came (kept), Trim did not (missed), Cut was cancelled, the Balayage at 4:30 was cancelled
 * (it would have been "next"), Dulce Amaro's Color at five and a Trim at six stand.
 */
const afternoon = () =>
  calendar([
    visit("b1", 10, "Gloss", "kept", "Emily Chen"),
    visit("b2", 11, "Trim", "missed", "Ana Reyes"),
    visit("b3", 12, "Cut", "cancelled"),
    { ...visit("b4", 16.5, "Balayage", "cancelled", "Priya Nair") },
    visit("b5", 17, "Color", "booked", "Dulce Amaro"),
    visit("b6", 18, "Trim", "booked"),
  ]);

test("a cancelled visit is none on Today's day: not listed, not counted, never the next", () => {
  const frame = todayOf(afternoon());
  assert.deepEqual(
    frame.items.map((i) => i.id),
    ["b1", "b2", "b5", "b6"],
    "the Cut and the Balayage are gone from the day",
  );
  assert.equal(
    frame.items.find((i) => i.phase === "next").id,
    "b5",
    "the next is Dulce Amaro, not the cancelled Balayage",
  );
  assert.deepEqual(frame.summary, { booked: "3 booked", flagged: null }, "three stand; the missed one is not booked");
  // A day whose every visit was cancelled is an empty day.
  const none = calendar([visit("c1", 10, "Cut", "cancelled"), visit("c2", 11, "Trim", "cancelled")]);
  assert.deepEqual(todayOf(none).items, []);
  assert.equal(briefDay(none), "Nothing on the calendar today.");
  // A cancelled all-day entry is none too.
  const allDay = calendar([]);
  allDay.days[0].allDay = [visit("c3", 0, "Stock count", "cancelled")];
  assert.deepEqual(todayOf(allDay).items, []);
});

test("a word the record keeps for a visit rides on its item: Kept and Missed in the board's own words, and nothing on a visit that stands", () => {
  const items = todayOf(afternoon()).items;
  assert.deepEqual(
    items.map((i) => (i.said ? [i.said.status, i.said.word] : null)),
    [["kept", "Kept"], ["missed", "Missed"], null, null],
  );
  // Without a mark at all (a block read before the marks existed, or a feed event the record has no row for) it stands.
  const unmarked = visit("x", 17, "Color");
  delete unmarked.visit;
  assert.equal(todayOf(calendar([unmarked])).items[0].said, null);
  assert.equal(todayOf(calendar([{ ...unmarked, visit: null }])).items[0].said, null);
});

test("a visit said missed is never under way or next: nobody is coming; one said kept and still under way is 'now', with its word", () => {
  // At 4 PM the Trim from 3:30 is in its slot. Said missed, nothing is under way and the five o'clock is next.
  const missed = todayOf(
    calendar([visit("m", 15.5, "Trim", "missed", "Ana Reyes"), visit("n", 17, "Color", "booked", "Dulce Amaro")]),
  );
  assert.deepEqual(
    missed.items.map((i) => [i.id, i.phase]),
    [
      ["m", "past"],
      ["n", "next"],
    ],
  );
  // Said kept while it lasts, it is under way, and says so.
  const kept = todayOf(
    calendar([visit("k", 15.5, "Trim", "kept", "Ana Reyes"), visit("n", 17, "Color", "booked", "Dulce Amaro")]),
  );
  assert.deepEqual(
    kept.items.map((i) => [i.id, i.phase]),
    [
      ["k", "now"],
      ["n", "next"],
    ],
  );
});

test("the brief counts what stands, says how many were missed, and names the next visit that is really next", () => {
  assert.equal(
    briefDay(afternoon()),
    "4 appointments today, 1 missed: next is Dulce Amaro (Color) at 5 PM, 1 more after.",
    "the cancelled two are not in the four, and the next is the five o'clock",
  );
  // Kept and under way: named with its word.
  const under = calendar([
    visit("k", 15.5, "Trim", "kept", "Ana Reyes"),
    visit("n", 17, "Color", "booked", "Dulce Amaro"),
  ]);
  assert.equal(
    briefDay(under),
    "2 appointments today: Ana Reyes (Trim, kept) is in now (1h), then Dulce Amaro (Color) at 5 PM.",
  );
  // One said missed, in its slot: not "in now".
  const gone = calendar([
    visit("m", 15.5, "Trim", "missed", "Ana Reyes"),
    visit("n", 17, "Color", "booked", "Dulce Amaro"),
  ]);
  assert.equal(briefDay(gone), "2 appointments today, 1 missed: next is Dulce Amaro (Color) at 5 PM.");
});

test("a day that is over says it is past, never 'all done': the word decision 0002 chose never to use for a visit", () => {
  const over = (now) =>
    calendar(
      [
        visit("b1", 10, "Gloss", "kept", "Emily Chen"),
        visit("b2", 11, "Trim", "missed", "Ana Reyes"),
        visit("b3", 12, "Cut", "cancelled"),
      ],
      now,
    );
  assert.equal(briefDay(over(19)), "2 appointments today, 1 missed, all past.");
  // Unmarked visits that have simply ended are past too: the record never infers that they came.
  const ended = calendar([visit("e1", 9, "Gloss"), visit("e2", 10, "Trim")], 14);
  assert.equal(briefDay(ended), "2 appointments today, all past.");
  for (const cal of [over(19), ended]) assert.ok(!/all done/.test(briefDay(cal)), briefDay(cal));
});

/* ----------------------------------------- what is next, in the frame's top bar ----------------------------------------- */

/** The clock at `h` hours on the calendar's day, in its zone (America/New_York, four hours behind UTC in September). */
const at = (h) => Date.UTC(2026, 8, 18, 4) + h * HOUR_MS;

const drawNext = (cal, h = 16) => {
  fresh();
  setSurfaceValue("calendar", { vm: cal });
  Date.now = () => at(h);
  return W.React.createElement(NextVisitBar, {});
};
const realNow = Date.now;
after(() => {
  setSurfaceValue("calendar", undefined);
  Date.now = realNow;
});

test("the bar's Next names the next visit that stands: a cancelled one is never it, a missed one is not under way", () => {
  const next = todayDayNext(afternoon(), at(16));
  assert.equal(next.phase, "Next");
  assert.equal(next.start, "5 PM");
  assert.equal(next.who, "Dulce Amaro");
  assert.ok(!/Priya Nair|Balayage/.test(next.label), `the cancelled visit is not named: ${next.label}`);
  // Said missed in its slot: the bar says what comes next, not "Now".
  const gone = todayDayNext(
    calendar([visit("m", 15.5, "Trim", "missed", "Ana Reyes"), visit("n", 17, "Color", "booked", "Dulce Amaro")]),
    at(16),
  );
  assert.equal(gone.phase, "Next");
  assert.equal(gone.who, "Dulce Amaro");
  // Nothing left that stands: no Next at all, and the bar draws nothing.
  const none = calendar([visit("m", 15.5, "Trim", "missed", "Ana Reyes"), visit("c", 17, "Cut", "cancelled")]);
  assert.equal(todayDayNext(none, at(16)), null);
  assert.equal(all(drawNext(none), (n) => n.props?.["data-testid"] === "next-bar").length, 0);
});

test("the bar says Kept beside a visit that is said kept and still under way", () => {
  const next = todayDayNext(
    calendar([visit("k", 15.5, "Trim", "kept", "Ana Reyes"), visit("n", 17, "Color", "booked", "Dulce Amaro")]),
    at(16),
  );
  assert.equal(next.phase, "Now");
  assert.equal(next.who, "Ana Reyes");
  assert.match(next.label, /Kept/);
});

test("the bar reads the clock now, not the minute the Calendar was read: a visit that began since is under way", () => {
  // The Calendar was read at four (its `now`); the bar stays up across pages, and at half past five Dulce Amaro is in.
  const cal = afternoon();
  assert.equal(todayDayNext(cal, at(16)).phase, "Next");
  const later = todayDayNext(cal, at(17.5));
  assert.equal(later.phase, "Now");
  assert.equal(later.who, "Dulce Amaro");
  // Past the last visit, nothing is next.
  assert.equal(todayDayNext(cal, at(19.5)), null);
  // No calendar, or one that could not be read: nothing is claimed.
  assert.equal(todayDayNext(null, at(16)), null);
  assert.equal(todayDayNext({ ...cal, feed: { ...cal.feed, state: "unavailable" } }, at(16)), null);
});

test("REGRESSION (S9-7): the bar's Next opens the visit itself, a link, and its day where it has none", () => {
  const door = (b) => byTestId(drawNext(calendar([b])), "next-bar");
  const visitDoor = door(visit("v9", 17, "Color", "booked", "Dulce Amaro"));
  assert.equal(visitDoor.type, "a", "a link: a long press or a new tab opens it too");
  assert.match(visitDoor.props.href, /\/calendar\/(\d{4}-\d{2}-\d{2}:)?a-ap-v9$/, "the visit's own address");
  assert.equal(typeof visitDoor.props.onClick, "function");
  assert.equal(visitDoor.props["aria-label"], "Next at 5 PM: Dulce Amaro · Color · 1h");
  assert.equal(
    textOf(byTestId(drawNext(calendar([visit("v9", 17, "Color", "booked", "Dulce Amaro")])), "next-bar")),
    "Next5 PMDulce Amaro",
  );
  const day = door({ ...visit("b17", 17, "Color", "booked", "Dulce Amaro"), visit: null });
  assert.match(day.props.href, /\/calendar\/\d{4}-\d{2}-\d{2}$/, "a block with no visit row opens its day");
});

test("the brief counts in the workspace's word for an appointment, as Campaigns says it (decision 0041, D1-visit-words)", () => {
  const sentence = (day) =>
    todayBriefWords(handoffDay(), day, [])
      .sentences.map((s) => s.map((x) => x.text).join(""))
      .find((l) => /^\d+ \w+ today/.test(l));
  // The playbooks read says the word, the workspace's own (00458).
  assert.equal(todayDay(afternoon(), { rows: [], word: "meeting" }).word, "meeting");
  assert.equal(
    sentence(todayDay(afternoon(), { rows: [], word: "meeting" })),
    "4 meetings today, 1 missed: next is Dulce Amaro (Color) at 5 PM, 1 more after.",
  );
  assert.equal(sentence(todayDay(afternoon(), { rows: [], word: "visit" })).split(",")[0], "4 visits today");
  // Playbooks unread: People's read says it (GET contacts' appointment_word), and nothing says it otherwise.
  assert.equal(todayDay(afternoon(), null, { rows: [], word: "meeting" }).word, "meeting");
  assert.equal(todayDay(afternoon(), null, { rows: [] }).word, "appointment");
  assert.equal(todayDay(null, null).word, "appointment", "no calendar, and the word is still the default one");
});
