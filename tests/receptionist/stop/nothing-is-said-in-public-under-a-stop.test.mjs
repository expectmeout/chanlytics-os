/**
 * Stop everything and what the receptionist says in public (db doesWorkspaceAnswerOnItsOwn: the one question a review's
 * answer asks before it is drafted or posted, the edge's google/review-answers.ts). While a workspace's owner has stopped
 * all sending, nothing is said under the business's name with nobody reading it first; once sending is resumed it is, as
 * before. A database the stop's column has not reached has no stop to read (either deploy order), and a stop that cannot
 * be read is never read as none.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { doesWorkspaceAnswerOnItsOwn, isSendingStopped } from "@chanlytics/db/workspace";
import { fakeDb } from "../../_fake-db.mjs";
import { withoutColumns } from "../../_schema.mjs";

const WORKSPACE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** A workspace open to its customers, its plan paid, and nothing stopped. `faults` fails a read as PostgREST does. */
const world = (faults = {}) => {
  const tables = {
    tenants: [{ id: WORKSPACE, status: "active", left_empty_at: null, sending_stopped_at: null }],
    billing_accounts: [{ tenant_id: WORKSPACE, mode: "stripe", status: "active" }],
  };
  return { tables, db: fakeDb(tables, faults) };
};

test("a stopped workspace says nothing in public under its name, and does again once sending is resumed", async () => {
  const { tables, db } = world();
  assert.equal(await doesWorkspaceAnswerOnItsOwn(db, WORKSPACE), true, "open and nothing stopped: it answers");
  tables.tenants[0].sending_stopped_at = "2026-11-17T12:00:00.000Z";
  assert.equal(await isSendingStopped(db, WORKSPACE), true);
  assert.equal(await doesWorkspaceAnswerOnItsOwn(db, WORKSPACE), false, "stopped: nothing in public");
  tables.tenants[0].sending_stopped_at = null;
  assert.equal(await doesWorkspaceAnswerOnItsOwn(db, WORKSPACE), true, "resumed: as before");
});

test("on a database the stop's column has not reached, no stop stands and asking after one does not fail", async () => {
  await withoutColumns({ tenants: ["sending_stopped_at"] }, async () => {
    const { tables, db } = world();
    delete tables.tenants[0].sending_stopped_at;
    assert.equal(await isSendingStopped(db, WORKSPACE), false);
    assert.equal(await doesWorkspaceAnswerOnItsOwn(db, WORKSPACE), true);
  });
});

test("a stop that cannot be read is not read as none: the question throws, so nothing goes out on a guess", async () => {
  const { db } = world({ "tenants.select": { message: "the database is busy" } });
  await assert.rejects(() => isSendingStopped(db, WORKSPACE), /cannot read whether sending is stopped/);
  await assert.rejects(() => doesWorkspaceAnswerOnItsOwn(db, WORKSPACE));
});
