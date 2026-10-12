/**
 * The demo's Reports (surfaces/reports/sample.ts, which the page imports and draws in a demo session), EXECUTED: a
 * sample business through the contracts functions a real workspace's numbers go through. The same day gives the same numbers, and every total agrees with its parts, because a demo that adds up
 * wrong teaches the viewer to distrust the real page. The Reviews lens's sample is the listing Google shows with no Business Profile
 * behind it, through the Reviews fold.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixedDaysOf, reportFacts, reportRangeKey } from "@chanlytics/contracts";
import { toCampaignLensVM, toPeopleReportVM, toReceptionistReportVM } from "@chanlytics/contracts/report-lens";
import { campaignsSample } from "../../../../apps/dashboard/src/surfaces/reports/campaigns-sample.ts";
import {
  peopleSample,
  receptionistSample,
  reportsSample,
  reviewsSample,
} from "../../../../apps/dashboard/src/surfaces/reports/sample.ts";

const TODAY = "2026-09-18";
/** The clock the Campaigns sample is folded on: the sample's own noon-ish hour on the day it is of. */
const SAMPLE_NOW = Date.parse(`${TODAY}T16:00:00Z`);
/** The Campaigns sample folded by the real fold, as the page folds it (no reach-outs: nothing reads them in a demo). */
const campaignsFold = (sample) =>
  toCampaignLensVM({ campaigns: sample.campaigns, ledger: sample.ledger, reachOuts: sample.reachOuts }, SAMPLE_NOW);

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
    const { vm, booking } = reportsSample(id, TODAY);
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
    const { report } = campaignsFold(campaignsSample(id, TODAY));
    assert.equal(
      report.sources.reduce((s, x) => s + x.sent, 0),
      report.totals.sent,
      `${days}: the sources share what was sent`,
    );
    assert.ok(booking.present && booking.booked <= booking.asked, `${days}: booked out of asked`);
  }
});

test("it is a report worth showing: traffic, a period before to compare with, campaigns, facts", () => {
  for (const id of ["7d", "30d", "90d"]) {
    const days = fixedDaysOf(id);
    const s = reportsSample(id, TODAY);
    const { report } = campaignsFold(campaignsSample(id, TODAY));
    assert.equal(s.vm.empty, false, `${days}`);
    assert.ok(s.vm.tiles.find((x) => x.id === "messages").compare, `${days}: compared with the period before`);
    assert.ok(report && !report.empty && report.totals.sent > 0, `${days}: something went out`);
    // Worth knowing is the page's, made from the report and the Campaigns sample's sources: three at most, and at least one.
    const facts = reportFacts(s.vm, report);
    assert.ok(facts.length >= 1 && facts.length <= 3, `${days}: Worth knowing has something to say`);
  }
});

test("the report's sample is the frame alone: it carries nothing of campaigns and no facts, which the Campaigns sample and the page make", () => {
  const s = reportsSample("30d", TODAY);
  assert.deepEqual(Object.keys(s).sort(), ["booking", "days", "deals", "fetchedAt", "key", "period", "range", "vm"]);
  assert.equal("campaigns" in s, false);
  assert.equal("facts" in s, false);
  assert.equal("reachOuts" in s, false);
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
      const { report: campaigns } = campaignsFold(campaignsSample(id, today));
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

const total = (xs) => xs.reduce((a, b) => a + b, 0);
const valuesOf = (record) => Object.values(record);

test("the Receptionist sample is the route's answer for the same business and days, folded by the real fold with every part available, and every part agrees with the report's own", () => {
  for (const id of ["7d", "30d", "90d", "month"]) {
    const report = reportsSample(id, TODAY);
    const own = receptionistSample(id, TODAY);
    const { series } = own.dto;
    const v = toReceptionistReportVM(own.dto, { nowMs: own.readAt });
    const at = `${id}`;
    assert.deepEqual([own.key, own.dto.days, own.dto.today], [report.key, report.days, TODAY], `${at}: its days`);
    assert.equal(own.readAt, Date.parse(`${TODAY}T16:00:00Z`), `${at}: read on the sample's own clock`);
    assert.equal(v.available, true, `${at}: every part is available`);
    const t = report.vm.answered.totals;
    const h = series.hold.now;
    // The hold: every outcome adds to the held replies, the replies sent are the ones the report counts, and the sample's business set a hold.
    assert.equal(h.sent + h.canceled + h.steered + h.overtaken + h.person_first + h.waiting + h.other, h.total, at);
    assert.equal(h.sent, t.ai, `${at}: a reply the receptionist sent went through the hold`);
    assert.ok(h.low_confidence <= h.total, at);
    assert.equal(total(v.hold.rows.map((r) => r.value)), h.total, `${at}: the bars are the held replies`);
    assert.equal(
      report.vm.replyTime.hold?.label,
      "1-minute",
      `${at}: the report's replies waited the hold the card names`,
    );
    assert.equal(report.vm.replyTime.dots.length, t.ai, `${at}: a dot for every reply`);
    // The topics are of the text and WhatsApp messages the report counts by channel.
    const texts = report.vm.channels
      .filter((c) => ["whatsapp", "sms"].includes(c.key))
      .reduce((s, c) => s + c.value, 0);
    assert.equal(series.topics.of, texts, at);
    assert.ok(series.topics.stamped <= series.topics.of, at);
    assert.equal(
      total(valuesOf(series.topics.by_intent)),
      series.topics.stamped,
      `${at}: a topic for each stamped message`,
    );
    // Replies in a language, how calls ended and what the door refused each add up to their whole.
    assert.equal(total(valuesOf(series.languages.by_language)), series.languages.stamped, at);
    assert.ok(series.languages.stamped <= series.languages.of, at);
    assert.equal(total(valuesOf(series.call_endings.by_reason)), series.call_endings.total, at);
    assert.ok(series.call_endings.total <= report.vm.calls.total, `${at}: calls someone spoke on are calls`);
    assert.equal(total(valuesOf(series.blocked.by_reason)), series.blocked.total, at);
    // What came while closed is a part of the messages of the window, and the receptionist answered no more than it answered.
    const came = total(series.after_hours.map((r) => r.n));
    assert.equal(came, t.in, `${at}: every message of the window by its quarter hour`);
    assert.ok(
      series.after_hours.every((r) => r.a <= r.n && r.n > 0),
      at,
    );
    assert.ok(total(series.after_hours.map((r) => r.a)) <= t.ai, at);
    assert.ok(
      series.after_hours.every((r) => r.q >= 0 && r.q < 96),
      at,
    );
    assert.ok(v.closed && v.closed.unset === false, `${at}: the sample keeps hours`);
    // The handovers are the report's, and the people they reached are no more than were handed over.
    const handed = total(report.vm.reasons.map((r) => r.value));
    assert.equal(series.handover.now.n, handed, at);
    for (const side of [series.handover.now, series.handover.before]) {
      assert.ok(side.replied.n <= side.n && side.settled.n <= side.n, at);
      assert.equal(side.replied.median_s === null, side.replied.n === 0, at);
      assert.equal(side.settled.median_s === null, side.settled.n === 0, at);
    }
    for (const side of [series.missed.now, series.missed.before]) assert.ok(side.touched <= side.n, at);
    // The people who wait on the owner now: the call-backs are counted inside them, and the oldest has waited since before it was read.
    assert.ok(series.stuck.callbacks <= series.stuck.waiting, at);
    assert.ok(Date.parse(series.stuck.oldest_at) < own.readAt, at);
    assert.equal(v.stuck[0].value, String(series.stuck.waiting), at);
    // The link: a count of the people sent it, and a count of who booked where the calendar could say.
    assert.deepEqual([series.links.calendar, series.links.booked <= series.links.sent], ["ok", true], at);
    assert.equal(JSON.stringify(v).includes("NaN"), false, `${at}: no NaN`);
    assert.equal(JSON.stringify(v).includes("Infinity"), false, at);
  }
});

test("the Receptionist sample is kept per range and day, names a range by its one name, and says days that ended before today as the report does", () => {
  const a = receptionistSample("30d", TODAY);
  assert.equal(
    a,
    receptionistSample("30d", TODAY),
    "the same range on the same day is the same object, which the lens folds once",
  );
  assert.notEqual(a, receptionistSample("30d", "2026-09-19"), "another day, another read");
  assert.deepEqual(Object.keys(a).sort(), ["dto", "key", "readAt"], "what the surface holds");
  assert.equal(receptionistSample("14d", TODAY).key, "30d", "a period Reports does not offer is the default one");
  assert.equal(receptionistSample("month", TODAY).dto.days, 18);
  // Days a member picked are those days of the same business, ending on their last.
  const picked = { from: "2026-09-01", to: "2026-09-10" };
  const own = receptionistSample(picked, TODAY);
  assert.equal(own.key, reportRangeKey(picked), "named by its one name");
  assert.deepEqual([own.dto.days, own.dto.end, own.dto.today], [10, "2026-09-10", TODAY]);
  assert.deepEqual(
    [own.dto.series.links.calendar, own.dto.series.links.booked],
    ["ended", null],
    "who booked since is not counted for days that ended before today",
  );
  assert.equal(own.dto.series.after_hours.at(-1).d <= "2026-09-10", true, "nothing counted after the last day");
  const v = toReceptionistReportVM(own.dto, { nowMs: own.readAt });
  assert.equal(v.available, true);
  assert.equal(v.link.booked, null);
  // A window that ends today names no day to the database.
  assert.equal("end" in receptionistSample("7d", TODAY).dto, false);
});

test("the People sample is the route's answer for the same business and days, folded by the real fold with both halves available, and every part adds up", () => {
  for (const id of ["7d", "30d", "90d", "month"]) {
    const report = reportsSample(id, TODAY);
    const own = peopleSample(id, TODAY);
    const { dto } = own;
    const { series, now } = dto;
    const v = toPeopleReportVM(dto);
    const at = `${id}`;
    assert.deepEqual([own.key, dto.days, dto.today], [report.key, report.days, TODAY], `${at}: its days`);
    assert.deepEqual([v.windowAvailable, v.nowAvailable], [true, true], `${at}: both halves are available`);
    assert.notEqual(series, null, at);
    assert.notEqual(now, null, at);
    // The window: who reached you, of whom the new ones are the report's, and how they came.
    const { reached } = series;
    assert.equal(reached.now.new, report.vm.people.total, `${at}: the new people the report counts`);
    assert.ok(reached.now.new <= reached.now.people && reached.before.new <= reached.before.people, at);
    assert.ok(reached.now.people > 0 && reached.before.people > 0, `${at}: a period before to compare with`);
    assert.equal(total(valuesOf(series.first_came.by_via)), reached.now.new, `${at}: a way in for each new person`);
    for (const side of [series.by_channel.now, series.by_channel.before]) {
      const people = side === series.by_channel.now ? reached.now.people : reached.before.people;
      assert.ok(total(valuesOf(side)) >= people, `${at}: each person is on at least one wire`);
      assert.ok(
        valuesOf(side).every((n) => n <= people && n >= 0),
        `${at}: and on a wire once`,
      );
    }
    // What was answered: the total is the sum of its sources and of its purposes.
    for (const answers of [series.consent.now.yes, series.consent.now.stop]) {
      assert.equal(total(valuesOf(answers.by_source)), answers.total, `${at}: a source for each answer`);
      assert.equal(total(valuesOf(answers.by_purpose)), answers.total, `${at}: a purpose for each answer`);
    }
    assert.ok(series.consent.before.yes >= 0 && series.consent.before.stop >= 0, at);
    assert.equal(total(valuesOf(series.email_stopped.by_reason)), series.email_stopped.total, `${at}: a reason each`);
    assert.ok(series.steps.on_time <= series.steps.done, `${at}: on time is some of the steps done`);
    // The book, as it stands now: its parts add up to the people in it, and the Quiet list is the buckets past thirty days.
    const f = now.fresh;
    assert.equal(total(valuesOf(f)), now.people, `${at}: how long since each was heard`);
    assert.equal(now.lists.quiet, f.d31_60 + f.d61_90 + f.d91_up, `${at}: the Quiet list is the last three buckets`);
    assert.equal(total(valuesOf(now.wires)), now.people, `${at}: the wires add up to the book`);
    assert.ok(now.lists.offers_ok <= now.lists.opted_in && now.lists.opted_in <= now.people, at);
    assert.ok(now.lists.opted_out + now.lists.opted_in <= now.people, `${at}: nobody is on both`);
    assert.ok(now.steps.overdue + now.steps.due_today <= now.people && now.email_stopped <= now.people, at);
    assert.ok(reached.now.people <= now.people, `${at}: the book holds everyone who reached you`);
    // The sample is a business with something to show on every part.
    assert.ok(now.steps.overdue > 0 && now.email_stopped > 0, `${at}: something is stuck`);
    assert.ok(v.head && v.strip.length === 4 && v.stuck.length === 3 && v.stand.length === 4, at);
    for (const part of [v.channels, v.firstCame, v.yeses, v.stops, v.wires, v.fresh])
      assert.ok(part.rows.length > 0 && part.empty === null, `${at}: a part with bars to draw`);
    assert.equal(JSON.stringify(v).includes("NaN"), false, `${at}: no NaN`);
    assert.equal(JSON.stringify(v).includes("Infinity"), false, at);
  }
});

test("the People sample's book is the same whichever days are picked, as the book is", () => {
  const nows = ["7d", "30d", "90d", "month"].map((id) => peopleSample(id, TODAY).dto.now);
  for (const now of nows) assert.deepEqual(now, nows[0]);
  const window30 = peopleSample("30d", TODAY).dto.series;
  const window90 = peopleSample("90d", TODAY).dto.series;
  assert.ok(window90.reached.now.people > window30.reached.now.people, "a longer period is more people");
});

test("the People sample is kept per range and day, names a range by its one name, and says days that ended before today as the report does", () => {
  const a = peopleSample("30d", TODAY);
  assert.equal(
    a,
    peopleSample("30d", TODAY),
    "the same range on the same day is the same object, which the lens folds once",
  );
  assert.notEqual(a, peopleSample("30d", "2026-09-19"), "another day, another read");
  assert.deepEqual(Object.keys(a).sort(), ["dto", "key"], "what the surface holds");
  assert.equal(peopleSample("14d", TODAY).key, "30d", "a period Reports does not offer is the default one");
  assert.equal(peopleSample("month", TODAY).dto.days, 18);
  const picked = { from: "2026-09-01", to: "2026-09-10" };
  const own = peopleSample(picked, TODAY);
  assert.equal(own.key, reportRangeKey(picked), "named by its one name");
  assert.deepEqual([own.dto.days, own.dto.end, own.dto.today], [10, "2026-09-10", TODAY]);
  assert.equal(own.dto.series.end, "2026-09-10", "the window names its last day to the fold");
  const v = toPeopleReportVM(own.dto);
  assert.deepEqual([v.windowAvailable, v.nowAvailable], [true, true]);
  // A window that ends today names no day to the database.
  assert.equal("end" in peopleSample("7d", TODAY).dto, false);
  assert.equal("end" in peopleSample("7d", TODAY).dto.series, false);
  for (const id of ["7d", "30d", "90d"]) {
    const v2 = toPeopleReportVM(peopleSample(id, TODAY).dto);
    assert.equal(typeof v2.head, "string", `${id}: the head says it`);
  }
});

test("the Reviews sample is the public listing through the Reviews fold: four figures, the ratings it gained, the five reviews Google shows, and what a profile would add; kept per period and day", () => {
  const a = reviewsSample("30d", TODAY);
  assert.equal(a, reviewsSample("30d", TODAY), "kept rather than rebuilt on every draw");
  assert.deepEqual(Object.keys(a).sort(), ["key", "vm"], "what the surface holds");
  assert.equal(reviewsSample("14d", TODAY).key, "30d", "a period Reports does not offer is the default one");
  for (const id of ["7d", "30d", "90d", "month"]) {
    const s = reviewsSample(id, TODAY);
    const days = fixedDaysOf(id) ?? 18;
    assert.equal(s.key, id);
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

/** Every number in what the fold says is whole, and no sentence in it is made of a number that was not there. */
function wholeWords(value, at) {
  if (typeof value === "number") assert.ok(Number.isFinite(value), `${at}: ${value}`);
  else if (typeof value === "string") assert.doesNotMatch(value, /NaN|Infinity|undefined|null/, `${at}: ${value}`);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) wholeWords(v, `${at}.${k}`);
}

test("the demo's Campaigns sample is the sends and the ledger over the report's own days, folded by the real fold with every read present and agreeing, and no reach-outs", () => {
  const picked = { from: "2026-09-01", to: "2026-09-10" };
  for (const range of ["7d", "30d", "90d", "month", picked]) {
    const at = typeof range === "string" ? range : "picked days";
    const sample = campaignsSample(range, TODAY);
    const report = reportsSample(range, TODAY);
    const v = campaignsFold(sample);
    assert.deepEqual(
      Object.keys(sample).sort(),
      ["campaigns", "key", "ledger"],
      `${at}: what the surface holds, no reach-outs`,
    );
    assert.equal(sample.key, report.key, `${at}: of the report's range, by its one name`);
    assert.deepEqual(
      [v.reads.campaigns, v.reads.ledger, v.reads.stuck, v.reads.reachOuts],
      ["ok", "ok", "ok", "none"],
      `${at}: every read present, and the reach-outs absent so that part draws nothing`,
    );
    assert.equal(v.reachOuts, null, at);
    assert.deepEqual(v.failed, [], `${at}: nothing failed`);
    assert.equal(v.quiet, false, `${at}: something went out`);
    assert.equal(typeof v.head, "string", `${at}: the lens has a sentence`);
    assert.equal(v.strip.length, 5, `${at}: the five figures`);
    assert.equal(v.stuck.length, 5, `${at}: and the five stuck now`);
    wholeWords(v, at);
    // The sends: the channels, the sources and the days agree.
    const t = v.report.totals;
    const channels = campaignsSampleChannels(sample);
    assert.deepEqual(
      [channels.sent, channels.delivered, channels.replied],
      [t.sent, t.delivered, t.replied],
      `${at}: the channels sum to the totals`,
    );
    assert.equal(
      sample.campaigns.sources.reduce((s, x) => s + x.sent, 0),
      t.sent,
      `${at}: the sources share what was sent`,
    );
    // The ledger agrees with the sends it is beside.
    const s = sample.ledger.series;
    const people = s.people;
    assert.ok(
      people.now.sent_to <= t.sent && people.now.wrote_back <= people.now.sent_to,
      `${at}: people are no more than the sends`,
    );
    assert.ok(people.now.wrote_back <= t.replied, `${at}: and none wrote back more than were answered`);
    assert.ok(people.now.counting <= people.now.sent_to, `${at}: and those still to answer are of those sent to`);
    assert.ok(people.before.wrote_back <= people.before.sent_to, at);
    const runs = s.runs.now.moment + s.runs.now.broadcast;
    assert.equal(
      runs,
      sample.campaigns.sources.reduce((n, x) => n + x.runs, 0),
      `${at}: the runs behind the sends`,
    );
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    assert.equal(sum(s.first_reply.buckets), s.first_reply.n, `${at}: first replies add up`);
    assert.equal(s.first_reply.n, t.replied, `${at}: one first reply for each answered send`);
    assert.equal(sum(s.approval.buckets), s.approval.n, `${at}: approvals add up`);
    assert.equal(sum(s.held.by_reason), s.held.total, `${at}: held back, by reason`);
    assert.equal(sum(s.stopped.by_failure), s.stopped.failed, `${at}: stopped, by why`);
    assert.equal(
      s.failed_sends.by_code.reduce((n, c) => n + c.n, 0),
      s.failed_sends.total,
      `${at}: failed sends, by why`,
    );
    assert.equal(
      s.by_message.reduce((n, m) => n + m.sent, 0),
      t.sent,
      `${at}: each message's sends are the report's`,
    );
    for (const m of s.by_message) assert.ok(m.replied <= m.mature && m.mature <= m.sent, `${at}: ${m.name}`);
    // What is stuck now is as of now: one run waits and the number is healthy.
    assert.deepEqual(
      [sample.ledger.stuck.waiting.n, sample.ledger.stuck.number.state, sample.ledger.stuck.number.tone],
      [1, "read", "ok"],
      at,
    );
  }
});

/** The sends' channels summed. */
function campaignsSampleChannels(sample) {
  const rows = sample.campaigns.by_channel ?? [];
  const add = (k) => rows.reduce((n, c) => n + c[k], 0);
  return { sent: add("sent"), delivered: add("delivered"), replied: add("replied") };
}

test("the Campaigns sample is kept per range and day, names a range by its one name, and says days that ended before today as the report does", () => {
  const a = campaignsSample("30d", TODAY);
  assert.equal(
    a,
    campaignsSample("30d", TODAY),
    "the same range on the same day is the same object, which the page folds once",
  );
  assert.notEqual(a, campaignsSample("30d", "2026-09-19"), "another day, another read");
  assert.equal(campaignsSample("14d", TODAY).key, "30d", "a period Reports does not offer is the default one");
  assert.equal(campaignsSample("month", TODAY).ledger.days, 18);
  const picked = { from: "2026-09-01", to: "2026-09-10" };
  const own = campaignsSample(picked, TODAY);
  assert.equal(own.key, reportRangeKey(picked), "named by its one name");
  assert.deepEqual([own.ledger.days, own.ledger.end, own.ledger.today], [10, "2026-09-10", TODAY]);
  assert.equal(own.ledger.series.end, "2026-09-10", "the window names its last day to the fold");
  assert.equal(own.ledger.series.people.now.counting, 0, "a window that ended has nobody whose reply window is open");
  assert.equal(
    own.ledger.series.by_message.every((m) => m.mature === m.sent),
    true,
    "and every send has had its time",
  );
  // A window that ends today names no day to the database, and has the newest sends not yet counted as answered.
  assert.equal("end" in campaignsSample("7d", TODAY).ledger, false);
  assert.equal("end" in campaignsSample("7d", TODAY).ledger.series, false);
  const live = campaignsSample("30d", TODAY).ledger.series;
  assert.ok(
    live.by_message.some((m) => m.mature < m.sent),
    "sent in the last 3 days: too new to say",
  );
});
