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
  vm: { days: 7, rangeLabel: "7 days", since: "Aug 31", until: "Sep 6", empty: false, tiles: [tile("in", "Customer messages", "12"), tile("ai", "Receptionist answered", "10")] },
  campaigns: { tiles: [tile("sent", "Messages sent", "8"), tile("optins", "Said yes", "2")], empty: false },
  booking: { present: true, headline: "3 of 12 booked", sub: "25% of the people who wrote or called in the last 7 days have an appointment on the calendar", pct: 25 },
  ...over,
});

test("the period keeps Reports' own tiles and range, and says what the campaigns sent and who booked -- a visit reminder is no offer", () => {
  const vm = todayWeek(reports());
  assert.equal(vm.label, "Last 7 days");
  assert.equal(vm.sub, "Aug 31 – Sep 6 · against the 7 days before");
  assert.deepEqual(vm.tiles.map((t) => t.id), ["in", "ai"], "the tiles are Reports' tiles, untouched");
  assert.deepEqual(vm.lines, [
    { id: "campaigns", text: "8 campaign messages sent · 2 said yes", to: "reports" },
    { id: "booking", text: "Asked → booked: 3 of 12 booked · 25%", to: "reports" },
  ]);
  assert.equal(todayWeek(null), null);
});

test("nothing sent, nobody asked, no calendar: each line says so and leads where the fix is", () => {
  const quiet = todayWeek(reports({ campaigns: { tiles: [tile("sent", "Messages sent", "0")], empty: true }, booking: { present: true, headline: "Nobody asked", sub: "nobody wrote or called in the last 7 days", pct: null } }));
  assert.deepEqual(quiet.lines, [
    { id: "campaigns", text: "No campaign message went out.", to: "reports" },
    { id: "booking", text: "Nobody wrote or called, so there was nothing to book.", to: "reports" },
  ]);
  const one = todayWeek(reports({ campaigns: { tiles: [tile("sent", "Messages sent", "1")], empty: false } }));
  assert.equal(one.lines[0].text, "1 campaign message sent · 0 said yes");
  const noCal = todayWeek(reports({ booking: { present: false, headline: "—", sub: "Connect your calendar under Settings › Business to see who booked.", pct: null } }));
  assert.deepEqual(noCal.lines[1], { id: "booking", text: "Connect your calendar under Settings › Business to see who booked.", to: "calendar" });
});

test("the journey: People's journey lists with their counts, a row to the list, the step where it has one; the calendar's absence said once", () => {
  const lists = [
    { id: "needs_you", label: "Needs you", group: "attention", count: 2, action: { text: "", cta: "Open the Inbox", to: "inbox", enabled: true } },
    { id: "new_week", label: "New this week", group: "journey", count: 3, action: { text: "", cta: "Get their yes", to: "broadcasts", enabled: true } },
    { id: "booked_week", label: "Booked this week", group: "journey", count: 0, action: { text: "", cta: "See the week", to: "calendar", enabled: false } },
    { id: "lapsed", label: "Lapsed", group: "journey", count: 4, action: { text: "Nobody on this list has said yes yet", cta: "Win them back", to: "broadcasts/lapsed", enabled: false } },
    { id: "booked", label: "Booked", group: "journey", count: 1, action: null },
  ];
  const vm = todayJourney({ lists, calendar: { state: "ok" } });
  assert.deepEqual(vm.rows, [
    { id: "new_week", label: "New this week", count: 3, to: "clients/seg:new_week", act: { label: "Get their yes", to: "broadcasts" } },
    { id: "booked_week", label: "Booked this week", count: 0, to: "clients/seg:booked_week", act: null },
    { id: "lapsed", label: "Lapsed", count: 4, to: "clients/seg:lapsed", act: null },
    { id: "booked", label: "Booked", count: 1, to: "clients/seg:booked", act: null },
  ], "journey only; a step only when it is enabled");
  assert.equal(vm.note, null);
  const none = todayJourney({ lists: lists.slice(0, 2), calendar: { state: "none" } });
  assert.equal(none.rows.length, 1);
  assert.match(none.note, /once the calendar is connected/);
  assert.equal(todayJourney(null), null);
});

test("while you were away: the bell's unread rows, newest first as the bell orders them, capped with the rest counted", () => {
  const rows = [{ id: "a", unread: true }, { id: "b", unread: false }, { id: "c", unread: true }, { id: "d", unread: true }];
  assert.deepEqual(todayAway(rows, 2), { rows: [{ id: "a", unread: true }, { id: "c", unread: true }], more: 1 });
  assert.deepEqual(todayAway(rows), { rows: rows.filter((r) => r.unread), more: 0 });
  assert.deepEqual(todayAway([]), { rows: [], more: 0 });
});

test("the wiring: the bridge publishes the three, Reports lends its tile, the page composes below the core in order", () => {
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/today.ts").includes("window.__today = { day: todayDay, facts: todayDayFacts, week: todayWeek, journey: todayJourney, away: todayAway };"));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/reports.jsx").includes("Object.assign(window, { RpTile, RpSpark });"), "the tile is shared, not copied");
  const page = readCode("apps/dashboard/src/legacy/pages/dashboard-a-week.jsx");
  for (const s of ['data-testid="today-week"', "window.__today.week(R)", 'className="rp2-tiles"', 'data-testid={`today-week-${l.id}`}', 'data-testid="today-journey"', "window.__today.journey(P)", 'data-testid="today-journey-row"', 'data-testid="today-away"', "window.__today.away(rows, 5)", "api.read(n.id); twNav(to);", "api.seenAll()", "api.dismiss(n.id)", "return api.onChange(refresh);"]) assert.ok(page.includes(s), s);
  assert.ok(page.includes("!window.__DEMO_MODE && window.__notifs ? window.__notifs : null"), "the same bell the topbar reads, never in a demo");
  const dash = readCode("apps/dashboard/src/legacy/pages/dashboard-a.jsx");
  const order = ["<AgentCommand />", "<TodayDay />", "<TodayWeek />", "<TodayAway />", "<TodayJourney />"].map((s) => dash.indexOf(s));
  assert.ok(order.every((i) => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]), "queue, day, the period, away, journey");
  const manifest = readCode("apps/dashboard/src/legacy-bridge/manifest.ts");
  assert.ok(manifest.indexOf('"@/legacy/pages/dashboard-a-week.jsx"') < manifest.indexOf('"@/legacy/pages/dashboard-a.jsx"'));
  const css = readRaw("apps/dashboard/src/legacy/styles/dashboard-a-v2.css");
  for (const s of [".tsec {", ".tsec .rp2-tiles {", ".tj-open {", ".ta-list {"]) assert.ok(css.includes(s), s);
});
