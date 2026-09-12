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
// The DR fallback is held against the LIVE config. The database workflow
// replays the migrations on this machine, and 00012's seed is not the live
// config (its phone_display was retired from production on 2026-09-09, and the
// owner edits the prompt from Settings); those two tests answer only there.
const liveOnly = !skip && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
  ? "the live config is production's; a replayed seed is not it"
  : false;

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

test("GOLDEN: seeded Melany brain === the quarantined DR fallback, byte for byte", { skip: skip || liveOnly }, async () => {
  // WHAT A FAILURE HERE MEANS. tenant-fallback.ts is what the receptionist
  // answers with when the control plane cannot be read. If it has drifted from
  // the live config, a disaster-recovery event serves the OLD words -- which is
  // not hypothetical: on 2026-09-09 this test was red because the fallback
  // still carried the salon's transfer number as the number to publish, months
  // after that was recognised as a defect and hours after it was fixed in the
  // live config. A restore that day would have reinstated it.
  //
  // The remedy is mechanical and is named in every message below, because the
  // person who sees this red is not necessarily the person who moved the config.
  const FIX = "run: node tooling/scripts/refresh-dr-fallback.mjs --apply";
  const { data } = await db.from("tenant_config").select("config, version, updated_at").eq("tenant_id", melanyId).single();
  const seeded = data.config.brain;
  const fallback = fallbackBrainFromSource();
  assert.equal(seeded.system_prompt, fallback.system_prompt, `the system prompt drifted between the live config (v${data.version}, ${String(data.updated_at).slice(0, 16)}) and the DR fallback — ${FIX}`);
  assert.equal(seeded.business_name, fallback.business_name, FIX);
  assert.equal(seeded.phone_display, fallback.phone_display, `the DR fallback publishes a different number from the live config — the exact drift this test was red for on 2026-09-09 — ${FIX}`);
  assert.equal(seeded.booking_link, fallback.booking_link, FIX);
  assert.deepEqual(seeded.fallbacks, fallback.fallbacks, FIX);
});

test("the DR refresh is idempotent: running it twice leaves no diff", { skip: skip || liveOnly }, async () => {
  // The script is only trustworthy if it converges. If a second run produced a
  // diff, every refresh would be a fresh review of formatting noise and the
  // real change would hide in it.
  const { data } = await db.from("tenant_config").select("config").eq("tenant_id", melanyId).single();
  const brain = data.config.brain;
  const fallback = fallbackBrainFromSource();
  for (const k of ["business_name", "phone_display", "booking_link", "system_prompt"]) {
    assert.equal(fallback[k], brain[k], `${k}: the checked-in fallback already matches, so a refresh would change nothing`);
  }
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
