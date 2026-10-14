/**
 * A template's verdict reaches its row before the bell says it (the wiring's second audit, R11 S11-6). Meta's notice that a
 * template was approved or rejected is written on the row the sync keeps, by name and language, and the bell tells it.
 * A notice that found no row was a status kept nowhere: the bell said "Template approved" over a Library still saying
 * pending, and the campaign on it stayed blocked until someone pressed Sync. Now the write counts its rows, looks once more
 * after a moment (Meta can decide before the request that made the template has written its row), and where none is on
 * file still, syncs the workspace's templates from Meta before the notice is told.
 *
 * Run over a database in memory, Meta's notice as its webhook carries it, and the clock by hand for the moment's wait.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const { handleWabaChange } = await import(at("apps/edge/lib/whatsapp/waba-events.ts"));

const T = "aaaaaaaa-0000-4000-8000-0000000000c1";
const WABA = "207650000000977";
const channel = {
  id: "ch-1",
  tenant_id: T,
  kind: "whatsapp",
  external_id: "106540000000971",
  waba_id: WABA,
  status: "active",
  number_e164: "+13055550971",
  config: {},
  created_at: "2026-09-01T09:00:00.000Z",
};
const template = (over = {}) => ({
  id: "tpl-1",
  tenant_id: T,
  channel: "whatsapp",
  name: "winback_offer",
  language: "en_US",
  meta_status: "pending",
  rejected_reason: null,
  source: "chanlytics",
  created_at: "2026-10-14T09:00:00.000Z",
  updated_at: "2026-10-14T09:00:00.000Z",
  ...over,
});
/** Meta's notice that a template was decided, with its reason ("NONE" where it gave none). */
const verdict = (event, reason = "NONE", name = "winback_offer") => ({
  field: "message_template_status_update",
  value: { event, message_template_name: name, message_template_language: "en_US", reason },
});
const updatesOf = (db) => db.seen.filter((q) => q.table === "templates" && q.op === "update");
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
};

test("a verdict on a template on file is written on its row at once, and the bell is told", async () => {
  const tables = { tenant_channels: [{ ...channel }], templates: [template()], events: [] };
  const db = fakeDb(tables);
  assert.equal(await handleWabaChange(db, WABA, verdict("REJECTED", "INVALID_FORMAT"), async () => null), "alerted");
  assert.equal(tables.templates[0].meta_status, "rejected", "the Library says what the bell says");
  assert.equal(tables.templates[0].rejected_reason, "INVALID_FORMAT", "and why Meta refused it");
  assert.equal(updatesOf(db).length, 1, "one write: the row was there");
  // Approved again: the status is Meta's newest, and a reason of "NONE" is no reason kept.
  assert.equal(await handleWabaChange(db, WABA, verdict("APPROVED"), async () => null), "alerted");
  assert.deepEqual([tables.templates[0].meta_status, tables.templates[0].rejected_reason], ["approved", null]);
});

test("a verdict that finds no row looks again after a moment, then syncs the workspace's templates from Meta before the bell is told, and never invents a row", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const tables = { tenant_channels: [{ ...channel }], templates: [], events: [] };
    const db = fakeDb(tables);
    let settled = false;
    const told = handleWabaChange(db, WABA, verdict("REJECTED"), async () => null).then((r) => {
      settled = true;
      return r;
    });
    await flush();
    assert.equal(updatesOf(db).length, 1, "the first write found no row");
    assert.equal(settled, false, "and nothing is told before the row is looked for again");
    t.mock.timers.tick(2_000);
    assert.equal(await told, "alerted", "the verdict is told all the same");
    assert.equal(updatesOf(db).length, 2, "looked for once more after the moment");
    assert.equal(
      tables.templates.length,
      0,
      "no row invented: the sync is Meta's to fill, and with no token here it fills none",
    );
  } finally {
    t.mock.timers.reset();
  }
});
