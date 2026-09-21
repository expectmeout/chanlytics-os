/**
 * Session A exit criteria, against REAL Postgres (smoke tenant, self-cleaning,
 * skips without service credentials — same contract as thread-state tests).
 *
 * The one that matters most is the GOLDEN: the disaster-recovery fallback the
 * deployment would answer with must be the stored brain config, field for
 * field. If either moves without the other, the "flip day changes nothing"
 * guarantee is broken and CI says so.
 *
 * WHERE THE FALLBACK NOW LIVES. It used to be a literal in
 * apps/edge/lib/tenant-fallback.ts, and this test evaluated that literal out
 * of the TypeScript source — which is why a live workspace's name, link,
 * greeting and published number were checked into the repository at all. The
 * profile is configuration: the edge reads it from DR_FALLBACK_BRAIN_JSON, so
 * the pin is held against that variable, in whatever environment holds it.
 * Absent, there is nothing to compare and the test says so rather than
 * passing quietly — the same contract as the credentials above it.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { parseTenantConfig, parseTenantConfigResult } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no service-role credentials in env" : false;
// The DR fallback is held against the LIVE config. The database workflow
// replays the migrations on this machine, and 00012's seed is not the live
// config (its phone_display was retired from production on 2026-09-09, and the
// owner edits the prompt from Settings); that test answers only there.
const liveOnly = !skip && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
  ? "the live config is production's; a replayed seed is not it"
  : false;
// A skip, not a pass: an exit code cannot tell them apart, so the reason is
// printed the way every credential-gated case in this suite prints one. A run
// that is MEANT to hold the fallback — the nightly, or an operator checking a
// change before a deploy — sets DR_FALLBACK_BRAIN_JSON to the same value the
// chanlytics-messaging project holds, which is what refresh-dr-fallback.mjs
// prints.
const noFallback = !process.env.DR_FALLBACK_BRAIN_JSON
  ? "DR_FALLBACK_BRAIN_JSON is not set: this environment holds no disaster-recovery fallback to hold the row against"
  : false;

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

/**
 * The fallback the deployment would answer with, read the way the edge reads
 * it: JSON out of DR_FALLBACK_BRAIN_JSON, through parseTenantConfigResult —
 * the same helper tenant-runtime.ts parses the stored row with, and the same
 * one tenant-fallback.ts uses. A variable that does not survive it is not a
 * fallback at all: the edge logs it and answers with the neutral default, so
 * a deployment that believes it is covered is not.
 */
function fallbackBrainFromEnv() {
  let json;
  try {
    json = JSON.parse(process.env.DR_FALLBACK_BRAIN_JSON);
  } catch (e) {
    assert.fail(`DR_FALLBACK_BRAIN_JSON is not JSON, so the edge would answer with the neutral default: ${e.message}`);
  }
  const parsed = parseTenantConfigResult({ brain: json });
  assert.ok(
    parsed.ok,
    `DR_FALLBACK_BRAIN_JSON does not parse as a brain config, so the edge would answer with the neutral default: ${parsed.ok ? "" : parsed.issues.join("; ")}`,
  );
  return parsed.config.brain;
}

test("GOLDEN: the stored brain === the disaster-recovery fallback this environment holds", { skip: skip || liveOnly || noFallback }, async () => {
  // WHAT A FAILURE HERE MEANS. DR_FALLBACK_BRAIN_JSON is what the receptionist
  // answers with when the control plane cannot be read. If it has drifted from
  // the live config, a disaster-recovery event serves the OLD words -- which is
  // not hypothetical: on 2026-09-09 the fallback of the day still carried the
  // workspace's transfer number as the number to publish, months after that was
  // recognised as a defect and hours after it was fixed in the live config. A
  // restore that day would have reinstated it.
  //
  // The remedy is mechanical and is named in every message below, because the
  // person who sees this red is not necessarily the person who moved the config.
  const FIX = "run: node tooling/scripts/refresh-dr-fallback.mjs, then set what it prints on the chanlytics-messaging project and redeploy";
  const { data } = await db.from("tenant_config").select("config, version, updated_at").eq("tenant_id", melanyId).single();
  const stored = parseTenantConfigResult({ brain: data.config.brain });
  assert.ok(stored.ok, `the stored brain does not parse: ${stored.ok ? "" : stored.issues.join("; ")}`);
  const seeded = stored.config.brain;
  const fallback = fallbackBrainFromEnv();
  assert.equal(seeded.system_prompt, fallback.system_prompt, `the system prompt drifted between the live config (v${data.version}, ${String(data.updated_at).slice(0, 16)}) and the DR fallback — ${FIX}`);
  assert.equal(seeded.business_name, fallback.business_name, FIX);
  assert.equal(seeded.phone_display, fallback.phone_display, `the DR fallback publishes a different number from the live config — the exact drift this test was red for on 2026-09-09 — ${FIX}`);
  assert.equal(seeded.booking_link, fallback.booking_link, FIX);
  assert.deepEqual(seeded.fallbacks, fallback.fallbacks, FIX);
  // Everything else the brain carries, in one comparison: a field added to the
  // config and not to the variable is drift like any other.
  assert.deepEqual(fallback, seeded, FIX);
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
