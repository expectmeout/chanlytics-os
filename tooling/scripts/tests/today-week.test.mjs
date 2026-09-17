/**
 * Below Today's core: the period as Reports counts it, where people are on
 * the way to a booking, and what happened while the owner was away — each
 * computed in contracts from a surface the page already holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { todayWeek, todayJourney, todayAway } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const tile = (id, label, value) => ({ id, label, value, meta: "", delta: null, spark: [] });
const reports = (over = {}) => ({
  vm: {
    days: 7, rangeLabel: "7 days", since: "Aug 31", until: "Sep 6", empty: false,
    tiles: [tile("in", "Customer messages", "12"), tile("ai", "Receptionist answered", "10")],
    answered: { totals: { in: 12, ai: 10, you: 2, none: 0 } },
    reasons: [{ id: "manual", label: "Flagged by you", value: 2 }, { id: "quiet", label: "Nobody stopped it", value: 0 }],
    ...(over.vm || {}),
  },
  campaigns: { tiles: [tile("sent", "Messages sent", "8"), tile("optins", "Said yes", "2")], empty: false },
  booking: { present: true, headline: "3 of 12 booked", sub: "25% of the people who wrote or called in the last 7 days have an appointment on the calendar", pct: 25, asked: 12, booked: 3 },
  ...(({ vm: _vm, ...rest }) => rest)(over),
});

test("the period keeps Reports' own tiles and range, and each of its three reads is a view with its own tiles", () => {
  const vm = todayWeek(reports());
  assert.equal(vm.label, "Last 7 days");
  assert.equal(vm.sub, "Aug 31 – Sep 6", "the comparison it is drawn against stays on Reports, with the charts");
  assert.deepEqual(vm.views.map((v) => v.id), ["conversations", "campaigns", "booking"]);
  assert.equal(vm.initial, "conversations");

  const [conv, camp, book] = vm.views;
  assert.deepEqual(conv.tiles.map((t) => t.id), ["in", "ai"], "the tiles are Reports' tiles, untouched");
  assert.deepEqual(conv.chips, [{ label: "Flagged by you", value: "2" }], "what stopped it, and never a reason that never fired");
  assert.equal(conv.note, null);
  assert.deepEqual(camp.tiles.map((t) => t.id), ["sent", "optins"], "the campaign numbers were one grey line under six tiles");
  assert.equal(camp.to, "broadcasts");
  assert.deepEqual(book.tiles.map((t) => [t.id, t.value]), [["asked", "12"], ["booked", "3"], ["rate", "25%"]]);
  assert.equal(book.tiles[2].meta, "3 of 12 booked");
  assert.equal(todayWeek(null), null);
});

test("nothing sent, nobody asked, no calendar: each view says so and leads where the fix is", () => {
  const quiet = todayWeek(reports({
    campaigns: { tiles: [tile("sent", "Messages sent", "0")], empty: true },
    booking: { present: true, headline: "Nobody asked", sub: "nobody wrote or called in the last 7 days", pct: null, asked: 0, booked: 0 },
  }));
  const view = (id) => quiet.views.find((v) => v.id === id);
  assert.deepEqual(view("campaigns").tiles, []);
  assert.equal(view("campaigns").note, "No campaign message went out in this period.");
  assert.deepEqual(view("booking").tiles, []);
  assert.equal(view("booking").note, "Nobody wrote or called, so there was nothing to book.");

  const noCal = todayWeek(reports({ booking: { present: false, headline: "—", sub: "Connect your calendar under Settings › Business to see who booked.", pct: null, asked: 0, booked: 0 } }));
  const b = noCal.views.find((v) => v.id === "booking");
  assert.equal(b.note, "Connect your calendar under Settings › Business to see who booked.");
  assert.equal(b.to, "calendar");
});

test("a message nobody answered is NOT said a third time here, and an empty period opens on what it has", () => {
  // The Receptionist answered tile carries "4 unanswered" in its own meta and
  // todayLeaks says it in words above; a note here was the third printing.
  const missed = todayWeek(reports({ vm: { answered: { totals: { in: 21, ai: 16, you: 1, none: 4 } } } }));
  assert.equal(missed.views[0].note, null);
  const empty = todayWeek(reports({ vm: { empty: true, tiles: [] } }));
  assert.equal(empty.views[0].note, "Nobody wrote or called in this period.");
  assert.equal(empty.initial, "campaigns", "the card opens on the view that has something in it");
});

test("the journey: People's lists with their counts, a row to the list, the step where it has one; reach comes with it", () => {
  const lists = [
    { id: "needs_you", label: "Needs you", group: "attention", count: 2, action: { text: "", cta: "Open the Inbox", to: "inbox", enabled: true } },
    { id: "new_week", label: "New this week", group: "journey", count: 3, action: { text: "", cta: "Get their yes", to: "broadcasts", enabled: true } },
    { id: "booked_week", label: "Booked this week", group: "journey", count: 0, action: { text: "", cta: "See the week", to: "calendar", enabled: false } },
    { id: "lapsed", label: "Lapsed", group: "journey", count: 4, action: { text: "Nobody on this list has said yes yet", cta: "Win them back", to: "broadcasts/lapsed", enabled: false } },
    { id: "booked", label: "Booked", group: "journey", count: 1, action: null },
    { id: "quiet", label: "Quiet 30+ days", group: "reach", count: 6, action: { text: "", cta: "Reach out", to: "broadcasts/quiet", enabled: true } },
    { id: "opted_out", label: "Opted out", group: "reach", count: 1, action: null },
  ];
  const vm = todayJourney({ lists, calendar: { state: "ok" } });
  assert.deepEqual(vm.rows, [
    { id: "new_week", label: "New this week", count: 3, to: "clients/seg:new_week", act: { label: "Get their yes", to: "broadcasts" } },
    { id: "booked_week", label: "Booked this week", count: 0, to: "clients/seg:booked_week", act: null },
    { id: "lapsed", label: "Lapsed", count: 4, to: "clients/seg:lapsed", act: null },
    { id: "booked", label: "Booked", count: 1, to: "clients/seg:booked", act: null },
  ], "journey only; a step only when it is enabled");
  assert.deepEqual(vm.reach, [
    { id: "quiet", label: "Quiet 30+ days", count: 6, to: "clients/seg:quiet", act: { label: "Reach out", to: "broadcasts/quiet" } },
    { id: "opted_out", label: "Opted out", count: 1, to: "clients/seg:opted_out", act: null },
  ], "the reach lists sat on People alone, where nobody looked");
  assert.equal(vm.note, null);
  const none = todayJourney({ lists: lists.slice(0, 2), calendar: { state: "none" } });
  assert.equal(none.rows.length, 1);
  assert.deepEqual(none.reach, []);
  assert.match(none.note, /once the calendar is connected/);
  assert.equal(todayJourney(null), null);
});

test("while you were away: the bell's unread rows, newest first as the bell orders them, capped with the rest counted", () => {
  const rows = [{ id: "a", unread: true }, { id: "b", unread: false }, { id: "c", unread: true }, { id: "d", unread: true }];
  assert.deepEqual(todayAway(rows, 2), { rows: [{ id: "a", unread: true }, { id: "c", unread: true }], more: 1 });
  assert.deepEqual(todayAway(rows), { rows: rows.filter((r) => r.unread), more: 0 });
  assert.deepEqual(todayAway([]), { rows: [], more: 0 });
});

test("the wiring: the bridge publishes them, Reports lends its tile, the page composes below the core in order", () => {
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/today.ts").includes("window.__today = { day: todayDay, facts: todayDayFacts, dayLine: todayDayLine, week: todayWeek, journey: todayJourney, away: todayAway, awayGrouped: todayAwayGrouped, leaks: todayLeaks };"));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/reports.jsx").includes("Object.assign(window, { RpTile });"), "the tile is shared, not copied");
  const page = readCode("apps/dashboard/src/legacy/pages/dashboard-a-week.jsx");
  for (const s of [
    'data-testid="today-leaks"', "window.__today.leaks(R, P)", 'data-testid={`today-leak-${l.id}`}',
    'data-testid="today-week"', "window.__today.week(R)", 'className="rp2-tiles"', 'data-testid={`today-week-view-${v.id}`}',
    'data-testid="today-journey"', "window.__today.journey(P)", 'data-testid="today-journey-row"',
    'data-testid="today-away"', "window.__today.awayGrouped(rows, inQueue, 5)", "g.ids.forEach((id) => api.read(id))", "api.seenAll()", "g.ids.forEach((id) => api.dismiss(id))", "return api.onChange(refresh);",
  ]) assert.ok(page.includes(s), s);
  assert.ok(page.includes("!window.__DEMO_MODE && window.__notifs ? window.__notifs : null"), "the same bell the topbar reads, never in a demo");
  assert.ok(page.includes("T.queue.rows.map((r) => r.also && r.also.conversationId)"), "a conversation in the queue above is not said again here");
  const dash = readCode("apps/dashboard/src/legacy/pages/dashboard-a.jsx");
  const order = ["<AgentCommand />", "<TodayDay />", "<TodayLeaks />", "<TodayPulse />", "<TodayAway />", "<TodayJourney />"].map((s) => dash.indexOf(s));
  assert.ok(order.every((i) => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]), "queue, day, worth a look, how it is going, away, journey");
  const manifest = readCode("apps/dashboard/src/legacy-bridge/manifest.ts");
  assert.ok(manifest.indexOf('"@/legacy/pages/dashboard-a-week.jsx"') < manifest.indexOf('"@/legacy/pages/dashboard-a.jsx"'));
  const css = readRaw("apps/dashboard/src/legacy/styles/dashboard-a-v2.css");
  for (const s of [".tsec {", ".tsec .tw-period .rp2-tiles {", ".tj-open {", ".ta-list {", ".tl-row {"]) assert.ok(css.includes(s), s);
});
