/**
 * Every chain's numbers (00375 reach_out_chain_totals), behind one question of who may read a workspace
 * (may_read_workspace), on a real Postgres. Reports' reach_out_report lists twenty chains, the ones that wrote in the
 * period, so the twenty-first and a chain that sent nothing were both absent; this answers every chain, by its id, and
 * says of each chain the report lists what the report says, over the report's own window (its last day, 00360).
 *
 * Local stack only: it makes workspaces, members, chains, leads and their emails.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { showSecondFactor } from "../_second-factor.mjs";
import { reachOutChainTotals } from "@chanlytics/db";

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
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

let db;
let A;
let B;
let viewer;
let stranger;
const roots = [];
const users = [];
const ok = (res, what = "the read") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single(), "the write").id;

async function member(tenant, role) {
  const email = `chains-${role}-${RUN}-${users.length}@example.com`;
  const password = `pw-${RUN}-${role}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), "the membership");
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }), "the sign-in");
  return c;
}

/**
 * Twenty-four chains: 0-21 each wrote to one business in the last day (chain n, n hours ago), 22 wrote forty days ago,
 * 23 never wrote. Chain 0's business wrote back.
 */
before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `chains-a-${RUN}`, name: "Chains A", timezone: TZ }));
  B = await one(db.from("tenants").insert({ slug: `chains-b-${RUN}`, name: "Chains B", timezone: TZ }));
  viewer = await member(A, "viewer");
  stranger = await member(B, "owner");
  const template = await one(
    db
      .from("templates")
      .insert({ tenant_id: A, channel: "email", name: "reach_chain", language: "en", meta_status: "approved" }),
  );
  for (let n = 0; n < 24; n += 1) {
    const search = await one(
      db
        .from("lead_searches")
        .insert({ tenant_id: A, via: "people", card: "movers", name: `Movers ${n}`, asked: `movers ${n}`, plan: {} }),
    );
    const root = await one(
      db.from("playbooks").insert({
        tenant_id: A,
        kind: "reach_out",
        trigger: "lead_first",
        name: `Reach out ${n}`,
        template_id: template,
        template_name: "reach_chain",
        template_language: "en",
        params: [],
        policy_class: "outreach",
        gap_minutes: 12,
        lead_search_id: search,
        state: "running",
      }),
    );
    roots.push(root);
    if (n === 23) continue;
    const run = await one(
      db.from("broadcasts").insert({
        tenant_id: A,
        name: `Movers ${n}`,
        template_id: template,
        template_name: "reach_chain",
        template_language: "en",
        audience: { kind: "reach_out", root_id: root, step_id: root },
        state: "sent",
        scheduled_for: new Date().toISOString(),
        playbook_id: root,
        run_for: "2097-01-01",
      }),
    );
    const contact = await one(db.from("contacts").insert({ tenant_id: A, email: `owner-${RUN}-${n}@example.com` }));
    const lead = await one(
      db.from("leads").insert({
        tenant_id: A,
        place_id: `ChIJchains${RUN}${n}`,
        business_name: `Chain Movers ${n}`,
        city: "Austin",
        region: "TX",
        email: `owner-${RUN}-${n}@example.com`,
        email_state: "ok",
        stage: "nurture",
        contact_id: contact,
      }),
    );
    const at = new Date(n === 22 ? Date.now() - 40 * DAY : Date.now() - n * HOUR).toISOString();
    ok(
      await db.from("reach_out_sends").insert({
        id: crypto.randomUUID(),
        tenant_id: A,
        broadcast_id: run,
        playbook_id: root,
        root_id: root,
        lead_id: lead,
        contact_id: contact,
        state: "sent",
        send_at: at,
        sent_at: at,
      }),
      "an email that left",
    );
    if (n === 0) {
      const thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: contact }));
      ok(
        await db.from("messages").insert({
          tenant_id: A,
          conversation_id: thread,
          contact_id: contact,
          channel: "email",
          direction: "inbound",
          sender: "customer",
          type: "text",
          body: "Tell me more",
          status: "received",
          meta: {},
        }),
        "the business wrote back",
      );
    }
  }
});

after(async () => {
  if (skip) return;
  for (const t of [A, B]) if (t) await db.from("tenants").delete().eq("id", t);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "every chain is answered by its id -- past the report's twenty, and with nothing sent -- saying what the report says of each it lists",
  { skip },
  async () => {
    const totals = ok(await viewer.rpc("reach_out_chain_totals", { p_tenant_id: A, p_days: 30 }), "the chains");
    assert.deepEqual(Object.keys(totals).sort(), [...roots].sort(), "every chain of the workspace, and nothing else");
    const report = ok(await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: 30 }), "the report");
    assert.equal(report.chains.length, 20, "the report's twenty");
    for (const c of report.chains) {
      const sum = (k) => c.steps.reduce((t, s) => t + s[k], 0);
      assert.deepEqual(
        [totals[c.root_id].written, totals[c.root_id].wrote_back],
        [sum("written"), sum("wrote_back")],
        c.name,
      );
      assert.equal(Date.parse(totals[c.root_id].last_at), Date.parse(c.last_at), `${c.name}: when it last wrote`);
    }
    const listed = new Set(report.chains.map((c) => c.root_id));
    const past = roots.slice(0, 22).filter((r) => !listed.has(r));
    assert.deepEqual(
      past,
      [roots[20], roots[21]],
      "the two oldest of this month's writers are past the report's twenty",
    );
    for (const r of past) assert.equal(totals[r].written, 1, "and still say what they wrote");
    assert.deepEqual(
      totals[roots[22]],
      { written: 0, wrote_back: 0, last_at: null },
      "wrote forty days ago: nothing in thirty",
    );
    assert.deepEqual(
      totals[roots[23]],
      { written: 0, wrote_back: 0, last_at: null },
      "never wrote: nothing, and never absent",
    );
    assert.equal(totals[roots[0]].wrote_back, 1, "the business that wrote back");
    const ninety = ok(await viewer.rpc("reach_out_chain_totals", { p_tenant_id: A, p_days: 90 }), "ninety days");
    assert.equal(ninety[roots[22]].written, 1, "ninety days hold it");
    assert.equal(
      ok(await viewer.rpc("reach_out_chain_totals", { p_tenant_id: A, p_days: 500 }))[roots[22]].written,
      1,
      "a period past 90 is held to 90",
    );
  },
);

test(
  "a member's read alone: another workspace's member and a caller who is nobody are told the workspace is not found, and may_read_workspace says who may",
  { skip },
  async () => {
    for (const [who, client] of [
      ["another workspace's member", stranger],
      ["the service role, nobody signed in", db],
    ]) {
      const r = await client.rpc("reach_out_chain_totals", { p_tenant_id: A, p_days: 30 });
      assert.ok(r.error, `${who}: refused`);
      assert.equal(r.error.code, "P0002", `${who}: ${r.error.message}`);
    }
    assert.equal(ok(await viewer.rpc("may_read_workspace", { p_tenant: A })), true, "a viewer reads its workspace");
    assert.equal(ok(await viewer.rpc("may_read_workspace", { p_tenant: B })), false, "and no other");
    assert.equal(ok(await db.rpc("may_read_workspace", { p_tenant: A })), false, "the service role is no member");
    const partner = await member(A, "partner");
    assert.equal(
      ok(await partner.rpc("may_read_workspace", { p_tenant: A })),
      false,
      "a partner's password alone (00261)",
    );
    await showSecondFactor(partner);
    assert.equal(
      ok(await partner.rpc("may_read_workspace", { p_tenant: A })),
      true,
      "and once the session showed its code",
    );
  },
);

test(
  "a window that ended before today is the report's window: each chain counts what it wrote in those days and nothing after, and a day to come is today",
  { skip },
  async () => {
    // The days to two days ago in the workspace's zone: chains 0-21 wrote in the last day, after the window ended, and
    // chain 22's email forty days ago is inside ninety days to it.
    const today = ok(await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: 7 }), "today's report").today;
    const dayBefore = (k) => new Date(Date.parse(`${today}T00:00:00Z`) - k * DAY).toISOString().slice(0, 10);
    const window = { p_tenant_id: A, p_days: 90, p_end: dayBefore(2) };
    const report = ok(await viewer.rpc("reach_out_report", window), "the report, ended");
    const ended = ok(await viewer.rpc("reach_out_chain_totals", window), "the chains, ended");
    assert.deepEqual([report.end, report.today], [dayBefore(2), today], "the report's window ended two days ago");
    assert.deepEqual(Object.keys(ended).sort(), [...roots].sort(), "every chain of the workspace, still");
    for (const r of roots.slice(0, 22))
      assert.deepEqual(ended[r], { written: 0, wrote_back: 0, last_at: null }, "REGRESSION: counted what came after");
    assert.equal(ended[roots[22]].written, 1, "the email forty days ago is in its days");
    assert.deepEqual(
      report.chains.map((c) => c.root_id),
      [roots[22]],
      "the report lists the one chain that wrote in them",
    );
    for (const c of report.chains) {
      const sum = (k) => c.steps.reduce((t, s) => t + s[k], 0);
      assert.deepEqual([ended[c.root_id].written, ended[c.root_id].wrote_back], [sum("written"), sum("wrote_back")]);
      assert.equal(Date.parse(ended[c.root_id].last_at), Date.parse(c.last_at), `${c.name}: when it last wrote`);
    }
    const now = ok(await viewer.rpc("reach_out_chain_totals", { p_tenant_id: A, p_days: 30 }), "no day named");
    for (const end of [today, dayBefore(-3)])
      assert.deepEqual(
        ok(await viewer.rpc("reach_out_chain_totals", { p_tenant_id: A, p_days: 30, p_end: end }), end),
        now,
        `named ${end}: the days to today, as no day named reads them`,
      );
    assert.deepEqual(await reachOutChainTotals(viewer, A, { days: 90, end: dayBefore(2) }), ended, "through the door");
  },
);

test(
  "the dashboard reads every chain through packages/db's door, as the member it is signed in as",
  { skip },
  async () => {
    assert.deepEqual(
      await reachOutChainTotals(viewer, A, { days: 30, end: null }),
      ok(await viewer.rpc("reach_out_chain_totals", { p_tenant_id: A, p_days: 30 })),
    );
    await assert.rejects(
      reachOutChainTotals(stranger, A, { days: 30, end: null }),
      /reach_out_chain_totals: Workspace not found/,
    );
  },
);
