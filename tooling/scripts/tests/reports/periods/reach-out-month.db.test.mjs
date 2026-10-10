/**
 * Reports' Reach-outs section for "This month so far" (00360), on a real Postgres. reach_out_report took 7, 30 or 90
 * days and raised for any other, and the month sends the day of the month, so the section answered 422 on every day but
 * the 7th and the 30th. It reads any period of 1 to 90 days now, refuses any other in contracts' words, and still only
 * for a member of the workspace. Every day of a month is asked here, as Reports asks it; a window that ended before
 * today is reach-out-back/what-comes-back.db.test.mjs's.
 *
 * Local stack only: it makes workspaces, members, a chain and its emails.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { REACH_OUT_REFUSALS, monthDaysAt, zoneDayKey } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const TZ = "America/Chicago";
const DAY = 24 * 3_600_000;
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

let db;
let A;
let B;
let viewer;
let stranger;
const users = [];
const ok = (res, what = "the read") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single(), "the write").id;

/** A member signed in: the report is a definer that asks who is calling. */
async function member(tenant, role) {
  const email = `month-${role}-${RUN}@example.com`;
  const password = `pw-${RUN}-${role}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), "the membership");
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }), "the sign-in");
  return c;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `month-a-${RUN}`, name: "Month A", timezone: TZ }));
  B = await one(db.from("tenants").insert({ slug: `month-b-${RUN}`, name: "Month B", timezone: TZ }));
  viewer = await member(A, "viewer");
  stranger = await member(B, "owner");
  const template = await one(
    db
      .from("templates")
      .insert({ tenant_id: A, channel: "email", name: "reach_month", language: "en", meta_status: "approved" }),
  );
  const search = await one(
    db.from("lead_searches").insert({
      tenant_id: A,
      via: "people",
      card: "movers",
      name: "Movers · Austin",
      asked: "movers in Austin",
      plan: {},
    }),
  );
  const root = await one(
    db.from("playbooks").insert({
      tenant_id: A,
      kind: "reach_out",
      trigger: "lead_first",
      name: "Reach out · Movers",
      template_id: template,
      template_name: "reach_month",
      template_language: "en",
      params: [],
      policy_class: "outreach",
      gap_minutes: 12,
      lead_search_id: search,
      state: "running",
    }),
  );
  const run = await one(
    db.from("broadcasts").insert({
      tenant_id: A,
      name: "Movers",
      template_id: template,
      template_name: "reach_month",
      template_language: "en",
      audience: { kind: "reach_out", root_id: root, step_id: root },
      state: "sent",
      scheduled_for: new Date().toISOString(),
      playbook_id: root,
      run_for: "2097-01-01",
    }),
  );
  const lead = (n) =>
    one(
      db.from("leads").insert({
        tenant_id: A,
        place_id: `ChIJmonth${RUN}${n}`,
        business_name: `Month Movers ${n}`,
        city: "Austin",
        region: "TX",
        email: `owner-${RUN}-${n}@example.com`,
        email_state: "ok",
        stage: "nurture",
      }),
    );
  const sent = async (n, at) =>
    ok(
      await db.from("reach_out_sends").insert({
        id: crypto.randomUUID(),
        tenant_id: A,
        broadcast_id: run,
        playbook_id: root,
        root_id: root,
        lead_id: await lead(n),
        state: "sent",
        send_at: new Date(at).toISOString(),
        sent_at: new Date(at).toISOString(),
      }),
      "an email that left",
    );
  // One email now, and one forty days ago: inside every period of the month, and inside ninety days alone.
  await sent(1, Date.now());
  await sent(2, Date.now() - 40 * DAY);
});

after(async () => {
  if (skip) return;
  for (const t of [A, B]) if (t) await db.from("tenants").delete().eq("id", t);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "This month so far: every day of a month is a period the report reads, as Reports asks for it",
  { skip },
  async () => {
    for (let d = 1; d <= 31; d += 1) {
      const r = ok(await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: d }), `${d} days`);
      assert.equal(r.days, d, `${d} days: the period asked`);
      assert.equal(r.series.length, d, `${d} days: a row a day`);
      assert.equal(r.totals.written, 1, `${d} days: today's email, and not the one forty days ago`);
    }
    const month = monthDaysAt(zoneDayKey(Date.now(), TZ));
    const r = ok(await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: month }), "the month");
    assert.equal(String(r.since).slice(8, 10), "01", "the month so far starts on its 1st, in the workspace's zone");
  },
);

test(
  "a period outside 1 to 90 days is refused in contracts' words; 7, 30 and 90 read as they did",
  { skip },
  async () => {
    for (const p of [0, -3, 91, 365]) {
      const r = await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: p });
      assert.equal(r.error?.code, "22023", `${p} days: ${r.error?.message}`);
      assert.equal(r.error.message, REACH_OUT_REFUSALS.period, `${p} days: the refusal contracts words`);
    }
    assert.equal(
      ok(await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: 90 })).totals.written,
      2,
      "ninety days hold the email forty days ago",
    );
    assert.equal(ok(await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: 30 })).totals.written, 1);
    assert.equal(ok(await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: 7 })).series.length, 7);
  },
);

test(
  "still a member's read: another workspace's member and a caller who is nobody are told the workspace is not found",
  { skip },
  async () => {
    for (const [who, client] of [
      ["another workspace's member", stranger],
      ["the service role, nobody signed in", db],
    ]) {
      const r = await client.rpc("reach_out_report", { p_tenant_id: A, p_days: 9 });
      assert.ok(r.error, `${who}: refused`);
      assert.equal(r.error.code, "P0002", `${who}: ${r.error.message}`);
    }
  },
);
