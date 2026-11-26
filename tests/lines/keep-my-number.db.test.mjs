/**
 * Keep my number, on a real database (00067): the owner's two doors, line_forwarding_set and line_forwarding_test, run
 * as a signed-in member.
 *
 * A business keeps the number its customers already dial and forwards it to the receptionist's line. The set door
 * refuses until there is a receptionist's line to forward to, refuses forwarding that line to itself, and otherwise
 * keeps one forwarded row per workspace, naming where its calls go; the test door opens a thirty-minute window in which
 * a call proves it (the call webhook's half is run in voice/calls/retell-door/). Definer doors whose bodies are only
 * proved by running them: pinned as 00067's text in lines/forwarding.test.mjs until 26 Nov 2026. Runs against Postgres
 * in the database workflow; skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY || !ANON
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a workspace and its lines"
      : false;

let db;
let as;
let tenantId;
let userId;
// A live line's number is unique across the database (lines_e164_live_idx), so the kept one is this run's own.
const KEPT = `+15558${String(100_000 + (Date.now() % 900_000)).padStart(6, "0")}`;
const RECEPTIONIST = "+13055550177";

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t = await db
    .from("tenants")
    .insert({ slug: `keep-my-number-${Date.now()}`, name: "Keep my number" })
    .select("id")
    .single();
  if (t.error) throw new Error(t.error.message);
  tenantId = t.data.id;
  const email = `owner-keep-${Date.now()}@example.com`;
  const made = await db.auth.admin.createUser({ email, password: "a-long-test-password-1", email_confirm: true });
  if (made.error) throw new Error(made.error.message);
  userId = made.data.user.id;
  const m = await db.from("memberships").insert({ tenant_id: tenantId, user_id: userId, role: "owner" });
  if (m.error) throw new Error(m.error.message);
  as = createClient(URL_, ANON, { auth: { persistSession: false } });
  const s = await as.auth.signInWithPassword({ email, password: "a-long-test-password-1" });
  if (s.error) throw new Error(s.error.message);
});

after(async () => {
  if (skip || !tenantId) return;
  // events has no foreign key to tenants (it is partitioned), so the tenant's rows go first or they outlive it.
  await db.from("events").delete().eq("tenant_id", tenantId);
  await db.from("tenants").delete().eq("id", tenantId);
  if (userId) await db.auth.admin.deleteUser(userId);
});

const keep = (args = {}) =>
  as.rpc("line_forwarding_set", {
    p_tenant_id: tenantId,
    p_number: KEPT,
    p_carrier: "att",
    p_mode: "always",
    p_test_from: null,
    ...args,
  });

test(
  "with no receptionist's line there is nothing to forward to, and the owner is told so in the door's words",
  { skip },
  async () => {
    const r = await keep();
    assert.ok(r.error, "refused");
    assert.match(r.error.message, /Your receptionist has no line to forward to yet\./);
    const rows = await db.from("lines").select("id").eq("tenant_id", tenantId);
    assert.deepEqual(rows.data, [], "and no forwarded row is made");
  },
);

test(
  "a kept number forwards to the receptionist's line: one forwarded row, instructed, naming where its calls go; the line's own number is refused",
  { skip },
  async () => {
    const route = await db.from("tenant_channels").insert({
      tenant_id: tenantId,
      kind: "voice",
      external_id: `agent_keep${Date.now().toString(36)}`,
      number_e164: RECEPTIONIST,
      status: "active",
      config: {},
    });
    assert.equal(route.error, null, route.error?.message);

    const self = await keep({ p_number: RECEPTIONIST });
    assert.ok(self.error, "forwarding the receptionist's line to itself is refused");
    assert.match(self.error.message, /forward the number you keep, not this one/);

    const first = await keep();
    assert.equal(first.error, null, first.error?.message);
    const again = await keep({ p_carrier: "verizon", p_mode: "unanswered" });
    assert.equal(again.error, null, again.error?.message);
    assert.equal(again.data, first.data, "one forwarded row per workspace, changed in place");
    const row = (
      await db.from("lines").select("kind, provider, e164, forwarding_state, facts").eq("id", first.data).single()
    ).data;
    assert.deepEqual(
      [row.kind, row.provider, row.e164, row.forwarding_state],
      ["forwarded", "carrier", KEPT, "instructed"],
      "a carrier's line, instructed until a test call proves it",
    );
    assert.deepEqual(
      [row.facts.carrier, row.facts.mode, row.facts.destination_e164],
      ["verizon", "unanswered", RECEPTIONIST],
    );
  },
);

test("the test window is thirty minutes, opened on the workspace's own forwarded line only", { skip }, async () => {
  const set = await keep();
  assert.equal(set.error, null, set.error?.message);
  const before = Date.now();
  const opened = await as.rpc("line_forwarding_test", { p_tenant_id: tenantId, p_line_id: set.data });
  assert.equal(opened.error, null, opened.error?.message);
  assert.equal(opened.data.ok, true);
  const minutes = (Date.parse(opened.data.test_until) - before) / 60_000;
  assert.ok(minutes > 29 && minutes <= 31, `the window is about thirty minutes (${minutes.toFixed(1)})`);
  const row = (await db.from("lines").select("forwarding_state, facts").eq("id", set.data).single()).data;
  assert.equal(row.forwarding_state, "instructed");
  assert.equal(
    Date.parse(row.facts.test_until),
    Date.parse(opened.data.test_until),
    "kept on the row the webhook reads",
  );

  const stranger = await as.rpc("line_forwarding_test", {
    p_tenant_id: tenantId,
    p_line_id: "00000000-0000-4000-8000-000000000000",
  });
  assert.ok(stranger.error, "no such forwarded line");
});
