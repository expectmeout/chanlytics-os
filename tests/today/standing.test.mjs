/**
 * One standing per thread, wherever it is shown. The Inbox, People and Today
 * all read standingOf, so "needs you" is one number.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { standingOf, personStateFor, threadStanding } from "@chanlytics/contracts";

const NOW = Date.parse("2026-09-06T20:00:00Z");
const H = 3_600_000;
const later = new Date(NOW + 20 * H).toISOString();
const earlier = new Date(NOW - 2 * H).toISOString();
const at = (over = {}) =>
  standingOf({ state: "open", paused_until: null, assignee_user_id: null, open_escalation: false, ...over }, NOW);

test("the truth table", () => {
  assert.equal(at().standing, "quiet", "nothing open");
  assert.equal(at({ open_escalation: true }).standing, "needs_you", "an open escalation and nobody on it");
  assert.equal(
    at({ open_escalation: true, paused_until: later }).standing,
    "needs_you",
    "the receptionist's own pause on a handoff is not a person",
  );
  assert.equal(at({ state: "needs_human" }).standing, "needs_you", "needs_human with nobody on it");
  assert.equal(at({ open_escalation: true, assignee_user_id: "u1" }).standing, "yours", "you took it");
  assert.equal(at({ open_escalation: true, assignee_user_id: "u1", assignee_is_me: true }).standing, "yours");
  assert.equal(
    at({ open_escalation: true, assignee_user_id: "u2", assignee_is_me: false }).standing,
    "theirs",
    "a teammate took it",
  );
  assert.equal(
    at({ paused_until: later }).standing,
    "yours",
    "a pause with nothing open is the one your reply left behind",
  );
  assert.equal(at({ paused_until: earlier }).standing, "quiet", "an expired pause is nothing");
  assert.equal(
    at({ state: "snoozed", open_escalation: true }).standing,
    "snoozed",
    "snoozed wins, and the request waits with it",
  );
  const v = at({ open_escalation: true, paused_until: later });
  assert.deepEqual([v.flagged, v.paused, v.takenOver, v.claimedByOther], [true, true, false, false]);
});

test("the three surfaces agree on the filler's cases", () => {
  // Daniela: handoff, receptionist paused, nobody assigned → needs you everywhere.
  const inbox = threadStanding(
    {
      id: "c",
      state: "needs_human",
      paused_until: later,
      assignee_user_id: null,
      contacts: null,
      messages: [],
      last_wa_inbound_at: null,
      last_message_at: null,
    },
    { id: "e", reason: "policy_block", state: "open", created_at: earlier, details: null },
    new Date(NOW),
  );
  assert.deepEqual([inbox.state, inbox.takenOver, inbox.needsYou], ["escalated", false, true]);
  const person = {
    needs_human: true,
    open_escalation_reason: "policy_block",
    latest_state: "needs_human",
    latest_paused_until: later,
    latest_assignee_user_id: null,
    last_message_direction: "inbound",
    consent: "unknown",
    dnc: false,
    first_contact_at: null,
    has_backfill: false,
    last_message_at: earlier,
    last_call_at: null,
    latest_snooze_until: null,
  };
  assert.equal(personStateFor(person, NOW, "UTC"), "needs_you");
  // Marcus: you replied, the receptionist paused, they wrote last → yours / waiting on you.
  const mine = threadStanding(
    {
      id: "c",
      state: "open",
      paused_until: later,
      assignee_user_id: "me",
      assignee_is_me: true,
      contacts: null,
      messages: [],
      last_wa_inbound_at: null,
      last_message_at: null,
    },
    null,
    new Date(NOW),
  );
  assert.deepEqual([mine.state, mine.takenOver, mine.needsYou], ["escalated", true, false]);
  assert.equal(
    personStateFor(
      {
        ...person,
        needs_human: false,
        open_escalation_reason: null,
        latest_state: "open",
        latest_assignee_user_id: "me",
      },
      NOW,
      "UTC",
      "me",
    ),
    "waiting_on_you",
  );
});

// Every surface reads the one function: a rule of the repository (one predicate per rule), held in
// tests/repo/standing-is-one-predicate.test.mjs since 26 Nov 2026. Today counts the threads that need you, never the
// SQL's open escalations: run over its view model in today-vm.test.mjs. The queue is named for what it holds, a list
// under the card with what is past its lines counted in one line: drawn in today/page/ ("today-queue", "today-also"),
// and the band above the work says nothing while nothing cannot wait (today-day.test.mjs, "the hero says nothing").
