/**
 * A new tenant must be born configurable.
 *
 * 00012 seeded the policy matrix and the config rows as ONE-SHOT backfills over
 * the tenants that existed that day, and nothing provisioned a tenant
 * afterwards. A workspace created since had zero policy rows and no
 * tenant_config row, which meant:
 *
 *   - its receptionist held every message for a human (an absent mode reads as
 *     'ask' — correct, but it never answers anyone), and
 *   - PUT /v1/settings, an UPDATE guarded by an optimistic-version check,
 *     matched zero rows and told the owner "Someone else saved settings after
 *     you loaded them — reload and reapply." Nobody saved anything, no
 *     colleague exists, and reloading can never fix it.
 *
 * These tests create a REAL tenant and delete it again, because the thing being
 * tested is a database trigger — asserting it from the application side would
 * only prove the application still works.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no service-role credentials in env" : false;

let db;
let tenantId;
const slug = `provision-probe-${Date.now()}`;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip || !tenantId) return;
  // policies + tenant_config cascade on tenant delete.
  await db.from("tenants").delete().eq("id", tenantId);
});

test("creating a tenant provisions it — no application code involved", { skip }, async () => {
  const { data, error } = await db
    .from("tenants")
    .insert({ slug, name: "Provisioning probe", timezone: "America/New_York" })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  tenantId = data.id;

  const { data: policies } = await db
    .from("policies").select("class, mode, limits").eq("tenant_id", tenantId).is("subject_type", null);
  const byClass = Object.fromEntries((policies ?? []).map((p) => [p.class, p]));

  assert.equal(policies.length, 6, `expected the full matrix, got ${policies.length}`);
  // The modes must mirror the runtime's actual behaviour, or provisioning a
  // tenant would CHANGE how it behaves rather than just making it visible.
  assert.equal(byClass.reply.mode, "auto");
  assert.equal(byClass.faq.mode, "auto");
  assert.equal(byClass.booking.mode, "auto");
  assert.equal(byClass.reengage.mode, "ask");
  assert.equal(byClass.campaign.mode, "ask");
  assert.equal(byClass.money.mode, "never", "the charter lock must be the seeded state");
  assert.equal(byClass.reply.limits.max_replies_day, 20, "the shipped rate cap travels with the policy");
  assert.equal(byClass.reply.limits.pause_hours, 24);
});

test("the new tenant has a config row, so Settings can be read and written", { skip }, async () => {
  const { data: cfg } = await db
    .from("tenant_config").select("config, version").eq("tenant_id", tenantId).maybeSingle();
  assert.ok(cfg, "no tenant_config row — GET /v1/settings would 404 and PUT would report a false conflict");
  assert.deepEqual(cfg.config, {}, "provisioning must not invent a persona");
  assert.equal(cfg.version, 1);
});

test("an EMPTY config still means the receptionist does not speak", { skip }, async () => {
  // Provisioning makes a tenant configurable; it does not make it talk. A brain
  // section is the only thing that gives it a voice, and silence beats speaking
  // in a persona we invented for someone else.
  const { data: cfg } = await db
    .from("tenant_config").select("config").eq("tenant_id", tenantId).single();
  assert.equal(cfg.config.brain, undefined);
});

test("provision_tenant is idempotent — the trigger, backfill and onboarding can all call it", { skip }, async () => {
  const { error } = await db.rpc("provision_tenant", { p_tenant_id: tenantId });
  assert.equal(error, null, error?.message);
  const { data: policies } = await db
    .from("policies").select("id").eq("tenant_id", tenantId).is("subject_type", null);
  assert.equal(policies.length, 6, "a second call duplicated the matrix");
});

test("every existing tenant was backfilled", { skip }, async () => {
  // The migration repairs tenants created between 00012 and now, including the
  // live one — a partially provisioned production tenant is the same defect.
  const { data: tenants } = await db.from("tenants").select("id, slug");
  for (const t of tenants ?? []) {
    const { data: p } = await db
      .from("policies").select("id").eq("tenant_id", t.id).is("subject_type", null);
    const { data: c } = await db
      .from("tenant_config").select("tenant_id").eq("tenant_id", t.id).maybeSingle();
    assert.equal(p.length, 6, `${t.slug} has ${p.length} policy rows`);
    assert.ok(c, `${t.slug} has no tenant_config row`);
  }
});
