/**
 * 00426 and 00427 on the database (the lead workbench): a reach-out takes the leads you add.
 *
 *   1. The one predicate, reach_out_why_not, says why a lead would not be written to, in its order, and the audience is
 *      the members it lets go, strongest fit first.
 *   2. reach_out_add, dry: each lead's why (the predicate's, then already on the list, never counted, with another
 *      reach-out and which), nothing written; a finder-fed reach-out answers fed_by_search; a viewer and another
 *      workspace's owner find nothing.
 *   3. reach_out_add: the leads join the list outside any round with the fit, reason and share marks of where each was
 *      found, one operation and its event; a list made by choosing carries them too (lead_search_choose).
 *   4. The pile: leads_page's pile sort (undecided, later, added; fit; reach), each row's later_at and chain_id, and
 *      lead_pile_counts; Later and its undo, which is its maker's (or find's), never another operator's.
 *   5. A lead on a list before any send has its chain (the timeline), its line (the search's lines) and its place in
 *      the drawer's People (reach_out_chain_people); a finder-fed reach-out's waiting are its audience. The ledger's
 *      counts (reach_out_people_counts) are the drawer's, by the one rule; New message's sources (reach_out_sources)
 *      are the searches and lists with no reach-out, each with its reach as the Leads door reads it.
 *   5b. Leave out (reach_out_leave_out): a lead waiting on a list comes off it, its planned send skipped as taken back,
 *      with an undo that is its maker's; one already written to stays and says so; a finder-fed reach-out refuses.
 *   6. One first email per lead (00427): a second reach-out's run leaves the lead out and is made; an add taken back
 *      skips its planned send as owner_took_back, which lets the lead be planned again; on its way and sent say so.
 *   7. The record the check reads: why it fits and what was asked fall back to where the lead was found, and the
 *      listing's review spread and claim mark ride along to the check (reach_out_unchecked).
 *   8. Who may call what: the doors are a signed-in member's, the predicate and the lines the service role's alone.
 *
 * Local stack only: it makes workspaces, people, leads and runs.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
/** One SQL read of the local stack, for what PostgREST does not serve (a grant, a hash a session may not ask for). */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`${CLI} db query failed: ${[r.stderr, r.stdout].join("\n").trim().slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const parsed = JSON.parse(out.slice(start, out.lastIndexOf(out[start] === "{" ? "}" : "]") + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

const stamp = Date.now().toString(36);
const at = (who) => `${who}-${stamp}@fixture-add.example`;
const month = () => new Date().toISOString().slice(0, 7);
const day = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

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
const refusedWith = (res, code) => {
  assert.ok(res.error, "refused");
  assert.equal(res.error.code, code, res.error.message);
};

async function person(role, tenant = A, label = role) {
  const email = `add-${label}-${stamp}-${tenant === A ? "a" : "b"}@fixture-add.example`;
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
      place_id: `ChIJfixtureAdd${stamp}${n}`,
      business_name: `Fixture Gym ${n}`,
      city: "Austin",
      region: "TX",
      stage: "ready",
      ...over,
    }),
  );
};
const member = (search, leadId, over = {}) =>
  one(
    db.from("lead_search_members").insert({
      search_id: search,
      lead_id: leadId,
      tenant_id: A,
      class: "qualified",
      counted: true,
      counted_month: month(),
      fit: "strong",
      reason: "",
      judgment: { answer: "yes", reasons: [], shares: [] },
      ...over,
    }),
  );
const search = (name, asked, via = "people") =>
  one(db.from("lead_searches").insert({ tenant_id: A, via, card: "local_businesses", name, asked, plan: {} }));
const chain = (searchId, name) =>
  one(
    db.from("playbooks").insert({
      tenant_id: A,
      kind: "reach_out",
      name,
      trigger: "lead_first",
      policy_class: "outreach",
      state: "running",
      lead_search_id: searchId,
      gap_minutes: 12,
      template_id: W.template,
      template_language: "en_US",
      template_name: "fixture_add_1",
    }),
  );

/** A run of a chain's first step, written the way core's runReachOut writes it (reach_out_plan_run). */
async function planRun(root, searchId, runFor, sends, state = "pending_approval") {
  const id = crypto.randomUUID();
  const res = ok(
    await db.rpc("reach_out_plan_run", {
      p_run: {
        id,
        tenant_id: A,
        playbook_id: root,
        run_for: runFor,
        name: `Run ${runFor}`,
        template_id: W.template,
        template_name: "fixture_add_1",
        template_language: "en_US",
        state,
        scheduled_for: new Date(Date.now() + 3_600_000).toISOString(),
        recipient_count: sends.length,
        audience: { kind: "reach_out", root_id: root, step_id: root, search_id: searchId },
      },
      p_sends: sends.map((leadId) => ({
        id: crypto.randomUUID(),
        lead_id: leadId,
        contact_id: null,
        domain_id: null,
        send_at: new Date(Date.now() + 3_600_000).toISOString(),
        state: "planned",
      })),
    }),
  );
  assert.equal(res.id, id, "the run is made");
  return id;
}
const sendsOf = async (runId) =>
  ok(await db.from("reach_out_sends").select("id, lead_id, state, reason").eq("broadcast_id", runId));
const whyNot = async (ids) =>
  Object.fromEntries(
    ok(await db.rpc("reach_out_why_not", { p_tenant_id: A, p_lead_ids: ids })).map((r) => [r.lead_id, r.why]),
  );
const listIds = async (searchId) =>
  ok(await db.from("lead_search_members").select("lead_id").eq("search_id", searchId).is("blanked_at", null)).map(
    (r) => r.lead_id,
  );

/**
 * The world: a finder search F (no reach-out) with a lead for each reason, a second finder search with its own
 * reach-out, a customer, a list chosen from F with its reach-out.
 */
let W;
before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db.from("tenants").insert({ slug: `add-a-${stamp}`, name: "Harbor Fitness Co", timezone: "America/Chicago" }),
  );
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  B = await one(db.from("tenants").insert({ slug: `add-b-${stamp}`, name: "Elsewhere Co" }));
  for (const role of ["owner", "operator", "viewer"]) as[role] = await person(role);
  as.operator2 = await person("operator", A, "operator2");
  as.stranger = await person("owner", B, "stranger");

  W = {};
  W.template = await one(
    db.from("templates").insert({ tenant_id: A, channel: "whatsapp", name: "fixture_add_1", language: "en_US" }),
  );
  W.F = await search("Gyms · Austin", "gyms that open before six");
  W.l1 = await lead({
    email: at("l1"),
    email_state: "ok",
    reviews_dist: { 5: 40, 4: 3, 1: 2 },
    claimed: false,
  });
  await member(W.F, W.l1, { reason: "Opens at 5 AM, and the only one this side of the river" });
  W.l2 = await lead({ email: at("l2"), email_state: "ok" });
  await member(W.F, W.l2, { fit: "look", reason: "No booking page on its site" });
  W.l3 = await lead({ email: at("l3"), email_state: "checking" });
  await member(W.F, W.l3);
  W.l4 = await lead({ email: at("l4"), email_state: "ok" });
  await member(W.F, W.l4, { judgment: { answer: "yes", reasons: [], shares: [{ kind: "phone", lead_id: W.l1 }] } });
  W.l5 = await lead({ email: null, email_state: "none", phone_e164: "+15125550142" });
  await member(W.F, W.l5);
  W.l6 = await lead({ email: at("l6"), email_state: "ok" });
  await member(W.F, W.l6, { class: "review", counted: false, counted_month: null, fit: null });
  W.l8 = await lead({ email: at("l8"), email_state: "ok", stage: "nurture" });
  await member(W.F, W.l8);
  // A second finder search with a reach-out of its own.
  W.F2 = await search("Barres · Austin", "barre studios");
  W.l7 = await lead({ email: at("l7"), email_state: "ok" });
  await member(W.F2, W.l7);
  W.RF = await chain(W.F2, "Barres in Austin");
  // A business already a customer: People holds its address.
  W.l9 = await lead({ email: at("l9"), email_state: "ok" });
  await one(db.from("contacts").insert({ tenant_id: A, email: at("l9"), display_name: "A customer" }));
  // A list chosen on Leads from F, and its reach-out.
  const chosen = ok(
    await as.owner.c.rpc("lead_search_choose", { p_tenant_id: A, p_name: `Early gyms ${stamp}`, p_lead_ids: [W.l2] }),
  );
  W.L = chosen.search_id;
  W.RL = await chain(W.L, "Early gyms");
});

after(async () => {
  if (skip) return;
  for (const id of [A, B].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const u of users) await db.auth.admin.deleteUser(u).catch(() => {});
});

test(
  "one predicate says why a lead would not be written to, and the audience is the members it lets go",
  { skip },
  async () => {
    const gone = crypto.randomUUID();
    assert.deepEqual(await whyNot([W.l1, W.l2, W.l3, W.l4, W.l5, W.l7, W.l8, W.l9, gone]), {
      [W.l1]: null,
      [W.l2]: null,
      [W.l3]: "checking",
      [W.l4]: "shared",
      [W.l5]: "no_email",
      [W.l7]: null,
      [W.l8]: "closed",
      [W.l9]: "customer",
      [gone]: "gone",
    });
    const audience = ok(
      await db.rpc("reach_out_audience", {
        p_tenant_id: A,
        p_search_id: W.F,
        p_limit: 10,
        p_include_unconfirmed: false,
      }),
    );
    assert.deepEqual(
      audience.map((r) => r.lead_id),
      [W.l1, W.l2],
      "strongest fit first; checking, shared, no address and closed are left out",
    );
    assert.equal(audience[0].email, at("l1"));
  },
);

test(
  "a chosen list carries the fit, the reason and the share marks of where each lead was found",
  { skip },
  async () => {
    const [m] = ok(
      await db.from("lead_search_members").select("fit, reason, judgment, counted, round_id").eq("search_id", W.L),
    );
    assert.deepEqual(
      [m.fit, m.reason, m.judgment.answer, m.judgment.shares, m.counted, m.round_id],
      ["look", "No booking page on its site", "yes", [], true, null],
    );
  },
);

test("a dry add says why each lead would not go, and writes nothing", { skip }, async () => {
  const ids = [W.l1, W.l2, W.l3, W.l4, W.l5, W.l6, W.l7, W.l8];
  const dry = ok(await as.operator.c.rpc("reach_out_add", { p_root_id: W.RL, p_lead_ids: ids, p_dry: true }));
  assert.equal(dry.dry, true);
  assert.equal(dry.added, 0);
  assert.equal(dry.would_add, 2, "a ready lead, and one whose address is still being checked");
  assert.deepEqual(dry.left_out, { already: 1, shared: 1, no_email: 1, not_counted: 1, elsewhere: 1, closed: 1 });
  const by = Object.fromEntries(dry.leads.map((l) => [l.lead_id, l]));
  assert.deepEqual([by[W.l7].why, by[W.l7].chain_id, by[W.l7].chain_name], ["elsewhere", W.RF, "Barres in Austin"]);
  assert.equal(by[W.l2].why, "already");
  assert.equal(by[W.l6].why, "not_counted");
  assert.equal(dry.cap, 25);
  assert.deepEqual(await listIds(W.L), [W.l2], "nothing written");

  assert.deepEqual(
    ok(await as.operator.c.rpc("reach_out_add", { p_root_id: W.RF, p_lead_ids: [W.l1], p_dry: true })),
    { error: "fed_by_search", search_id: W.F2 },
    "a finder search never gains a lead it did not find",
  );
  refusedWith(await as.viewer.c.rpc("reach_out_add", { p_root_id: W.RL, p_lead_ids: [W.l1], p_dry: true }), "P0002");
  refusedWith(await as.stranger.c.rpc("reach_out_add", { p_root_id: W.RL, p_lead_ids: [W.l1], p_dry: true }), "P0002");
  refusedWith(await as.operator.c.rpc("reach_out_add", { p_root_id: W.RL, p_lead_ids: [] }), "22023");
});

test("an add joins the list outside any round, as found, with its operation and its event", { skip }, async () => {
  const res = ok(await as.operator.c.rpc("reach_out_add", { p_root_id: W.RL, p_lead_ids: [W.l1, W.l3] }));
  assert.deepEqual([res.dry, res.added, res.version, res.waiting], [false, 2, 1, 2], "l1 and l2 wait; l3 is checking");
  W.addOp = res.op_id;
  assert.deepEqual((await listIds(W.L)).sort(), [W.l1, W.l2, W.l3].sort());
  const [m1] = ok(
    await db
      .from("lead_search_members")
      .select("fit, reason, judgment, counted, round_id, class")
      .eq("search_id", W.L)
      .eq("lead_id", W.l1),
  );
  assert.deepEqual(
    [m1.class, m1.fit, m1.reason, m1.judgment.answer, m1.counted, m1.round_id],
    ["qualified", "strong", "Opens at 5 AM, and the only one this side of the river", "yes", true, null],
  );
  const [op] = ok(await db.from("lead_operations").select("kind, lead_ids, after, by, version").eq("id", W.addOp));
  assert.deepEqual(
    [op.kind, op.lead_ids.sort(), op.after.root_id, op.by, op.version],
    ["add", [W.l1, W.l3].sort(), W.RL, as.operator.id, 1],
  );
  const events = ok(
    await db.from("events").select("data").eq("tenant_id", A).eq("kind", "reach_out.lead_added").eq("subject_id", W.RL),
  );
  assert.deepEqual([events.length, events[0].data.n, events[0].data.search_id], [1, 2, W.L]);
  const again = ok(await as.operator.c.rpc("reach_out_add", { p_root_id: W.RL, p_lead_ids: [W.l1] }));
  assert.deepEqual([again.added, again.left_out], [0, { already: 1 }], "an add of one already on it adds nothing");
});

test("the pile: undecided, later, added; its counts; Later is undone by its maker or by find", { skip }, async () => {
  const page = async () =>
    ok(
      await as.owner.c.rpc("leads_page", {
        p_tenant_id: A,
        p_search_id: W.F,
        p_sort: "pile",
        p_list_id: W.L,
        p_limit: 50,
      }),
    );
  const counts = async () =>
    ok(await as.owner.c.rpc("lead_pile_counts", { p_tenant_id: A, p_search_id: W.F, p_list_id: W.L }));

  let rows = await page();
  const ids = rows.map((r) => r.lead_id);
  assert.deepEqual(ids.slice(0, 2), [W.l4, W.l5], "undecided: a checked address before a number alone");
  assert.deepEqual(
    new Set(ids.slice(2)),
    new Set([W.l1, W.l8, W.l3, W.l2]),
    "then the decided: on the list, with a reach-out, or no longer Ready",
  );
  assert.equal(ids.at(-1), W.l2, "the decided by fit too: a look last");
  const row = Object.fromEntries(rows.map((r) => [r.lead_id, r]));
  assert.deepEqual([row[W.l1].chain_id, row[W.l2].chain_id, row[W.l4].chain_id], [W.RL, W.RL, null]);
  assert.equal(row[W.l4].later_at, null);
  assert.deepEqual(await counts(), { total: 6, added: 3, elsewhere: 0, closed: 1, later: 0, left: 2 });

  const later = ok(await as.operator.c.rpc("lead_member_later", { p_search_id: W.F, p_lead_id: W.l4 }));
  rows = await page();
  assert.deepEqual(
    rows.slice(0, 2).map((r) => r.lead_id),
    [W.l5, W.l4],
    "put off for later: after the undecided",
  );
  assert.ok(rows[1].later_at, "the row says when");
  assert.deepEqual(await counts(), { total: 6, added: 3, elsewhere: 0, closed: 1, later: 1, left: 1 });
  const events = ok(
    await db.from("events").select("data").eq("tenant_id", A).eq("kind", "lead.later").eq("subject_id", W.l4),
  );
  assert.equal(events.length, 1);

  refusedWith(
    await as.operator2.c.rpc("lead_undo", { p_op_id: later.op_id, p_version: later.version }),
    "P0002",
    "another operator's later is not theirs to undo",
  );
  assert.deepEqual(ok(await as.operator.c.rpc("lead_undo", { p_op_id: later.op_id, p_version: later.version })), {
    ok: true,
    version: later.version + 1,
  });
  assert.deepEqual(await counts(), { total: 6, added: 3, elsewhere: 0, closed: 1, later: 0, left: 2 });
  const again = ok(await as.operator.c.rpc("lead_member_later", { p_search_id: W.F, p_lead_id: W.l4 }));
  assert.equal(ok(await as.owner.c.rpc("lead_undo", { p_op_id: again.op_id, p_version: again.version })).ok, true);
  refusedWith(await as.viewer.c.rpc("lead_member_later", { p_search_id: W.F, p_lead_id: W.l4 }), "P0002");
});

test("a lead on a list before any send has its chain, its line and its place among the waiting", { skip }, async () => {
  const story = ok(await as.owner.c.rpc("reach_out_lead_timeline", { p_tenant_id: A, p_lead_id: W.l1 }));
  assert.deepEqual(
    [story.chain.root_id, story.chain.fed_by, story.can_stop, story.chain.waiting_run_id],
    [W.RL, "list", false, null],
  );
  assert.ok(story.added_at, "when it was put on the list");
  assert.deepEqual(story.chain.steps, [{ n: 0, after_days: null, hand: null }]);
  assert.equal(typeof story.chain.run_hour, "number");
  assert.equal(story.search.id, W.L);
  const loose = ok(await as.owner.c.rpc("reach_out_lead_timeline", { p_tenant_id: A, p_lead_id: W.l4 }));
  assert.deepEqual([loose.chain, loose.added_at, loose.search.id], [null, null, W.F]);

  const lines = ok(await as.owner.c.rpc("reach_out_search_lines", { p_tenant_id: A, p_search_id: W.L }));
  assert.equal(lines.fed_by, "list");
  assert.deepEqual(new Set(lines.leads.map((l) => l.lead_id)), new Set([W.l1, W.l2, W.l3]));
  assert.ok(
    lines.leads.every((l) => l.sent === 0 && l.added_at),
    "each with when it was added, nothing sent",
  );

  const people = ok(await as.viewer.c.rpc("reach_out_chain_people", { p_tenant_id: A, p_root_id: W.RL }));
  assert.deepEqual(
    [people.fed_by, people.search.id, people.counts],
    ["list", W.L, { waiting: 3, writing: 0, done: 0, of: 3 }],
  );
  assert.deepEqual(new Set(people.waiting.map((l) => l.lead_id)), new Set([W.l1, W.l2, W.l3]));
  const fed = ok(await as.owner.c.rpc("reach_out_chain_people", { p_tenant_id: A, p_root_id: W.RF }));
  assert.deepEqual(
    [fed.fed_by, fed.counts.waiting, fed.waiting.map((l) => l.lead_id)],
    ["search", 1, [W.l7]],
    "a finder-fed reach-out's waiting are its audience",
  );
  refusedWith(await as.stranger.c.rpc("reach_out_chain_people", { p_tenant_id: A, p_root_id: W.RL }), "P0002");

  // The ledger's People cell: every reach-out's counts at once, the drawer's own.
  const counts = ok(await as.viewer.c.rpc("reach_out_people_counts", { p_tenant_id: A }));
  assert.deepEqual(counts[W.RL], { waiting: 3, writing: 0, done: 0 }, "the drawer's counts, less how many are on it");
  assert.deepEqual(counts[W.RF], { waiting: fed.counts.waiting, writing: 0, done: 0 });
  refusedWith(await as.stranger.c.rpc("reach_out_people_counts", { p_tenant_id: A }), "P0002");

  // Write to leads: the searches and lists with no reach-out and someone to write to, each with its reach.
  const sources = ok(await as.viewer.c.rpc("reach_out_sources", { p_tenant_id: A }));
  assert.deepEqual(
    sources.map((s) => s.id),
    [W.F],
    "F alone: F2 and the list have their reach-outs",
  );
  const reach = ok(await as.owner.c.rpc("reach_out_reach", { p_tenant_id: A, p_search_id: W.F }));
  assert.deepEqual(
    [sources[0].name, sources[0].via, sources[0].ready, sources[0].with_unconfirmed],
    ["Gyms · Austin", "people", reach.ready, reach.with_unconfirmed],
    "its reach, as the Leads door reads it",
  );
  refusedWith(await as.stranger.c.rpc("reach_out_sources", { p_tenant_id: A }), "P0002");
});

test(
  "Leave out: a lead waiting on a list comes off it, its planned email skipped as taken back, and its undo is its maker's",
  { skip },
  async () => {
    const lx = await lead({ email: at("lx"), email_state: "ok" });
    await member(W.F, lx);
    const ly = await lead({ email: at("ly"), email_state: "ok" });
    await member(W.F, ly);
    const made = ok(
      await as.owner.c.rpc("lead_search_choose", {
        p_tenant_id: A,
        p_name: `Leave-out list ${stamp}`,
        p_lead_ids: [lx, ly],
      }),
    );
    const LX = made.search_id;
    const RX = await chain(LX, "Leave-out gyms");
    const run = await planRun(RX, LX, day(2), [lx, ly]);

    const left = ok(await as.operator.c.rpc("reach_out_leave_out", { p_root_id: RX, p_lead_id: lx }));
    assert.deepEqual([left.ok, left.skipped, typeof left.op_id], [true, 1, "string"]);
    assert.deepEqual(await listIds(LX), [ly], "off its list");
    const sends = await sendsOf(run);
    assert.deepEqual(
      sends.filter((s) => s.lead_id === lx).map((s) => [s.state, s.reason]),
      [["skipped", "owner_took_back"]],
      "its planned email skipped as taken back",
    );
    assert.deepEqual(
      sends.filter((s) => s.lead_id === ly).map((s) => s.state),
      ["planned"],
      "the others untouched",
    );
    const [op] = ok(await db.from("lead_operations").select("kind, lead_ids, by").eq("id", left.op_id));
    assert.deepEqual([op.kind, op.lead_ids, op.by], ["leave", [lx], as.operator.id]);
    const [ev] = ok(
      await db
        .from("events")
        .select("data")
        .eq("tenant_id", A)
        .eq("kind", "reach_out.lead_taken_back")
        .eq("subject_id", RX),
    );
    assert.deepEqual([ev.data.n, ev.data.left_out], [1, true]);
    assert.deepEqual(ok(await as.operator.c.rpc("reach_out_leave_out", { p_root_id: RX, p_lead_id: lx })), {
      error: "not_on_it",
    });

    // Its undo is its maker's (or find's), never another operator's; back on, the next run plans it again.
    refusedWith(await as.operator2.c.rpc("lead_undo", { p_op_id: left.op_id, p_version: left.version }), "P0002");
    assert.equal(ok(await as.operator.c.rpc("lead_undo", { p_op_id: left.op_id, p_version: left.version })).ok, true);
    assert.deepEqual((await listIds(LX)).sort(), [lx, ly].sort(), "back on its list");

    // One already written to stays: Stop writing is the correction there.
    const move = async (state, over = {}) =>
      ok(
        await db
          .from("reach_out_sends")
          .update({ state, ...over })
          .eq("broadcast_id", run)
          .eq("lead_id", ly),
      );
    await move("claimed", { checked_at: new Date().toISOString() });
    assert.deepEqual(ok(await as.operator.c.rpc("reach_out_leave_out", { p_root_id: RX, p_lead_id: ly })), {
      error: "on_its_way",
    });
    await move("queued");
    await move("sent", { sent_at: new Date().toISOString() });
    assert.deepEqual(ok(await as.operator.c.rpc("reach_out_leave_out", { p_root_id: RX, p_lead_id: ly })), {
      error: "sent",
    });
    assert.deepEqual(ok(await as.operator.c.rpc("reach_out_leave_out", { p_root_id: W.RF, p_lead_id: W.l7 })), {
      error: "fed_by_search",
      search_id: W.F2,
    });
    refusedWith(await as.viewer.c.rpc("reach_out_leave_out", { p_root_id: RX, p_lead_id: ly }), "P0002");
  },
);

test(
  "one first email per lead; an add taken back lets its lead be planned again; on its way and sent say so",
  { skip },
  async () => {
    const today = await planRun(W.RL, W.L, day(), [W.l1, W.l2]);
    assert.equal((await sendsOf(today)).length, 2);
    const other = await planRun(W.RF, W.F2, day(), [W.l7, W.l1], "scheduled");
    assert.deepEqual(
      (await sendsOf(other)).map((s) => s.lead_id),
      [W.l7],
      "the lead another reach-out planned first is left out of this run, and the run is made",
    );
    assert.equal((await whyNot([W.l1]))[W.l1], "written");

    const back = ok(await as.operator.c.rpc("lead_undo", { p_op_id: W.addOp, p_version: 1 }));
    assert.deepEqual(back, { ok: true, taken: 2, leaving: 0, sent: 0 });
    const l1 = (await sendsOf(today)).find((s) => s.lead_id === W.l1);
    assert.deepEqual([l1.state, l1.reason], ["skipped", "owner_took_back"]);
    assert.deepEqual(await listIds(W.L), [W.l2], "off the list: the one chosen with it stays");
    assert.equal(
      (await whyNot([W.l1]))[W.l1],
      null,
      "a send taken back never happened, as far as the lead is concerned",
    );
    const taken = ok(
      await db
        .from("events")
        .select("data")
        .eq("tenant_id", A)
        .eq("kind", "reach_out.lead_taken_back")
        .eq("subject_id", W.RL),
    );
    assert.equal(taken[0].data.n, 2);
    assert.deepEqual(
      ok(await as.operator.c.rpc("lead_undo", { p_op_id: W.addOp, p_version: 1 })),
      { error: "undone" },
      "once",
    );
    const tomorrow = await planRun(W.RL, W.L, day(1), [W.l1]);
    assert.equal((await sendsOf(tomorrow)).length, 1, "planned again");

    // An add whose email is on its way, then gone.
    W.l11 = await lead({ email: at("l11"), email_state: "ok", reviews_dist: { 5: 12 }, claimed: true });
    await member(W.F, W.l11, { reason: "Its classes start at 5:30" });
    const add = ok(await as.operator.c.rpc("reach_out_add", { p_root_id: W.RL, p_lead_ids: [W.l11] }));
    const sendId = crypto.randomUUID();
    ok(
      await db.from("reach_out_sends").insert({
        id: sendId,
        tenant_id: A,
        broadcast_id: tomorrow,
        playbook_id: W.RL,
        root_id: W.RL,
        lead_id: W.l11,
        state: "queued",
        send_at: new Date().toISOString(),
      }),
    );
    assert.deepEqual(ok(await as.operator.c.rpc("lead_undo", { p_op_id: add.op_id, p_version: 1 })), {
      error: "on_its_way",
      leaving: 1,
      sent: 0,
    });
    ok(await db.from("reach_out_sends").update({ state: "sent", sent_at: new Date().toISOString() }).eq("id", sendId));
    assert.deepEqual(ok(await as.operator.c.rpc("lead_undo", { p_op_id: add.op_id, p_version: 1 })), {
      error: "sent",
      leaving: 0,
      sent: 1,
    });
    assert.ok((await listIds(W.L)).includes(W.l11), "it stays: Stop writing is the true correction there");
    const people = ok(await as.owner.c.rpc("reach_out_chain_people", { p_tenant_id: A, p_root_id: W.RL }));
    assert.deepEqual(
      people.writing.map((l) => l.lead_id),
      [W.l11],
    );
    assert.equal(people.counts.writing, 1);
  },
);

test(
  "the record falls back to where the lead was found, and carries the listing's signals to the check",
  { skip },
  async () => {
    const [rec] = ok(await db.rpc("reach_out_record", { p_tenant_id: A, p_search_id: W.L, p_lead_id: W.l11 }));
    assert.deepEqual(
      [rec.why_it_fits, rec.what_you_asked, rec.reviews_dist, rec.claimed],
      ["Its classes start at 5:30", "gyms that open before six", { 5: 12 }, true],
      "a list asks nothing: what was asked is the search that found it",
    );
    ok(await db.from("lead_search_members").update({ reason: "" }).eq("search_id", W.L).eq("lead_id", W.l2));
    const [two] = ok(await db.rpc("reach_out_record", { p_tenant_id: A, p_search_id: W.L, p_lead_id: W.l2 }));
    assert.equal(
      two.why_it_fits,
      "No booking page on its site",
      "a list member with no reason reads where it was found",
    );

    const rows = ok(
      await db.rpc("reach_out_unchecked", { p_limit: 20, p_per_workspace: 20, p_ahead_minutes: 2880, p_tenant_id: A }),
    );
    const l1 = rows.find((r) => r.send.lead_id === W.l1);
    assert.ok(l1, "tomorrow's planned send is read by the check");
    assert.deepEqual(
      [l1.reviews_dist, l1.claimed, l1.why_it_fits],
      [{ 5: 40, 4: 3, 1: 2 }, false, "Opens at 5 AM, and the only one this side of the river"],
    );
  },
);

test("the doors are a signed-in member's; the predicate, the lines and the record the service role's", { skip }, () => {
  const can = (role, fn) => `has_function_privilege('${role}', 'public.${fn}', 'execute')`;
  const doors = {
    add: "reach_out_add(uuid, uuid[], boolean)",
    later: "lead_member_later(uuid, uuid)",
    counts: "lead_pile_counts(uuid, uuid, text, uuid)",
    people: "reach_out_chain_people(uuid, uuid, integer)",
    now: "reach_out_people_counts(uuid)",
    sources: "reach_out_sources(uuid, integer)",
    leave: "reach_out_leave_out(uuid, uuid)",
    page: "leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid)",
  };
  const inner = {
    why: "reach_out_why_not(uuid, uuid[], boolean)",
    lines: "reach_out_root_lines(uuid, uuid)",
    record: "reach_out_record(uuid, uuid, uuid)",
    unchecked: "reach_out_unchecked(integer, integer, integer, uuid)",
    rule: "reach_out_people_of(uuid, uuid)",
  };
  const cols = [
    ...Object.entries(doors).flatMap(([k, f]) => [
      `${can("anon", f)} as anon_${k}`,
      `${can("authenticated", f)} as member_${k}`,
    ]),
    ...Object.entries(inner).map(([k, f]) => `${can("authenticated", f)} as member_${k}`),
  ];
  const got = query(`select ${cols.join(", ")}`)[0];
  assert.deepEqual(got, {
    anon_add: false,
    member_add: true,
    anon_later: false,
    member_later: true,
    anon_counts: false,
    member_counts: true,
    anon_people: false,
    member_people: true,
    anon_now: false,
    member_now: true,
    anon_sources: false,
    member_sources: true,
    anon_leave: false,
    member_leave: true,
    anon_page: false,
    member_page: true,
    member_why: false,
    member_lines: false,
    member_record: false,
    member_unchecked: false,
    member_rule: false,
  });
  const [idx] = query(
    `select indisunique as unique, indisvalid as valid from pg_index where indexrelid = 'public.reach_out_sends_one_first'::regclass`,
  );
  assert.deepEqual(idx, { unique: true, valid: true });
});
