/**
 * One dial saved leaves the others as they were (packages/db setPolicyMode, the door How it runs and the autonomy pane
 * write through). A policy row's `limits` holds several settings at once, so a save reads them and merges the new one
 * in. A read that failed merged over nothing, and the write then wiped the reply cap, the confidence dial, the day's
 * token budget and the reply delay, with no error for anyone. Run over a database in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { setPolicyMode } from "@chanlytics/db";
import { fakeDb } from "../_fake-db.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HELD = { max_replies_day: 5, reply_delay_ms: 3000, min_confidence: 0.7, max_llm_tokens_day: 20000 };
const replyRow = () => ({
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: T,
  class: "reply",
  mode: "ask",
  subject_type: null,
  subject_id: null,
  limits: { ...HELD },
  updated_at: "2026-10-01T00:00:00.000Z",
});
const updatesOf = (db) => db.seen.filter((q) => q.table === "policies" && q.op === "update");

test("a dial saved is merged into the limits on file: the others stay", async () => {
  const tables = { policies: [replyRow()] };
  const row = await setPolicyMode(fakeDb(tables), T, "reply", "auto", { min_confidence: 0.9 });
  assert.deepEqual(row.limits, { ...HELD, min_confidence: 0.9 });
  assert.equal(tables.policies[0].mode, "auto");
});

test("a read of the limits that fails throws before the write: nothing is merged over nothing, and every dial stays", async () => {
  const tables = { policies: [replyRow()] };
  const db = fakeDb(tables, { "policies.select": { message: "connection reset" } });
  await assert.rejects(setPolicyMode(db, T, "reply", "auto", { min_confidence: 0.9 }), /connection reset/);
  assert.deepEqual(updatesOf(db), [], "REGRESSION: the write went on with no limits read, and wiped the other dials");
  assert.deepEqual(tables.policies, [replyRow()], "the row is exactly as it was: its mode too");
});
