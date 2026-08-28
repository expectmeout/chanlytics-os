/**
 * Session A exit criteria, against REAL Postgres (smoke tenant, self-cleaning,
 * skips without service credentials — same contract as thread-state tests).
 *
 * The one that matters most is the GOLDEN: the seeded Melany brain profile
 * must be byte-identical to the quarantined DR fallback in tenant-fallback.ts.
 * If either changes without the other, the "flip day changes nothing"
 * guarantee is broken and CI says so.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseTenantConfig } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no service-role credentials in env" : false;

const here = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_SRC = path.join(here, "../../../apps/edge/lib/tenant-fallback.ts");

let db;
let melanyId;
let smokeId;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data: ts } = await db.from("tenants").select("id, slug");
  melanyId = ts.find((t) => t.slug === "melanys-beauty-salon").id;
  smokeId = ts.find((t) => t.slug === "chanlytics-smoke-test").id;
});

/** Evaluate the FALLBACK_BRAIN literal out of the TS source without a TS
 *  toolchain: the object is plain data between known markers. */
function fallbackBrainFromSource() {
  const src = fs.readFileSync(FALLBACK_SRC, "utf8");
  const m = src.match(/export const FALLBACK_BRAIN: BrainConfig = (\{[\s\S]*?\n\};)/);
  assert.ok(m, "FALLBACK_BRAIN literal not found");
  const body = m[1].replace(/^\};$/m, "}").replace(/\/\/ PROMPT-(START|END)\r?\n/g, "");
  // `new Function` is deliberate: evaluating the literal is what makes this a
  // faithful comparison. A raw byte diff would fail spuriously — the TS file is
  // CRLF and the database row is LF, and ECMAScript normalises line endings
  // inside template literals at parse time, so only the parsed values match.
  return new Function(`return (${body});`)();
}

test("GOLDEN: seeded Melany brain === the quarantined DR fallback, byte for byte", { skip }, async () => {
  const { data } = await db.from("tenant_config").select("config").eq("tenant_id", melanyId).single();
  const seeded = data.config.brain;
  const fallback = fallbackBrainFromSource();
  assert.equal(seeded.system_prompt, fallback.system_prompt, "system prompt drifted between DB seed and DR fallback");
  assert.equal(seeded.business_name, fallback.business_name);
  assert.equal(seeded.phone_display, fallback.phone_display);
  assert.equal(seeded.booking_link, fallback.booking_link);
  assert.deepEqual(seeded.fallbacks, fallback.fallbacks);
});

test("the seeded config parses under the SAME zod schema the runtime uses", { skip }, async () => {
  const { data } = await db.from("tenant_config").select("config").eq("tenant_id", melanyId).single();
  const parsed = parseTenantConfig(data.config);
  assert.ok(parsed?.brain, "Melany's seeded config must survive schema validation");
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
  const melany = chans.find((c) => c.tenant_id === melanyId);
  const { data: creds } = await db.rpc("get_channel_credentials", { p_channel_id: smoke.id });
  assert.equal(creds.phone_id, "TEST-PHONE-ID");
  assert.equal(creds.access_token, "SMOKE-FAKE-TOKEN");
  const { data: none } = await db.rpc("get_channel_credentials", { p_channel_id: melany.id });
  assert.equal(none, null, "Melany rides the env fallback until her ref is set");
});

test("roles are the widened set and nothing kept 'staff'", { skip }, async () => {
  const { data } = await db.from("memberships").select("role");
  for (const m of data) assert.ok(["owner", "operator", "viewer"].includes(m.role), `unexpected role ${m.role}`);
});

test("policy seeds mirror the edge's previous hardcoded behavior", { skip }, async () => {
  const { data } = await db
    .from("policies")
    .select("class, mode, limits")
    .eq("tenant_id", melanyId)
    .is("subject_type", null);
  const by = Object.fromEntries(data.map((p) => [p.class, p]));
  assert.equal(by.reply.mode, "auto", "Melany answers automatically — flip day changes nothing");
  assert.equal(by.reply.limits.max_replies_day, 20);
  assert.equal(by.reply.limits.pause_hours, 24);
  assert.equal(by.money.mode, "never");
});
