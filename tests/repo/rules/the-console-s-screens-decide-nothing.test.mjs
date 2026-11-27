/**
 * The Console's screens decide nothing (decision 0066): every verdict, word and row they draw comes from the contract
 * (contracts workspace/platform.ts and console/), read through the bridge's verbs, so a screen and the server can never
 * judge a workspace two ways. A rule of the code's shape, held over the screens' source: what is checked is an
 * absence (a sort, a clock, a state judgement, a money figure of a screen's own), which no run of a screen can show.
 * Moved here from console/back-office/office/ on 26 Nov 2026 (lane 4, area c): it is a rule of the repository, not one
 * module's behaviour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readCode } from "../../_source.mjs";

/** The Console's screens and rows, their source as one, whitespace folded. */
const CONSOLE_FILES = ["workspaces", "workspace", "home", "lines", "partner-rows", "waiting", "rows"];
const consoleSource = () =>
  CONSOLE_FILES.map((f) => readCode(`apps/dashboard/src/surfaces/console/${f}.tsx`))
    .join("\n")
    .replace(/\s+/g, " ");

test("the screens decide nothing: every verdict, word and row comes from the contract", () => {
  const src = consoleSource();
  for (const call of [
    "P.rows(tenants)",
    "P.summary(rows)",
    "verdictPill(row.verdict)",
    "P.steps({ ...setup, tz, later: [], rests: {} })",
    "P.number(line.e164)",
    "P.actions(line)",
    "P.warning(arm)",
    "consoleGroups(",
  ]) {
    assert.ok(src.includes(call), `the screen reads ${call} rather than deciding`);
  }
  // No thresholds, no state lists, no sorting of its own.
  assert.ok(!/\.sort\(/.test(src), "the contract sorts");
  assert.ok(!/86_?400_?000|14 \* DAY|\bDAY\b/.test(src), "no clocks of its own");
  assert.ok(!/needs_record|past_due|reg_mock === true/.test(src), "no state judgements of its own");
  assert.ok(!/\$\d/.test(src.replace(/\$\{/g, "")), "no money figure lives in a screen");
  // It borrows the row grammar rather than inventing one.
  assert.ok(src.includes("<AttnRow"), "the same row People, Today and Setup draw");
});
