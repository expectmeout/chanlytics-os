/**
 * A run waiting on you says what approving it does, and nothing it cannot know.
 *
 * The canvas draws the phone moment -- "approving from the sofa" -- with a
 * reach card reading "186 of 312 will get it", "94 never said yes to offers",
 * "32 heard from a playbook this week". A run keeps who its moment named and
 * why each of the rest was left out (playbookRunReach, on its audience), so the
 * sheet says exactly that; a run made before runs kept it says the number it
 * has and the RULES that made the list, which are true of everyone on it by
 * construction (eligibleForPlaybook), and never a count it does not have. The words
 * are shown as the first person on it reads them; the people a greeting by
 * name reaches with no name on file are counted, because they get "Hi there".
 * The act says when the send goes -- an approval sends at the next open
 * moment (approveRun) -- and a run whose day has passed cannot be approved at
 * all, so it says so instead of offering a button the server refuses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";

const person = (name, first_name, over = {}) => ({ contact_id: name, name, first_name, state: "queued", ...over });
const run = (over = {}) => ({
  recipient_count: 3,
  playbook_id: "pb1",
  run_for: "2026-09-21",
  params: [{ kind: "text", value: "This month at" }, { kind: "business_name" }, { kind: "first_name" }],
  ...over,
});
const opts = (over = {}) => ({
  playbook: { trigger: "everyone_monthly", cap_per_run: 250, gap_days: 90, cadence_days: 30 },
  businessName: "Marisa Studio",
  today: "2026-09-21",
  open: { time: "10:00", moved: false, on: "2026-09-21" },
  day: (ymd) => `day ${ymd}`,
  paused: false,
  ...over,
});
const people = [person("+1 (917) 555-0142", null), person("Priya Nair", "Priya"), person("Tom Baker", "Tom")];

test("a run that kept no count says who it reaches by the number it has and the rules that made the list -- never a pool or a held-back count it did not record", () => {
  const vm = C.toApprovalVM({ broadcast: run(), recipients: people }, opts());
  assert.equal(vm.will, 3);
  assert.equal(vm.of, null, "no count kept, none said");
  assert.deepEqual(vm.rules, [
    "each said yes to offers",
    "none heard from this playbook in 30 days",
    "none heard from any playbook this week",
  ]);
  assert.ok(
    !vm.rules.some((r) => /\d+ (never|heard|have not)/.test(r)),
    "no count of who was left out: the run never recorded one",
  );
  // A list playbook's gap is its own, and its cap is said when the run reached it.
  const winback = C.toApprovalVM(
    { broadcast: run({ recipient_count: 25 }), recipients: people },
    opts({ playbook: { trigger: "quiet_30", cap_per_run: 25, gap_days: 90, cadence_days: 30 } }),
  );
  assert.deepEqual(winback.rules, [
    "each said yes to offers",
    "none heard from this playbook in 90 days",
    "none heard from any playbook this week",
    "capped at 25 a run, the longest unheard first",
  ]);
  // A reminder is owed to everyone with a visit: no gap, no week's breath, no cap -- and its yes is to hearing from you.
  const visit = C.toApprovalVM(
    { broadcast: run(), recipients: people },
    opts({ playbook: { trigger: "visit_tomorrow", cap_per_run: 25, gap_days: 90, cadence_days: 30 } }),
  );
  assert.deepEqual(visit.rules, ["each said yes to hearing from you", "each has a visit tomorrow on the calendar"]);
});

test('the words are the first named person\'s, slot by slot, and the people a greeting by name reaches with no name are counted -- they get "Hi there"', () => {
  const vm = C.toApprovalVM({ broadcast: run(), recipients: people }, opts());
  assert.equal(vm.reader, "Priya Nair", "the first person on it with a name, not a number");
  assert.deepEqual(vm.values, ["This month at", "Marisa Studio", "Priya"]);
  assert.equal(vm.hiThere, 1);
  const noName = C.toApprovalVM(
    { broadcast: run({ params: [{ kind: "text", value: "20% off" }] }), recipients: people },
    opts(),
  );
  assert.equal(noName.hiThere, 0, 'a message that greets nobody by name greets nobody "Hi there"');
  // A visit's words are each person's own, kept on their row; the sheet names the slot rather than make one up.
  const visit = C.toApprovalVM(
    { broadcast: run({ params: [{ kind: "visit_when" }, { kind: "booking_link" }] }), recipients: people },
    opts(),
  );
  assert.deepEqual(visit.values, ["[their visit's time]", "your booking link"]);
  assert.equal(C.toApprovalVM({ broadcast: run(), recipients: [] }, opts()).reader, null);
});

test("the act says when the send goes -- now, or at the next open hour -- and a run whose day has passed says so instead of offering it", () => {
  assert.equal(
    C.toApprovalVM({ broadcast: run({ recipient_count: 186 }), recipients: people }, opts()).approve,
    "Approve — 186 now",
  );
  const late = C.toApprovalVM(
    { broadcast: run({ recipient_count: 186 }), recipients: people },
    opts({ open: { time: "9:00", moved: true, on: "2026-09-21" } }),
  );
  assert.equal(late.approve, "Approve — 186 at 9:00");
  assert.equal(
    late.goes,
    "goes at 9:00 once you approve it",
    "after hours it waits for the morning, and says so before the press",
  );
  const expired = C.toApprovalVM({ broadcast: run({ run_for: "2026-09-20" }), recipients: people }, opts());
  assert.equal(expired.approve, null, "REGRESSION-IN-WAITING: a button approveRun refuses");
  assert.equal(
    expired.expired,
    "This run was made for day 2026-09-20 and that day has passed: its people and its words were that day's. Skip it; the next run reads the calendar again.",
    "the verb's own sentence, with the day said as the page says days",
  );
  assert.equal(expired.goes, "made for day 2026-09-20");
  assert.equal(
    C.toApprovalVM({ broadcast: run(), recipients: people }, opts()).skip,
    "Skipping loses this run only — the playbook keeps running.",
  );
});

test("a visit's run that approving now would send on a later day says why instead of offering the button, in approveRun's own words: a reminder for tomorrow's visit does not go out on the morning of it", () => {
  const visitRun = (trigger = "visit_tomorrow") => run({ run_for: "2026-09-21", audience: { trigger } });
  const after = opts({ open: { time: "9:00", moved: true, on: "2026-09-22" } });
  for (const trigger of ["visit_tomorrow", "visited"]) {
    const vm = C.toApprovalVM({ broadcast: visitRun(trigger), recipients: people }, after);
    assert.equal(vm.approve, null, `${trigger}: no button the verb refuses`);
    assert.equal(
      vm.expired,
      C.runApprovalRefusal(
        { playbook_id: "pb1", run_for: "2026-09-21", audience: { trigger } },
        { today: "2026-09-21", sendsOn: "2026-09-22", say: (ymd) => `day ${ymd}` },
      ),
      "the sheet says the refusal's words, the verb's: it asks the one predicate, and says the day as the page does",
    );
    assert.ok(vm.expired.startsWith("This run was made for day 2026-09-21 and that day has passed"), vm.expired);
    assert.equal(vm.goes, "made for day 2026-09-21");
  }
  // Inside the hours, or before nine the same morning: it goes on the day it was made for, and the button is offered.
  const evening = opts({ open: { time: "7:30 PM", moved: false, on: "2026-09-21" } });
  assert.equal(C.toApprovalVM({ broadcast: visitRun(), recipients: people }, evening).approve, "Approve — 3 now");
  const early = opts({ open: { time: "9:00", moved: true, on: "2026-09-21" } });
  assert.equal(C.toApprovalVM({ broadcast: visitRun(), recipients: people }, early).approve, "Approve — 3 at 9:00");
  // Another moment's words name no day: approved at night, it goes at nine, as it always did. So does a run that kept no moment.
  for (const audience of [{ trigger: "quiet_30" }, { trigger: "everyone_monthly" }, {}, null, undefined]) {
    const vm = C.toApprovalVM({ broadcast: run({ audience }), recipients: people }, after);
    assert.equal(vm.approve, "Approve — 3 at 9:00", JSON.stringify(audience));
    assert.equal(vm.expired, null);
  }
});

test("the verb's refusal and the sheet's are one predicate: a run made for a day that has passed, a visit's run that would go out on a later one, and nothing else", () => {
  const day = (today, sendsOn) => ({ today, sendsOn });
  const visit = { playbook_id: "pb1", run_for: "2026-09-21", audience: { trigger: "visit_tomorrow" } };
  const sentence = (d) =>
    `This run was made for ${d} and that day has passed: its people and its words were that day's. Skip it; the next run reads the calendar again.`;
  // The day has passed: runDayPassed's sentence, for every kind of run.
  assert.equal(
    C.runApprovalRefusal({ ...visit, run_for: "2026-09-20" }, day("2026-09-21", "2026-09-21")),
    sentence("2026-09-20"),
  );
  assert.equal(
    C.runApprovalRefusal({ playbook_id: "pb1", run_for: "2026-09-20" }, day("2026-09-21", "2026-09-21")),
    C.runDayPassed({ playbook_id: "pb1", run_for: "2026-09-20" }, "2026-09-21"),
  );
  // A visit's run that would go on a later day: the same sentence, about the day it was made for.
  assert.equal(C.runApprovalRefusal(visit, day("2026-09-21", "2026-09-22")), sentence("2026-09-21"));
  assert.equal(
    C.runApprovalRefusal({ ...visit, audience: { trigger: "visited" } }, day("2026-09-21", "2026-09-22")),
    sentence("2026-09-21"),
  );
  // Nothing else is refused: the day it was made for, another moment, a broadcast with no day, a run that kept no moment.
  assert.equal(C.runApprovalRefusal(visit, day("2026-09-21", "2026-09-21")), null);
  assert.equal(
    C.runApprovalRefusal({ ...visit, audience: { trigger: "quiet_30" } }, day("2026-09-21", "2026-09-22")),
    null,
  );
  assert.equal(
    C.runApprovalRefusal({ playbook_id: "pb1", run_for: "2026-09-21" }, day("2026-09-21", "2026-09-22")),
    null,
  );
  assert.equal(
    C.runApprovalRefusal(
      { playbook_id: null, run_for: null, audience: { trigger: "visit_tomorrow" } },
      day("2026-09-21", "2026-09-22"),
    ),
    null,
  );
});

test("the sheet offers the button exactly where the verb does not refuse, whatever the run: it asks runApprovalRefusal, the playbook_id guard included, and recomputes nothing", () => {
  const days = [
    { today: "2026-09-21", sendsOn: "2026-09-21" },
    { today: "2026-09-21", sendsOn: "2026-09-22" },
  ];
  for (const playbook_id of ["pb1", null]) {
    for (const run_for of ["2026-09-20", "2026-09-21", null]) {
      for (const audience of [{ trigger: "visit_tomorrow" }, { trigger: "visited" }, { trigger: "quiet_30" }, null]) {
        for (const d of days) {
          const broadcast = run({ playbook_id, run_for, audience });
          const refusal = C.runApprovalRefusal(broadcast, d);
          const vm = C.toApprovalVM(
            { broadcast, recipients: people },
            opts({ today: d.today, open: { time: "9:00", moved: d.sendsOn !== d.today, on: d.sendsOn } }),
          );
          const at = JSON.stringify({ playbook_id, run_for, audience, d });
          assert.equal(vm.approve === null, refusal !== null, at);
          assert.equal(vm.expired === null, refusal === null, at);
        }
      }
    }
  }
  // A run that is no playbook's has no day to pass: the verb does not refuse it, so the sheet offers it.
  const none = C.toApprovalVM(
    { broadcast: run({ playbook_id: null, run_for: "2026-09-01" }), recipients: people },
    opts(),
  );
  assert.equal(none.approve, "Approve — 3 now");
  assert.equal(none.expired, null);
});

test("a paused workspace is said instead of the button, in the words every campaign says it; before the day's own refusal, as approveRun refuses it first; not known paused says nothing", () => {
  const paused = C.toApprovalVM({ broadcast: run(), recipients: people }, opts({ paused: true }));
  assert.equal(paused.approve, null, "no button approveRun would answer 402 to");
  assert.equal(paused.expired, C.CAMPAIGNS_PAUSED_WORDS);
  assert.equal(paused.goes, "waits until billing resumes");
  // A paused workspace and a day gone: the pause is the verb's first refusal.
  const both = C.toApprovalVM(
    { broadcast: run({ run_for: "2026-09-20" }), recipients: people },
    opts({ paused: true }),
  );
  assert.equal(both.expired, C.CAMPAIGNS_PAUSED_WORDS);
  assert.equal(both.goes, "made for day 2026-09-20");
  // Not paused, and a readiness that was not read (Ask's card has none): the button is as it was.
  for (const was of [false, null]) {
    const vm = C.toApprovalVM({ broadcast: run(), recipients: people }, opts({ paused: was }));
    assert.equal(vm.approve, "Approve — 3 now", String(was));
    assert.equal(vm.expired, null, String(was));
  }
});

const kept = (over = {}) => ({
  pool: 312,
  will: 186,
  noNumber: 0,
  stopped: 0,
  noYes: 94,
  heardThis: 0,
  heardAny: 32,
  overCap: 0,
  overLimit: 0,
  ...over,
});
const counted = (reach, o = opts()) =>
  C.toApprovalVM(
    {
      broadcast: run({
        recipient_count: reach.will,
        audience: { kind: "playbook", id: "p1", label: "The month's offer", reach },
      }),
      recipients: people,
    },
    o,
  );

test("a run that kept who it left out says the board's card: 186 of 312, the waiting amber, and a line for each reason, the most first", () => {
  const vm = counted(kept());
  assert.equal(vm.will, 186);
  assert.equal(vm.of.pool, 312);
  assert.equal(vm.of.held, 32, "who waits only for time -- the bar's amber; the rest of the bar is grey");
  assert.deepEqual(
    vm.of.lines.map((l) => [l.words, l.tone]),
    [
      ["94 never said yes to offers", "plain"],
      ["32 heard from a playbook this week", "warn"],
    ],
  );
  // Of every reason, the one an owner can change carries its door (#663).
  assert.deepEqual(vm.of.lines[0].door, { words: "Get their yes", to: C.GET_YES_ROUTE });
  assert.equal(vm.of.lines[1].door, null);
  // A reminder's yes is to hearing from you, and one person is one person.
  const visit = counted(
    kept({ pool: 5, will: 3, noYes: 1, heardAny: 0, noNumber: 1 }),
    opts({ playbook: { trigger: "visit_tomorrow", cap_per_run: 25, gap_days: 90, cadence_days: 30 } }),
  );
  assert.deepEqual(
    visit.of.lines.map((l) => l.words),
    ["1 never said yes to hearing from you", "1 has no number on file"],
    "ties keep the rules' order",
  );
  // Every reason a run keeps has its words, the gap and the cap the playbook's own.
  const all = counted(
    kept({ pool: 20, will: 7, noYes: 0, heardAny: 0, noNumber: 2, stopped: 3, heardThis: 4, overCap: 1, overLimit: 3 }),
    opts({ playbook: { trigger: "quiet_30", cap_per_run: 8, gap_days: 90, cadence_days: 30 } }),
  );
  assert.deepEqual(
    all.of.lines.map((l) => l.words),
    [
      "4 heard from this playbook in the last 90 days",
      "3 asked you to stop",
      "3 are past what the number may start today",
      "2 have no number on file",
      "1 waits for the next run — 8 a run, the longest unheard first",
    ],
  );
  assert.equal(all.of.held, 7, "the playbook's gap and the number's day are waits; the cap is a turn, drawn grey");
});

test("the month's allowance: people it already holds are in the held line and out of the count -- approving reaches none of them", () => {
  // Core holds them at enrolment as skipped with month_allowance, on the channel each was to go by; the run's own count (will)
  // was made before, so it still includes them.
  const held = (n, channel) =>
    Array.from({ length: n }, (_, i) =>
      person(`held-${channel}-${i}`, `H${i}`, { state: "skipped", reason: "month_allowance", channel }),
    );
  const sent = [person("A", "A", { channel: "email" }), person("B", "B", { channel: "whatsapp" })];
  const reach = kept({
    pool: 20,
    will: 10,
    noYes: 6,
    heardAny: 2,
    overCap: 0,
    by_channel: { whatsapp: 4, sms: 0, email: 6 },
  });
  const vm = C.toApprovalVM(
    {
      broadcast: run({ recipient_count: 10, audience: { kind: "playbook", id: "p1", label: "Win-back", reach } }),
      recipients: [...sent, ...held(4, "email")],
    },
    opts(),
  );
  assert.equal(vm.will, 6, "ten enrolled, four held for the month: six will get it");
  assert.equal(vm.approve, "Approve — 6 now", "the act says six");
  assert.deepEqual(vm.byChannel, { whatsapp: 4, sms: 0, email: 2 }, "the four come off the channel they were to go by");
  assert.equal(vm.of.pool, 20);
  assert.equal(vm.of.held, 6, "the bar's amber holds the two who heard this week and the four the month holds");
  assert.deepEqual(
    vm.of.lines.map((l) => [l.words, l.tone]),
    [
      ["6 never said yes to offers", "plain"],
      ["4 held for this month's allowance", "warn"],
      ["2 heard from a playbook this week", "warn"],
    ],
    "one line for them, said in the contracts' words",
  );
  // Nobody held for it is the run as it was: the count, the act and the lines unchanged.
  const plain = C.toApprovalVM(
    {
      broadcast: run({ recipient_count: 10, audience: { kind: "playbook", id: "p1", label: "Win-back", reach } }),
      recipients: sent,
    },
    opts(),
  );
  assert.equal(plain.will, 10);
  assert.equal(plain.approve, "Approve — 10 now");
  assert.ok(!plain.of.lines.some((l) => /allowance/.test(l.words)));
  // A run that kept no count of who it left out still takes the held off its number, and has no line to say them in.
  const nocount = C.toApprovalVM(
    { broadcast: run({ recipient_count: 5 }), recipients: [...sent, ...held(2, "sms")] },
    opts(),
  );
  assert.deepEqual([nocount.will, nocount.of, nocount.byChannel], [3, null, null]);
  // A person skipped for another reason is not the allowance's.
  const other = C.toApprovalVM(
    {
      broadcast: run({ recipient_count: 3 }),
      recipients: [person("X", "X", { state: "skipped", reason: "opted_out" })],
    },
    opts(),
  );
  assert.equal(other.will, 3);
});

test("a run's reasons name everyone it counted and left out: no address, an address that stopped and no channel each have their line, one person or many", () => {
  // The run counted them (playbookRunReach) and the sheet said none of the three: the bar was shorter than the list.
  const lines = (over) =>
    counted(kept({ pool: 40, will: 20, noYes: 0, heardAny: 0, ...over })).of.lines.map((l) => [
      l.words,
      l.tone,
      l.door,
    ]);
  assert.deepEqual(lines({ no_address: 5, address_stopped: 3, no_channel: 2 }), [
    ["5 have no email address on file", "plain", null],
    ["3 have an email address mail no longer goes to", "plain", null],
    ["2 have no channel this message can go by here", "plain", null],
  ]);
  assert.deepEqual(
    lines({ no_address: 1, address_stopped: 1, no_channel: 1 }).map(([words]) => words),
    [
      "1 has no email address on file",
      "1 has an email address mail no longer goes to",
      "1 has no channel this message can go by here",
    ],
  );
  // A bounced address is said as itself, never as "no email address on file": that is the other fact.
  assert.ok(!lines({ address_stopped: 3 }).some(([words]) => /no email address/.test(words)));
  // Nothing counted, nothing said: a run counted before runs kept the three has no line for them.
  assert.deepEqual(lines({}), []);
  // They are not time's (the amber), so they do not move the bar's held.
  assert.equal(
    counted(kept({ pool: 40, will: 20, noYes: 0, heardAny: 0, no_address: 5, address_stopped: 3, no_channel: 2 })).of
      .held,
    0,
  );
  // And they sort with the rest, the most first.
  assert.equal(lines({ noYes: 9, no_address: 5, heardAny: 0 })[0][0], "9 never said yes to offers");
});

test("the run's rules say what each person was asked on the channel they are reached on: a yes for WhatsApp and a text, not for an email about a visit, a yes or a relationship for an offer by email", () => {
  const runBy = (by_channel, trigger, will = 10) =>
    counted(
      kept({ pool: 20, will, noYes: 0, heardAny: 0, by_channel }),
      opts({ playbook: { trigger, cap_per_run: 25, gap_days: 90, cadence_days: 30 } }),
    ).rules;
  // WhatsApp alone, or no count of channels: the sentence every run said.
  assert.equal(runBy({ whatsapp: 10, sms: 0, email: 0 }, "everyone_monthly")[0], "each said yes to offers");
  assert.equal(runBy({ whatsapp: 10, sms: 0, email: 0 }, "visit_tomorrow")[0], "each said yes to hearing from you");
  // An offer on WhatsApp and by email: two lines, each true of the people it names, and the moment's own rules after them.
  assert.deepEqual(runBy({ whatsapp: 6, sms: 0, email: 4 }, "everyone_monthly"), [
    "each reached on WhatsApp said yes to offers",
    "each reached by email asked for offers by email, or has dealt with you",
    "none heard from this playbook in 30 days",
    "none heard from any playbook this week",
  ]);
  // An offer by email alone is not "said yes to offers": a relationship on record is enough.
  assert.equal(
    runBy({ whatsapp: 0, sms: 0, email: 10 }, "everyone_monthly")[0],
    "each asked for offers by email, or has dealt with you",
  );
  // A message about a visit goes by WhatsApp and email: an email about a visit asks no yes at all (consent.ts), and the sheet no
  // longer says they each said one. What it says of an email is what the one predicate asks, so it holds when that moves.
  const visit = runBy({ whatsapp: 6, sms: 0, email: 4 }, "visit_tomorrow");
  assert.equal(visit[0], "each reached on WhatsApp said yes to hearing from you");
  assert.ok(
    C.yesAsked("email", "conversational", "theirs") === "none"
      ? visit[1] === "each reached by email has an email address that works"
      : /^each reached by email said yes to hearing from you by email/.test(visit[1]),
    visit[1],
  );
  assert.equal(visit[2], "each has a visit tomorrow on the calendar");
  // A run that kept no count of channels is a WhatsApp run.
  assert.equal(C.toApprovalVM({ broadcast: run(), recipients: people }, opts()).rules[0], "each said yes to offers");
});

test("the reader's channel is their row's own, WhatsApp where the run kept none: the sheet draws the words of the version they read", () => {
  const on = (over) => [
    person("+1 (917) 555-0142", null, over),
    person("Priya Nair", "Priya", over),
    person("Tom Baker", "Tom"),
  ];
  // The reader is the first person with a name: their channel, not the first row's.
  const mixed = [
    person("+1 (917) 555-0142", null, { channel: "sms" }),
    person("Priya Nair", "Priya", { channel: "email" }),
    person("Tom Baker", "Tom", { channel: "whatsapp" }),
  ];
  const vm = C.toApprovalVM({ broadcast: run(), recipients: mixed }, opts());
  assert.equal(vm.reader, "Priya Nair");
  assert.equal(vm.readerChannel, "email");
  assert.equal(C.toApprovalVM({ broadcast: run(), recipients: on({ channel: "sms" }) }, opts()).readerChannel, "sms");
  // A run made before channels were kept, an unknown word, or nobody on it: WhatsApp.
  for (const channel of [undefined, null, "carrier pigeon"])
    assert.equal(C.toApprovalVM({ broadcast: run(), recipients: on({ channel }) }, opts()).readerChannel, "whatsapp");
  assert.equal(C.toApprovalVM({ broadcast: run(), recipients: [] }, opts()).readerChannel, "whatsapp");
});
