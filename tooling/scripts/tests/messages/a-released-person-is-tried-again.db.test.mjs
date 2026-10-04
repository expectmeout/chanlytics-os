/**
 * 00301, on a real Postgres: what the Campaigns code review of 4 Oct 2026 found 00296-00299 left, held where the
 * database holds it, not as the fakes stand in for it.
 *
 *   - broadcast_recipients.attempt: the guard adds one on every release of a claim (failed outcome_unknown -> queued,
 *     throttled or not_taken), and on nothing else, so a person tried again is sent under a new email id;
 *   - queuedRecipients reads a batch in contact_id order, with each person's attempt;
 *   - has_relationship counts a call they placed that connected only when it has a start, as People's
 *     last_inbound_call_at (max(started_at)) and contracts' relationshipOnRecord read it;
 *   - campaign_month_sent and reach_out_month_sent read the workspace's zone through safe_zone: a zone Postgres does not
 *     know is UTC, where it raised and held every email and text of that workspace's campaigns.
 *
 * (The gates' hard bounces are held in consent/email-offers.db.test.mjs.) Runs against the database `supabase start`
 * builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { queuedRecipients } from "@chanlytics/db";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes workspaces, runs and calls"
      : false;

let db;
let A;
let template;
const ok = (res, what = "the write") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({
        slug: `released-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: "released",
        timezone: "America/Chicago",
      })
      .select("id")
      .single(),
    "the workspace",
  ).id;
  template = ok(
    await db
      .from("templates")
      .insert({ tenant_id: A, channel: "whatsapp", name: "note", language: "en_US", meta_status: "approved" })
      .select("id")
      .single(),
    "the template",
  ).id;
});

after(async () => {
  if (skip || !A) return;
  await db.from("calls").delete().eq("tenant_id", A);
  await db.from("jobs").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
});

let n = 0;
const contact = async (over = {}) => {
  n += 1;
  return ok(
    await db
      .from("contacts")
      .insert({ tenant_id: A, phone_e164: `+1555019${String(n).padStart(4, "0")}`, ...over })
      .select("id")
      .single(),
    "a person",
  ).id;
};
/** A run with these people, assembled whole as the routes make one (00282). */
const runWith = async (name, people) => {
  const made = ok(
    await db.rpc("assemble_broadcast", {
      p_tenant: A,
      p_run: {
        name,
        template_id: template,
        template_name: "note",
        template_language: "en_US",
        params: [],
        audience: { kind: "everyone", id: null, label: "Everyone" },
        state: "scheduled",
        scheduled_for: new Date(Date.now() + 86_400_000).toISOString(),
        recipient_count: people.length,
      },
      p_recipients: people.map((contact_id) => ({ contact_id, facts: null })),
    }),
    "the run",
  );
  return typeof made === "string" ? made : (made.id ?? made.broadcast_id);
};
const move = (broadcastId, contactId, patch) =>
  db
    .from("broadcast_recipients")
    .update(patch)
    .eq("broadcast_id", broadcastId)
    .eq("contact_id", contactId)
    .select("state, reason, attempt")
    .single();

test("the guard counts every release of a claim as a new attempt, and nothing else", async (t) => {
  if (skip) return t.skip(skip);
  const p = await contact();
  const b = await runWith("released once, then twice", [p]);
  const claim = { state: "failed", reason: "outcome_unknown" };
  // Made: attempt 0. A claim is not an attempt of its own: the send it guards is.
  assert.equal(ok(await move(b, p, claim)).attempt, 0, "claimed: still the first attempt");
  // Released, the provider did not take it: the next try is a new attempt.
  assert.deepEqual(ok(await move(b, p, { state: "queued", reason: "not_taken" })), {
    state: "queued",
    reason: "not_taken",
    attempt: 1,
  });
  ok(await move(b, p, claim));
  assert.equal(ok(await move(b, p, { state: "queued", reason: "throttled" })).attempt, 2, "a throttle's release too");
  // Claimed and settled: the claim's verdict is no release, and the count stays.
  ok(await move(b, p, claim));
  assert.equal(ok(await move(b, p, { state: "sent", reason: null })).attempt, 2);
  // A writer cannot set it back by hand through a release it did not make: sent is final, as it always was.
  const refused = await move(b, p, { state: "queued", reason: "not_taken" });
  assert.ok(refused.error, "REGRESSION: a sent person was queued again");
  assert.match(refused.error.message, /terminal/);
});

test("a batch is read in contact_id order, each person with their attempt", async (t) => {
  if (skip) return t.skip(skip);
  const people = [await contact(), await contact(), await contact()];
  const b = await runWith("in order", people);
  // One of them released once, so the batch names them under their second attempt.
  const released = people[1];
  ok(await move(b, released, { state: "failed", reason: "outcome_unknown" }));
  ok(await move(b, released, { state: "queued", reason: "not_taken" }));
  const batch = await queuedRecipients(db, { tenantId: A, broadcastId: b, limit: 25 });
  assert.deepEqual(
    batch.map((r) => r.contact_id),
    [...people].sort(),
    "contact_id order, the same every read: a released person is not left behind by an unordered page",
  );
  assert.deepEqual(
    batch.map((r) => [r.contact_id, r.attempt]),
    [...people].sort().map((id) => [id, id === released ? 1 : 0]),
  );
});

test("a call they placed that connected is a relationship only with a start, as People reads it", async (t) => {
  if (skip) return t.skip(skip);
  const relationshipOf = async (id) =>
    ok(await db.from("contacts").select("has_relationship").eq("id", id).single()).has_relationship;
  const p = await contact();
  assert.equal(await relationshipOf(p), false, "nobody has dealt with the business yet");
  const call = ok(
    await db
      .from("calls")
      .insert({ tenant_id: A, contact_id: p, retell_call_id: `rc-${p}`, direction: "inbound", status: "ended" })
      .select("id")
      .single(),
    "a call with no start",
  ).id;
  // People's last_inbound_call_at is max(started_at): none. The send door read a relationship there; now it does not.
  assert.equal(await relationshipOf(p), false, "a connected call with no start is no relationship, as on People");
  ok(await db.from("calls").update({ started_at: new Date().toISOString() }).eq("id", call));
  assert.equal(await relationshipOf(p), true, "with its start, it is");
  // One that did not connect is none either way.
  const q = await contact();
  ok(
    await db.from("calls").insert({
      tenant_id: A,
      contact_id: q,
      retell_call_id: `rc-${q}`,
      direction: "inbound",
      status: "not_connected",
      started_at: new Date().toISOString(),
    }),
  );
  assert.equal(await relationshipOf(q), false);
});

test("the month's counts read a zone Postgres does not know as UTC, where they raised", async (t) => {
  if (skip) return t.skip(skip);
  // Accepted by the browser's Intl when it was saved, unknown to Postgres: the counts used to raise on it.
  ok(await db.from("tenants").update({ timezone: "Mars/Olympus_Mons" }).eq("id", A), "an unknown zone");
  try {
    for (const channel of ["email", "sms"]) {
      const sent = await db.rpc("campaign_month_sent", { p_tenant_id: A, p_channel: channel });
      assert.equal(sent.error, null, `campaign_month_sent(${channel}): ${sent.error?.message}`);
      assert.equal(typeof sent.data, "number");
    }
    const cold = await db.rpc("reach_out_month_sent", { p_tenant_id: A, p_at: new Date().toISOString() });
    assert.equal(cold.error, null, `reach_out_month_sent: ${cold.error?.message}`);
    assert.equal(typeof cold.data, "number");
  } finally {
    ok(await db.from("tenants").update({ timezone: "America/Chicago" }).eq("id", A), "the zone put back");
  }
});
