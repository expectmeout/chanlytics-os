/**
 * The public health door, judged against a fake database: 200 only when
 * every registered clock is healthy and nothing due is waiting; 503 names
 * the unhealthy clocks and nothing else; a health function that cannot be
 * read is 503 with a reason and none of the database's words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { judgeHealth } = await import(pathToFileURL(path.join(ROOT, "apps/edge/api/health.ts")).href);

const db = (rows, backlog, healthError = null, backlogError = null) => ({
  rpc: async (name) => (name === "sweep_health" ? { data: rows, error: healthError } : { data: backlog, error: backlogError }),
});
const row = (sweep, healthy) => ({ sweep, healthy, detail: healthy ? null : "the cron job is disabled (secret-ish detail)", last_request_at: null, status_code: null, scheduled: true, alerted_at: null });
const NOW = new Date("2026-09-11T12:00:00.000Z");

test("every clock healthy and nothing waiting is 200", async () => {
  const a = await judgeHealth(db([row("jobs", true), row("purge_events", true), row("partitions", true)], 0), NOW);
  assert.equal(a.status, 200);
  assert.deepEqual(a.body, { ok: true, unhealthy: [], jobs_backlog: 0, checked_at: "2026-09-11T12:00:00.000Z" });
});

test("one unhealthy clock is 503, named, with its detail kept inside", async () => {
  const a = await judgeHealth(db([row("jobs", true), row("partitions", false)], 0), NOW);
  assert.equal(a.status, 503);
  assert.deepEqual(a.body.unhealthy, ["partitions"]);
  assert.ok(!JSON.stringify(a.body).includes("secret-ish"), "the detail is for the inside; the monitor gets the name");
});

test("due work nobody drains is 503 even when every clock ticks", async () => {
  const a = await judgeHealth(db([row("jobs", true)], 7), NOW);
  assert.equal(a.status, 503);
  assert.equal(a.body.ok, false);
  assert.equal(a.body.jobs_backlog, 7);
});

test("a backlog that cannot be read is not 'zero'", async () => {
  const a = await judgeHealth(db([row("jobs", true)], null, null, { message: "permission denied" }), NOW);
  assert.equal(a.status, 503, "unknown is not healthy");
  assert.equal(a.body.jobs_backlog, null);
});

test("a health function that cannot be read is 503 with a reason, and none of the database's words", async () => {
  const a = await judgeHealth(db(null, 0, { message: "permission denied for schema cron (secret-ish)" }), NOW);
  assert.equal(a.status, 503);
  assert.equal(a.body.reason, "health_unreadable");
  assert.ok(!JSON.stringify(a.body).includes("secret-ish"));
});
