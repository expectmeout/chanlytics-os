/**
 * A business that never answered may be tried again (00589-00591, decision 0120, D6), on a real Postgres. Off unless the
 * sequence says so; once, after its last email is the days old the sequence says, never a third time; never to anyone who
 * said no, became a customer or was stopped; its second first email a round of its own, which the first round's rule no
 * longer refuses; and the count the switch says. A written lead reads to reach_out_why_not as closed (nurture) or a
 * customer (its own person holds its address) as often as written: reach_out_comes_back asks each reason again.
 *
 * Local stack only: it makes a workspace, a member, a sequence, leads and their emails.
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
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in as needs it"
        : false;

const DAY = 24 * 3_600_000;
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

let db;
let A;
let owner;
let template;
let search;
let root;
const users = [];
const leads = {};
const ok = (res, what = "the read") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single(), "the write").id;

/**
 * A lead of the search, written to by the sequence `daysAgo` days ago (or never), in nurture, with the person its first
 * email made holding its address: a written lead as the clock leaves it.
 */
async function writtenLead(name, daysAgo, over = {}) {
  const email = `${name}-${RUN}@example.com`;
  const contact = await one(db.from("contacts").insert({ tenant_id: A, email }));
  const lead = await one(
    db.from("leads").insert({
      tenant_id: A,
      place_id: `ChIJagain${RUN}${name}`,
      business_name: `${name} Movers`,
      city: "Austin",
      region: "TX",
      email,
      email_state: "ok",
      stage: daysAgo === null ? "ready" : "nurture",
      contact_id: daysAgo === null ? null : contact,
      ...over,
    }),
  );
  ok(
    await db.from("lead_search_members").insert({
      search_id: search,
      lead_id: lead,
      tenant_id: A,
      class: "qualified",
      counted: true,
      fit: "strong",
      reason: "",
    }),
    `member ${name}`,
  );
  if (daysAgo !== null) {
    const at = new Date(Date.now() - daysAgo * DAY).toISOString();
    const batch = await one(
      db.from("sequence_batches").insert({
        tenant_id: A,
        name: `Movers · ${name}`,
        template_id: template,
        template_name: "again_chain",
        template_language: "en",
        audience: { kind: "reach_out", root_id: root, step_id: root },
        state: "sent",
        scheduled_for: at,
        step_id: root,
        sequence_id: root,
        run_for: new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10),
      }),
    );
    ok(
      await db.from("sequence_sends").insert({
        id: crypto.randomUUID(),
        tenant_id: A,
        batch_id: batch,
        step_id: root,
        sequence_id: root,
        lead_id: lead,
        contact_id: contact,
        state: "sent",
        send_at: at,
        sent_at: at,
      }),
      `the email to ${name}`,
    );
  }
  leads[name] = lead;
  return lead;
}

const comesBack = async (ids, days) =>
  ok(
    await db.rpc("reach_out_comes_back", { p_tenant_id: A, p_lead_ids: ids, p_after_days: days }),
    "who comes back",
  ).map((r) => r.lead_id);
const audience = async (again) =>
  ok(
    await db.rpc("reach_out_audience", {
      p_tenant_id: A,
      p_search_id: search,
      p_limit: 50,
      p_include_unconfirmed: false,
      ...(again ? { p_again_after: again } : {}),
    }),
    "the audience",
  ).map((r) => r.lead_id);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `again-${RUN}`, name: "Again", timezone: "America/Chicago" }));
  const email = `again-owner-${RUN}@example.com`;
  const password = `pw-${RUN}-owner-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }), "the owner");
  owner = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await owner.auth.signInWithPassword({ email, password }), "the sign-in");
  template = await one(
    db
      .from("templates")
      .insert({ tenant_id: A, channel: "email", name: "again_chain", language: "en", meta_status: "approved" }),
  );
  search = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "people", card: "movers", name: "Movers", asked: "movers", plan: {} }),
  );
  root = await one(
    db.from("sequence_steps").insert({
      tenant_id: A,
      kind: "reach_out",
      trigger: "lead_first",
      name: "Movers in Austin",
      template_id: template,
      template_name: "again_chain",
      template_language: "en",
      params: [],
      policy_class: "outreach",
      gap_minutes: 12,
      lead_search_id: search,
      state: "running",
      words_ok_at: new Date().toISOString(),
    }),
  );
  await writtenLead("fresh", null);
  await writtenLead("old", 120);
  await writtenLead("recent", 30);
  await writtenLead("saidno", 120, { stage: "archived", closed_reason: "said_no" });
  await writtenLead("stopped", 120, { reach_out_stopped_at: new Date().toISOString() });
});

after(async () => {
  if (skip) return;
  if (A) await db.from("tenants").delete().eq("id", A);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("off, a business written to is written to once: the audience is the new ones alone", { skip }, async () => {
  assert.deepEqual(await audience(null), [leads.fresh]);
});

test(
  "on, a business that never answered comes back once its last email is old enough, after the new ones",
  { skip },
  async () => {
    assert.deepEqual(await audience(90), [leads.fresh, leads.old]);
    assert.deepEqual(await comesBack(Object.values(leads), 90), [leads.old]);
    // The age is the setting's: at 20 days the recent one is old enough too, and the rest still never.
    assert.deepEqual((await comesBack(Object.values(leads), 20)).sort(), [leads.old, leads.recent].sort());
  },
);

test("its second first email is a round of its own, and it never comes back a third time", { skip }, async () => {
  const run = crypto.randomUUID();
  const send = crypto.randomUUID();
  ok(
    await db.rpc("reach_out_plan_run", {
      p_run: {
        id: run,
        tenant_id: A,
        playbook_id: root,
        run_for: "2097-01-02",
        name: "Movers · again",
        template_id: template,
        template_name: "again_chain",
        template_language: "en",
        state: "scheduled",
        scheduled_for: new Date().toISOString(),
        recipient_count: 1,
        audience: { kind: "reach_out", root_id: root, step_id: root },
      },
      p_sends: [
        { id: send, lead_id: leads.old, contact_id: null, mailbox_id: null, send_at: new Date().toISOString() },
      ],
    }),
    "the run",
  );
  const [row] = ok(await db.from("sequence_sends").select("round, state").eq("id", send), "its send");
  assert.deepEqual(
    row,
    { round: 2, state: "planned" },
    "planned, as its second round: the first round's rule let it be",
  );
  assert.deepEqual(await comesBack([leads.old], 0), [], "a business tried again does not come back");
});

test(
  "the switch is a member's who may approve: on, its words wait once more; the count says who and from when",
  { skip },
  async () => {
    const set = ok(
      await owner.rpc("reach_out_again_set", { p_tenant_id: A, p_root_id: root, p_days: 90 }),
      "turned on",
    );
    assert.deepEqual(set, { root_id: root, again_after_days: 90 });
    const [step] = ok(
      await db.from("sequence_steps").select("again_after_days, words_ok_at").eq("id", root),
      "the step",
    );
    assert.deepEqual(step, { again_after_days: 90, words_ok_at: null });
    const refused = await owner.rpc("reach_out_again_set", { p_tenant_id: A, p_root_id: root, p_days: 30 });
    assert.equal(refused.error?.code, "22023", "never sooner than 90 days");
    const count = ok(
      await db.rpc("reach_out_again_count", { p_tenant_id: A, p_root_id: root, p_days: 90 }),
      "the count",
    );
    // The recent one comes back sixty days from now; old was tried again above, and the rest never.
    assert.equal(count.count, 1);
    assert.ok(Math.abs(Date.parse(count.first_at) - (Date.now() + 60 * DAY)) < DAY, count.first_at);
    ok(await owner.rpc("reach_out_again_set", { p_tenant_id: A, p_root_id: root }), "turned off");
    const [off] = ok(await db.from("sequence_steps").select("again_after_days").eq("id", root), "the step");
    assert.equal(off.again_after_days, null);
  },
);
