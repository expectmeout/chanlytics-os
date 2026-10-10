/**
 * A playbook changed in place (the moment spec §4.9 A5): the bounds of its whole numbers said once (contracts
 * PLAYBOOK_LIMITS, read by a new playbook's check and a change's), the six things a change may name, and the words a change
 * card says. Then (Task 2) core checkPlaybookPatch, the one judgement Ask's change card and PUT playbooks/:id both run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAYBOOK_HOURS,
  PLAYBOOK_LIMITS,
  PLAYBOOK_NAME_MAX,
  PLAYBOOK_PATCH_KEYS,
  PLAYBOOK_PATCH_WORDS,
} from "@chanlytics/contracts";

test("the bounds a playbook's whole numbers keep are said once: the hour the sending hours', a cap of 1 to 500, a gap of 7 to 365 days, a cadence of 1 to 90", () => {
  assert.deepEqual(PLAYBOOK_LIMITS, {
    run_hour: { min: PLAYBOOK_HOURS.min, max: PLAYBOOK_HOURS.max, what: "The hour" },
    cap_per_run: { min: 1, max: 500, what: "The cap" },
    gap_days: { min: 7, max: 365, what: "The gap" },
    cadence_days: { min: 1, max: 90, what: "The cadence" },
  });
  assert.equal(PLAYBOOK_NAME_MAX, 80);
});

test("a change names any of six things, in the order a card says them, and says each in the product's words", () => {
  assert.deepEqual([...PLAYBOOK_PATCH_KEYS], ["state", "name", "run_hour", "cap_per_run", "gap_days", "cadence_days"]);
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
