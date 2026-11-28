/**
 * Deleting a workspace: its work is stopped first (tooling/scripts/ops/delete-tenant.mjs, delete-tenant/fence.mjs).
 *
 * The delete used to read the workspace, wait two minutes where a video's copy might be landing on the shelf, and
 * delete. A job that started after the read wrote rows the backup did not hold, and could put a file where nothing
 * would take it. Now an apply sets Stop everything, withdraws the workspace's queued jobs, waits for the running ones,
 * and reads the workspace again; that second read is what it deletes by. The ledger here is the stand-in's: the world
 * says what happens to the workspace's jobs between two of the script's looks at them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NAME, OTHER, STOPPED, T, deleteTenant, harbor } from "../_delete-tenant-world.mjs";

const WHO = ["--tenant", T, "--expect-name", NAME];
/** An apply that waits for the workspace's running jobs for about a third of a second. */
const APPLY = [...WHO, "--apply", "--wait-minutes", "0.005"];

const job = (id, state, over = {}) => ({
  id,
  tenant_id: T,
  kind: "file_shelve",
  state,
  due_at: "2026-11-28T09:00:00Z",
  fired_at: state === "fired" ? "2026-11-28T09:00:05Z" : null,
  lease_until: state === "fired" ? "2026-11-28T09:05:05Z" : null,
  payload: {},
  ...over,
});
const deletes = (run) => run.log.filter((line) => line.endsWith(" delete"));
const jobsIn = (run) =>
  Object.fromEntries(run.backup.filter((l) => l.table === "jobs").map((l) => [l.row.id, l.row.state]));

test("an apply stops the workspace and withdraws its queued jobs before it deletes, and a dry run stops nothing", () => {
  const jobs = [job("j-queued", "scheduled"), job("j-theirs", "scheduled", { tenant_id: OTHER })];
  const dry = deleteTenant({ tables: harbor({ jobs }) }, ...WHO);
  assert.deepEqual(dry.log, [], "a dry run writes nothing: no stop, no job withdrawn");
  assert.equal(dry.tables.tenants.find((t) => t.id === T).sending_stopped_at, null);

  const applied = deleteTenant({ tables: harbor({ jobs }) }, ...APPLY);
  assert.equal(applied.code, 0, applied.said);
  assert.deepEqual(applied.log.slice(0, 2), STOPPED, "Stop everything through its door, then the ledger");
  assert.ok(applied.log.indexOf("jobs update") < applied.log.indexOf("events delete"), "both before the first delete");
  assert.deepEqual(jobsIn(applied), { "j-queued": "canceled" }, "the backup the delete goes by is read after the stop");
  assert.deepEqual(
    applied.tables.jobs.map((j) => [j.id, j.state]),
    [["j-theirs", "scheduled"]],
    "and another workspace's queued work is not touched",
  );
  assert.match(applied.out, /Stop everything is on\n\s+withdrew 1 queued jobs/);
});

test("a job that is running is waited for, and the workspace is read again once it has ended", () => {
  // A video's copy is being put on the shelf when the delete begins, and ends two looks at the ledger later.
  const world = { tables: harbor({ jobs: [job("j-running", "fired")] }), ledger: [{ look: 3, done: "j-running" }] };
  const applied = deleteTenant(world, ...APPLY);
  assert.equal(applied.code, 0, applied.said);
  assert.deepEqual(
    jobsIn(applied),
    { "j-running": "done" },
    "the backup holds the job as it ended: what it wrote while it ran is in the read the delete goes by",
  );
  assert.deepEqual(deletes(applied), ["events delete", "tenants delete"]);
});

test("a job that does not end in the time given refuses, deletes nothing, and says where it leaves the workspace", () => {
  const world = { tables: harbor({ jobs: [job("j-stuck", "fired")] }) };
  const refused = deleteTenant(world, ...APPLY);
  assert.equal(refused.code, 1);
  assert.match(refused.err, /REFUSING: 1 of this workspace's jobs had not ended after 0\.005 minutes:/);
  assert.match(refused.err, /file_shelve, running since 2026-11-28T09:00:05Z/, "named, with since when");
  assert.match(
    refused.err,
    /Stop everything is on for this workspace\. Run this again to finish, or press Resume in the product/,
    "and what to do about a workspace left stopped",
  );
  assert.deepEqual(deletes(refused), [], "nothing is deleted");
  assert.ok(refused.tables.tenants.find((t) => t.id === T).sending_stopped_at, "the stop stays on");
});

test("a job queued while the workspace was being read does not start after it: it is withdrawn and the read taken again", () => {
  // A clock hands the workspace a job after its ledger was found empty and while its rows were read: the look after
  // the snapshot (the second) finds it.
  const world = { tables: harbor(), ledger: [{ look: 2, add: job("j-late", "scheduled") }] };
  const applied = deleteTenant(world, ...APPLY);
  assert.equal(applied.code, 0, applied.said);
  assert.deepEqual(jobsIn(applied), { "j-late": "canceled" }, "withdrawn before it could start, and in the backup");
  assert.equal(
    applied.log.slice(0, applied.log.indexOf("events delete")).filter((line) => line === "jobs update").length,
    2,
    "the ledger is gone over again before the delete: once for each time the workspace was stopped and read",
  );
});

test("a workspace that keeps being handed work is not deleted", () => {
  const ledger = [2, 4, 6].map((look, i) => ({ look, add: job(`j-late-${i}`, "scheduled") }));
  const refused = deleteTenant({ tables: harbor(), ledger }, ...APPLY);
  assert.equal(refused.code, 1);
  assert.match(refused.err, /REFUSING: jobs of this workspace were queued again each of the 3 times it was read/);
  assert.match(refused.err, /2 of its queued jobs are withdrawn/, "the two it had the time to; the third it only saw");
  assert.deepEqual(deletes(refused), []);
});

test("a stop that is already on is left as it was, and one that cannot be set stops the run before any write", () => {
  const stoppedAt = "2026-11-20T08:00:00Z";
  const tables = harbor();
  tables.tenants[0].sending_stopped_at = stoppedAt;
  const applied = deleteTenant({ tables }, ...APPLY);
  assert.equal(applied.code, 0, applied.said);
  assert.equal(applied.log[0], "jobs update", "the door is not asked a second time");
  assert.match(applied.out, new RegExp(`Stop everything was already on \\(since ${stoppedAt}\\)`));

  const faults = { "tenants.update": { message: "permission denied for table tenants" } };
  const refused = deleteTenant({ tables: harbor(), faults }, ...APPLY);
  assert.equal(refused.code, 1);
  assert.match(refused.err, /REFUSING: could not stop the workspace's work: permission denied for table tenants/);
  assert.deepEqual(refused.log, ["rpc workspace_sending_stop"], "no job is withdrawn and nothing is deleted");
});
