/**
 * What a sequence's head offers past its one act (decision 0060, contracts sequence-acts.ts), executed on rows as the
 * overview answers them: Run now only where its first step runs on the business's day and no batch waits for an OK, and
 * Turn on asked first, in the words a campaign's Resume asks (decision 7), from the playbooks surface's row of its first
 * step: when and to about how many, and that it sends on its own where its class does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIFECYCLE_WORDS, SEQUENCE_ACT_WORDS, sequenceResumeAsk, sequenceRunsNow } from "@chanlytics/contracts";

const TZ = "America/New_York";
// 9:00 AM in New York, before a 10 o'clock run.
const NOW = Date.parse("2026-10-15T13:00:00Z");
const needs = (waiting = 0) => ({
  waiting,
  waiting_people: 0,
  held: 0,
  to_send: 0,
  replies: 0,
  oldest_at: null,
  batches: [],
});
const first = (over = {}) => ({
  id: "p1",
  kind: "moment",
  trigger: "visited",
  state: "running",
  policy_class: "visit_followup",
  run_hour: 10,
  list_id: null,
  list_key: null,
  list_name: null,
  search_id: null,
  search_name: null,
  owner_sends: false,
  until: null,
  trial_until: null,
  template_name: null,
  template_language: null,
  ...over,
});
const row = (over = {}) => ({ name: "Thank you", starts: "moment", first: first(), needs: needs(), ...over });

test("Run now is offered while the first step runs on the business's day, and never over a batch that waits", () => {
  const at = { tz: TZ, nowMs: NOW };
  assert.equal(sequenceRunsNow(row(), at), true);
  assert.equal(sequenceRunsNow(row({ starts: "list" }), at), true);
  assert.equal(sequenceRunsNow(row({ first: first({ state: "paused" }) }), at), false, "paused runs nothing");
  assert.equal(sequenceRunsNow(row({ first: first({ until: "2026-10-01" }) }), at), false, "past its last day");
  assert.equal(sequenceRunsNow(row({ needs: needs(1) }), at), false, "the notice holds the batch that waits");
  assert.equal(sequenceRunsNow(row({ starts: "leads" }), at), false, "a reach-out runs on its own day");
  assert.equal(sequenceRunsNow(row({ starts: "date", first: null }), at), false);
});

test("Turn on asks when it runs next and to about how many, and says an auto class in full", () => {
  const W = LIFECYCLE_WORDS.ledger.resume;
  const pb = {
    id: "p1",
    name: "Thank you",
    trigger: "visited",
    state: "paused",
    run_hour: 10,
    cadence_days: 1,
    cap_per_run: null,
    last_run_for: null,
    next: "paused",
    triggerLabel: "",
    candidates: 14,
    held: null,
    named: null,
    off: null,
    totals: { waiting: null },
  };
  const surface = (rows, ready = null) => ({ rows, pools: {}, triggers: [], timezone: TZ, countsRead: true, ready });
  const at = { tz: TZ, nowMs: NOW, mode: "ask" };
  const asked = sequenceResumeAsk(row(), surface([pb]), at);
  assert.equal(asked.question, SEQUENCE_ACT_WORDS.resumeAsk("Thank you"));
  assert.equal(asked.detail, "Next run today 10:00 AM, about 14 people");
  assert.equal(asked.yes, SEQUENCE_ACT_WORDS.resumeYes);
  assert.equal(
    sequenceResumeAsk(row(), surface([pb]), { ...at, mode: "auto" }).detail,
    `Next run today 10:00 AM, about 14 people. ${W.auto}`,
  );
  // On trial, an auto class's run still waits for a person: it is not said to send on its own.
  assert.doesNotMatch(
    sequenceResumeAsk(row(), surface([{ ...pb, trial: "Oct 20" }]), { ...at, mode: "auto" }).detail,
    /on its own/,
  );
  assert.equal(sequenceResumeAsk(row(), surface([{ ...pb, candidates: null }]), at).detail, "Next run today 10:00 AM");
  // A workspace paused for billing says so instead of a time, as the home's rows do.
  assert.doesNotMatch(sequenceResumeAsk(row(), surface([pb], { paused: true }), at).detail, /10:00 AM/);
  // Unread, or a surface that holds no row of it: the question alone, nothing guessed.
  assert.equal(sequenceResumeAsk(row(), undefined, at).detail, null);
  assert.equal(sequenceResumeAsk(row(), surface([{ ...pb, id: "p2" }]), at).detail, null);
  // A sequence to leads says what a reach-out's Resume says.
  assert.equal(sequenceResumeAsk(row({ starts: "leads" }), undefined, at).detail, W.chain);
});
