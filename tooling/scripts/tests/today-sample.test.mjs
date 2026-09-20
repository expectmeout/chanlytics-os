/**
 * The mockup's Today, EXECUTED: a sample workspace through the view models a real one goes through. The same moment
 * gives the same day; every figure agrees with the threads and calls under it; the bundle serve-legacy.mjs builds
 * publishes the same sample and installs it where the app's globals are absent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { todayLeaks, todayAwayGrouped, unreadCount } from "@chanlytics/contracts";
import { todaySample, installTodaySample } from "../../../apps/dashboard/src/legacy-bridge/today-sample.ts";

// 4 PM in New York on Friday 18 September 2026: every "minutes ago" in the sample lands on this day.
const NOW = Date.parse("2026-09-18T20:00:00Z");

test("the same moment is the same day, kept rather than rebuilt on every draw", () => {
  const a = todaySample(NOW);
  assert.equal(a, todaySample(NOW));
  assert.notEqual(a, todaySample(NOW + 60_000), "another moment is another day");
  assert.equal(a.TODAY_DATA.standing.eyebrow.split(" · ").at(-1), "Melany's Studio");
});

test("every figure agrees with the threads and calls under it", () => {
  const s = todaySample(NOW);
  const t = s.TODAY_DATA;
  const since = Date.parse(s.metrics.window.since);
  const inboundToday = s.conversations.flatMap((c) => c.messages).filter((m) => m.direction === "inbound" && m.sender === "customer" && Date.parse(m.created_at) >= since);
  const by = Object.fromEntries(t.figures.map((f) => [f.id, f]));
  assert.equal(by.messages.value, inboundToday.length, "the messages figure is the messages the read holds");
  assert.equal(by.messages.value, s.metrics.period.messages_in);
  const split = by.messages.receipt.text.match(/\d+/g).map(Number).reduce((a, n) => a + n, 0);
  assert.equal(split, inboundToday.length, `the receipt's wires add up to the figure: ${by.messages.receipt.text}`);
  assert.equal(by.answered.value, s.metrics.period.answered_by_ai);
  assert.equal(by.calls.value, s.calls.length, "one figure per call");
  assert.equal(by.calls.value, s.metrics.period.calls);
  assert.match(by.calls.receipt.text, /reached voicemail\.$/, "the caller who reached voicemail is named");
  assert.equal(by.new.value, 2);
  assert.match(by.new.receipt.text, /^Renata Solís and Marco Ibáñez wrote for the first time today\.$/);
  assert.equal(t.proof.startsWith("The last message arrived "), true);
  for (const f of t.figures) if (f.receipt) assert.doesNotMatch(f.receipt.text, new RegExp(`\\b${f.value}\\b`), `${f.id}: the receipt repeats the figure`);
});

test("the queue holds one of each kind, and Worth a look names who is waiting", () => {
  const s = todaySample(NOW);
  const t = s.TODAY_DATA;
  assert.deepEqual(t.queue.rows.map((r) => r.kind), ["handoff", "callback", "window", "call"]);
  assert.deepEqual(t.noReply.map((r) => r.who), ["Dulce Amaro"], "Sofía's thread is the closing window's; Ana's is the handoff's; Dulce is the one nobody answered");
  const leaks = todayLeaks(s.__REPORTS, s.__PEOPLE, t.noReply);
  assert.ok(leaks.rows.some((l) => l.id === "unreachable"), `everyone here said yes to messages and nobody to offers: ${leaks.rows.map((l) => l.id)}`);
  const away = todayAwayGrouped(s.bell, t.queue.rows.map((r) => ({ conversationId: r.conversationId, callId: r.callId })), 5);
  assert.equal(away.total, unreadCount(s.bell));
  assert.equal(away.queued, 3, "the handoff's row, the call-back's row and the missed call are the queue's");
  assert.deepEqual(away.groups.map((g) => g.row.kind), ["number", "review", "broadcast_sent"], "a warning first, then the news");
  assert.ok(s.__CALENDAR.vm.feed.state === "ok" && s.__CALENDAR.vm.days.find((d) => d.today).blocks.length === 6, "six on the calendar today: the day module's cap has something to cut");
  assert.equal(s.__BROADCASTS.rows.map((r) => r.state).sort().join(","), "pending_approval,scheduled,sent");
});

test("it installs only where the app's globals are absent", () => {
  const win = { TODAY_DATA: "the app's" };
  installTodaySample(win, NOW);
  assert.equal(win.TODAY_DATA, "the app's", "never over the bridge's own");
  assert.equal(typeof win.__today.periodLine, "function");
  assert.equal(win.__TODAY_SAMPLE.__notifs.feed().length, todaySample(NOW).bell.length);
  win.__TODAY_SAMPLE.__notifs.read(win.__TODAY_SAMPLE.__notifs.feed()[0].id);
  assert.equal(win.__TODAY_SAMPLE.__notifs.unread(), todaySample(NOW).bell.length - 1, "a read mark holds in memory");
  assert.equal(win.__TODAY_SAMPLE.__clock.dayKey(NOW), "2026-09-18");
  for (const key of ["__CALENDAR", "__PLAYBOOKS", "__PEOPLE", "__BROADCASTS", "__REPORTS", "__LIVE", "__clock", "__notifs"]) {
    assert.equal(win[key], undefined, "the mockup's other pages switch to their real variants on the bridge's names");
  }
});

test("the mockup's bundle publishes the same sample and never bundles the bridge's api", async () => {
  const { todaySampleBundle } = await import("../serve-legacy.mjs");
  const js = await todaySampleBundle();
  assert.ok(!js.includes("legacy-bridge/api.ts"), "zone.ts and notifications.ts import ./api; the sample must import neither");
  const win = {};
  vm.runInNewContext(js, { window: win, console, Date, Intl });
  const plain = (x) => JSON.parse(JSON.stringify(x));
  assert.deepEqual(plain(win.__todaySample(NOW).TODAY_DATA), plain(todaySample(NOW).TODAY_DATA));
  assert.ok(win.TODAY_DATA && win.__today && win.__TODAY_SAMPLE, "installed at load, for the page scripts that follow");
  assert.equal(win.__BROADCASTS, undefined, "the mockup's other pages switch to their real variants on the bridge's names");
});

/** "A", "A and B", "A, B and C", "A, B, C and 2 more": the andList grammar, unpicked. */
function splitAndList(text) {
  const parts = text.split(", ");
  const lastGroup = parts.pop().split(" and ");
  return [...parts, ...lastGroup];
}

test("at any hour the figures agree with the rows under them", () => {
  for (const iso of ["2026-09-18T04:13:00Z", "2026-09-18T10:00:00Z", "2026-09-18T20:00:00Z", "2026-09-19T02:00:00Z"]) {
    const at = Date.parse(iso);
    const s = todaySample(at);
    const t = s.TODAY_DATA;
    const since = Date.parse(s.metrics.window.since);
    const inboundToday = s.conversations.flatMap((c) => c.messages).filter((m) => m.direction === "inbound" && m.sender === "customer" && Date.parse(m.created_at) >= since);
    assert.equal(s.metrics.period.messages_in, inboundToday.length, `${iso}: messages_in is the inbound customer messages the read holds`);
    const callsToday = s.calls.filter((c) => c.started_at && Date.parse(c.started_at) >= since);
    assert.equal(s.metrics.period.calls, callsToday.length, `${iso}: calls is the calls started today`);

    if (s.metrics.period.messages_in === 0 && s.metrics.period.calls === 0 && s.metrics.period.new_contacts === 0) {
      assert.equal(t.figures, null, `${iso}: a day with nothing at all draws no row of zeros`);
      assert.equal(t.proof.startsWith("The last message arrived "), true, `${iso}: ${t.proof}`);
      continue;
    }
    const by = Object.fromEntries(t.figures.map((f) => [f.id, f]));
    assert.equal(by.messages.value, s.metrics.period.messages_in, `${iso}: messages figure`);
    assert.equal(by.answered.value, s.metrics.period.answered_by_ai, `${iso}: answered figure`);
    assert.equal(by.calls.value, s.metrics.period.calls, `${iso}: calls figure`);
    assert.equal(by.new.value, s.metrics.period.new_contacts, `${iso}: new figure`);
    assert.notEqual(by.new.meta, "first contact today", `${iso}: the count and the threads agree by construction`);
    if (s.metrics.period.new_contacts > 0) {
      assert.ok(by.new.receipt, `${iso}: names who is new`);
      const named = splitAndList(by.new.receipt.text.replace(/ wrote for the first time today\.$/, ""));
      const expectedNamed = Math.min(s.metrics.period.new_contacts, 3);
      const more = s.metrics.period.new_contacts > 3 ? named.pop() : null;
      assert.equal(named.length, expectedNamed, `${iso}: ${by.new.receipt.text}`);
      if (more !== null) assert.equal(more, `${s.metrics.period.new_contacts - 3} more`, `${iso}: ${by.new.receipt.text}`);
    }
    for (const f of t.figures) if (f.receipt) assert.doesNotMatch(f.receipt.text, new RegExp(`\\b${f.value}\\b`), `${iso}: ${f.id}: the receipt repeats the figure`);
  }
});
