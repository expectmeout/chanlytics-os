/**
 * The demo's Reports (surfaces/reports/sample.ts, which the page imports and draws in a demo session), EXECUTED: a
 * sample business through the contracts functions a real workspace's numbers go through. The same day gives the same numbers, and every total agrees with its parts, because a demo that adds up
 * wrong teaches the viewer to distrust the real page. The Reviews lens's sample is the listing Google shows with no Business Profile
 * behind it, through the Reviews fold.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixedDaysOf } from "@chanlytics/contracts";
import { reportsSample, reviewsSample } from "../../../../apps/dashboard/src/surfaces/reports/sample.ts";

const TODAY = "2026-09-18";

test("the same period on the same day is the same report, kept rather than rebuilt on every draw", () => {
  const a = reportsSample("30d", TODAY);
  assert.equal(a, reportsSample("30d", TODAY));
  assert.equal(a.days, 30);
  assert.equal(a.vm.until, "Sep 18", "the period ends today");
  assert.equal(reportsSample("7d", TODAY).vm.answered.points.length, 7);
  assert.equal(reportsSample("90d", TODAY).vm.answered.points.length, 90);
  assert.equal(reportsSample("14d", TODAY).days, 30, "a period Reports does not offer is the default one");
});

test("every total agrees with its parts, in every period", () => {
  for (const id of ["7d", "30d", "90d"]) {
    const days = fixedDaysOf(id);
    const { vm, campaigns, booking } = reportsSample(id, TODAY);
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
  for (const id of ["7d", "30d", "90d"]) {
    const days = fixedDaysOf(id);
    const s = reportsSample(id, TODAY);
    assert.equal(s.vm.empty, false, `${days}`);
    assert.ok(s.vm.tiles.find((x) => x.id === "messages").compare, `${days}: compared with the period before`);
    assert.ok(s.campaigns && !s.campaigns.empty && s.campaigns.totals.sent > 0, `${days}: something went out`);
    assert.ok(s.facts.length >= 1 && s.facts.length <= 3, `${days}: Worth knowing has something to say`);
  }
});

test("Month is the days since the 1st: eighteen on the 18th, said as a period of its own", () => {
  const month = reportsSample("month", TODAY);
  assert.deepEqual([month.period, month.days, month.vm.answered.points.length], ["month", 18, 18]);
  assert.equal(reportsSample("90d", TODAY).period, "90d");
});

test("the sample's channels (0030) share each period's figures, every part inside its channel's own sends, on every day of a year and every period", () => {
  for (let k = 0; k < 366; k++) {
    const today = new Date(Date.parse("2026-01-01T12:00:00Z") + k * 86_400_000).toISOString().slice(0, 10);
    for (const id of ["7d", "30d", "90d", "month"]) {
      const { campaigns } = reportsSample(id, today);
      const at = `${today} ${id}`;
      const sum = (k2) => campaigns.channels.reduce((n, c) => n + c[k2], 0);
      if (!campaigns.totals.sent) continue;
      assert.deepEqual(
        [sum("sent"), sum("delivered"), sum("replied")],
        [campaigns.totals.sent, campaigns.totals.delivered, campaigns.totals.replied],
        `${at}: the parts are the whole`,
      );
      for (const c of campaigns.channels) {
        assert.ok(
          c.delivered <= c.sent && c.replied <= c.sent && c.delivered >= 0 && c.replied >= 0,
          `${at} ${c.label}`,
        );
        assert.ok(c.deliveredPct === null || c.deliveredPct <= 100, `${at} ${c.label}: at most all of it`);
      }
      assert.ok(campaigns.totals.read <= campaigns.totals.readOf, `${at}: a read of WhatsApp's own`);
    }
  }
});

test("the Reviews sample is the public listing through the Reviews fold: four figures, the ratings it gained, the five reviews Google shows, and what a profile would add; kept per period and day", () => {
  const a = reviewsSample("30d", TODAY);
  assert.equal(a, reviewsSample("30d", TODAY), "kept rather than rebuilt on every draw");
  assert.deepEqual(Object.keys(a).sort(), ["period", "vm"], "what the surface holds");
  assert.equal(reviewsSample("14d", TODAY).period, "30d", "a period Reports does not offer is the default one");
  for (const id of ["7d", "30d", "90d", "month"]) {
    const s = reviewsSample(id, TODAY);
    const days = fixedDaysOf(id) ?? 18;
    assert.equal(s.period, id);
    assert.deepEqual(
      [s.vm.state, s.vm.source, s.vm.days, s.vm.empty],
      ["linked", "places", days, false],
      `${id}: a listing is linked and no profile is`,
    );
    assert.deepEqual(
      s.vm.tiles.map((t) => t.metric),
      ["rating", "reviews", "ratings_gained", "newest_review"],
      `${id}: the listing's own four`,
    );
    assert.equal(s.vm.google.gained.points.length, days, `${id}: a reading's difference for each day of the period`);
    assert.equal(s.vm.latest.length, 5, `${id}: the five Google shows`);
    assert.ok(
      s.vm.latest.every((r) => !r.fromProfile && !r.replied),
      `${id}: none can be answered from here`,
    );
    assert.equal(s.vm.lines.connect, "Connect your Business Profile to see every review, who answered, and how fast.");
    assert.equal(typeof s.vm.lines.head, "string", `${id}: and its head says the listing`);
  }
});
