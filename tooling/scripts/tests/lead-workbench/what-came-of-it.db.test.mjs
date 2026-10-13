/**
 * What came of a reach-out (the lead workbench, 00423, canvas B's loop), on the database:
 *
 *   1. Won: a deal that names its lead, won, reaches the lead's line (reach_out_root_lines' won_at), its story
 *      (reach_out_lead_timeline) and the report (reach_out_report's won, on the totals and the step), a count and never
 *      an amount; a deal proposed or lost is no win.
 *   2. The drawer's line: reach_out_chain_people's `came`, of everyone it has, written to, booked and won.
 *   3. A visit names the lead its person was made from (appointments_lead_stamp), and the 6 PM line counts the visits
 *      made today whose lead a reach-out wrote to before them (reach_out_day_due's booked).
 *   4. Back today (leads_back_today, decision 9): a lead whose own day has come, within the week after it, still not
 *      booked, won, stopped or closed; a member's read, and another workspace's member finds nothing.
 *
 * Local stack only: it makes workspaces, people, leads, runs, deals and visits.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

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

const stamp = Date.now().toString(36);
const HOUR = 3_600_000;
let db;
let A;
let B;
const users = [];
const as = {};
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

async function person(role, tenant, label) {
  const email = `came-${label}-${stamp}@fixture-came.example`;
  const password = `pw-${stamp}-${label}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }));
  return { id: made.data.user.id, c };
}

const lead = (over = {}) => {
  n += 1;
  return one(
    db.from("leads").insert({
      tenant_id: A,
      place_id: `ChIJfixtureCame${stamp}${n}`,
      business_name: `Fixture Studio ${n}`,
      city: "Austin",
      region: "TX",
      stage: "ready",
      email: `studio-${n}-${stamp}@fixture-came.example`,
      email_state: "ok",
      ...over,
    }),
  );
};

/** An email of the reach-out that left for a lead, an hour ago: queued, then sent, as the sender moves it. */
async function sent(leadId) {
  const id = crypto.randomUUID();
  const at = new Date(Date.now() - HOUR).toISOString();
  ok(
    await db.from("reach_out_sends").insert({
      id,
      tenant_id: A,
      broadcast_id: W.run,
      playbook_id: W.root,
      root_id: W.root,
      lead_id: leadId,
      state: "queued",
      send_at: at,
    }),
  );
  ok(await db.from("reach_out_sends").update({ state: "sent", sent_at: at }).eq("id", id));
  return id;
}

let W;
before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db.from("tenants").insert({ slug: `came-a-${stamp}`, name: "Harbor Fitness Co", timezone: "America/Chicago" }),
  );
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  B = await one(db.from("tenants").insert({ slug: `came-b-${stamp}`, name: "Elsewhere Co" }));
  as.owner = await person("owner", A, "owner");
  as.stranger = await person("owner", B, "stranger");

  W = {};
  W.template = await one(
    db.from("templates").insert({ tenant_id: A, channel: "email", name: "fixture_came_1", language: "en_US" }),
  );
  W.search = await one(
    db.from("lead_searches").insert({
      tenant_id: A,
      via: "people",
      card: "local_businesses",
      name: "Studios · Austin",
      asked: "pilates studios",
      plan: {},
    }),
  );
  W.root = await one(
    db.from("playbooks").insert({
      tenant_id: A,
      kind: "reach_out",
      name: "Studios in Austin",
      trigger: "lead_first",
      policy_class: "outreach",
      state: "running",
      lead_search_id: W.search,
      gap_minutes: 12,
      template_id: W.template,
      template_language: "en_US",
      template_name: "fixture_came_1",
    }),
  );
  W.run = await one(
    db.from("broadcasts").insert({
      tenant_id: A,
      name: "Studios in Austin · today",
      state: "sending",
      scheduled_for: new Date(Date.now() - 2 * HOUR).toISOString(),
      playbook_id: W.root,
      run_for: new Date().toISOString().slice(0, 10),
      template_id: W.template,
      template_name: "fixture_came_1",
      template_language: "en_US",
      channels: ["email"],
      audience: { kind: "reach_out", root_id: W.root, step_id: W.root, search_id: W.search },
    }),
  );
  // Three leads written to: one who booked and whose deal was won, one with a deal still proposed, one with none.
  W.contact = await one(db.from("contacts").insert({ tenant_id: A, display_name: "Ana at Fixture Studio" }));
  W.won = await lead({
    stage: "converted",
    contact_id: W.contact,
    booked_at: new Date(Date.now() + 24 * HOUR).toISOString(),
  });
  W.proposed = await lead();
  W.plain = await lead();
  for (const l of [W.won, W.proposed, W.plain]) {
    ok(
      await db.from("lead_search_members").insert({
        search_id: W.search,
        lead_id: l,
        tenant_id: A,
        class: "qualified",
        counted: true,
        counted_month: new Date().toISOString().slice(0, 7),
        fit: "strong",
        reason: "",
        judgment: { answer: "yes", reasons: [], shares: [] },
      }),
    );
    await sent(l);
  }
  const proposedContact = await one(db.from("contacts").insert({ tenant_id: A, display_name: "Bo at Fixture Studio" }));
  ok(
    await db.from("deals").insert([
      {
        tenant_id: A,
        contact_id: W.contact,
        lead_id: W.won,
        stage: "won",
        decided_at: new Date().toISOString(),
        amount_cents: 90000,
      },
      { tenant_id: A, contact_id: proposedContact, lead_id: W.proposed, stage: "proposed" },
    ]),
  );
});

after(async () => {
  if (skip) return;
  for (const id of [A, B].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const u of users) await db.auth.admin.deleteUser(u).catch(() => {});
});

test("won reaches the lead's line, its story and the report, a count and never an amount", { skip }, async () => {
  const lines = ok(await db.rpc("reach_out_root_lines", { p_tenant_id: A, p_root_id: W.root }));
  const of = (id) => lines.find((l) => l.lead_id === id).line;
  assert.ok(of(W.won).won_at, "the won deal names its lead");
  assert.equal(of(W.proposed).won_at, null, "a deal still proposed is no win");
  assert.equal(of(W.plain).won_at, null);
  assert.ok(!JSON.stringify(of(W.won)).includes("90000"), "no amount on the line");

  const story = ok(await as.owner.c.rpc("reach_out_lead_timeline", { p_tenant_id: A, p_lead_id: W.won }));
  assert.ok(story.won_at);

  const report = ok(await as.owner.c.rpc("reach_out_report", { p_tenant_id: A, p_days: 30 }));
  assert.deepEqual([report.totals.businesses, report.totals.booked, report.totals.won], [3, 1, 1]);
  assert.equal(report.chains[0].steps[0].won, 1, "at the step that last wrote to it");
});

test("the drawer says what came of it: of everyone it has, written to, booked and won", { skip }, async () => {
  const people = ok(await as.owner.c.rpc("reach_out_chain_people", { p_tenant_id: A, p_root_id: W.root }));
  assert.deepEqual(people.came, { written: 3, wrote_back: 0, booked: 1, won: 1 });
  assert.equal(people.counts.of, 3);
});

test(
  "a visit names its person's lead, and the 6 PM line counts the ones a reach-out's lead booked today",
  { skip },
  async () => {
    const starts = new Date(Date.now() + 26 * HOUR);
    const visit = ok(
      await db
        .from("appointments")
        .insert({
          tenant_id: A,
          contact_id: W.contact,
          source: "person",
          starts_at: starts.toISOString(),
          ends_at: new Date(starts.getTime() + HOUR).toISOString(),
          timezone: "America/Chicago",
        })
        .select("id, lead_id")
        .single(),
    );
    assert.equal(visit.lead_id, W.won, "stamped from the person the lead became");
    const loose = ok(
      await db
        .from("appointments")
        .insert({
          tenant_id: A,
          source: "person",
          starts_at: starts.toISOString(),
          ends_at: new Date(starts.getTime() + HOUR).toISOString(),
          timezone: "America/Chicago",
          client_name: "A walk-in",
        })
        .select("lead_id")
        .single(),
    );
    assert.equal(loose.lead_id, null, "a visit naming nobody names no lead");

    // Late tonight in Austin: past 6 PM, the visit made today.
    const local = new Date().toLocaleString("en-CA", { timeZone: "America/Chicago", hour12: false }).slice(0, 10);
    const due = ok(await db.rpc("reach_out_day_due", { p_now: `${local}T23:30:00-05:00`, p_limit: 1000 }));
    const mine = due.find((d) => d.tenant_id === A);
    assert.ok(mine, "today has something to say");
    assert.equal(mine.numbers.booked, 1);
    assert.equal(mine.numbers.written, 3);
  },
);

test(
  "Back today: a lead whose own day has come, still open, for a member of its workspace alone",
  { skip },
  async () => {
    const back = await lead({ stage: "nurture", resume_at: new Date(Date.now() - HOUR).toISOString() });
    await lead({ stage: "nurture", resume_at: new Date(Date.now() - 12 * 24 * HOUR).toISOString() });
    await lead({ stage: "nurture", resume_at: new Date(Date.now() + 3 * 24 * HOUR).toISOString() });
    await lead({ stage: "archived", closed_reason: "said_no", resume_at: new Date(Date.now() - HOUR).toISOString() });
    ok(
      await db
        .from("leads")
        .update({ resume_at: new Date(Date.now() - HOUR).toISOString() })
        .eq("id", W.won),
    );

    const leads = ok(await as.owner.c.rpc("leads_back_today", { p_tenant_id: A }));
    assert.deepEqual(
      leads.map((l) => l.lead_id),
      [back],
      "its day come; not a week past it, not still ahead, not closed, not booked or won",
    );
    assert.ok(leads[0].resume_at && leads[0].business_name);
    const refused = await as.stranger.c.rpc("leads_back_today", { p_tenant_id: A });
    assert.equal(refused.error?.code, "P0002");
  },
);
