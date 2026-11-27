/**
 * Setup says the owner's words, not ours: no tenant, onboarding, provisioning, SIP, E.164, webhook or toggle, and no
 * price it made up, in any string Setup's model or its rows hold. A rule of the repository, held over their source:
 * what is checked is an absence across every sentence they could draw, which no run of one state shows for the others.
 * Moved here from setup/setup.test.mjs on 26 Nov 2026 (lane 4, area c); the four state words themselves are run there.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readCode } from "../../_source.mjs";

const MODEL = [
  "packages/contracts/src/setup/setup.ts",
  "packages/contracts/src/setup/rows/steps.ts",
  "packages/contracts/src/setup/rows-phone.ts",
];
const ROWS = ["rows", "acts", "card-row", "line-chooser", "forwarding"];

test("Setup's words: no jargon, no trade, no invented price", () => {
  // Only what the owner can read: the string literals, not our identifiers.
  const src =
    MODEL.map((f) => readCode(f)).join("\n") +
    ROWS.map((f) => readCode(`apps/dashboard/src/surfaces/setup/rows/${f}.tsx`)).join("\n");
  const words = [...src.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]).join("\n");
  assert.ok(words.length > 1000, "the strings were found");
  assert.doesNotMatch(
    words,
    /\b(tenant|onboard|provision|SIP|E\.?164|webhook|toggle)\b/i,
    "the owner's words, not ours",
  );
  assert.doesNotMatch(words, /\$\d/, "no invented prices");
});
