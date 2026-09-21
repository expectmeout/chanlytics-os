/**
 * The Business tab's own view models, as pure functions: a fact's tone, how far a rule goes,
 * the standing line's three clauses, the ability rows and the prompt's blocks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf, SOURCE_WORDS } from "@chanlytics/contracts";

test("a fact's source carries a tone and the words facts.ts already wrote", () => {
  assert.equal(stateOf("fact", "verified").tone, "ok");
  assert.equal(stateOf("fact", "provisioned").tone, "ok");
  assert.equal(stateOf("fact", "typed").tone, "plain");
  assert.equal(stateOf("fact", "workspace").tone, "plain");
  assert.equal(stateOf("fact", "absent").tone, "plain");
  assert.equal(stateOf("fact", "disputed").tone, "warn");
  // One copy of the words: the pill reads facts.ts, it does not restate it.
  assert.equal(stateOf("fact", "verified").label, SOURCE_WORDS.verified);
  assert.equal(stateOf("fact", "provisioned").label, SOURCE_WORDS.provisioned);
  assert.equal(stateOf("fact", "disputed").label, "doesn't match");
});
