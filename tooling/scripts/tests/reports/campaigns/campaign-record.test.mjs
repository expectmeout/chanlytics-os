/**
 * The Campaigns lens's record, EXECUTED: the shape the ledger route answers (contracts
 * reports/campaigns/campaign-record.ts) -- the databases' two answers (campaign_ledger, 00405, and campaign_stuck, 00406),
 * the guards that tell each from `{ error }` and from a body short of a part the fold reads, and the one builder that puts
 * them beside the number's health. What waits is judged here and not in SQL, by the product's own rules: a run's day has
 * passed by the verb's refusal (runApprovalRefusal), a reply waits on you by the one standing (standingOf), and the
 * business's day is the workspace's own zone, never the machine's. Each half stands without the other. Run it under
 * TEST_TZ=Pacific/Auckland too: nothing here may read a clock but through the workspace's zone.
 *
 * Beside it, the two small functions the lens leans on, held to what the product already says: the words of a failure the
 * ledger keeps as a closed pair (failureWordsOf) are the words the Inbox's thread says of the row (sendFailureWords), and
 * the number's health read from its stored config (numberHealthOfConfig) is what the composer derived inline.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  campaignLedgerDtoOf,
  failureWordsOf,
  isCampaignLedgerSeriesDto,
  isCampaignStuckRawDto,
  numberHealth,
  numberHealthOfConfig,
  numberHealthWithStanding,
  runApprovalRefusal,
  sendFailureWords,
  standingFromConfig,
  standingOf,
} from "@chanlytics/contracts";
import {
  CAMPAIGNS,
  CAMPAIGNS_QUIET,
  HEAD,
  NOW,
  NUMBER,
  QUIET,
  SERIES,
  STUCK,
  STUCK_NOW,
  dtoWith,
  held,
} from "./_campaign-world.mjs";

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const total = (o) => sum(Object.values(o));
const copy = (v) => structuredClone(v);
const parts = (over = {}) => ({ stuck: STUCK, stuckFailed: false, number: NUMBER, head: HEAD, nowMs: NOW, ...over });
const stuckAt = (raw, over = {}) => campaignLedgerDtoOf(SERIES, parts({ stuck: raw, ...over })).stuck;
const HOUR = 3_600_000;

test("the world's facts add up, so a test that reads them can trust them", () => {
  const current = CAMPAIGNS.series.slice(-CAMPAIGNS.days);
  const prior = CAMPAIGNS.series.slice(0, -CAMPAIGNS.days);
  const by = (days, key) => sum(days.map((d) => d[key]));
  assert.equal(CAMPAIGNS.series.length, CAMPAIGNS.span_days, "two periods of days");
  assert.equal(CAMPAIGNS.series.at(-1).day, CAMPAIGNS.today, "ending today");
  assert.deepEqual(
    {
      sent: by(current, "sent"),
      delivered: by(current, "delivered"),
      read: by(current, "read"),
      replied: by(current, "replied"),
    },
    { sent: 240, delivered: 220, read: 31, replied: 50 },
    "the thirty days' sends",
  );
  assert.deepEqual([by(current, "opt_ins"), by(current, "opt_outs")], [14, 3]);
  assert.deepEqual(
    { sent: by(prior, "sent"), delivered: by(prior, "delivered"), replied: by(prior, "replied") },
    { sent: 190, delivered: 168, replied: 44 },
    "and the thirty before",
  );
  assert.deepEqual([by(prior, "opt_ins"), by(prior, "opt_outs")], [11, 2]);
  assert.equal(
    by(CAMPAIGNS_QUIET.series, "sent") + by(CAMPAIGNS_QUIET.series, "opt_ins"),
    0,
    "a quiet period sent nothing",
  );
  assert.deepEqual([CAMPAIGNS_QUIET.sources, CAMPAIGNS_QUIET.by_channel], [[], []]);

  for (const key of ["sent", "delivered", "read", "replied"]) {
    assert.equal(sum(CAMPAIGNS.sources.map((s) => s[key])), by(current, key), `the sources add to the days: ${key}`);
  }
  for (const key of ["sent", "delivered", "replied"]) {
    assert.equal(
      sum(CAMPAIGNS.by_channel.map((c) => c[key])),
      by(current, key),
      `the channels add to the days: ${key}`,
    );
  }
  const whatsapp = CAMPAIGNS.by_channel.find((c) => c.channel === "whatsapp");
  assert.deepEqual([whatsapp.read, whatsapp.sent], [31, 120], "31 read of WhatsApp's 120");

  const { people, runs, held: heldPeople, stopped, failed_sends, by_message, first_reply, approval } = SERIES;
  const runsNow = total(runs.now);
  assert.equal(runsNow, sum(CAMPAIGNS.sources.map((s) => s.runs)), "the runs are the sources' runs");
  assert.equal(sum(by_message.map((m) => m.sent)), by(current, "sent"), "every send is one message's");
  for (const source of CAMPAIGNS.sources) {
    const message = by_message.find((m) => m.name === source.template_name);
    assert.equal(message.sent, source.sent, `${source.template_name}: the source and the message count one set`);
  }
  assert.ok(
    by_message.every((m) => m.replied <= m.mature && m.mature <= m.sent),
    "a rate is of the mature, which are of the sent",
  );
  assert.ok(
    people.now.sent_to <= by(current, "sent") && people.before.sent_to <= by(prior, "sent"),
    "a person has at least one send",
  );
  assert.ok(people.now.wrote_back <= people.now.sent_to && people.before.wrote_back <= people.before.sent_to);
  // The people and the messages agree, as a real database's would.
  assert.equal(first_reply.n, by(current, "replied"), "the first replies are the answered sends the funnel counts");
  assert.ok(people.now.wrote_back <= first_reply.n, "a person who wrote back has an answered send, at least one");
  assert.ok(people.before.wrote_back <= by(prior, "replied"), "and so in the period before");
  assert.ok(
    sum(by_message.map((m) => m.replied)) <= first_reply.n,
    "the messages' replies count the mature sends alone, so they are no more than the answered sends",
  );
  assert.ok(
    sum(by_message.map((m) => m.sent - m.mature)) >= people.now.counting,
    "the people still counting have sends too new to judge",
  );
  assert.equal(total(heldPeople.by_reason), heldPeople.total, "every held person has one reason");
  assert.equal(heldPeople.skipped + heldPeople.failed, heldPeople.total);
  assert.equal(total(stopped.by_failure), stopped.failed, "every failed run has one failure");
  assert.equal(sum(failed_sends.by_code.map((f) => f.n)), failed_sends.total, "every failed send has one cause");
  assert.equal(total(first_reply.buckets), first_reply.n, "every answered send is in one bucket");
  assert.equal(total(approval.buckets), approval.n, "and every approval");
  assert.deepEqual(
    Object.keys(QUIET).sort(),
    Object.keys(SERIES)
      .filter((k) => !["timezone", "today", "end", "days"].includes(k))
      .sort(),
    "a quiet window has every part, with nothing in it",
  );

  assert.equal(STUCK.runs_waiting.length, 3);
  assert.equal(
    STUCK_NOW.waiting.n + STUCK_NOW.failed.n + STUCK_NOW.replies.n,
    3 + 1 + 2,
    "what is stuck, by the world's own count",
  );
  const dto = dtoWith();
  assert.deepEqual(
    { timezone: dto.timezone, today: dto.today, end: dto.end, days: dto.days },
    { timezone: SERIES.timezone, today: SERIES.today, end: SERIES.end, days: SERIES.days },
    "the DTO's window is the series'",
  );
  assert.deepEqual(
    held(dto),
    { campaigns: CAMPAIGNS, ledger: dto, key: "30d" },
    "the surface holds the sends, the ledger and the range's one name",
  );
  assert.deepEqual(dtoWith(QUIET).series.people, QUIET.people, "a quiet window is read from the same shape");
  assert.equal(dtoWith(null).series, null, "a database with no campaign_ledger");
  assert.equal(dtoWith({}, null).stuck, null, "or none for campaign_stuck");
});

test("the guards take the databases' answers and refuse anything else", () => {
  assert.equal(isCampaignLedgerSeriesDto(SERIES), true, "the full answer");
  assert.equal(isCampaignLedgerSeriesDto({ ...SERIES, ...QUIET }), true, "a quiet window is the same shape");
  const noEnd = { ...SERIES };
  delete noEnd.end;
  assert.equal(isCampaignLedgerSeriesDto(noEnd), true, "the last day is optional");
  assert.equal(
    isCampaignLedgerSeriesDto({ ...SERIES, end: "2026-09-01" }),
    true,
    "a window that ended is the same answer",
  );
  assert.equal(isCampaignLedgerSeriesDto({ error: "unknown_tenant" }), false, "an unknown workspace is not a read");
  for (const [what, answer] of [
    ["null", null],
    ["undefined", undefined],
    ["a string", "campaign_ledger"],
    ["a number", 3],
    ["an array", []],
    ["an empty object", {}],
  ])
    assert.equal(isCampaignLedgerSeriesDto(answer), false, what);
  const noReply = { ...SERIES };
  delete noReply.first_reply;
  assert.equal(isCampaignLedgerSeriesDto(noReply), false, "a body without the first replies");
  assert.equal(
    isCampaignLedgerSeriesDto({ ...SERIES, people: { before: SERIES.people.before } }),
    false,
    "without people.now",
  );
  for (const gone of ["timezone", "today", "days", "people", "first_reply"])
    assert.equal(isCampaignLedgerSeriesDto({ ...SERIES, [gone]: undefined }), false, `without ${gone}`);
  assert.equal(isCampaignLedgerSeriesDto({ ...SERIES, end: 20260904 }), false, "the last day is a day");
  assert.equal(isCampaignLedgerSeriesDto({ ...SERIES, end: null }), false, "or absent");
  assert.equal(isCampaignLedgerSeriesDto({ ...SERIES, days: "30" }), false, "days is a count");
  assert.equal(isCampaignLedgerSeriesDto({ ...SERIES, days: 1.5 }), false, "a whole count");

  const NOTHING = { runs_waiting: [], runs_failed: [], replies: [], templates: [] };
  assert.equal(isCampaignStuckRawDto(STUCK), true, "the full answer");
  assert.equal(isCampaignStuckRawDto(NOTHING), true, "a workspace with nothing stuck answers four empty lists");
  assert.equal(isCampaignStuckRawDto({ error: "unknown_tenant" }), false, "an unknown workspace is not a read");
  for (const [what, answer] of [
    ["null", null],
    ["undefined", undefined],
    ["a string", "campaign_stuck"],
    ["an array", []],
    ["an empty object", {}],
  ])
    assert.equal(isCampaignStuckRawDto(answer), false, what);
  const noFailed = { ...STUCK };
  delete noFailed.runs_failed;
  assert.equal(isCampaignStuckRawDto(noFailed), false, "a body without the failed runs");
  assert.equal(isCampaignStuckRawDto(SERIES), false, "one database's answer is not the other's");
  assert.equal(isCampaignLedgerSeriesDto(STUCK), false);
});

/** SERIES with the part at `path` taken away (`undefined`) or replaced by `value`: a deep copy, the shared world is never written. */
const seriesWith = (path, value) => {
  const clone = copy(SERIES);
  const parent = path.slice(0, -1).reduce((at, key) => at[key], clone);
  if (value === undefined) delete parent[path.at(-1)];
  else parent[path.at(-1)] = value;
  return clone;
};

test("isCampaignLedgerSeriesDto: every part the fold reads must be there, so an answer short of one is not an answer", () => {
  assert.equal(isCampaignLedgerSeriesDto(seriesWith(["people"], SERIES.people)), true, "the copy is the full answer");
  const objects = [
    ["people"],
    ["people", "now"],
    ["people", "before"],
    ["runs"],
    ["runs", "now"],
    ["runs", "before"],
    ["held"],
    ["held", "by_reason"],
    ["stopped"],
    ["stopped", "by_failure"],
    ["failed_sends"],
    ["first_reply"],
    ["first_reply", "buckets"],
    ["approval"],
    ["approval", "buckets"],
  ];
  for (const path of objects)
    for (const [what, value] of [
      ["missing", undefined],
      ["null", null],
      ["a number", 3],
      ["a string", "none"],
      ["an array", []],
    ])
      assert.equal(isCampaignLedgerSeriesDto(seriesWith(path, value)), false, `${path.join(".")} ${what}`);
  for (const path of [["failed_sends", "by_code"], ["by_message"]]) {
    for (const [what, value] of [
      ["missing", undefined],
      ["null", null],
      ["a number", 3],
      ["a string", "none"],
      ["an object", {}],
      ["a list holding a null", [null]],
      ["a list holding a number", [3]],
      ["a list holding a list", [[]]],
    ])
      assert.equal(isCampaignLedgerSeriesDto(seriesWith(path, value)), false, `${path.join(".")} ${what}`);
    assert.equal(isCampaignLedgerSeriesDto(seriesWith(path, [])), true, `${path.join(".")} may be an empty list`);
  }
});

test("isCampaignStuckRawDto: each of the four lists must be a list of objects", () => {
  for (const key of Object.keys(STUCK))
    for (const [what, value] of [
      ["missing", undefined],
      ["null", null],
      ["a number", 3],
      ["a string", "none"],
      ["an object", {}],
      ["a list holding a null", [null]],
      ["a list holding a string", ["run"]],
    ])
      assert.equal(isCampaignStuckRawDto({ ...STUCK, [key]: value }), false, `${key} ${what}`);
});

test("campaignLedgerDtoOf judges what waits by the product's own rules", () => {
  const dto = campaignLedgerDtoOf(SERIES, parts());
  assert.deepEqual(dto, dtoWith(), "the world's stuck half, judged at the world's clock, is what it was written to be");
  assert.deepEqual(dto.stuck, STUCK_NOW);
  assert.deepEqual(Object.keys(dto.stuck), ["waiting", "failed", "replies", "templates", "number"]);

  // Runs waiting for an OK: the verb's own refusal, judged at the salon's noon on Friday Sep 4.
  const [reach, late, today] = STUCK.runs_waiting;
  const days = { today: "2026-09-04", sendsOn: "2026-09-04" };
  const refusal = (run) =>
    runApprovalRefusal(
      {
        playbook_id: run.playbook_id,
        run_for: run.run_for,
        audience: { kind: run.audience_kind, trigger: run.trigger },
      },
      days,
    );
  assert.notEqual(refusal(late), null, "the run made for yesterday is one the verb refuses");
  assert.equal(refusal(today), null, "today's is not");
  assert.equal(refusal(reach), null, "and a reach-out's never is, though it carries a step's id and a day gone by");
  assert.deepEqual(dto.stuck.waiting, { n: 3, late: 1, oldest_at: "2026-09-02T15:00:00.000Z", capped: false });
  for (const [what, runs, late_] of [
    ["only yesterday's", [late], 1],
    ["only today's", [today], 0],
    ["only the reach-out's", [reach], 0],
    ["two of them late", [late, { ...late, id: "run-late-2" }, today], 2],
    ["none", [], 0],
  ]) {
    const waiting = stuckAt({ ...STUCK, runs_waiting: runs }).waiting;
    assert.equal(waiting.n, runs.length, `${what}: n`);
    assert.equal(waiting.late, late_, `${what}: late`);
  }
  // A broadcast has no day to pass (no playbook behind it) and is never refused.
  const broadcast = {
    ...late,
    id: "run-broadcast",
    kind: "broadcast",
    playbook_id: null,
    trigger: null,
    audience_kind: "everyone",
  };
  assert.equal(
    stuckAt({ ...STUCK, runs_waiting: [broadcast] }).waiting.late,
    0,
    "a one-off broadcast made a day ago is not late",
  );
  assert.deepEqual(stuckAt({ ...STUCK, runs_waiting: [] }).waiting, { n: 0, late: 0, oldest_at: null, capped: false });
  assert.equal(
    stuckAt({ ...STUCK, runs_waiting: [...STUCK.runs_waiting].reverse() }).waiting.oldest_at,
    "2026-09-02T15:00:00.000Z",
    "the oldest is the oldest whatever order the list came in",
  );

  // The failed runs, newest first for the message and not by the list's order.
  const older = {
    ...STUCK.runs_failed[0],
    id: "f-old",
    name: "Old note",
    failure: "other",
    finished_at: "2026-08-20T10:00:00.000Z",
  };
  const newer = {
    ...STUCK.runs_failed[0],
    id: "f-new",
    name: "Newest note",
    failure: "wire_unavailable:sms",
    finished_at: "2026-09-03T08:30:00.000Z",
  };
  for (const list of [
    [older, STUCK.runs_failed[0], newer],
    [newer, older, STUCK.runs_failed[0]],
  ])
    assert.deepEqual(
      stuckAt({ ...STUCK, runs_failed: list }).failed,
      {
        n: 3,
        latest: { name: "Newest note", failure: "wire_unavailable:sms", at: "2026-09-03T08:30:00.000Z" },
        capped: false,
      },
      "the latest is the newest failed run",
    );
  assert.deepEqual(stuckAt({ ...STUCK, runs_failed: [] }).failed, { n: 0, latest: null, capped: false });

  // The templates Meta stopped: how many, and the first three, by name, language and status only.
  const more = ["a", "b", "c", "d"].map((name) => ({
    name: `${name}_note`,
    language: "es",
    status: "disabled",
    quality: "RED",
  }));
  const templates = stuckAt({ ...STUCK, templates: [...STUCK.templates, ...more] }).templates;
  assert.equal(templates.n, 6, "every template counts");
  assert.deepEqual(
    templates.items,
    [
      { name: "winback_offer", language: "en_US", status: "paused" },
      { name: "spring_note", language: "en_US", status: "rejected" },
      { name: "a_note", language: "es", status: "disabled" },
    ],
    "and the first three are shown, with no rating",
  );
  assert.deepEqual(stuckAt({ ...STUCK, templates: [] }).templates, { n: 0, items: [] });
});

test("a run waits by the workspace's own day and sending hours, never the machine's", () => {
  const waitingAt = (nowMs, run, head = HEAD) =>
    campaignLedgerDtoOf(null, parts({ stuck: { ...STUCK, runs_waiting: [run] }, nowMs, head })).stuck.waiting.late;
  const [, late, today] = STUCK.runs_waiting;
  // 22:00 on Sep 4 in New York is already Sep 5 in UTC and 14:00 on Sep 5 in Auckland.
  const night = Date.parse("2026-09-05T02:00:00Z");
  assert.equal(waitingAt(night, today), 0, "at ten at night in New York, today's run is still today's");
  assert.equal(waitingAt(night, late), 1, "and yesterday's is late");
  assert.equal(
    waitingAt(night, today, { ...HEAD, timezone: "Pacific/Auckland" }),
    1,
    "in Auckland the same instant is Sep 5: today's run is late",
  );
  assert.equal(
    waitingAt(night, { ...today, run_for: "2026-09-05" }, { ...HEAD, timezone: "Pacific/Auckland" }),
    0,
    "made for Sep 5 it is not",
  );
  // One minute past midnight in New York on Sep 5.
  const midnight = Date.parse("2026-09-05T04:01:00Z");
  assert.equal(waitingAt(midnight, today), 1, "past the salon's midnight, the run made for Sep 4 is late");
  // The series' own zone says the workspace's, whatever the head asked.
  const asAuckland = campaignLedgerDtoOf(
    { ...SERIES, timezone: "Pacific/Auckland", today: "2026-09-05" },
    parts({ nowMs: night, head: HEAD }),
  );
  assert.equal(
    asAuckland.stuck.waiting.late,
    2,
    "read in the series' zone: Sep 4's and Sep 3's runs are both late there",
  );

  // A visit's run, made for today, that an approval after the last sending hour would send tomorrow.
  const visit = { ...today, id: "run-visit", playbook_id: "pb-visit", trigger: "visit_tomorrow" };
  const evening = Date.parse("2026-09-05T01:30:00Z"); // 21:30 on Sep 4 in New York
  const earlyMorning = Date.parse("2026-09-04T11:00:00Z"); // 07:00
  assert.equal(waitingAt(NOW, visit), 0, "at noon, a visit's run made for today goes out today");
  assert.equal(waitingAt(earlyMorning, visit), 0, "at seven it goes out at nine");
  assert.equal(
    waitingAt(evening, visit),
    1,
    "at half past nine at night an approval would send it tomorrow: the verb refuses it",
  );
  assert.equal(waitingAt(evening, today), 0, "any other moment's run for today is not late then");

  // East of UTC the next sending hour falls on the day before in UTC: it is the workspace's day that counts.
  const auckland = { ...HEAD, timezone: "Pacific/Auckland" };
  const nzNight = Date.parse("2026-09-04T10:00:00Z"); // 22:00 on Sep 4 in Auckland
  assert.equal(
    waitingAt(nzNight, visit, auckland),
    1,
    "in Auckland at ten at night the visit's run would go out tomorrow",
  );
  assert.equal(waitingAt(nzNight, today, auckland), 0, "and any other moment's run made for today is still today's");
});

test("a reply waits on you by the one standing, the workspace's and not a member's", () => {
  const future = new Date(NOW + 4 * HOUR).toISOString();
  const past = new Date(NOW - 6 * HOUR).toISOString();
  const reply = (replied_at, over) => ({
    state: "open",
    paused_until: null,
    assignee_user_id: null,
    open_escalation: false,
    replied_at,
    ...over,
  });
  const cases = [
    ["an open escalation and nobody", reply("2026-09-03T10:00:00.000Z", { open_escalation: true }), true],
    [
      "an open STOP hold and nobody: it waits on nobody (decision 0048)",
      reply("2026-09-03T11:00:00.000Z", { open_escalation: true, open_escalation_reason: "opt_out" }),
      false,
    ],
    ["the needs_human state and nobody", reply("2026-08-31T10:00:00.000Z", { state: "needs_human" }), true],
    [
      "a live pause with an escalation open",
      reply("2026-09-02T10:00:00.000Z", { paused_until: future, open_escalation: true }),
      true,
    ],
    [
      "assigned to a teammate with an escalation open",
      reply("2026-08-01T10:00:00.000Z", { assignee_user_id: "user-teammate", open_escalation: true }),
      false,
    ],
    [
      "needs_human but a teammate has it",
      reply("2026-08-02T10:00:00.000Z", { state: "needs_human", assignee_user_id: "user-teammate" }),
      false,
    ],
    [
      "snoozed with an escalation open",
      reply("2026-08-03T10:00:00.000Z", { state: "snoozed", open_escalation: true }),
      false,
    ],
    [
      "snoozed under a live pause",
      reply("2026-08-04T10:00:00.000Z", { state: "snoozed", paused_until: future, open_escalation: true }),
      false,
    ],
    ["a live pause a person's own reply left", reply("2026-08-05T10:00:00.000Z", { paused_until: future }), false],
    [
      "needs_human, and a person's own reply left a live pause",
      reply("2026-08-08T10:00:00.000Z", { state: "needs_human", paused_until: future }),
      false,
    ],
    ["a pause that has run out", reply("2026-08-06T10:00:00.000Z", { paused_until: past }), false],
    ["nothing flagged", reply("2026-08-07T10:00:00.000Z", {}), false],
  ];
  for (const [what, r, counts] of cases) {
    const oracle = standingOf(
      {
        state: r.state,
        paused_until: r.paused_until,
        assignee_user_id: r.assignee_user_id,
        open_escalation: r.open_escalation,
        escalation_reason: r.open_escalation_reason,
      },
      NOW,
    ).standing;
    assert.equal(oracle === "needs_you", counts, `${what}: the product's standing says ${oracle}`);
    const alone = stuckAt({ ...STUCK, replies: [r] }).replies;
    assert.equal(alone.n, counts ? 1 : 0, `${what}: counted`);
    assert.equal(alone.oldest_at, counts ? r.replied_at : null, `${what}: oldest`);
  }
  const all = cases.map(([, r]) => r);
  for (const list of [all, [...all].reverse()]) {
    assert.deepEqual(
      stuckAt({ ...STUCK, replies: list }).replies,
      { n: 3, oldest_at: "2026-08-31T10:00:00.000Z", capped: false },
      "three wait on you; the oldest of them is the oldest whatever order the list came in",
    );
  }
  assert.deepEqual(stuckAt({ ...STUCK, replies: [] }).replies, { n: 0, oldest_at: null, capped: false });
});

test("a list the database cut at 500 is said to be capped, each on its own", () => {
  const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  const run = (i) => ({ ...STUCK.runs_waiting[2], id: `w${i}` });
  const failed = (i) => ({ ...STUCK.runs_failed[0], id: `f${i}` });
  const answered = (i) => ({ ...STUCK.replies[0], replied_at: new Date(NOW - i * HOUR).toISOString() });
  for (const [list, make, part] of [
    ["runs_waiting", run, "waiting"],
    ["runs_failed", failed, "failed"],
    ["replies", answered, "replies"],
  ]) {
    assert.equal(stuckAt({ ...STUCK, [list]: many(3, make) })[part].capped, false, `${list} at 3`);
    assert.equal(stuckAt({ ...STUCK, [list]: many(499, make) })[part].capped, false, `${list} at 499`);
    const at500 = stuckAt({ ...STUCK, [list]: many(500, make) });
    assert.equal(at500[part].capped, true, `${list} at 500`);
    assert.equal(at500[part].n, 500, `${list} says what it was given`);
    for (const other of ["waiting", "failed", "replies"].filter((p) => p !== part))
      assert.equal(at500[other].capped, false, `${list} at 500 does not cap ${other}`);
  }
  // The cap is of the list the database cut, not of the threads that wait: 500 listed, one of them waiting on you.
  const quiet = () => ({ ...STUCK.replies[0], open_escalation: false });
  assert.deepEqual(
    stuckAt({ ...STUCK, replies: [STUCK.replies[0], ...many(499, quiet)] }).replies,
    { n: 1, oldest_at: STUCK.replies[0].replied_at, capped: true },
    "the list reached 500, so there may be more that wait",
  );
});

test("the answer carries the window it is of, and each half stands alone", () => {
  // The series says the window: its own zone, day, last day and length.
  const echoed = campaignLedgerDtoOf(SERIES, parts({ head: { timezone: "UTC", today: "2000-01-01", days: 1 } }));
  assert.deepEqual(Object.keys(echoed), ["timezone", "today", "end", "days", "series", "stuck"], "the keys, in order");
  assert.deepEqual(
    { timezone: echoed.timezone, today: echoed.today, end: echoed.end, days: echoed.days },
    { timezone: "America/New_York", today: "2026-09-04", end: "2026-09-04", days: 30 },
    "the series says the window, not the head",
  );
  assert.equal(echoed.series, SERIES, "the series stands as the database gave it");
  const noEnd = { ...SERIES };
  delete noEnd.end;
  assert.equal("end" in campaignLedgerDtoOf(noEnd, parts()), false, "a series that carries no last day echoes none");
  assert.equal(
    campaignLedgerDtoOf({ ...SERIES, end: "2026-09-01" }, parts()).end,
    "2026-09-01",
    "days a member picked say where they ended",
  );

  // No campaign_ledger in this database: the window the route asked for, and the stuck half still there.
  const missing = campaignLedgerDtoOf(null, parts());
  assert.deepEqual(missing, { ...HEAD, series: null, stuck: STUCK_NOW });
  assert.deepEqual(
    Object.keys(missing),
    ["timezone", "today", "days", "series", "stuck"],
    "no last day asked, none said",
  );
  const picked = { ...HEAD, end: "2026-09-01" };
  assert.deepEqual(
    campaignLedgerDtoOf(null, parts({ head: picked })),
    { ...picked, series: null, stuck: STUCK_NOW },
    "the days asked, last day included",
  );

  // No campaign_stuck: null, and no word of failure. A read that failed says so.
  const none = campaignLedgerDtoOf(SERIES, parts({ stuck: null }));
  assert.equal(none.stuck, null);
  assert.equal("stuck_failed" in none, false, "a function the database lacks is not a failure");
  assert.deepEqual(none.series, SERIES, "the ledger stands");
  const failedRead = campaignLedgerDtoOf(SERIES, parts({ stuck: null, stuckFailed: true }));
  assert.equal(failedRead.stuck, null);
  assert.equal(failedRead.stuck_failed, true);
  assert.deepEqual(Object.keys(failedRead), ["timezone", "today", "end", "days", "series", "stuck", "stuck_failed"]);
  assert.equal(
    campaignLedgerDtoOf(SERIES, parts({ stuckFailed: true })).stuck,
    null,
    "a read that failed has nothing to judge",
  );
  assert.deepEqual(
    campaignLedgerDtoOf(null, parts({ stuck: null })),
    { ...HEAD, series: null, stuck: null },
    "both missing",
  );
  assert.deepEqual(
    campaignLedgerDtoOf(null, parts({ stuck: null, stuckFailed: true })),
    { ...HEAD, series: null, stuck: null, stuck_failed: true },
    "the ledger missing and the stuck read failed",
  );

  // The number rides with what is stuck, in each of its states.
  for (const number of [
    { state: "none" },
    { state: "unread" },
    { ...NUMBER, tone: "danger", can_send: false, checked_at: null },
  ])
    assert.equal(stuckAt(STUCK, { number }).number, number, `the number: ${number.state} ${number.tone ?? ""}`);

  // Nothing the caller handed in is written to.
  const [series, raw, head] = [copy(SERIES), copy(STUCK), copy(HEAD)];
  campaignLedgerDtoOf(series, parts({ stuck: raw, head }));
  campaignLedgerDtoOf(null, parts({ stuck: raw, head }));
  assert.deepEqual([series, raw, head], [SERIES, STUCK, HEAD], "the builder reads and never writes");
});

/* ------------------------------------------------------------------ failureWordsOf */

/**
 * The codes a wire documents, found by asking the public function the thread asks (sendFailureWords) about every code in a
 * range: a code with a sentence of its own is one whose sentence does not begin with the generic "didn't deliver it (error
 * N)". A code added to a table is therefore held here at once, with no source read.
 */
function documentedCodes(channel, from, to, generic) {
  const found = [];
  for (let code = from; code < to; code += 1) {
    const words = sendFailureWords({ errors: [{ code }] }, channel);
    if (words !== null && !words.startsWith(generic)) found.push(code);
  }
  return found;
}

test("failureWordsOf says what the Inbox's thread says", () => {
  const whatsapp = documentedCodes("whatsapp", 100000, 140000, "WhatsApp didn't deliver it (error");
  const text = documentedCodes("sms", 20000, 40000, "Twilio didn't deliver it (error");
  assert.ok(whatsapp.length >= 15 && text.length >= 11, `the tables were found (${whatsapp.length}, ${text.length})`);
  assert.ok(whatsapp.includes(131049) && text.includes(30003), "and they hold the codes the lens is built on");
  for (const [channel, documented] of [
    ["whatsapp", whatsapp],
    ["sms", text],
  ]) {
    for (const code of [...documented, 131000, 99999]) {
      const words = failureWordsOf(channel, { code, kind: null });
      assert.equal(words, sendFailureWords({ errors: [{ code }] }, channel), `${channel} ${code}`);
      assert.equal(words, sendFailureWords({ code }, channel), `${channel} ${code}, the code on the receipt itself`);
      assert.match(words, /\.$/, `${channel} ${code} is a sentence`);
    }
    assert.match(
      failureWordsOf(channel, { code: 99999, kind: null }),
      /\(error 99999\)\.$/,
      `${channel}: a code in no table is said by its number`,
    );
  }
  assert.match(
    failureWordsOf("whatsapp", { code: 131049, kind: null }),
    /^WhatsApp held it back.*\(WhatsApp error 131049\)\.$/,
  );
  assert.match(failureWordsOf("sms", { code: 30003, kind: null }), /\(Twilio error 30003\)\.$/);
  assert.equal(
    failureWordsOf(null, { code: 131049, kind: null }),
    failureWordsOf("whatsapp", { code: 131049, kind: null }),
    "a row naming no wire went by WhatsApp",
  );
  assert.equal(
    failureWordsOf(undefined, { code: 131049, kind: null }),
    failureWordsOf("whatsapp", { code: 131049, kind: null }),
  );
  assert.equal(
    failureWordsOf("email", { code: 131049, kind: null }),
    sendFailureWords({ code: 131049 }, "email"),
    "an email's code is said as the thread says it",
  );

  // An email's provider word.
  for (const provider of ["bounced", "failed", "suppressed"]) {
    const words = failureWordsOf("email", { code: null, kind: provider });
    assert.equal(words, sendFailureWords({ provider }, "email"), `email ${provider}`);
    assert.ok(words, `email ${provider} has words`);
  }
  assert.match(failureWordsOf("email", { code: null, kind: "bounced" }), /^The email bounced/);
  // A text's carrier word.
  for (const carrier of ["undelivered", "failed", "canceled"]) {
    const words = failureWordsOf("sms", { code: null, kind: carrier });
    assert.equal(words, sendFailureWords({ carrier }, "sms"), `sms ${carrier}`);
    assert.ok(words, `sms ${carrier} has words`);
  }
  assert.notEqual(
    failureWordsOf("sms", { code: null, kind: "failed" }),
    failureWordsOf("email", { code: null, kind: "failed" }),
    "one word, two wires, two sentences",
  );
  // The settled reasons, on any wire.
  for (const channel of ["whatsapp", "sms", "email", null])
    for (const reason of ["never_delivered", "run_interrupted", "orphaned"]) {
      const words = failureWordsOf(channel, { code: null, kind: reason });
      assert.equal(words, sendFailureWords({ reason }, channel), `${channel} ${reason}`);
      assert.ok(words, `${channel} ${reason} has words`);
    }
  assert.match(failureWordsOf("whatsapp", { code: null, kind: "never_delivered" }), /^It was never sent/);
  // A send the provider never answered, which may have gone: what the thread says of `outcome: "unknown"`, on any wire.
  for (const channel of ["whatsapp", "sms", "email", null]) {
    const words = failureWordsOf(channel, { code: null, kind: "outcome_unknown" });
    assert.equal(words, sendFailureWords({ outcome: "unknown" }, channel), `${channel} outcome_unknown`);
    assert.match(words, /^The provider didn't answer in time, so it may have gone/, `${channel} says it may have gone`);
  }
  assert.equal(
    failureWordsOf("email", { code: null, kind: "outcome_unknown" }),
    failureWordsOf("sms", { code: null, kind: "outcome_unknown" }),
    "one sentence, whatever the wire",
  );
  assert.equal(
    failureWordsOf("sms", { code: 30003, kind: "outcome_unknown" }),
    failureWordsOf("sms", { code: 30003, kind: null }),
    "a code is still the cause when there is one",
  );
  // Nothing the ledger cannot name says nothing.
  for (const channel of ["whatsapp", "sms", "email", null])
    for (const kind of [
      "unknown",
      "nonsense",
      "",
      "outcome",
      "OUTCOME_UNKNOWN",
      "outcome unknown",
      "constructor",
      "toString",
      "__proto__",
      null,
    ])
      assert.equal(
        failureWordsOf(channel, { code: null, kind }),
        null,
        `${channel} ${JSON.stringify(kind)} says nothing`,
      );
  assert.equal(
    failureWordsOf("whatsapp", { code: null, kind: "bounced" }),
    null,
    "an email's word on a message that went by WhatsApp is none the ledger gives",
  );
  assert.equal(
    failureWordsOf("whatsapp", { code: null, kind: "undelivered" }),
    null,
    "and a text's carrier word on it",
  );
  assert.equal(failureWordsOf("email", { code: null, kind: "undelivered" }), null);
  assert.equal(failureWordsOf("sms", { code: null, kind: "bounced" }), null);
  assert.equal(
    failureWordsOf("whatsapp", { code: 131049, kind: "bounced" }),
    failureWordsOf("whatsapp", { code: 131049, kind: null }),
    "a code is the cause when there is one",
  );
});

test("sendFailureWords finds a word only in its own tables, not on the prototype every object has", () => {
  const inherited = ["constructor", "toString", "valueOf", "hasOwnProperty", "isPrototypeOf", "__proto__"];
  for (const word of inherited) {
    assert.equal(sendFailureWords({ provider: word }, "email"), null, `an email's provider ${word}`);
    assert.equal(sendFailureWords({ carrier: word }, "sms"), null, `a text's carrier ${word}`);
    assert.equal(sendFailureWords({ carrier: word }, "whatsapp"), null, `a carrier ${word} on WhatsApp`);
    for (const channel of ["whatsapp", "sms", "email", null])
      assert.equal(sendFailureWords({ reason: word }, channel), null, `${channel} reason ${word}`);
  }
  // The tables still say what they say.
  assert.match(sendFailureWords({ provider: "bounced" }, "email"), /^The email bounced/);
  assert.equal(sendFailureWords({ carrier: "undelivered" }, "sms"), "The carrier didn't deliver it.");
  assert.match(sendFailureWords({ reason: "orphaned" }, "whatsapp"), /^It was never sent/);
  assert.match(sendFailureWords({ code: 131049 }, "whatsapp"), /\(WhatsApp error 131049\)\.$/);
});

/* ------------------------------------------------------------------ numberHealthOfConfig */

/** What `whatsappHealthOf` derived inline before the lens: the oracle numberHealthOfConfig is held to. */
function composerHealth(config) {
  const s = (k) => (typeof config[k] === "string" ? config[k] : null);
  const health = numberHealth({ quality: s("quality_rating"), event: s("quality_event"), limit: s("messaging_limit") });
  return numberHealthWithStanding(health, standingFromConfig(config.standing));
}

const standing = (over) => ({
  can_send: "AVAILABLE",
  problems: [],
  notes: [],
  name: "Harbor Studio",
  name_status: "APPROVED",
  verification: "verified",
  limit: "TIER_1K",
  has_payment_method: true,
  owner_business_id: "100200300",
  waba_id: "400500600",
  ...over,
});

test("numberHealthOfConfig is what the composer derived", () => {
  // A value that is no string is no reading, however a loose reading would spell it ("RED" in a list).
  const ratings = ["GREEN", "YELLOW", "RED", "UNKNOWN", "green", undefined, null, 5, ["RED"]];
  const events = [undefined, "FLAGGED", "UNFLAGGED", "DOWNGRADE", "UPGRADE", "ONBOARDING", ["FLAGGED"]];
  const tiers = [undefined, null, "TIER_50", "TIER_250", "TIER_1K", "TIER_UNLIMITED", "TIER_UNHEARD_OF", 1000];
  const standings = [
    undefined,
    null,
    "BLOCKED",
    {},
    standing({}),
    standing({ can_send: "LIMITED" }),
    standing({
      can_send: "LIMITED",
      problems: [{ entity: "PHONE_NUMBER", code: 1, said: "Messaging is limited.", fix: null }],
    }),
    standing({ can_send: "BLOCKED" }),
    standing({
      can_send: "BLOCKED",
      problems: [
        { entity: "PHONE_NUMBER", code: 141000, said: "This number is restricted", fix: "Open WhatsApp Manager" },
      ],
    }),
    standing({ has_payment_method: false }),
    standing({
      problems: [{ entity: "WABA", code: 131042, said: "There is an error with the payment method", fix: null }],
    }),
    standing({ can_send: "SOMETHING_ELSE" }),
  ];
  let n = 0;
  for (const quality_rating of ratings)
    for (const quality_event of events)
      for (const messaging_limit of tiers)
        for (const s of standings) {
          const config = { quality_rating, quality_event, messaging_limit, standing: s, number: "+15550100" };
          assert.deepEqual(numberHealthOfConfig(config), composerHealth(config), JSON.stringify(config));
          n += 1;
        }
  assert.equal(n, ratings.length * events.length * tiers.length * standings.length);
  assert.deepEqual(numberHealthOfConfig({}), composerHealth({}), "a config that says nothing");
});

test("numberHealthOfConfig: a rating, an event, a tier and what Meta holds, read as the gate reads them", () => {
  const read = (config) => numberHealthOfConfig(config);
  assert.deepEqual(read({ quality_rating: "GREEN", messaging_limit: "TIER_1K" }), {
    canSend: true,
    tone: "ok",
    limitPerDay: 1000,
    label: "Number quality: good · up to 1,000 new conversations a day",
    refusal: null,
  });
  assert.equal(read({ quality_rating: "YELLOW" }).tone, "warn", "medium");
  assert.equal(read({ quality_rating: "YELLOW" }).canSend, true, "and still sends");
  assert.deepEqual(
    [read({ quality_rating: "RED" }).tone, read({ quality_rating: "RED" }).canSend],
    ["danger", false],
    "red is flagged",
  );
  assert.deepEqual(
    [read({ quality_rating: "GREEN", quality_event: "FLAGGED" }).tone, read({ quality_event: "FLAGGED" }).canSend],
    ["danger", false],
    "so is a flag",
  );
  assert.equal(read({}).tone, "unknown", "nothing reported is said so");
  assert.equal(
    read({ quality_rating: 5, quality_event: 7, messaging_limit: 9 }).tone,
    "unknown",
    "a value that is no word is no reading",
  );
  assert.equal(
    read({ quality_rating: "GREEN", standing: standing({ can_send: "LIMITED" }) }).tone,
    "ok",
    "a limit alone holds nothing against the number",
  );
  const blocked = read({ quality_rating: "GREEN", standing: standing({ can_send: "BLOCKED" }) });
  assert.deepEqual([blocked.canSend, blocked.tone], [false, "danger"], "Meta has stopped it");
  assert.match(blocked.refusal, /Meta/, "in the row's own sentence");
  const noCard = read({ quality_rating: "GREEN", standing: standing({ has_payment_method: false }) });
  assert.deepEqual(
    [noCard.canSend, noCard.tone],
    [false, "danger"],
    "an account with no payment method carries no campaign",
  );
  assert.match(noCard.refusal, /payment method/);
});
