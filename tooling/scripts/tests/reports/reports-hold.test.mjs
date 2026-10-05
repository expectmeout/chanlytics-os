/**
 * Reply speed is said against the hold the owner set (spec D14, A1). Every reply waited the workspace's 60-second hold,
 * so "half within 1m 00s" and "nine in ten within 1m 00s" sat beside bars that put 14 of 16 in "1 - 5m". Now each
 * reply is measured from its own hold, and the bars count on the edges the words use.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toReportVM, holdOf } from "@chanlytics/contracts";

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
const days7 = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"];
const salon = [
  ...Array.from({ length: 13 }, () => ({ day: "2026-09-17", s: 60, hold: 60 })),
  { day: "2026-09-17", s: 72, hold: 60 },
  { day: "2026-09-18", s: 6, hold: 0 },
  { day: "2026-09-18", s: 6, hold: 0 },
];
const dto = (replies) => ({
  timezone: "America/New_York",
  days: 7,
  span_days: 14,
  today: "2026-09-20",
  series: [
    ...days7.map((d) => day(d.replace("-09-", "-08-"))),
    ...days7.map((d, i) => day(d, i === 3 ? { messages_in: 25, answered_ai: 16, answered_you: 3, unanswered: 6 } : {})),
  ],
  reasons: {},
  reply_seconds: replies.map((r) => r.s),
  sentiments: {},
  voicemail: 0,
  replies,
});

test("each reply against its own hold: as it ended, unheld (no hold), and later with the most past it", () => {
  assert.deepEqual(holdOf(salon), { seconds: 60, label: "1-minute", atEnd: 13, unheld: 2, later: 1, laterMost: 12 });
});

test("the hero and the reply line say the hold, not a speed the setting made", () => {
  const vm = toReportVM(dto(salon));
  assert.equal(
    vm.lines.hero,
    "16 of 25 customer messages, without you. 13 of 16 went out as your 1-minute hold ended.",
  );
  assert.equal(vm.lines.reply, "1 reply took longer than the hold, at most 12s more.");
  assert.deepEqual(vm.replyTime.hold, holdOf(salon));
});

test("none past the hold says so, and says the ones with no hold", () => {
  const vm = toReportVM(dto(salon.filter((r) => r.s !== 72)));
  assert.equal(vm.lines.reply, "None waited longer than your hold; 2 had no hold.");
});

test("a hold changed mid-period: the label is the hold most replies waited, and the counts stay true", () => {
  const mixed = [
    { day: "2026-09-17", s: 31, hold: 30 },
    { day: "2026-09-17", s: 30, hold: 30 },
    { day: "2026-09-18", s: 61, hold: 60 },
  ];
  assert.deepEqual(holdOf(mixed), { seconds: 30, label: "30-second", atEnd: 3, unheld: 0, later: 0, laterMost: null });
});

test("a report from before the hold was kept says what it said before, on the words' own edges", () => {
  const old = salon.map(({ day: d, s }) => ({ day: d, s }));
  const vm = toReportVM(dto(old));
  assert.equal(vm.replyTime.hold, null);
  assert.equal(vm.lines.hero, "16 of 25 customer messages, without you. Half of its replies went out within 1m.");
  assert.equal(vm.lines.reply, "Nine in ten within 1m.");
  assert.deepEqual(
    vm.replyTime.buckets.map((b) => [b.id, b.value]),
    [
      ["lt15", 2],
      ["lt60", 13],
      ["lt300", 1],
      ["lt1800", 0],
      ["gte1800", 0],
    ],
    "a reply of exactly 60s is within a minute, as the sentence beside it says",
  );
});

/** A reply that took `s` seconds, held `hold` (0: no hold), on a day in the period. */
const reply = (s, hold, d = "2026-09-17") => ({ day: d, s, hold });
const times = (n, make) => Array.from({ length: n }, make);
const barsOf = (vm) => vm.replyTime.buckets.map((b) => [b.id, b.value]);
const AGAINST_HOLD = ["unheld", "atEnd", "lt60", "lt300", "gte300"];

test("a reply a few seconds past its hold is as the hold ended in the hero, the line and the bars alike, whatever the hold", () => {
  for (const [hold, label] of [
    [30, "30-second"],
    [60, "1-minute"],
    [90, "1m 30s"],
    [300, "5-minute"],
  ]) {
    const vm = toReportVM(dto(times(14, () => reply(hold + 3, hold))));
    const said = `${label} hold`;
    assert.equal(
      vm.lines.hero,
      `16 of 25 customer messages, without you. 14 of 14 went out as your ${said} ended.`,
      said,
    );
    assert.equal(vm.lines.reply, "None waited longer than your hold.", said);
    assert.deepEqual(
      barsOf(vm),
      [
        ["unheld", 0],
        ["atEnd", 14],
        ["lt60", 0],
        ["lt300", 0],
        ["gte300", 0],
      ],
      `${said}: the bars count what the hero counts`,
    );
  }
  const vm = toReportVM(dto(times(14, () => reply(63, 60))));
  assert.deepEqual(
    vm.replyTime.buckets.map((b) => b.label),
    ["with no hold", "as the hold ended", "up to 1m later", "1 – 5m later", "over 5m later"],
  );
});

test("the bars, the hero and the line count one split: the bars' first two are the hold's unheld and as-it-ended, the other three add up to its later", () => {
  const mixed = [
    reply(5, 0),
    reply(40, 0),
    reply(60, 60), // past 0
    reply(70, 60), // past 10, the slack: as it ended
    reply(50, 60), // sent before its hold ended: as it ended
    reply(71, 60), // past 11
    reply(70.4, 60), // past 10.4: later, and within a minute on whole seconds
    reply(120, 60), // past 60: the edge, within a minute
    reply(120.4, 60), // 60.4 rounds to 60
    reply(120.5, 60), // 60.5 rounds to 61
    reply(121, 60),
    reply(360, 60), // past 300: the edge
    reply(361, 60), // past 301
    reply(45, 30), // its own hold was 30: past 15
  ];
  const vm = toReportVM(dto(mixed));
  const hold = holdOf(mixed);
  assert.deepEqual(hold, { seconds: 60, label: "1-minute", atEnd: 3, unheld: 2, later: 9, laterMost: 301 });
  assert.deepEqual(barsOf(vm), [
    ["unheld", 2],
    ["atEnd", 3],
    ["lt60", 5],
    ["lt300", 3],
    ["gte300", 1],
  ]);
  assert.deepEqual(
    barsOf(vm).map(([id]) => id),
    AGAINST_HOLD,
  );
  const [unheld, atEnd, ...later] = barsOf(vm).map(([, n]) => n);
  assert.deepEqual([unheld, atEnd, later.reduce((a, b) => a + b, 0)], [hold.unheld, hold.atEnd, hold.later]);
  assert.equal(vm.lines.reply, "9 replies took longer than the hold, at most 5m 1s more.");
  assert.equal(vm.lines.hero, "16 of 25 customer messages, without you. 9 of 14 took longer than your 1-minute hold.");
});

test("a report with no hold keeps the bars on the seconds a reply took: from before 00304, or with none held", () => {
  const ABSOLUTE = ["lt15", "lt60", "lt300", "lt1800", "gte1800"];
  const unheld = times(14, () => ({ day: "2026-09-17", s: 63 }));
  for (const replies of [unheld, times(14, () => reply(63, 0))]) {
    const vm = toReportVM(dto(replies));
    assert.equal(vm.replyTime.hold, null);
    assert.deepEqual(barsOf(vm), [
      ["lt15", 0],
      ["lt60", 0],
      ["lt300", 14],
      ["lt1800", 0],
      ["gte1800", 0],
    ]);
    assert.deepEqual(
      barsOf(vm).map(([id]) => id),
      ABSOLUTE,
    );
    assert.equal(vm.lines.hero, "16 of 25 customer messages, without you. Half of its replies went out within 1m 3s.");
  }
});

test("the hero speaks of the hold only where most replies waited one, and says whether they went out as it ended or took longer", () => {
  const heroOf = (replies) =>
    toReportVM(dto(replies)).lines.hero.replace("16 of 25 customer messages, without you. ", "");
  const unheld = (n) => times(n, () => reply(5, 0));
  const atEnd = (n) => times(n, () => reply(61, 60));
  const late = (n) => times(n, () => reply(200, 60));
  assert.equal(heroOf([...unheld(5), ...atEnd(3)]), "Half of its replies went out within 5s.", "most had no hold");
  assert.equal(heroOf([...unheld(4), ...atEnd(4)]), "Half of its replies went out within 33s.", "exactly half held");
  assert.equal(heroOf([...unheld(2), ...atEnd(5), ...late(1)]), "5 of 8 went out as your 1-minute hold ended.");
  assert.equal(heroOf([...unheld(1), ...atEnd(1), ...late(5)]), "5 of 7 took longer than your 1-minute hold.");
  assert.equal(heroOf(late(4)), "4 of 4 took longer than your 1-minute hold.", "every reply held and late");
  assert.equal(
    heroOf([...unheld(1), ...atEnd(3), ...late(3)]),
    "3 of 7 went out as your 1-minute hold ended.",
    "as many late as at the end: the hold's own sentence, as it ended",
  );
});

test("replies that took longer than the hold say how many, in the plural, and the most any took past it", () => {
  const vm = toReportVM(dto([reply(60, 60), reply(160, 60), reply(200, 60)]));
  assert.equal(vm.lines.reply, "2 replies took longer than the hold, at most 2m 20s more.");
});
