/**
 * What a sequence's head offers past its one act (decision 0060, contracts sequence-acts.ts), executed on rows as the
 * overview answers them: Run now only where its first step runs on the business's day and no batch waits for an OK, and
 * Turn on asked first, in the words a campaign's Resume asks (decision 7), from the record's first step and its reach (GET
 * sequences/:id/reach): when and to about how many, and that it sends on its own where its class does.
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
  words_ok_at: "2026-09-01T10:00:00.000Z",
  template_name: null,
  template_language: null,
  ...over,
});
const row = (over = {}) => ({
  name: "Thank you",
  starts: "moment",
  mode: "ask",
  first: first(),
  needs: needs(),
  ...over,
});

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

test("Turn on asks when it runs next and to about how many, says a sequence that sends on its own in full, and a first batch that waits", () => {
  const W = LIFECYCLE_WORDS.ledger.resume;
  // The record as GET sequences/:id answers it, and the reach GET sequences/:id/reach answers beside it.
  const rec = (over = {}, firstOver = {}) => ({
    sequence: row({ first: first({ state: "paused", ...firstOver }), ...over }),
    last_run_for: null,
  });
  const reach = (over = {}) => ({ candidates: 14, cap_per_run: null, paused: false, ...over });
  const at = { tz: TZ, nowMs: NOW };
  const asked = sequenceResumeAsk(rec(), reach(), at);
  assert.equal(asked.question, SEQUENCE_ACT_WORDS.resumeAsk("Thank you"));
  assert.equal(asked.detail, "Next run today 10:00 AM, about 14 people");
  assert.equal(asked.yes, SEQUENCE_ACT_WORDS.resumeYes);
  assert.equal(
    sequenceResumeAsk(rec({ mode: "auto" }), reach(), at).detail,
    `Next run today 10:00 AM, about 14 people. ${W.auto}`,
  );
  // Its words new to the owner (decision 0064): its next batch waits for an OK whatever the mode, and says so.
  assert.equal(
    sequenceResumeAsk(rec({ mode: "auto" }, { words_ok_at: null }), reach(), at).detail,
    `Next run today 10:00 AM, about 14 people. ${W.asksFirst}`,
  );
  // A run sends its cap and no more: "about" counts the next run's share, as the home's rows do.
  assert.equal(
    sequenceResumeAsk(rec({}, { trigger: "quiet_30" }), reach({ cap_per_run: 5 }), at).detail,
    "Next run today 10:00 AM, about 5 people",
  );
  // It ran today: its next run is tomorrow's, from the record's last_run_for.
  assert.match(sequenceResumeAsk({ ...rec(), last_run_for: "2026-10-15" }, reach(), at).detail, /^Next run tomorrow/);
  // A moment that could not be counted says when alone, never "about 0 people".
  assert.equal(sequenceResumeAsk(rec(), reach({ candidates: null }), at).detail, "Next run today 10:00 AM");
  // A workspace paused for billing says so instead of a time, as the home's rows do.
  assert.doesNotMatch(sequenceResumeAsk(rec(), reach({ paused: true }), at).detail, /10:00 AM/);
  // Unread, or none to read: the question alone, nothing guessed.
  assert.equal(sequenceResumeAsk(rec(), undefined, at).detail, null);
  assert.equal(sequenceResumeAsk(rec(), null, at).detail, null);
  // A sequence to leads says what a reach-out's Resume says, and reads no reach.
  assert.equal(sequenceResumeAsk(rec({ starts: "leads" }), undefined, at).detail, W.chain);
});
