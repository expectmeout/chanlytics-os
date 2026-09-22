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
  run_for: "2026-09-21",
  params: [{ kind: "text", value: "This month at" }, { kind: "business_name" }, { kind: "first_name" }],
  ...over,
});
const opts = (over = {}) => ({
  playbook: { trigger: "everyone_monthly", cap_per_run: 250, gap_days: 90, cadence_days: 30 },
  businessName: "Melany Studio",
  today: "2026-09-21",
  open: { time: "10:00", moved: false },
  day: (ymd) => `day ${ymd}`,
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
  assert.deepEqual(vm.values, ["This month at", "Melany Studio", "Priya"]);
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
    opts({ open: { time: "9:00", moved: true } }),
  );
  assert.equal(late.approve, "Approve — 186 at 9:00");
  assert.equal(
    late.goes,
    "goes at 9:00 once you approve it",
    "after hours it waits for the morning, and says so before the press",
  );
  const expired = C.toApprovalVM({ broadcast: run({ run_for: "2026-09-20" }), recipients: people }, opts());
  assert.equal(expired.approve, null, "REGRESSION-IN-WAITING: a button approveRun refuses");
  assert.ok(expired.expired.startsWith("Made for day 2026-09-20, and that day has passed"), expired.expired);
  assert.equal(expired.goes, "made for day 2026-09-20");
  assert.equal(
    C.toApprovalVM({ broadcast: run(), recipients: people }, opts()).skip,
    "Skipping loses this run only — the playbook keeps running.",
  );
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
