/**
 * Every handler that asks for its own next run (_next-asks.mjs) writes it under a key of its own: put beside the job
 * that wrote it, running and holding its key, the ask is taken by the ledger, never refused as a second of that job.
 * Over the database in memory, whose once-only keys are the migrations' own; the suite beside this one holds the same
 * pairs on a real database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleJobOnce } from "@chanlytics/jobs";
import { fakeDb } from "../../_fake-db.mjs";
import { JOB_WRITERS } from "../writers/_job-writers.mjs";
import { NEXT_ASKS } from "./_next-asks.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const soon = () => new Date(Date.now() + 60_000);

test("every pair names a handler the syntax tree knows writes that kind", () => {
  for (const ask of NEXT_ASKS) {
    assert.ok(JOB_WRITERS[ask.writer], `${ask.writer} is no writer of a job any more`);
    assert.equal(ask.writer.split("|")[1], ask.kind);
  }
});

for (const ask of NEXT_ASKS) {
  test(`${ask.kind}: ${ask.what}`, async () => {
    const tables = { jobs: [] };
    const db = fakeDb(tables);
    assert.equal(
      await scheduleJobOnce(db, { tenantId: T, kind: ask.kind, dueAt: soon(), payload: ask.running }),
      "scheduled",
    );
    // Claimed: the job that asks is running, and holds its key until it reports back.
    Object.assign(tables.jobs[0], { state: "fired", attempts: 1 });
    assert.equal(
      await scheduleJobOnce(db, { tenantId: T, kind: ask.kind, dueAt: soon(), payload: ask.next }),
      "scheduled",
      "the ledger takes the ask while the job that wrote it still runs",
    );
    const [running, next] = tables.jobs.map((j) => j.dedupe_key);
    assert.ok(running && next && running !== next, `two keys: ${running} and ${next}`);
    // And the ask is still once: the same one written again is the fact that it is on the ledger.
    assert.equal(
      await scheduleJobOnce(db, { tenantId: T, kind: ask.kind, dueAt: soon(), payload: ask.next }),
      "already_scheduled",
    );
  });
}
