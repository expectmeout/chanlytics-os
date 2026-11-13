/**
 * The clock, some hours on: the launcher (tooling/scripts/checks/test.mjs) loads this before anything else in every
 * process of a run asked for with `TEST_CLOCK=+12h`, the test files and every process they start, since it rides
 * NODE_OPTIONS with the hours in its address. `Date` reads the machine's clock plus those hours and runs on from there;
 * a date built from a number or a string is that date, and a test that freezes the clock (node:test's mock timers)
 * freezes it where it says. Nothing else moves: timers, `performance`, a file's times and an `Intl` format asked for no
 * date keep the machine's.
 *
 * A test that reads the clock and holds only in some hours of the day passes or fails by when CI runs it. On 13 Nov
 * 2026 #2285's playbooks test passed in CI at 23:11 in New York, in the only four hours of the day it could, and was red
 * on main for the other twenty. CI runs a change's tests at its own clock and twelve hours on (ci.yml), so such a test
 * fails before it merges. Not a *.test.mjs, so the suite never globs it.
 */
const HOUR = 60 * 60 * 1000;
const hours = Number(new URL(import.meta.url).searchParams.get("hours") ?? 0);
/** Set once a process's clock has moved, so a second load moves it no further. */
const MOVED = Symbol.for("chanlytics.test-clock");

if (hours && !globalThis[MOVED]) {
  const Machine = globalThis.Date;
  const now = () => Machine.now() + hours * HOUR;
  /** `Date` as the run reads it: called with nothing, the clock some hours on; with a date, that date. */
  function MovedDate(...parts) {
    if (!new.target) return new Machine(now()).toString();
    return Reflect.construct(Machine, parts.length ? parts : [now()], new.target);
  }
  Object.setPrototypeOf(MovedDate, Machine);
  MovedDate.prototype = Machine.prototype;
  // Its own, not inherited: a sandbox that copies Date's own functions over (the edge runtime the sign-in gate's tests
  // run in) found no `parse` when they were only inherited.
  for (const name of Reflect.ownKeys(Machine))
    if (name !== "prototype") Object.defineProperty(MovedDate, name, Object.getOwnPropertyDescriptor(Machine, name));
  MovedDate.now = now;
  globalThis.Date = MovedDate;
  globalThis[MOVED] = hours;
}
