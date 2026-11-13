// Run by shared/the-suite-runs-in-one-zone.test.mjs through the launcher: the clock a run's tests, and the processes they
// start, see under TEST_CLOCK. Not a *.test.mjs, so the suite itself never globs it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const AHEAD = Number(process.env.EXPECT_AHEAD_MS);
/** The machine's own time, which no clock a test reads moves. */
const realNow = () => performance.timeOrigin + performance.now();
const near = (ms, reading, within = 5_000) =>
  assert.ok(Math.abs(ms - (realNow() + AHEAD)) < within, `${reading}: ${new Date(ms).toISOString()}`);

test("the clock the launcher set", (t) => {
  near(Date.now(), "Date.now()");
  near(new Date().getTime(), "new Date()");
  near(Date.parse(Date()), "Date() said as words");
  // A date built from a number or a string is that date.
  assert.equal(new Date(0).getTime(), 0);
  assert.equal(new Date("2026-11-13T04:11:54Z").toISOString(), "2026-11-13T04:11:54.000Z");
  assert.ok(new Date() instanceof Date);
  // A sandbox that copies Date's own functions over (the edge runtime the sign-in gate's tests run in) finds them all.
  const own = Object.fromEntries(Object.getOwnPropertyNames(Date).map((name) => [name, Date[name]]));
  assert.deepEqual([typeof own.parse, typeof own.UTC, typeof own.now], ["function", "function", "function"]);
  assert.equal(own.parse("2026-11-13T04:11:54Z"), Date.UTC(2026, 10, 13, 4, 11, 54));
  class Later extends Date {}
  assert.ok(new Later() instanceof Later);
  near(new Later().getTime(), "a subclass of Date");
  // A process the test starts reads the same clock.
  near(Number(execFileSync(process.execPath, ["-e", "console.log(Date.now())"], { encoding: "utf8" })), "a child");
  // A test that freezes the clock freezes it where it says, and lets go of it as it was.
  t.mock.timers.enable({ apis: ["Date"], now: 86_400_000 });
  assert.equal(Date.now(), 86_400_000);
  assert.equal(new Date().toISOString(), "1970-01-02T00:00:00.000Z");
  t.mock.timers.reset();
  near(Date.now(), "after the mock");
});
