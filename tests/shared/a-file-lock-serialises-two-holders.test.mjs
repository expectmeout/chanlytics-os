/**
 * The lock two database suites take for the state they share (_file-lock.mjs): the second holder waits until the first
 * lets go, a lock left by a process that died is taken over, and a lock nobody lets go of is a failure with its name,
 * not a hang.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { takeLock } from "../_file-lock.mjs";

const name = () => `test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const dirOf = (n) => path.join(os.tmpdir(), `chanlytics-lock-${n}`);

test("a second holder waits until the first lets go, and then has it", async () => {
  const n = name();
  const order = [];
  const first = await takeLock(n);
  const second = takeLock(n).then(async (release) => {
    order.push("second has it");
    await release();
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.deepEqual(order, [], "the second is still waiting");
  order.push("first lets go");
  await first();
  await second;
  assert.deepEqual(order, ["first lets go", "second has it"]);
  assert.equal(fs.existsSync(dirOf(n)), false, "and the last to let go leaves nothing behind");
});

test("a lock older than staleMs was left by a dead process and is taken over", async () => {
  const n = name();
  fs.mkdirSync(dirOf(n));
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(dirOf(n), old, old);
  const release = await takeLock(n, { staleMs: 30_000, waitMs: 5_000 });
  await release();
  assert.equal(fs.existsSync(dirOf(n)), false);
});

test("a lock nobody lets go of fails after waitMs, naming itself", async () => {
  const n = name();
  const release = await takeLock(n);
  try {
    await assert.rejects(takeLock(n, { waitMs: 400 }), new RegExp(`the lock ${n} was not released in 400 ms`));
  } finally {
    await release();
  }
});
