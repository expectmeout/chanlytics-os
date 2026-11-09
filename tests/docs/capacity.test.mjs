/**
 * docs/capacity.md is what tooling/scripts/gen/capacity.mjs writes from the constants and the migrations' schedules
 * (decision 0115): a limit raised in the code changes the page, and a new clock arrives with its row.
 *
 *   corepack pnpm gen:capacity
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { CLOCKS } from "../clocks/_clocks.mjs";
import { CAPACITY, OUT, constantOf, generate, schedulesOf, ticksAnHour } from "../../tooling/scripts/gen/capacity.mjs";

test("the page is what the script writes", () => {
  const page = fs.readFileSync(path.join(ROOT, OUT), "utf8").split("\r\n").join("\n");
  const next = generate();
  if (page === next) return;
  const a = page.split("\n");
  const b = next.split("\n");
  let i = 0;
  while (a[i] === b[i]) i++;
  assert.fail(
    `${OUT} is stale at line ${i + 1}:\n  page       ${a[i] ?? "(end)"}\n  generated  ${b[i] ?? "(end)"}\n` +
      "Run `corepack pnpm gen:capacity`, and commit it.",
  );
});

test("every clock that does work has a row, and every row is a clock of the register", () => {
  const working = Object.entries(CLOCKS)
    .filter(([, c]) => !["keep", "roll"].includes(c.kind))
    .map(([name]) => name)
    .sort();
  assert.deepEqual(Object.keys(CAPACITY).sort(), working, "add the clock's row in tooling/scripts/gen/capacity.mjs");
});

test("each row says what bounds a tick, and what that comes to at the working figure", () => {
  const schedules = schedulesOf();
  for (const [clock, row] of Object.entries(CAPACITY)) {
    assert.ok(schedules.has(row.job), `${clock}: pg_cron holds no job ${row.job}`);
    assert.ok(row.atFull, `${clock}: says nothing of a full platform`);
    assert.notEqual(Boolean(row.cap), Boolean(row.bound), `${clock}: a constant or words, one of them`);
    if (row.cap) assert.ok(constantOf(row.cap[0], row.cap[1]) > 0, `${clock}: its constant`);
  }
});

test("the hand-out clocks have no ceiling of their own, and what bounds them is the ledger", () => {
  for (const clock of ["playbooks", "calendar", "google"]) assert.equal(CAPACITY[clock].cap, undefined, clock);
  assert.match(generate(), /\| jobs \| `\d+ seconds?` \| `CLAIM_SLOTS` = \d+ \|/);
});

test("a schedule's ticks an hour", () => {
  assert.equal(ticksAnHour("5 * * * *"), 1);
  assert.equal(ticksAnHour("*/5 * * * *"), 12);
  assert.equal(ticksAnHour("2-59/5 * * * *"), 12);
  assert.equal(ticksAnHour("8,23,38,53 * * * *"), 4);
  assert.equal(ticksAnHour("* * * * *"), 60);
  assert.equal(ticksAnHour("41 */6 * * *"), 1 / 6);
  assert.equal(ticksAnHour("23 6 * * *"), 1 / 24);
  assert.equal(ticksAnHour("2 seconds"), 1800);
  assert.throws(() => ticksAnHour("0 12 25 * *"), /by the day/);
});
