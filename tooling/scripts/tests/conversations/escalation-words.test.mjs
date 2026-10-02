/**
 * One vocabulary for why the receptionist stopped: the label a row says, the clause a chip says and the sentence
 * the operator reads first are three forms of ONE closed set, declared beside each other. Reports said "Flagged by
 * you" and "Memory was unavailable" where the Inbox said "Flagged manually" and "The receptionist could not read
 * this thread" (the 2 Oct 2026 audit): two maps, two vocabularies, one set.
 * Run: node tooling/scripts/checks/test.mjs tooling/scripts/tests/conversations/escalation-words.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESCALATION_REASON_LABELS,
  ESCALATION_REASON_SHORT,
  ESCALATION_SUMMARIES,
  reasonShort,
  SCHEMA_SETS,
} from "@chanlytics/contracts";

test("every stored reason has a label, a clause and a summary, and nothing else does", () => {
  const stored = [...SCHEMA_SETS["escalations.reason"]].sort();
  for (const [name, map] of [
    ["labels", ESCALATION_REASON_LABELS],
    ["clauses", ESCALATION_REASON_SHORT],
    ["summaries", ESCALATION_SUMMARIES],
  ]) {
    assert.deepEqual(Object.keys(map).sort(), stored, `${name} must cover the closed set exactly`);
  }
});

test("the clause is the label's own words, not a second vocabulary", () => {
  assert.equal(reasonShort("manual"), "flagged by hand");
  assert.equal(reasonShort("state_unavailable"), "the receptionist could not read this thread");
  assert.equal(reasonShort("person_hold"), "you handle this person");
  assert.equal(reasonShort("deadman"), "nobody picked this up");
  assert.equal(reasonShort("human_token"), "asked for a person");
  // An unknown reason reads as its own words, never as nothing.
  assert.equal(reasonShort("nonsense_reason"), "nonsense reason");
  assert.equal(reasonShort(null), "");
});

test("no clause starts with a capital or ends with a stop: it sits after 'Escalated ·' and inside a sentence", () => {
  for (const [reason, clause] of Object.entries(ESCALATION_REASON_SHORT)) {
    assert.match(clause, /^[a-z]/, `${reason}: "${clause}"`);
    assert.doesNotMatch(clause, /[.!]$/, `${reason}: "${clause}"`);
  }
});
