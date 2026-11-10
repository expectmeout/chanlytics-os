/**
 * A late booking's reminder that waits for its owner (decision 0118). Its batch has no day of its own, since the day's
 * batch holds that key, so how late an approval may come is read from what its audience keeps: the day its words were
 * written for and its visit's start (contracts runApprovalRefusal, the one predicate the verb, the rows, the sheet and
 * the hourly sweep ask). Approved while that day's sending hours last and before the visit begins, it goes; past either
 * it can only be skipped, in one sentence, and its owner is told nothing later sends it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lateReminderSkippedNotice,
  runApprovalRefusal,
  runDaysAt,
  runTooLate,
  toApprovalVM,
  waitingRunOffer,
} from "@chanlytics/contracts";

/** Monday 9 November 2026 in New York is on standard time, five hours behind UTC. */
const TZ = "America/New_York";
const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const TOO_LATE =
  "It is too late for this reminder: approved now it would arrive on a later day than its words say, or after the appointment has begun. Skip it; nothing later sends it in its place.";

/** A late reminder's batch waiting for an OK, as the run kept it: no day, and its visit in its audience. */
const waiting = (start, day) => ({
  state: "pending_approval",
  playbook_id: "pb1",
  run_for: null,
  audience: {
    kind: "playbook",
    id: "pb1",
    label: "Appointment reminder",
    trigger: "visit_tomorrow",
    late: { appointment: APPT, start, day },
  },
});
/** Booked Monday afternoon for Tuesday at 9:00 AM: its words are Monday's, "tomorrow at 9:00 AM". */
const EVENING = waiting("2026-11-10T14:00:00.000Z", "2026-11-09");
/** Booked Monday night for Tuesday at 2:00 PM: its words are Tuesday's, "today at 2:00 PM". */
const MORNING = waiting("2026-11-10T19:00:00.000Z", "2026-11-10");
const daysAt = (iso) => runDaysAt(TZ, new Date(iso));

test("approved while the day its words name still sends, it goes", () => {
  // Monday at 4:00 PM, and at 8:59 PM, the last minute of the sending hours.
  for (const now of ["2026-11-09T21:00:00Z", "2026-11-10T01:59:00Z"]) {
    assert.equal(runApprovalRefusal(EVENING, daysAt(now)), null, now);
    assert.equal(runTooLate(EVENING, daysAt(now)), false, now);
  }
  assert.deepEqual(waitingRunOffer(EVENING, daysAt("2026-11-09T21:00:00Z"), { paused: false, known: true }), {
    kind: "approve",
  });
});

test("approved after that day's sending hours it would say tomorrow on the morning of the visit: it can only be skipped", () => {
  // Monday at 9:30 PM: an approval now goes at nine on Tuesday.
  const days = daysAt("2026-11-10T02:30:00Z");
  assert.equal(runApprovalRefusal(EVENING, days), TOO_LATE);
  assert.equal(runTooLate(EVENING, days), true, "the hourly sweep ends it");
  assert.deepEqual(waitingRunOffer(EVENING, days, { paused: false, known: true }), { kind: "skip", why: TOO_LATE });
});

test("a reminder for the morning of the visit goes until the appointment begins, and never after", () => {
  // Monday at 11:00 PM it goes at nine, saying today; Tuesday at 1:59 PM it still goes.
  for (const now of ["2026-11-10T04:00:00Z", "2026-11-10T18:59:00Z"])
    assert.equal(runApprovalRefusal(MORNING, daysAt(now)), null, now);
  // Tuesday at 2:00 PM the appointment has begun; Wednesday its day is gone as well.
  for (const now of ["2026-11-10T19:00:00Z", "2026-11-11T15:00:00Z"])
    assert.equal(runApprovalRefusal(MORNING, daysAt(now)), TOO_LATE, now);
});

test("its sheet offers no button the verb refuses, and says the day its words were written for", () => {
  const vm = toApprovalVM(
    {
      broadcast: { recipient_count: 1, playbook_id: "pb1", run_for: null, params: [], audience: EVENING.audience },
      recipients: [{ contact_id: "a", name: "Nina Patel", first_name: "Nina", state: "queued" }],
    },
    {
      playbook: { trigger: "visit_tomorrow", cap_per_run: 25, gap_days: 90, cadence_days: 30, word: "visit" },
      businessName: "Elm Street Studio",
      today: "2026-11-09",
      // Monday at 9:30 PM: an approval would go at nine on Tuesday.
      open: { time: "9:00", moved: true, on: "2026-11-10" },
      day: (ymd) => `day ${ymd}`,
      paused: false,
    },
  );
  assert.equal(vm.approve, null);
  assert.equal(vm.expired, TOO_LATE);
  assert.equal(vm.goes, "made for day 2026-11-09");
});

test("skipped by the sweep, its owner is told it did not reach them and that nothing later sends it", () => {
  assert.deepEqual(lateReminderSkippedNotice("Appointment reminder", 1), {
    subject: "“Appointment reminder” didn’t go: nobody approved it",
    body: "1 person booked after the day’s reminders went, and the reminder made for them waited for your OK until it was too late to send: it did not reach them, and no later batch sends it in its place. Open it to see who, and write to them yourself. The next “Appointment reminder” waits for your OK too: its batches wait until you approve one, and every one waits while “Before each batch” in its How it runs says to ask.",
  });
});
