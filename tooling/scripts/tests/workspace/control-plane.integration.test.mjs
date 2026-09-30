/**
 * Session A exit criteria, against REAL Postgres (smoke tenant, self-cleaning,
 * skips without service credentials — same contract as thread-state tests).
 *
 * This file used to open with a GOLDEN: the disaster-recovery fallback the
 * deployment answered with had to equal the stored brain config, field for
 * field. There is no fallback profile any more — a control plane that cannot
 * be read holds the thread for a person, in every workspace alike — so the
 * pin, and the customer data it compared, are gone with it.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { MEMBERSHIP_ROLES, parseTenantConfig } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no service-role credentials in env" : false;
let db;
let pilotId;
let smokeId;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  // The pilot is the first workspace: 00001_foundation.sql made it, and its name
  // lives there, not here. The smoke tenant is `test`, so it is never the one.
  const { data: first } = await db
    .from("tenants")
    .select("id")
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .single();
  pilotId = first.id;
  const { data: ts } = await db.from("tenants").select("id, slug");
  smokeId = ts.find((t) => t.slug === "chanlytics-smoke-test").id;
});

test("the seeded config parses under the SAME zod schema the runtime uses", { skip }, async () => {
  const { data } = await db.from("tenant_config").select("config").eq("tenant_id", pilotId).single();
  const parsed = parseTenantConfig(data.config);
  assert.ok(parsed?.brain, "the pilot's seeded config must survive schema validation");
  assert.ok(parsed.notifications.escalation_emails.length >= 1);
});

test("config write is optimistic-concurrency guarded", { skip }, async () => {
  const { data: row } = await db.from("tenant_config").select("version").eq("tenant_id", smokeId).single();
  const v = row.version;
  // correct version -> applies
  const ok = await db
    .from("tenant_config")
    .update({ config: {}, version: v + 1 })
    .eq("tenant_id", smokeId)
    .eq("version", v)
    .select("version")
    .maybeSingle();
  assert.equal(ok.data.version, v + 1);
  // stale version -> zero rows, no clobber
  const stale = await db
    .from("tenant_config")
    .update({ config: { brain: null }, version: v + 1 })
    .eq("tenant_id", smokeId)
    .eq("version", v)
    .select("version")
    .maybeSingle();
  assert.equal(stale.data, null, "a stale write must update nothing");
});

test("the money lock holds even for the service role", { skip }, async () => {
  const { error } = await db.from("policies").update({ mode: "auto" }).eq("tenant_id", smokeId).eq("class", "money");
  assert.ok(error, "money must never leave 'never'");
  assert.match(error.message, /locked/);
});

test("per-tenant credentials resolve through Vault; a null ref means env fallback", { skip }, async () => {
  const { data: chans } = await db
    .from("tenant_channels")
    .select("id, credentials_ref, tenant_id")
    .eq("kind", "whatsapp");
  const smoke = chans.find((c) => c.tenant_id === smokeId);
  const pilot = chans.find((c) => c.tenant_id === pilotId);
  const { data: creds } = await db.rpc("get_channel_credentials", { p_channel_id: smoke.id });
  assert.equal(creds.phone_id, "TEST-PHONE-ID");
  assert.equal(creds.access_token, "SMOKE-FAKE-TOKEN");
  const { data: none } = await db.rpc("get_channel_credentials", { p_channel_id: pilot.id });
  assert.equal(none, null, "the pilot rides the env fallback until its ref is set");
});

// The roles are contracts' one list (MEMBERSHIP_ROLES, held to the memberships.role CHECK at compile time), never a
// copy: a copy written before 00201 made partner a fourth role failed the nightly, whose database holds a partner.
test("roles are the widened set and nothing kept 'staff'", { skip }, async () => {
  const { data } = await db.from("memberships").select("role");
  for (const m of data) assert.ok(MEMBERSHIP_ROLES.includes(m.role), `unexpected role ${m.role}`);
});

test("policy seeds mirror the edge's previous hardcoded behavior", { skip }, async () => {
  const { data } = await db
    .from("policies")
    .select("class, mode, limits")
    .eq("tenant_id", pilotId)
    .is("subject_type", null);
  const by = Object.fromEntries(data.map((p) => [p.class, p]));
  assert.equal(by.reply.mode, "auto", "the pilot answers automatically — flip day changes nothing");
  assert.equal(by.reply.limits.max_replies_day, 20);
  assert.equal(by.reply.limits.pause_hours, 24);
  assert.equal(by.money.mode, "never");
});
