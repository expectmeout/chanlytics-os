/**
 * One standing per thread, wherever it is shown. The Inbox, People and Today
 * all read standingOf, so "needs you" is one number.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { standingOf, personStateFor, threadStanding } from "@chanlytics/contracts";
import { readCode } from "../_source.mjs";

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

test("the wiring: every surface reads the one function, and Today's queue is named for what it holds", () => {
  for (const [file, s] of [
    ["packages/contracts/src/conversations/inbox-thread.ts", /standingOf\(\s*\{/],
    ["packages/contracts/src/people/person-state.ts", /standingOf\(\s*\{/],
    ["packages/contracts/src/today/today-facts.ts", /standingOf\(\s*\{/],
  ])
    assert.ok(s.test(readCode(file)), `${file} reads standingOf`);
  // Today's view model, in the modules today.ts was split into.
  const today = [
    "metrics",
    "vm",
    "clock",
    "facts",
    "figures",
    "rows",
    "queue",
    "brief",
    "day",
    "period",
    "runs",
    "leaks",
    "away",
    "steps",
  ]
    .map((m) => readCode(`packages/contracts/src/today/today-${m}.ts`))
    .join("\n");
  assert.ok(
    !today.includes("live.escalations_open"),
    "Today no longer counts the SQL's open escalations — it counts the threads that need you",
  );
  const page = readCode("apps/dashboard/src/surfaces/today/pages/queue.tsx");
  assert.ok(
    page.includes('<span className="tq-title">Your queue</span>') && page.includes("vm.queue.parts"),
    "the queue says what it holds",
  );
  const brief = readCode("apps/dashboard/src/surfaces/today/pages/brief.tsx");
  assert.ok(
    !brief.includes('"Queue clear — nothing needs you"'),
    "the queue says it once: the line above the work said it too, over the queue that means it",
  );
});
