/**
 * The next visit to mark follows a word said in a visit's sheet (the visit sheet's review, 12 Nov 2026, finding 5), and More
 * keeps its cancel last and apart (finding 7).
 *
 * The header's line opened the first of the visits to mark; after Kept or Missed the sheet stood where it was, so each of
 * the rest took a close and the line again. Now the sheet offers the next of them as its lead, by the line's own rule
 * (contracts todayVisitsAsked), and its press opens it in this one's place (the desk's walk, which replaces the address).
 * The visit a word was just said on is never offered back, though the board has not read again. And More's cancel, which
 * cannot be taken back, stood between Open the deal and Open the full page: it is last now, in a group of its own.
 *
 * The visit (visit-sheet.tsx OpenVisit, the desk's peek) is the real TSX drawn on a stub React, its presses sent over a
 * scripted wire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toCalendarVM } from "@chanlytics/contracts";
import { installStubReact, fresh, again, byTestId, find, press } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";

const TZ = "America/New_York";
const NOW = new Date("2026-09-08T16:00:00.000Z");

installStubReact({ __DEMO_MODE: false, CHANLY: { nav() {} } });
const { OpenVisit } = await import("../../../apps/dashboard/src/surfaces/calendar/visit/visit-sheet");

/** The door takes every word said on a visit, and the reads behind it answer nothing new. */
globalThis.window.fetch = async (url, init = {}) => {
  const said = init.method === "POST" ? JSON.parse(init.body ?? "{}").status : null;
  const data = said
    ? { visit: { id: "v", status: said }, from: "booked", decision_id: "d", unchanged: false, follows: null }
    : {};
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

/** A person with an hour's visit from `hour` UTC on `key` (yesterday, by NOW, unless said), its row `id`, as it stands. */
const visitOn = (id, name, hour, status = "booked", key = "2026-09-07") => ({
  id: `e-${id}`,
  start: `${key}T${String(hour).padStart(2, "0")}:00:00.000Z`,
  end: `${key}T${String(hour + 1).padStart(2, "0")}:00:00.000Z`,
  title: `${name} · Balayage`,
  all_day: false,
  person: { id: `p-${id}`, name, via: "phone", thread: `t-${id}`, reply_wire: "sms" },
  contacts: { phones: [], emails: [] },
  visit: { id, status },
});

/** A day key `n` days from `ms`, by UTC. */
const keyFrom = (ms, n) => new Date(ms + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The Calendar's week from the day before `now` (by default Monday 7 September, yesterday by NOW), each visit on its own
 * day. The sheet judges a visit by the clock (Date.now): a visit still to come is drawn on a board around it.
 */
const boardOf = (items, now = NOW) => {
  const from = keyFrom(now.getTime(), -1);
  const days = [];
  for (let i = 0; i < 7; i++) days.push({ key: keyFrom(now.getTime(), i - 1), items: [], windows: [] });
  for (const item of items) days.find((d) => item.start.startsWith(d.key)).items.push(item);
  return toCalendarVM(
    {
      timezone: TZ,
      from,
      to: days.at(-1).key,
      feed: {
        present: true,
        state: "ok",
        read_at: now.toISOString(),
        events: items.length,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
      hours: { mon: { open: "09:00", close: "18:00" }, tue: { open: "09:00", close: "18:00" } },
      closures: [],
      rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 14 },
      booking_link: "https://book.example.com/luna",
      days,
    },
    now,
  );
};

/** Where the sheet's walk went: the blocks it asked the page to open in its place. */
const walked = [];
const dayOf = (vm, visitId) => vm.days.find((d) => d.blocks.some((b) => b.visit?.id === visitId));
const draw = (vm, visitId) =>
  again(() =>
    OpenVisit({
      b: dayOf(vm, visitId).blocks.find((b) => b.visit?.id === visitId),
      day: dayOf(vm, visitId),
      todayKey: vm.today,
      tz: TZ,
      source: "your calendar",
      bookingLink: vm.bookingLink,
      moments: null,
      days: vm.days,
      onClose() {},
      onWalk: (b) => walked.push(b),
      flash() {},
    }),
  );
const open = (vm, visitId) => {
  fresh();
  walked.length = 0;
  return draw(vm, visitId);
};
/** The foot's lead act of the visit's own, whatever it is. */
const leadOf = (tree) => find(tree, (n) => /^cal-visit-primary-/.test(n.props?.["data-testid"] ?? ""));

test("once a word is said, the next visit to mark leads the foot, and its press opens it in this one's place", async () => {
  const vm = boardOf([visitOn("v1", "Ana Ruiz", 14), visitOn("v2", "Ben Ortiz", 16)]);
  let tree = open(vm, "v1");
  assert.equal(byTestId(tree, "cal-visit-next"), null, "nothing is offered before a word is said");

  press(byTestId(tree, "cal-visit-ask-kept"));
  await until(() => byTestId((tree = draw(vm, "v1")), "cal-visit-next"), "the next is offered once the word is said");
  const next = byTestId(tree, "cal-visit-next");
  assert.equal(next.props.variant, "primary", "it is the foot's lead");
  assert.match(
    next.props["aria-label"],
    /^Next: Ben Ortiz, Yesterday, .+\. 1 appointment to mark$/,
    "who, when, and how many are left",
  );
  assert.equal(leadOf(tree)?.props.variant, "secondary", "the visit's own act stands quiet beside it");

  press(next);
  assert.deepEqual(
    walked.map((b) => b.visit?.id),
    ["v2"],
    "its press opens the next in this one's place: the walk, which replaces the address",
  );
});

test("the visit a word was said on is never offered back, though the board has not read again; with none left, the visit's own act leads", async () => {
  const vm = boardOf([visitOn("v3", "Cleo Park", 14), visitOn("v4", "Dev Shah", 16)]);
  let tree = open(vm, "v3");
  press(byTestId(tree, "cal-visit-ask-missed"));
  await until(() => byTestId((tree = draw(vm, "v3")), "cal-visit-next"), "the next is offered");

  // The board still reads Cleo's visit unmarked (no read has landed): Dev's sheet, once answered, has nobody left.
  tree = open(vm, "v4");
  press(byTestId(tree, "cal-visit-ask-kept"));
  await until(() => byTestId((tree = draw(vm, "v4")), "cal-visit-outcome"), "Dev's word is answered");
  assert.equal(byTestId(tree, "cal-visit-next"), null, "REGRESSION: Next offered back the visit it came from");
  assert.equal(leadOf(tree)?.props.variant, "primary", "the visit's own act leads again");
});

test("a visit marked already, or one still to come, is not the next to mark", async () => {
  const vm = boardOf([
    visitOn("v5", "Eva Lind", 14),
    visitOn("v6", "Finn Roe", 16, "kept"),
    visitOn("v8", "Hal Berg", 15, "booked", "2026-09-09"),
  ]);
  let tree = open(vm, "v5");
  press(byTestId(tree, "cal-visit-ask-kept"));
  await until(() => byTestId((tree = draw(vm, "v5")), "cal-visit-outcome"), "the word is answered");
  assert.equal(byTestId(tree, "cal-visit-next"), null, "Finn's is marked, and Hal's is after today: nothing waits");
});

test("More holds the cancel last, in a group of its own under a line, after Open the full page", () => {
  // A visit still to come by the clock the sheet reads: two days on, on a board around today.
  const now = new Date();
  const vm = boardOf([visitOn("v7", "Gia Moss", 15, "booked", keyFrom(now.getTime(), 2))], now);
  const tree = open(vm, "v7");
  const groups = find(tree, (n) => Array.isArray(n.props?.groups)).props.groups.map((g) => g.items.map((i) => i.label));
  assert.equal(groups.length, 2, "the cancel stands apart");
  assert.equal(groups[0].at(-1), "Open the full page", "the page is the last of the rest");
  assert.deepEqual(
    groups[1],
    ["Cancel the appointment…"],
    "REGRESSION: the cancel stood between Open the deal and Open the full page",
  );
  assert.equal(find(tree, (n) => Array.isArray(n.props?.groups)).props.head, undefined, "a desk's menu has no head");
});
