/**
 * The ledger admits a line's provisioning (00109), proved on a real Postgres:
 * a line_provision row is accepted by the kind CHECK, claimed by
 * claim_due_jobs like any other, and the guard still refuses a kind nobody
 * declared.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes due jobs"
    : false;

let db;
let tenantId;
before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t = await db.from("tenants").insert({ slug: `line-provision-${Date.now()}`, name: "Line provision" }).select("id").single();
  assert.equal(t.error, null, t.error?.message);
  tenantId = t.data.id;
});
after(async () => {
  if (skip || !tenantId) return;
  await db.from("jobs").delete().eq("tenant_id", tenantId);
  await db.from("tenants").delete().eq("id", tenantId);
});

test("a line_provision job is accepted, due now, and claimed like any other", { skip }, async () => {
  const ins = await db.from("jobs").insert({ tenant_id: tenantId, kind: "line_provision", due_at: new Date(Date.now() - 1000).toISOString(), payload: { line_id: "00000000-0000-0000-0000-000000000001", by: "owner" } }).select("id").single();
  assert.equal(ins.error, null, ins.error?.message);
  const { data, error } = await db.rpc("claim_due_jobs", { p_limit: 5, p_lease_seconds: 60 });
  assert.equal(error, null, error?.message);
  const mine = (data ?? []).find((r) => r.id === ins.data.id);
  assert.ok(mine, "claimed by the heartbeat's own function");
  assert.equal(mine.kind, "line_provision");
  assert.equal(mine.payload.line_id, "00000000-0000-0000-0000-000000000001");
});

test("a kind nobody declared is still refused", { skip }, async () => {
  const bad = await db.from("jobs").insert({ tenant_id: tenantId, kind: "line_teleport", due_at: new Date().toISOString(), payload: {} });
  assert.notEqual(bad.error, null);
  assert.match(bad.error.message, /jobs_kind_check|violates check constraint/);
});
