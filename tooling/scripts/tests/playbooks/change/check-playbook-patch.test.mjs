/**
 * A playbook changed in place (the moment spec §4.9 A5): the bounds of its whole numbers said once (contracts
 * PLAYBOOK_LIMITS, read by a new playbook's check and a change's), the nine things a change may name, and the words a change
 * card says. Then core checkPlaybookPatch, the one judgement Ask's change card and PUT playbooks/:id both run;
 * playbookNumber, the one reading of a whole number a new playbook's check and a change's share; and checkPlaybookMoment,
 * what a new playbook names before its message, judged without reading the message (a starter card's first check).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAYBOOK_HOURS,
  PLAYBOOK_LIMITS,
  PLAYBOOK_NAME_MAX,
  PLAYBOOK_PATCH_KEYS,
  PLAYBOOK_PATCH_WORDS,
  REACH_OUT_IS_NOT_A_MOMENT,
} from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { checkPlaybookMoment, checkPlaybookPatch, playbookNumber } = await importSrc(
  "packages/core/src/campaigns/check-playbook.ts",
);

test("the bounds a playbook's whole numbers keep are said once: the hour the sending hours', a cap of 1 to 500, a gap of 7 to 365 days, a cadence of 1 to 90", () => {
  assert.deepEqual(PLAYBOOK_LIMITS, {
    run_hour: { min: PLAYBOOK_HOURS.min, max: PLAYBOOK_HOURS.max, what: "The hour" },
    cap_per_run: { min: 1, max: 500, what: "The cap" },
    gap_days: { min: 7, max: 365, what: "The gap" },
    cadence_days: { min: 1, max: 90, what: "The cadence" },
  });
  assert.equal(PLAYBOOK_NAME_MAX, 80);
});

test("a change names any of nine things, in the order a card says them, and says each of the six in the product's words (the three of 00416: playbook-change-words.test.mjs)", () => {
  assert.deepEqual(
    [...PLAYBOOK_PATCH_KEYS],
    ["state", "name", "run_hour", "cap_per_run", "gap_days", "cadence_days", "params", "until", "trial_until"],
  );
  const W = PLAYBOOK_PATCH_WORDS;
  assert.deepEqual(
    [
      W.title({ state: "paused" }, "Win-back"),
      W.title({ state: "running" }, "Win-back"),
      W.title({ name: "x" }, "Win-back"),
    ],
    ["Pause: Win-back", "Resume: Win-back", "Change: Win-back"],
  );
  assert.equal(W.name("Past clients"), "Renamed “Past clients”");
  assert.equal(W.run_hour(9, 10), "Runs at 9:00 AM by your clock, where it ran at 10:00 AM");
  assert.equal(W.cap_per_run(40, 25), "Up to 40 people a run, where it was 25");
  assert.equal(W.gap_days(60, 90), "Reaches a person again after 60 days, where it was 90");
  assert.equal(W.cadence_days(14, 30), "Every 14 days, where it was every 30");
  assert.equal(W.paused, "Nothing more runs until it is resumed");
  assert.equal(
    W.pausedWaits(12),
    "The run waiting for you (12 people) stays waiting: approve or skip it under Coming up",
  );
  assert.equal(
    W.pausedWaits(1),
    "The run waiting for you (1 person) stays waiting: approve or skip it under Coming up",
  );
  assert.equal(
    W.resumed("Re-engage", "ask", "each run waits for you on Today"),
    "Runs again under “Re-engage” (ask): each run waits for you on Today",
  );
  assert.equal(W.same("Win-back"), "“Win-back” already reads so: say so, and change nothing");
  // The state's refusal is the route's own sentence, moved here so core says it, in the product's word.
  assert.equal(W.state, "A campaign is running or paused.");
});

/** A playbook as the database holds it now: a win-back by silence, running at ten, 25 a run, a 90-day gap. */
const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Win-back",
  trigger: "quiet_30",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
};
/** Its list is live, or it runs on none: nothing keeps it paused. */
const LIVE = { archivedList: async () => null };
const refusedWith = (p, words) =>
  assert.rejects(p, (e) => {
    assert.equal(e.message, words);
    return true;
  });

test("one whole number by its field's bounds: none sent is the fallback, a number in range is itself, anything else is refused in the save's own sentence", () => {
  assert.equal(playbookNumber("run_hour", undefined, 10), 10);
  assert.equal(playbookNumber("run_hour", "", 10), 10);
  assert.equal(playbookNumber("run_hour", 9, 10), 9);
  assert.equal(playbookNumber("cap_per_run", "40", 25), 40, "a number written as words still counts");
  assert.throws(() => playbookNumber("run_hour", 7, 10), { message: "The hour must be a whole number from 9 to 20." });
  assert.throws(() => playbookNumber("cap_per_run", 9.5, 25), {
    message: "The cap must be a whole number from 1 to 500.",
  });
  assert.throws(() => playbookNumber("gap_days", 6, 90), { message: "The gap must be a whole number from 7 to 365." });
  assert.throws(() => playbookNumber("cadence_days", 91, 30), {
    message: "The cadence must be a whole number from 1 to 90.",
  });
});

test("a change judged against the playbook as it stands: only what differs is set, and what each set field held is kept for the undo", async () => {
  assert.deepEqual(await checkPlaybookPatch(LIVE, ROW, { state: "paused" }), {
    set: { state: "paused" },
    was: { state: "running" },
  });
  assert.deepEqual(await checkPlaybookPatch(LIVE, ROW, { name: "  Past   clients ", run_hour: 9, cap_per_run: 25 }), {
    set: { name: "Past clients", run_hour: 9 },
    was: { name: "Win-back", run_hour: 10 },
  });
  // Nothing that differs is nothing to write: the card refuses it in words, the route answers what it is.
  assert.deepEqual(await checkPlaybookPatch(LIVE, ROW, { state: "running", run_hour: 10 }), { set: {}, was: {} });
  // The month's offer, and only it, runs on a cadence.
  const offer = { ...ROW, name: "Monthly offer", trigger: "everyone_monthly" };
  assert.deepEqual(await checkPlaybookPatch(LIVE, offer, { cadence_days: 14 }), {
    set: { cadence_days: 14 },
    was: { cadence_days: 30 },
  });
  assert.deepEqual(await checkPlaybookPatch(LIVE, ROW, { gap_days: 60 }), {
    set: { gap_days: 60 },
    was: { gap_days: 90 },
  });
});

test("a change is refused in the product's words: nothing named, a field it does not know, a state it does not have, an empty name, a name past 80, a number out of bounds, a cadence off the month's offer", async () => {
  await refusedWith(checkPlaybookPatch(LIVE, ROW, {}), PLAYBOOK_PATCH_WORDS.nothing);
  await refusedWith(checkPlaybookPatch(LIVE, ROW, { trigger: "lapsed" }), PLAYBOOK_PATCH_WORDS.nothing);
  await refusedWith(checkPlaybookPatch(LIVE, ROW, { state: "sleeping" }), PLAYBOOK_PATCH_WORDS.state);
  await refusedWith(checkPlaybookPatch(LIVE, ROW, { name: "   " }), PLAYBOOK_PATCH_WORDS.nameMissing);
  await refusedWith(checkPlaybookPatch(LIVE, ROW, { name: "x".repeat(81) }), PLAYBOOK_PATCH_WORDS.nameLong(80));
  assert.deepEqual((await checkPlaybookPatch(LIVE, ROW, { name: "x".repeat(80) })).set, { name: "x".repeat(80) });
  await refusedWith(checkPlaybookPatch(LIVE, ROW, { run_hour: 21 }), "The hour must be a whole number from 9 to 20.");
  await refusedWith(checkPlaybookPatch(LIVE, ROW, { cadence_days: 14 }), PLAYBOOK_PATCH_WORDS.cadenceOffer("Win-back"));
});

test("a resume on an archived list is refused in the port's words, a pause there is not; a reach-out's step is paused or resumed and nothing else", async () => {
  const kept = "Its list, Regulars, is archived. Restore it on People, or move the campaign to another list.";
  const archived = { archivedList: async () => kept };
  const onList = { ...ROW, trigger: "saved_list", state: "paused" };
  await refusedWith(checkPlaybookPatch(archived, onList, { state: "running" }), kept);
  assert.deepEqual(
    (await checkPlaybookPatch(archived, { ...onList, state: "running" }, { state: "paused" })).set,
    { state: "paused" },
    "the port is asked only of a resume",
  );
  const step = { ...ROW, name: "Movers in Austin", trigger: "lead_first" };
  assert.deepEqual((await checkPlaybookPatch(LIVE, step, { state: "paused" })).set, { state: "paused" });
  await assert.rejects(checkPlaybookPatch(LIVE, step, { name: "Renamed" }), (e) => {
    assert.equal(e.message, REACH_OUT_IS_NOT_A_MOMENT);
    assert.equal(e.status, 409);
    return true;
  });
});

test("a new playbook's moment, list and class are judged before its message is read: a reach-out's step and a retired moment are refused, a list keeps the class it names, a moment its own", async () => {
  const LIST = "22222222-2222-4222-8222-222222222222";
  const ports = {
    listName: async (id) => (id === LIST ? "Regulars" : null),
    dealsOn: async () => false,
    calendarOn: async () => false,
    appointmentWord: async () => "appointment",
    message: async () => assert.fail("the message is never read before the moment is judged"),
  };
  await refusedWith(checkPlaybookMoment(ports, { trigger: "lead_first" }, null), REACH_OUT_IS_NOT_A_MOMENT);
  await assert.rejects(checkPlaybookMoment(ports, { trigger: "new_week" }, null), /answers a first contact itself/);
  await assert.rejects(checkPlaybookMoment(ports, { trigger: "nothing" }, null), /Pick what starts it/);
  const quiet = await checkPlaybookMoment(ports, { trigger: "quiet_30" }, null);
  assert.deepEqual(
    [quiet.trig.id, quiet.cls, quiet.listName, quiet.listKey, quiet.listId],
    ["quiet_30", "reengage", null, null, null],
  );
  const onList = await checkPlaybookMoment(
    ports,
    { trigger: "saved_list", list_id: LIST, policy_class: "reengage" },
    null,
  );
  assert.deepEqual(
    [onList.trig.id, onList.cls, onList.listName, onList.listKey, onList.listId],
    ["saved_list", "reengage", "Regulars", null, LIST],
  );
  // A moment kept as it was is not new: a retired moment's playbook may still be changed.
  assert.equal((await checkPlaybookMoment(ports, { trigger: "new_week" }, { trigger: "new_week" })).cls, "campaign");
});
