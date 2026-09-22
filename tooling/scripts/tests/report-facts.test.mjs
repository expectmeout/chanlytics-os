/**
 * Worth knowing, EXECUTED: at most three facts, in the order an owner should act on them (messages with no reply,
 * why it handed over, the busiest day and hours, the campaign that drew the most replies, a channel that moved),
 * each a count over the report's own columns, and none of them a tile's number said again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toReportVM, toCampaignReportVM, reportFacts } from "@chanlytics/contracts";

const day = (d, over = {}) => ({
  day: d,
  messages_in: 0,
  conversations: 0,
  answered_ai: 0,
  answered_you: 0,
  unanswered: 0,
  out_ai: 0,
  out_you: 0,
  escalations: 0,
  calls: 0,
  call_seconds: 0,
  new_contacts: 0,
  ...over,
});
const DAYS = [
  "2026-08-22",
  "2026-08-23",
  "2026-08-24",
  "2026-08-25",
  "2026-08-26",
  "2026-08-27",
  "2026-08-28",
  "2026-08-29",
  "2026-08-30",
  "2026-08-31",
  "2026-09-01",
  "2026-09-02",
  "2026-09-03",
  "2026-09-04",
];
/** A quiet week of one message a day, then the week the test describes (`cur`, by day). */
const report = (cur = {}, over = {}) =>
  toReportVM({
    timezone: "UTC",
    days: 7,
    span_days: 14,
    today: "2026-09-04",
    series: DAYS.map((d, i) => day(d, i < 7 ? { messages_in: 1, answered_ai: 1 } : cur[d] || {})),
    reasons: {},
    reply_seconds: [],
    sentiments: {},
    voicemail: 0,
    ...over,
  });
const cday = (d, over = {}) => ({
  day: d,
  sent: 0,
  delivered: 0,
  read: 0,
  replied: 0,
  opt_ins: 0,
  opt_outs: 0,
  ...over,
});
const campaigns = (sources) =>
  toCampaignReportVM({
    timezone: "UTC",
    days: 7,
    span_days: 14,
    today: "2026-09-04",
    series: DAYS.map((d) => cday(d)),
    sources,
  });
const source = (id, kind, name, sent, replied) => ({
  id,
  kind,
  name,
  template_name: null,
  runs: 1,
  sent,
  delivered: sent,
  read: 0,
  replied,
  last_at: null,
});

test("messages with no reply come first, in amber, with the door to the Inbox", () => {
  const f = reportFacts(report({ "2026-09-01": { messages_in: 3, answered_ai: 1, unanswered: 2 } }), null);
  assert.equal(f[0].id, "unanswered");
  assert.equal(f[0].tone, "warn");
  assert.equal(f[0].text, "2 messages have no reply yet");
  assert.equal(f[0].sub, "", "the text says it all");
  assert.deepEqual(f[0].door, { label: "Open the Inbox", to: "inbox" });
  assert.equal(
    reportFacts(report({ "2026-09-01": { messages_in: 1, unanswered: 1 } }), null)[0].text,
    "1 message has no reply yet",
  );
});

test("why it handed over says the reason, never the count the Needed you tile already gives", () => {
  const several = report(
    { "2026-09-01": { messages_in: 2, answered_ai: 2, escalations: 3 } },
    { reasons: { human_token: 2, non_text: 1 } },
  );
  const h = reportFacts(several, null).find((x) => x.id === "handovers");
  assert.equal(h.text, "Top reason it handed over: asked for a person");
  assert.equal(h.sub, "2 times", "two of the three: not the tile's three");
  assert.deepEqual(h.door, { label: "See them", to: "inbox" });
  const one = report(
    { "2026-09-01": { messages_in: 2, answered_ai: 2, escalations: 3 } },
    { reasons: { human_token: 3 } },
  );
  const only = reportFacts(one, null).find((x) => x.id === "handovers");
  assert.equal(only.text, "Why it handed over: asked for a person");
  assert.equal(only.sub, "every time", "one reason's count is the tile's count");
  assert.ok(!`${only.text}${only.sub}`.includes("3"));
});

test("the one busiest day, with the peak hours and what came in outside 8am to 8pm; a week is said as days", () => {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  grid[1][17] = 3;
  grid[1][18] = 2;
  grid[1][22] = 1;
  const vm = report({ "2026-09-01": { messages_in: 6, answered_ai: 6 } }, { hours: grid });
  const b = reportFacts(vm, null).find((x) => x.id === "busiest");
  assert.equal(b.text, "Tuesday was your busiest day");
  assert.equal(b.sub, "peak 5pm to 7pm, 1 outside 8am to 8pm");
  assert.equal(b.door, null);
  const tie = report({
    "2026-09-01": { messages_in: 2, answered_ai: 2 },
    "2026-09-03": { messages_in: 2, answered_ai: 2 },
  });
  assert.equal(
    reportFacts(tie, null).find((x) => x.id === "busiest"),
    undefined,
    "Tuesday and Thursday tie: neither is the busiest",
  );
});

test("over a longer period the busiest day is a weekday, from each weekday's own average", () => {
  const start = new Date("2025-07-21T12:00:00Z");
  const series = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const w = (d.getUTCDay() + 6) % 7;
    return day(d.toISOString().slice(0, 10), { messages_in: w === 4 ? 4 : 1, answered_ai: w === 4 ? 4 : 1 });
  });
  const vm = toReportVM({
    timezone: "UTC",
    days: 30,
    span_days: 60,
    today: series[59].day,
    series,
    reasons: {},
    reply_seconds: [],
    sentiments: {},
    voicemail: 0,
  });
  assert.equal(reportFacts(vm, null).find((x) => x.id === "busiest").text, "Fridays are your busiest day");
});

test("the campaign that drew the most replies, and for the same replies the one that sent fewer; the door to it", () => {
  const cm = campaigns([
    source("p1", "playbook", "Win-back", 40, 6),
    source("b1", "broadcast", "September offer", 24, 9),
  ]);
  const c = reportFacts(report(), cm).find((x) => x.id === "campaign");
  assert.equal(c.text, "September offer drew the most replies");
  assert.equal(c.sub, "9 of 24 wrote back");
  assert.deepEqual(c.door, { label: "Open it", to: "broadcasts/run:b1" });
  const tied = campaigns([
    source("p1", "playbook", "Win-back", 40, 6),
    source("p2", "playbook", "Quiet for a month", 12, 6),
  ]);
  const t = reportFacts(report(), tied).find((x) => x.id === "campaign");
  assert.equal(t.text, "Quiet for a month drew the most replies", "six replies from twelve beat six from forty");
  assert.deepEqual(t.door, { label: "Open it", to: "outbound/p2" });
});

test("a channel whose share moved ten points or more", () => {
  const vm = report(
    {},
    {
      channels: {
        current: { whatsapp: 6, voice: 0, email: 4, sms: 0, instagram: 0 },
        previous: { whatsapp: 8, voice: 1, email: 1, sms: 0, instagram: 0 },
      },
    },
  );
  const c = reportFacts(vm, null).find((x) => x.id === "channel");
  assert.equal(c.text, "Email grew to 40% of messages and calls");
  assert.equal(c.sub, "from 10% the 7 days before");
});

test("at most three, in priority order, and a quiet period has none", () => {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  grid[1][10] = 1;
  const vm = report(
    { "2026-09-01": { messages_in: 3, answered_ai: 1, unanswered: 1, escalations: 1 } },
    { reasons: { non_text: 1 }, hours: grid },
  );
  const cm = campaigns([source("p1", "playbook", "Win-back", 10, 2)]);
  assert.deepEqual(
    reportFacts(vm, cm).map((x) => x.id),
    ["unanswered", "handovers", "busiest"],
  );
  const quiet = toReportVM({
    timezone: "UTC",
    days: 7,
    span_days: 14,
    today: "2026-09-04",
    series: DAYS.map((d) => day(d)),
    reasons: {},
    reply_seconds: [],
    sentiments: {},
    voicemail: 0,
  });
  assert.deepEqual(reportFacts(quiet, null), []);
});
