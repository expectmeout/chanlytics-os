/**
 * The lead finder's three job kinds reach the pipeline the edge injects, and
 * a runtime without one fails the job loudly instead of guessing (00140,
 * release A1; A2 binds the pipeline). Run over the committed jobs dist, the
 * way line-provision.test.mjs runs its kind.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JOB_KINDS } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { dispatchJob } = await import(pathToFileURL(path.join(ROOT, "packages/jobs/dist/index.js")).href);

const job = (kind, payload) => ({ id: "j1", tenant_id: "t1", kind, payload, due_at: "2026-09-19T12:00:00Z", attempts: 1 });
const ctx = (leads) => ({
  db: fakeDb({}), wire: null, alert: async () => {}, eraseThread: async () => true, schedule: async () => {}, deadline: Date.now() + 60_000,
  ...(leads ? { leads } : {}),
});

test("the three kinds are declared, and each reaches its half of the injected pipeline with the claimed job whole", async () => {
  for (const kind of ["lead_round_start", "lead_collect", "lead_check"]) assert.ok(JOB_KINDS.includes(kind), `${kind} is a kind the ledger holds`);
  const calls = [];
  const leads = {
    roundStart: async (_c, j) => { calls.push(["roundStart", j.payload]); },
    collect: async (_c, j) => { calls.push(["collect", j.payload]); },
    check: async (_c, j) => { calls.push(["check", j.payload]); },
  };
  assert.equal(await dispatchJob(ctx(leads), job("lead_round_start", { round_id: "r1" })), "done");
  assert.equal(await dispatchJob(ctx(leads), job("lead_collect", { run_id: "u1", seq: "p100" })), "done");
  assert.equal(await dispatchJob(ctx(leads), job("lead_check", { round_id: "r1", batch: 2 })), "done");
  assert.deepEqual(calls, [["roundStart", { round_id: "r1" }], ["collect", { run_id: "u1", seq: "p100" }], ["check", { round_id: "r1", batch: 2 }]]);
});

test("a runtime without the pipeline fails a lead job by name, never silently", async () => {
  await assert.rejects(() => dispatchJob(ctx(undefined), job("lead_round_start", { round_id: "r1" })), /lead_round_start: this runtime holds no lead pipeline/);
  await assert.rejects(() => dispatchJob(ctx(undefined), job("lead_collect", { run_id: "u1", seq: "final" })), /lead_collect: this runtime holds no lead pipeline/);
  await assert.rejects(() => dispatchJob(ctx(undefined), job("lead_check", { round_id: "r1", batch: 1 })), /lead_check: this runtime holds no lead pipeline/);
});
