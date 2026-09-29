/**
 * Reports › Reach-outs, and the day's numbers at 6 PM (Reach out Part 6: H1, H3–H6, H12; contracts reach-out-report.ts):
 * the view model over the report's shape, executed. The funnel counts from written to booked with each share of what
 * was written; the angles show the share who wrote back, the eight most written and the rest as one; a domain says
 * how its mail landed and its state now, and a removed one is one line; each reach-out is a line with each of its
 * steps under it, a hand step's handed and nothing else; an empty period says so; nothing is said that is not counted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reachOutDayWords, toReachOutReportVM } from "@chanlytics/contracts";

const NOW = Date.parse("2026-09-28T22:00:00.000Z");
const counts = (over = {}) => ({
  written: 0,
  delivered: 0,
  bounced: 0,
  wrote_back: 0,
  interested: 0,
  booked: 0,
  said_no: 0,
  handed: 0,
  ...over,
});
const report = (over = {}) => ({
  timezone: "America/Chicago",
  days: 7,
  today: "2026-09-28",
  since: "2026-09-22",
  has_reach_out: true,
  totals: counts({ written: 40, delivered: 38, bounced: 1, wrote_back: 6, interested: 3, booked: 1, said_no: 2 }),
  series: [
    { day: "2026-09-22", written: 10 },
    { day: "2026-09-23", written: 30 },
  ],
  chains: [
    {
      root_id: "r1",
      name: "Trainers in Austin",
      state: "running",
      search: { id: "s1", name: "Personal trainers · Austin" },
      last_at: "2026-09-23T15:00:00.000Z",
      runs: 2,
      steps: [
        {
          id: "p1",
          n: 0,
          hand: null,
          ...counts({ written: 30, delivered: 29, bounced: 1, wrote_back: 5, interested: 3, booked: 1, said_no: 1 }),
        },
        { id: "p2", n: 1, hand: null, ...counts({ written: 10, delivered: 9, wrote_back: 1, said_no: 1 }) },
        { id: "p3", n: 2, hand: "call", ...counts({ handed: 4 }) },
      ],
    },
  ],
  angles: [
    { angle: "their rating", written: 20, wrote_back: 4 },
    { angle: "mid-session calls", written: 10, wrote_back: 1 },
  ],
  other_angles: { written: 0, wrote_back: 0 },
  no_angle: 10,
  domains: [
    {
      host: "mail.example.com",
      state: "verified",
      held_why: null,
      held_at: null,
      sent: 30,
      delivered: 29,
      bounced: 1,
      complained: 0,
    },
    {
      host: "hi.example.com",
      state: "held",
      held_why: "bounces",
      held_at: "2026-09-26T15:00:00.000Z",
      sent: 5,
      delivered: 4,
      bounced: 1,
      complained: 0,
    },
    { host: null, state: null, held_why: null, held_at: null, sent: 5, delivered: 5, bounced: 0, complained: 0 },
  ],
  ...over,
});

test("the funnel counts from written to booked, each a share of what was written", () => {
  const vm = toReachOutReportVM(report(), NOW);
  assert.equal(vm.present, true);
  assert.equal(vm.empty, false);
  assert.deepEqual(
    vm.funnel.rows.map((r) => [r.label, r.value, r.display]),
    [
      ["Written", 40, "40"],
      ["Delivered", 38, "38  95%"],
      ["Wrote back", 6, "6  15%"],
      ["Interested", 3, "3  8%"],
      ["Booked", 1, "1  3%"],
      ["Said no", 2, "2  5%"],
      ["Bounced", 1, "1  3%"],
    ],
  );
  assert.equal(vm.funnel.max, 40);
  assert.match(vm.lines.funnel, /Of 40 emails written in these 7 days/);
  assert.match(vm.lines.funnel, /a question counts as interested/);
  assert.doesNotMatch(JSON.stringify(vm), /open(ed|s)? rate|clicked/i);
});

test("the angles show the share who wrote back, and say how many had none", () => {
  const vm = toReachOutReportVM(report(), NOW);
  assert.deepEqual(
    vm.angles.rows.map((r) => [r.label, r.value, r.display]),
    [
      ["their rating", 20, "4 of 20  20%"],
      ["mid-session calls", 10, "1 of 10  10%"],
    ],
  );
  assert.equal(vm.angles.max, 20);
  assert.match(vm.lines.angles, /10 emails had no opening, so no angle/);
  const more = toReachOutReportVM(report({ other_angles: { written: 7, wrote_back: 2 }, no_angle: 0 }), NOW);
  assert.deepEqual(more.angles.rows.at(-1), { id: "other", label: "Other angles", value: 29, display: "2 of 7  29%" });
  assert.doesNotMatch(more.lines.angles, /no opening/);
  const none = toReachOutReportVM(report({ angles: [], no_angle: 40 }), NOW);
  assert.deepEqual(none.angles.rows, []);
  assert.match(none.lines.angles, /no angle to compare/);
});

test("a domain says how its mail landed and its state now; a removed one is one line", () => {
  const vm = toReachOutReportVM(report(), NOW);
  assert.deepEqual(
    vm.domains.map((d) => [d.host, d.state, d.sent, d.landed, d.bounced, d.complained]),
    [
      ["mail.example.com", "Verified", 30, "97%", "3.3%", "0%"],
      ["hi.example.com", "Held since Sat: more than 2% of its recent emails bounced", 5, "80%", "20%", "0%"],
      ["A domain since removed", "Since removed", 5, "100%", "0%", "0%"],
    ],
  );
  assert.equal(vm.domains[1].held, true);
});

test("each reach-out is a line, with each of its steps on its own line under it", () => {
  const vm = toReachOutReportVM(report(), NOW);
  const [chain, first, nudge, call] = vm.sources;
  assert.equal(chain.kind, "chain");
  assert.equal(chain.name, "Trainers in Austin");
  assert.equal(chain.to, "outbound/r1");
  assert.equal(chain.meta, "Reach-out · 3 steps · 2 runs · Personal trainers · Austin");
  assert.deepEqual(
    [chain.written, chain.delivered, chain.wroteBack, chain.interested, chain.booked, chain.saidNo, chain.last],
    ["40", "95%", "15% (6)", "3", "1", "2", "Sep 23"],
  );
  assert.deepEqual(
    [first.kind, first.name, first.written, first.wroteBack],
    ["step", "1 · Your email", "30", "17% (5)"],
  );
  assert.equal(nudge.name, "2 · A short nudge");
  assert.deepEqual(
    [call.name, call.meta, call.written, call.interested],
    ["3 · A call for you", "4 handed to you", "—", "—"],
  );
  const paused = toReachOutReportVM(
    report({ chains: [{ ...report().chains[0], state: "paused", search: null }] }),
    NOW,
  );
  assert.equal(paused.sources[0].meta, "Reach-out · 3 steps · 2 runs · paused");
});

test("written day by day is the series, with its table twin", () => {
  const vm = toReachOutReportVM(report(), NOW);
  assert.deepEqual(
    vm.points.map((p) => [p.day, p.written]),
    [
      ["2026-09-22", 10],
      ["2026-09-23", 30],
    ],
  );
  assert.deepEqual(vm.table.columns, ["Day", "Written"]);
  assert.equal(vm.table.rows.length, 2);
  assert.equal(vm.lines.written, "");
  const handed = toReachOutReportVM(report({ totals: counts({ written: 40, handed: 4 }) }), NOW);
  assert.equal(handed.lines.written, "4 businesses handed to you as a call or a note, too.");
});

test("a period that wrote nothing says so; a workspace with no reach-out draws nothing", () => {
  const empty = toReachOutReportVM(report({ totals: counts(), chains: [], angles: [], domains: [], no_angle: 0 }), NOW);
  assert.equal(empty.empty, true);
  assert.equal(empty.present, true);
  assert.equal(empty.lines.empty, "No reach-out wrote in the last 7 days.");
  assert.equal(toReachOutReportVM(report({ has_reach_out: false }), NOW).present, false);
  // Only handed to the team is not empty: the steps say so.
  assert.equal(toReachOutReportVM(report({ totals: counts({ handed: 2 }) }), NOW).empty, false);
});

test("the day's line at 6 PM says what happened, and nothing it did not count", () => {
  assert.deepEqual(reachOutDayWords({ written: 18, wrote_back: 2, interested: 1, said_no: 1, bounced: 0, held: 3 }), {
    title: "Today's reach-outs",
    body: "18 written · 2 wrote back, 1 interested · 1 said no · 3 wait for your say.",
  });
  assert.equal(
    reachOutDayWords({ written: 0, wrote_back: 1, interested: 0, said_no: 0, bounced: 2, held: 1 }).body,
    "1 wrote back · 2 bounced · 1 waits for your say.",
  );
  assert.equal(
    reachOutDayWords({ written: 0, wrote_back: 0, interested: 0, said_no: 0, bounced: 0, held: 0 }).body,
    "Nothing happened today.",
  );
});
