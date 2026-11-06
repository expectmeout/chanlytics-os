/**
 * The Sequences loop review's items 8 and 10 in contracts: a sequence that is on and whose last run did nothing says why,
 * as the record's one notice with the door that mends it (sequenceRunOff, sequenceNotice), after a batch waiting for an OK
 * and never for a sequence to leads, a one-off or one not on; an ended sequence sits in the list's Ended group, a paused
 * one in Paused; and Start's Change offers the gap to a moment over a group of people and the cadence to the month's offer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleSettingsOf, sequenceGroupOf, sequenceNotice } from "@chanlytics/contracts";

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-17T14:00:00Z");
const NONE = { waiting: 0, waiting_people: 0, held: 0, to_send: 0, replies: 0, oldest_at: null, batches: [] };
const row = (over = {}) => ({
  id: "q1",
  name: "Win back",
  starts: "moment",
  state: "on",
  created_at: "2026-09-18T12:00:00Z",
  first: { id: "q1", kind: "moment", trigger: "quiet_30", run_hour: 10, template_name: "come_back", list_name: null },
  date: null,
  steps: 2,
  channels: ["whatsapp"],
  needs: NONE,
  next: null,
  last: null,
  in_it: 4,
  ...over,
});
const off = (why, over = {}) =>
  sequenceNotice(row(over), [], null, { off: why, for: "2026-10-17", tz: TZ, nowMs: NOW });

test("a run that did nothing says why, with the door that mends it, until a run goes again", () => {
  const calendar = off("no_calendar");
  assert.equal(calendar.kind, "off");
  assert.equal(calendar.words, "Its last run (Oct 17) did nothing: no calendar is connected");
  assert.deepEqual(
    [calendar.line, calendar.fact, calendar.act],
    ["Its last run did nothing", "No calendar is connected", "Connect"],
  );
  assert.equal(calendar.off.mends, "door");
  assert.ok(calendar.off.to, "a door to the channels");
  assert.equal(off("template_not_approved").off.to, "campaigns/messages/come_back", "its message in Messages");
  assert.deepEqual([off("no_list").act, off("no_list").off.mends], [null, null], "said, with nothing a door mends");
  const ended = off("ended");
  assert.deepEqual(
    [ended.words, ended.act, ended.off.mends],
    ["Its last day has passed: it sends nothing more", "End it", "end"],
  );
});

test("nothing is said where it ran, found nobody, is not on, sends to leads, or is a one-off; a batch waiting comes first", () => {
  assert.equal(off(null), null, "the last run went");
  assert.equal(off("already_ran_today"), null, "no reason it says");
  // A class set to Never no longer stops a sequence (decision 0064: one that should not send is paused): an old run's
  // reason says nothing.
  assert.equal(off("never"), null, "a reason no run records any more");
  assert.equal(off("no_calendar", { state: "paused" }), null);
  assert.equal(off("no_calendar", { starts: "leads" }), null);
  assert.equal(off("no_calendar", { starts: "date" }), null);
  const waits = {
    needs: {
      ...NONE,
      waiting: 1,
      batches: [
        {
          id: "b1",
          step_id: "q1",
          run_for: "2026-10-17",
          at: "",
          people: 2,
          audience: { kind: "playbook", trigger: "quiet_30" },
        },
      ],
    },
  };
  assert.equal(off("no_calendar", waits).kind, "waiting");
  assert.equal(sequenceNotice(row(), []), null, "a record that reads no last run says none");
});

test("an ended sequence sits under Ended, folded at the list's foot; a paused one under Paused", () => {
  assert.equal(sequenceGroupOf(row({ state: "ended" })), "ended");
  assert.equal(sequenceGroupOf(row({ state: "paused" })), "off");
  assert.equal(
    sequenceGroupOf(row({ state: "ended", starts: "date" })),
    "dates",
    "a one-off that went stays among the Dates",
  );
});

test("Start's Change offers the gap to a moment over a group of people, the cadence to the month's offer, neither else", () => {
  assert.deepEqual(scheduleSettingsOf(row()), { gap: true, every: false, freed: false });
  assert.deepEqual(scheduleSettingsOf(row({ first: { ...row().first, trigger: "everyone_monthly" } })), {
    gap: false,
    every: true,
    freed: false,
  });
  assert.deepEqual(scheduleSettingsOf(row({ first: { ...row().first, trigger: "visit_tomorrow" } })), {
    gap: false,
    every: false,
    freed: false,
  });
  assert.deepEqual(scheduleSettingsOf(row({ first: { ...row().first, trigger: "saved_list" } })), {
    gap: false,
    every: false,
    freed: false,
  });
  assert.deepEqual(scheduleSettingsOf(row({ first: null })), { gap: false, every: false, freed: false });
});
