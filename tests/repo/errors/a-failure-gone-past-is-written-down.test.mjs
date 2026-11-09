/**
 * Going on past a failure writes it down (decision 0114). `.catch(() => null)` made a failed read look the same as
 * "nothing there", and a failed write the same as done, with no line anywhere. And a new error keeps the one it replaces.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { logAndGoOn, logKeptGoing } from "@chanlytics/log";
import { AppError, causedBy } from "@chanlytics/contracts";

/** The lines written while `fn` ran, parsed. */
async function linesOf(fn) {
  const lines = [];
  const real = console.warn;
  console.warn = (text) => lines.push(JSON.parse(text));
  try {
    return { out: await fn(), lines };
  } finally {
    console.warn = real;
  }
}

test("logAndGoOn answers its fallback and writes one line: what was being done, and what went wrong", async () => {
  const { out, lines } = await linesOf(() =>
    Promise.reject(new Error("connection reset")).catch(logAndGoOn("getMailboxCapacity", null)),
  );
  assert.equal(out, null);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].level, "warn");
  assert.equal(lines[0].event, "kept_going");
  assert.equal(lines[0].what, "getMailboxCapacity");
  assert.equal(lines[0].error, "Error: connection reset");
});

test("with no fallback it answers undefined, and a promise that held says nothing", async () => {
  const failed = await linesOf(() => Promise.reject(new Error("no")).catch(logAndGoOn("event billing.paid")));
  assert.equal(failed.out, undefined);
  assert.equal(failed.lines[0].what, "event billing.paid");
  const held = await linesOf(() => Promise.resolve(7).catch(logAndGoOn("a read", null)));
  assert.equal(held.out, 7);
  assert.deepEqual(held.lines, []);
});

test("it takes the place of a promise's failure handler alone: what the success handler throws still goes up", async () => {
  await assert.rejects(
    Promise.resolve(1).then(
      () => {
        throw new Error("the reading of the answer");
      },
      logAndGoOn("a read", null),
    ),
    /the reading of the answer/,
  );
});

test("logKeptGoing writes what is not an error too", async () => {
  const { lines } = await linesOf(() => logKeptGoing("a read", "not an error"));
  assert.equal(lines[0].error, "not an error");
});

test("causedBy keeps the error a new one replaces, and shows it to nothing that compares or serialises a refusal", () => {
  const underneath = new Error("connection reset");
  const refusal = causedBy(new AppError("internal", "Try again.", 503), underneath);
  assert.ok(refusal instanceof AppError, "the same error it was given");
  assert.equal(refusal.cause, underneath);
  assert.equal(refusal.message, "Try again.");
  assert.equal(Object.keys(refusal).includes("cause"), false);
  assert.equal(JSON.stringify(refusal).includes("connection reset"), false);
});
