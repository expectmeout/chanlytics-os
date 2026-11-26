/**
 * One predicate per rule (CLAUDE.md, "The rules"): standing is standingOf, and every surface that says who a thread or a
 * person is waiting on reaches it, never an answer of its own. A second implementation is a bug even when it agrees, so
 * no case run through the surfaces can hold this; reading where each reaches it is the rule. Moved here from
 * today/standing.test.mjs on 26 Nov 2026 (layer 14: a behaviour test's read that is a rule of the repository).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readCode } from "../_source.mjs";

test("every surface reads the one function: a thread's columns reach standingOf through standingOfThread, a People row's through it too", () => {
  for (const [file, s] of [
    ["packages/contracts/src/conversations/standing.ts", /standingOf\(\s*\{/],
    ["packages/contracts/src/conversations/inbox-thread/waits.ts", /standingOfThread\(/],
    ["packages/contracts/src/people/person-state.ts", /standingOf\(\s*\{/],
    ["packages/contracts/src/today/facts.ts", /standingOfThread\(/],
  ])
    assert.ok(s.test(readCode(file)), `${file} reads standingOf`);
});
