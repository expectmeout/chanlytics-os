/**
 * The demo's Reports, EXECUTED: a sample business through the contracts functions a real workspace's numbers go
 * through. The same day gives the same numbers, and every total agrees with its parts, because a demo that adds up
 * wrong teaches the viewer to distrust the real page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { reportsSample } from "../../../apps/dashboard/src/legacy-bridge/reports-sample.ts";

const TODAY = "2026-09-18";

test("the same period on the same day is the same report, kept rather than rebuilt on every draw", () => {
  const a = reportsSample(30, TODAY);
  assert.equal(a, reportsSample(30, TODAY));
  assert.equal(a.days, 30);
  assert.equal(a.vm.until, "Sep 18", "the period ends today");
  assert.equal(reportsSample(7, TODAY).vm.answered.points.length, 7);
  assert.equal(reportsSample(90, TODAY).vm.answered.points.length, 90);
  assert.equal(reportsSample(14, TODAY).days, 30, "a period Reports does not offer is the default one");
});

test("every total agrees with its parts, in every period", () => {
  for (const days of [7, 30, 90]) {
    const { vm, campaigns, booking } = reportsSample(days, TODAY);
    const t = vm.answered.totals;
    const reached = t.in + vm.calls.total;
    assert.equal(
      vm.channels.reduce((s, c) => s + c.value, 0),
      reached,
      `${days}: the channels are the messages and calls`,
    );
    assert.equal(
      vm.hours.values.reduce((a, b) => a + b, 0),
      reached,
      `${days}: so are the hours`,
    );
    // Over a week each weekday is its count, so the week adds up; over a longer period each is its own average.
    if (days === 7)
      assert.equal(
        vm.week.current.reduce((a, b) => a + b, 0),
        reached,
        `${days}: and the week`,
      );
    else assert.equal(vm.week.unit, "average", `${days}: a weekday is its own average`);
    assert.equal(vm.replyTime.count, t.ai, `${days}: a reply for each message the receptionist answered`);
    assert.equal(
      vm.speed.points.reduce((s, p) => s + p.count, 0),
      t.ai,
      `${days}: the speed line counts the same replies`,
    );
    assert.equal(
      vm.reasons.reduce((s, r) => s + r.value, 0),
      vm.answered.points.reduce((s, p) => s + p.escalations, 0),
      `${days}: a reason for each handover`,
    );
    assert.equal(
      vm.calls.sentiments.reduce((s, r) => s + r.value, 0),
      vm.calls.total,
      `${days}: a mood for each call`,
    );
    assert.equal(
      campaigns.sources.reduce((s, x) => s + x.sent, 0),
      campaigns.totals.sent,
      `${days}: the sources share what was sent`,
    );
    assert.ok(booking.present && booking.booked <= booking.asked, `${days}: booked out of asked`);
  }
});

test("it is a report worth showing: traffic, a period before to compare with, campaigns, facts", () => {
  for (const days of [7, 30, 90]) {
    const s = reportsSample(days, TODAY);
    assert.equal(s.vm.empty, false, `${days}`);
    assert.ok(s.vm.tiles.find((x) => x.id === "messages").compare, `${days}: compared with the period before`);
    assert.ok(s.campaigns && !s.campaigns.empty && s.campaigns.totals.sent > 0, `${days}: something went out`);
    assert.ok(s.facts.length >= 1 && s.facts.length <= 3, `${days}: Worth knowing has something to say`);
  }
});

test("the mockup's bundle publishes the same sample, so the demo draws the page a workspace draws", async () => {
  // serve-legacy.mjs builds data/reports-sample.js from the same file, with contracts from its dist.
  const { reportsSampleBundle } = await import("../serve-legacy.mjs");
  const win = {};
  vm.runInNewContext(await reportsSampleBundle(), { window: win, console });
  const plain = (x) => JSON.parse(JSON.stringify(x));
  for (const days of [7, 30, 90])
    assert.deepEqual(plain(win.__reportsSample(days, TODAY)), plain(reportsSample(days, TODAY)), `${days} days`);
});
