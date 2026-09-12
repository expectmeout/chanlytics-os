/**
 * Retention is stated in one place and enforced where it is stated -- on a
 * real database.
 *
 * contracts/retention.ts holds the numbers the privacy page prints;
 * purge_events (00115) drops the evidence kinds past
 * RETENTION_DAYS.events_evidence and nothing else. Seeded a day either side
 * of the boundary and run with its DEFAULT, so a default that drifts from the
 * contract fails here. Skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { EVENT_EVIDENCE_KINDS, RETENTION_DAYS } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes and purges events"
    : false;

let db;
let tenantId;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db.from("tenants").insert({ slug: `retention-${Date.now()}`, name: "Retention" }).select("id").single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

const daysAgo = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
const RECORD = ["billing.updated", "broadcast.sent", "contact.consent_changed", "message.received", "usage.voice_seconds", "usage.wa_conversation"];

test("purge_events drops every evidence kind past the contract's days, keeps the younger ones, and never touches the record", { skip }, async () => {
  const keep = RETENTION_DAYS.events_evidence;
  const rows = [];
  for (const kind of EVENT_EVIDENCE_KINDS) {
    rows.push({ tenant_id: tenantId, kind, data: { age: "old" }, created_at: daysAgo(keep + 1) });
    rows.push({ tenant_id: tenantId, kind, data: { age: "young" }, created_at: daysAgo(keep - 1) });
  }
  // The record: an old row of each family that is NOT evidence stays for ever.
  for (const kind of RECORD) rows.push({ tenant_id: tenantId, kind, data: { age: "old" }, created_at: daysAgo(400) });
  const { error } = await db.from("events").insert(rows);
  assert.equal(error, null, error?.message);

  const { data: n, error: pErr } = await db.rpc("purge_events");
  assert.equal(pErr, null, pErr?.message);
  assert.ok(n >= EVENT_EVIDENCE_KINDS.length, `purged ${n}`);

  const { data: left, error: lErr } = await db.from("events").select("kind, data").eq("tenant_id", tenantId);
  assert.equal(lErr, null, lErr?.message);
  const isEvidence = (k) => EVENT_EVIDENCE_KINDS.includes(k);
  assert.deepEqual(left.filter((e) => isEvidence(e.kind) && e.data.age === "old"), [], "every old evidence row went");
  assert.deepEqual(left.filter((e) => isEvidence(e.kind) && e.data.age === "young").map((e) => e.kind).sort(), [...EVENT_EVIDENCE_KINDS].sort(), "a day inside the contract stays");
  assert.deepEqual(left.filter((e) => !isEvidence(e.kind)).map((e) => e.kind).sort(), RECORD, "the record is never purged");
});
