/**
 * 00552 on the database: a lead stands in one status group (the table review of 5 Nov 2026, decision 0100).
 *
 * lead_status_groups says it, and leads_page, lead_view_counts and lead_bulk ask it, so what the page sorts by, what a
 * heading's menu counts, what it narrows to and what "all that match" acts on cannot disagree: needs (its place waits on
 * the member, or it is on a list no batch can take it), in (any other place that stands), and none (no place stands).
 *
 * Local stack only: it makes workspaces, members, leads, a list and its sequence with the service key, and removes them.
 * The two reads that count blocks run in a transaction that never commits, through the CLI, in the shape of
 * a-lead-s-listings-are-read-by-the-lead.db.test.mjs.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes leads and their sequences"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const stamp = Date.now().toString(36);
const at = (who) => `${who}-${stamp}@fixture-groups.example`;
const month = () => new Date().toISOString().slice(0, 7);
const dayAfter = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Each lead by the place it stands in, in the order the queue walks them: the newest of a run first. */
const NEEDS = ["waiting", "held", "to_send", "replied", "not_planned"];
const IN = ["next", "between", "listed", "checking"];
const NONE = ["never", "done", "left", "contacted"];
const ALL = [...NEEDS, ...IN, ...NONE];
/**
 * The order the queue walks them (00554): what needs you, by what it needs; what is in a sequence, the soonest first; who to
 * start with, the best reached first; then the longest since contact.
 */
const QUEUE = [
  "replied",
  "to_send",
  "waiting",
  "held",
  "not_planned",
  "listed",
  "checking",
  "next",
  "between",
  "never",
  "done",
  "left",
  "contacted",
];

let db;
let A;
let B;
const users = [];
const as = {};
const W = {};
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

async function person(role, tenant, label = role) {
  const email = `groups-${label}-${stamp}@fixture-groups.example`;
  const password = `pw-${stamp}-${label}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }));
  return { id: made.data.user.id, c };
}

const member = (search, leadId) =>
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
    }),
  );

/** A run of the sequence's first step, its sends planned, as core's runReachOut writes it. */
async function planRun(state, runFor, leads) {
  const id = crypto.randomUUID();
  ok(
    await db.rpc("reach_out_plan_run", {
      p_run: {
        id,
        tenant_id: A,
        playbook_id: W.R,
        run_for: runFor,
        name: "Run",
        template_id: W.template,
        template_name: "fixture_groups_1",
        template_language: "en_US",
        state,
        scheduled_for: new Date(Date.now() + 3_600_000).toISOString(),
        recipient_count: leads.length,
        audience: { kind: "reach_out", root_id: W.R, step_id: W.R, search_id: W.L },
      },
      p_sends: leads.map((leadId) => ({
        id: crypto.randomUUID(),
        lead_id: leadId,
        contact_id: null,
        send_at: new Date(Date.now() + 3_600_000).toISOString(),
        state: "planned",
      })),
    }),
  );
  return id;
}

const moveSend = async (run, leadId, change) =>
  ok(await db.from("sequence_sends").update(change).eq("batch_id", run).eq("lead_id", leadId));

/** The world: a search that found every lead, a list, the list's sequence, and each lead where its name says. */
before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db.from("tenants").insert({ slug: `groups-a-${stamp}`, name: "Harbor Books", timezone: "America/Los_Angeles" }),
  );
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  B = await one(db.from("tenants").insert({ slug: `groups-b-${stamp}`, name: "Elsewhere Co" }));
  as.owner = await person("owner", A);
  as.stranger = await person("owner", B, "stranger");
  as.partner = await person("partner", A);
  W.template = await one(
    db.from("templates").insert({ tenant_id: A, channel: "whatsapp", name: "fixture_groups_1", language: "en_US" }),
  );
  W.F = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "people", card: "local_businesses", name: "Bookshops", asked: "", plan: {} }),
  );
  // Each lead found a minute after the next, so the newest first is ALL's order. A lead's words carry its group, for the
  // box's words; what can reach each is said beside it (a number on two sources, a number marked wrong, one on one).
  const started = Date.parse("2026-11-01T12:00:00Z");
  const over = {
    not_planned: { email_state: "unknown" },
    checking: { email_state: "checking" },
    contacted: { stage: "nurture", contacted_at: new Date(started).toISOString() },
    waiting: { phone_e164: "+15125550111", phone_sources: 2 },
    never: { phone_e164: "+15125550112", phone_sources: 2 },
    left: { phone_e164: "+15125550113", phone_sources: 2, phone_wrong: true },
    done: { phone_e164: "+15125550114", phone_sources: 1 },
  };
  for (const [i, k] of ALL.entries()) {
    const word = NEEDS.includes(k) ? "Needs" : IN.includes(k) ? "Standing" : "Quiet";
    W[k] = await one(
      db.from("leads").insert({
        tenant_id: A,
        place_id: `ChIJfixtureGroups${stamp}${i}`,
        business_name: `${word} Bookshop ${k}`,
        city: "Portland",
        region: "OR",
        stage: "ready",
        email: at(k),
        email_state: "ok",
        found_at: new Date(started - i * 60_000).toISOString(),
        ...over[k],
      }),
    );
    W[`member_${k}`] = await member(W.F, W[k]);
  }
  W.L = ok(
    await as.owner.c.rpc("lead_search_choose", {
      p_tenant_id: A,
      p_name: `Portland bookshops ${stamp}`,
      p_lead_ids: [W.listed],
    }),
  ).search_id;
  // On the list and nothing planned: a batch takes one; one's address is being checked; one's could not be.
  await member(W.L, W.checking);
  await member(W.L, W.not_planned);
  W.R = await one(
    db.from("sequence_steps").insert({
      tenant_id: A,
      kind: "reach_out",
      name: "Portland bookshops",
      trigger: "lead_first",
      policy_class: "outreach",
      state: "running",
      lead_search_id: W.L,
      gap_minutes: 12,
      template_id: W.template,
      template_language: "en_US",
      template_name: "fixture_groups_1",
    }),
  );
  const waiting = await planRun("pending_approval", dayAfter(0), [W.waiting]);
  const run = await planRun("scheduled", dayAfter(1), [W.held, W.to_send, W.next, W.replied]);
  assert.ok(waiting);
  await moveSend(run, W.held, { state: "held", reason: "unbacked_fact" });
  await moveSend(run, W.to_send, { checked_at: new Date().toISOString() });
  await moveSend(run, W.to_send, { state: "claimed" });
  await moveSend(run, W.to_send, {
    state: "drafted",
    drafted_at: new Date().toISOString(),
    draft: { to: at("to_send"), subject: "Hello", text: "Hello there" },
  });
  // Who wrote back, a question read now.
  const contact = await one(db.from("contacts").insert({ tenant_id: A, email: at("replied"), display_name: "Dana" }));
  const thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: contact }));
  const message = await one(
    db.from("messages").insert({
      tenant_id: A,
      conversation_id: thread,
      contact_id: contact,
      channel: "email",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "Do you answer calls on Sundays?",
      status: "received",
    }),
  );
  const send = ok(await db.from("sequence_sends").select("id").eq("batch_id", run).eq("lead_id", W.replied).single());
  ok(
    await db.from("sequence_replies").insert({
      message_id: message,
      tenant_id: A,
      conversation_id: thread,
      contact_id: contact,
      lead_id: W.replied,
      send_id: send.id,
      claim: "person",
      intent: "question",
      summary: "Asks whether calls on Sundays are answered",
    }),
  );
  // Places with no send at all: between two steps, over, and taken out.
  const place = (leadId, row) =>
    db.from("sequence_enrollments").insert({ tenant_id: A, sequence_id: W.R, lead_id: leadId, ...row });
  ok(await place(W.between, { state: "in", place: 2, next_at: new Date(Date.now() + 86_400_000).toISOString() }));
  ok(await place(W.done, { state: "done", ended_at: new Date().toISOString() }));
  ok(await place(W.left, { state: "left", why: "removed", ended_at: new Date().toISOString() }));
});

after(async () => {
  if (skip) return;
  for (const id of [A, B].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const u of users) await db.auth.admin.deleteUser(u).catch(() => {});
});

const nameOf = () => new Map(ALL.map((k) => [W[k], k]));
const namesOf = (rows) => {
  const name = nameOf();
  return rows.map((r) => name.get(r.lead_id));
};
const groupsAs = (who, tenant = A, leads = ALL.map((k) => W[k])) =>
  who.c.rpc("lead_status_groups", { p_tenant_id: tenant, p_lead_ids: leads });
/** A page of the view of the search that found them all, as the page reads it. */
const page = (args = {}, who = as.owner) =>
  who.c.rpc("leads_page", { p_tenant_id: A, p_search_id: W.F, p_class: "qualified", p_limit: 500, ...args });
const countsOf = async (filters, who = as.owner) =>
  ok(
    await who.c.rpc("lead_view_counts", {
      p_tenant_id: A,
      p_search_id: W.F,
      p_class: "qualified",
      ...(filters ? { p_filters: filters } : {}),
    }),
  );

test("the door is a signed-in member's", { skip }, async () => {
  const fn = "public.lead_status_groups(uuid, uuid[])";
  const { data, error } = await db.rpc("lead_status_groups", { p_tenant_id: A, p_lead_ids: [] });
  assert.equal(error, null, error?.message);
  assert.deepEqual(data, [], "nobody named: nothing");
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const refused = await anon.rpc("lead_status_groups", { p_tenant_id: A, p_lead_ids: [W.waiting] });
  assert.ok(refused.error, `${fn}: not anon's`);
});

test("a lead stands in the group its place says, and one with no place standing is left out", { skip }, async () => {
  const name = nameOf();
  const got = Object.fromEntries(ok(await groupsAs(as.owner)).map((r) => [name.get(r.lead_id), r.status_group]));
  assert.deepEqual(got, {
    // Its place waits on the member.
    waiting: "needs",
    held: "needs",
    to_send: "needs",
    replied: "needs",
    // On a list no batch can take it: the row says Not planned.
    not_planned: "needs",
    // Any other place that stands: planned to go, between two steps, on a list, and one whose address is being checked
    // (no reason: it joins the batch after that).
    next: "in",
    between: "in",
    listed: "in",
    checking: "in",
  });
});

test("a lead's place says its rank among what needs you, and its date", { skip }, async () => {
  const name = nameOf();
  const got = new Map(ok(await groupsAs(as.owner)).map((r) => [name.get(r.lead_id), r]));
  assert.deepEqual(
    ["replied", "to_send", "waiting", "held", "not_planned"].map((k) => got.get(k).status_rank),
    [0, 1, 2, 3, 4],
    "who wrote back cools fastest; a list no batch can take waits longest",
  );
  for (const k of IN) assert.deepEqual([got.get(k).status_group, got.get(k).status_rank], ["in", 0], k);
  for (const [k, r] of got) assert.ok(r.status_at, `${k} says when`);
});

test("no list of leads reads every lead of the workspace", { skip }, async () => {
  const name = nameOf();
  const byIds = ok(await groupsAs(as.owner)).map((r) => [name.get(r.lead_id), r.status_group]);
  const whole = ok(await groupsAs(as.owner, A, null)).map((r) => [name.get(r.lead_id), r.status_group]);
  assert.deepEqual(new Map(whole), new Map(byIds));
});

test("a stage sort walks what needs you, what is in a sequence, then who to start with", { skip }, async () => {
  const rows = ok(await page({ p_sort: "stage" }));
  assert.deepEqual(namesOf(rows), QUEUE);
  assert.deepEqual(
    rows.map((r) => r.status_group),
    [...NEEDS.map(() => "needs"), ...IN.map(() => "in"), ...NONE.map(() => null)],
    "each row says its group, and a lead in none says nothing",
  );
  const back = ok(await page({ p_sort: "stage", p_dir: "desc" }));
  assert.deepEqual(namesOf(back), [...QUEUE].reverse(), "the second press walks it the other way");
});

test("Show more carries on across a status group boundary with no row twice", { skip }, async () => {
  for (const dir of ["asc", "desc"]) {
    const walked = [];
    let after_ = {};
    for (let turn = 0; turn < ALL.length; turn += 1) {
      const rows = ok(await page({ p_sort: "stage", p_dir: dir, p_limit: 3, ...after_ }));
      if (!rows.length) break;
      walked.push(...namesOf(rows));
      const last = rows[rows.length - 1];
      after_ = { p_after_key: last.page_key, p_after_id: last.member_id };
    }
    assert.deepEqual(
      walked,
      dir === "asc" ? QUEUE : [...QUEUE].reverse(),
      `${dir}: every lead once, in the queue's order`,
    );
  }
});

test("a read that names no group reads none, and a status filter on any sort says it", { skip }, async () => {
  const found = ok(await page({ p_sort: "found" }));
  assert.equal(found.length, ALL.length);
  assert.ok(
    found.every((r) => r.status_group === null),
    "another sort asks no place",
  );
  const narrowed = ok(await page({ p_sort: "found", p_filters: { status_group: ["needs", "none"] } }));
  assert.deepEqual(new Set(namesOf(narrowed)), new Set([...NEEDS, ...NONE]));
  assert.ok(narrowed.some((r) => r.status_group === "needs"));
  const none = ok(await page({ p_sort: "found", p_filters: { status_group: [] } }));
  assert.equal(none.length, ALL.length, "an empty list asks nothing");
});

test(
  "lead_view_counts agrees with a page: each group's count is the rows the page answers for it",
  { skip },
  async () => {
    const counts = await countsOf(null);
    assert.deepEqual(counts.status_groups, { needs: NEEDS.length, in: IN.length, none: NONE.length });
    assert.equal(counts.view, ALL.length);
    assert.equal(counts.matching, ALL.length);
    for (const [group, names] of [
      ["needs", NEEDS],
      ["in", IN],
      ["none", NONE],
    ]) {
      const rows = ok(await page({ p_sort: "found", p_filters: { status_group: [group] } }));
      assert.equal(rows.length, counts.status_groups[group], group);
      assert.deepEqual(new Set(namesOf(rows)), new Set(names), group);
    }
  },
);

test("a menu's counts hold while one is picked; every other filter narrows them", { skip }, async () => {
  const whole = await countsOf(null);
  const picked = await countsOf({ status_group: ["needs"] });
  assert.deepEqual(picked.status_groups, whole.status_groups, "the status filter does not narrow its own menu");
  assert.equal(picked.matching, NEEDS.length, "what the filters keep does narrow");
  const words = await countsOf({ q: "needs bookshop" });
  assert.deepEqual(words.status_groups, { needs: NEEDS.length, in: 0, none: 0 }, "the box's words do");
});

test("the foot's counts are of the rows every filter keeps, by the rule the Reach filter asks", { skip }, async () => {
  const whole = await countsOf(null);
  assert.equal(whole.with_email, ALL.length - 2, "all but the address not checked and the one being checked");
  assert.equal(whole.with_phone, 2, "two on two sources; never one marked wrong, or on one source");
  const picked = await countsOf({ status_group: ["needs"] });
  assert.equal(picked.with_email, NEEDS.length - 1);
  assert.equal(picked.with_phone, 1, "the lead waiting, not the one in none");
  // And it is what the filter itself keeps.
  const rows = ok(await page({ p_sort: "found", p_filters: { reach: ["phone"] } }));
  assert.equal(rows.length, whole.with_phone);
});

test("another workspace's places are never read", { skip }, async () => {
  assert.deepEqual(ok(await groupsAs(as.stranger, B)), [], "their own workspace's id, this workspace's leads");
  assert.deepEqual(ok(await groupsAs(as.stranger, A)), [], "this workspace's id, as a stranger");
  assert.deepEqual(ok(await groupsAs(as.owner, B)), [], "another workspace's id, by a member of this one");
  const counts = await countsOf(null, as.stranger);
  assert.deepEqual(counts.status_groups, { needs: 0, in: 0, none: 0 });
});

test("a partner with no second factor is never told why a lead is not planned", { skip }, async () => {
  // sequence_queued_why_not answers them nothing (00542), so whatever else their session may read of the workspace, it
  // does not learn that a batch cannot take this lead.
  const rows = ok(await groupsAs(as.partner));
  assert.ok(!rows.some((r) => r.lead_id === W.not_planned && r.status_group === "needs"));
  assert.ok(
    !ok(await page({ p_sort: "stage" }, as.partner)).some(
      (r) => r.status_group === "needs" && r.lead_id === W.not_planned,
    ),
  );
});

/* ------------------------------------------------------------------------------------------------- what it costs -- */

/** A transaction that never commits: `body` runs in a DO block that ends by raising what it `seen`, as hex. */
function rolledBack(body) {
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const r = spawnSync(CLI, ["db", "query", "--local", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

/** The blocks this transaction has read from these tables so far, from their heaps and every one of their indexes. */
const blocksOf = (tables) => {
  const oids = tables.map((t) => `'public.${t}'::regclass`).join(", ");
  return `(select coalesce(sum(coalesce(pg_stat_get_xact_blocks_fetched(x.oid), 0)), 0)::bigint from (
    select c.oid from pg_class c where c.oid in (${oids})
    union all select i.indexrelid from pg_index i where i.indrelid in (${oids})) x)`;
};

/** The same blocks, by the heap or index that read them: what a test says when its bound is passed. */
const blocksByRelation = (tables) => {
  const oids = tables.map((t) => `'public.${t}'::regclass`).join(", ");
  return `(select coalesce(jsonb_object_agg(c.relname, coalesce(pg_stat_get_xact_blocks_fetched(c.oid), 0)), '{}') from pg_class c
    where c.oid in (${oids}) or c.oid in (select i.indexrelid from pg_index i where i.indrelid in (${oids})))`;
};

/** What `read` cost those tables, in blocks, with fresh statistics and sequential scans off; `<name>_by` says where. */
const measured = (tables, name, read) => `
  analyze public.sequence_sends, public.sequence_enrollments, public.lead_search_members, public.leads;
  perform set_config('enable_seqscan', 'off', true);
  before := ${blocksOf(tables)};
  before_by := ${blocksByRelation(tables)};
  ${read}
  cost := cost || jsonb_build_object('${name}', ${blocksOf(tables)} - before);
  cost := cost || jsonb_build_object('${name}_by', (
    select coalesce(jsonb_object_agg(k.key, k.value::bigint - coalesce((before_by->>k.key)::bigint, 0)), '{}')
      from jsonb_each_text(${blocksByRelation(tables)}) k
     where k.value::bigint > coalesce((before_by->>k.key)::bigint, 0)));
  perform set_config('enable_seqscan', 'on', true);`;

/** A workspace with a template, a search and a first step, in the DO block's variables `<v>`, `<v>_t`, `<v>_s`, `<v>_r`. */
const workspace = (v, slug) => `
  insert into public.tenants (slug, name) values ('${slug}-' || gen_random_uuid(), '${slug}') returning id into ${v};
  perform public.provision_tenant(${v});
  insert into public.templates (tenant_id, channel, name, language) values (${v}, 'whatsapp', 'fixture_cost', 'en_US') returning id into ${v}_t;
  insert into public.lead_searches (tenant_id, via, card, name, asked, plan)
    values (${v}, 'people', 'fixture', '${slug}', '', '{}'::jsonb) returning id into ${v}_s;
  insert into public.sequence_steps (tenant_id, kind, name, trigger, policy_class, state, lead_search_id, gap_minutes,
                                     template_id, template_language, template_name)
    values (${v}, 'reach_out', '${slug}', 'lead_first', 'outreach', 'running', ${v}_s, 12, ${v}_t, 'en_US', 'fixture_cost')
    returning id into ${v}_r;`;

/** `n` more leads of a workspace on its list, nothing planned; `tag` keeps their place ids apart. */
const listed = (v, n, tag) => `
  with l as (insert into public.leads (tenant_id, place_id, business_name, email, email_state, stage)
               select ${v}, 'ChIJfixture-${tag}-' || i, 'Bookshop ' || i, 'b' || i || '-${tag}@fixture-groups.example', 'ok', 'ready'
                 from generate_series(1, ${n}) i returning id)
  insert into public.lead_search_members (search_id, lead_id, tenant_id, class, counted, counted_month, fit)
    select ${v}_s, l.id, ${v}, 'qualified', true, to_char(now(), 'YYYY-MM'), 'strong' from l;`;

/** `n` more leads of a workspace, each with a send planned in a run of its own day. */
const sent = (v, n, tag, day) => `
  insert into public.leads (tenant_id, place_id, business_name, email, email_state, stage)
    select ${v}, 'ChIJfixture-${tag}-' || i, 'Next door ' || i, 'n' || i || '-${tag}@fixture-groups.example', 'ok', 'ready'
      from generate_series(1, ${n}) i;
  select public.reach_out_plan_run(
           jsonb_build_object('id', gen_random_uuid(), 'tenant_id', ${v}, 'playbook_id', ${v}_r, 'run_for', current_date + ${day},
                              'name', 'Run', 'template_id', ${v}_t, 'template_name', 'fixture_cost', 'template_language', 'en_US',
                              'state', 'scheduled', 'scheduled_for', now() + interval '1 hour', 'recipient_count', ${n},
                              'audience', jsonb_build_object('kind', 'reach_out', 'root_id', ${v}_r, 'step_id', ${v}_r, 'search_id', ${v}_s)),
           (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'lead_id', l.id, 'send_at', now() + interval '1 hour', 'state', 'planned'))
              from public.leads l where l.tenant_id = ${v} and l.place_id like 'ChIJfixture-${tag}-%'))
    into answer;`;

/** What a bounded read cost, said on every run, so a pass shows its numbers as a failure does. */
const blocksSaid = (seen) =>
  `blocks ${seen.small} then ${seen.large}; by heap and index ${JSON.stringify(seen.small_by)} then ${JSON.stringify(seen.large_by)}`;

const DECLARE = `
  declare
    t uuid; t_t uuid; t_s uuid; t_r uuid; o uuid; o_t uuid; o_s uuid; o_r uuid;
    ids uuid[]; before bigint; before_by jsonb; cost jsonb := '{}'; answer jsonb;`;

test("the read stays put beside a neighbour's sends", { skip }, (t) => {
  const tables = ["sequence_sends", "sequence_enrollments"];
  const seen = rolledBack(`${DECLARE}
    begin
      ${workspace("t", "groups-here")}
      ${workspace("o", "groups-next-door")}
      ${sent("t", 20, "here", 0)}
      select array_agg(l.id) into ids from public.leads l where l.tenant_id = t;
      ${sent("o", 1000, "near", 0)}
      ${measured(tables, "small", "perform count(*) from public.lead_status_groups(t, ids);")}
      ${sent("o", 2000, "far", 1)}
      ${measured(tables, "large", "perform count(*) from public.lead_status_groups(t, ids);")}
      seen := cost;
    end;`);
  t.diagnostic(blocksSaid(seen));
  assert.ok(seen.small > 0, "the sends are read at all");
  assert.ok(
    seen.large <= seen.small * 1.5 + 5,
    `read ${seen.small} blocks beside 1,000 sends and ${seen.large} beside 3,000: a read that walks the platform's sends grows with them (by heap and index: ${JSON.stringify(seen.small_by)} then ${JSON.stringify(seen.large_by)})`,
  );
});

test("the read stays put beside its own workspace's other sends", { skip }, (t) => {
  const tables = ["sequence_sends", "sequence_enrollments"];
  const seen = rolledBack(`${DECLARE}
    begin
      ${workspace("t", "groups-own")}
      ${sent("t", 20, "page", 0)}
      select array_agg(l.id) into ids from public.leads l where l.tenant_id = t;
      ${sent("t", 3000, "rest", 1)}
      ${measured(tables, "small", "perform count(*) from public.lead_status_groups(t, ids);")}
      ${sent("t", 3000, "more-a", 2)}
      ${sent("t", 3000, "more-b", 3)}
      ${measured(tables, "large", "perform count(*) from public.lead_status_groups(t, ids);")}
      seen := cost;
    end;`);
  t.diagnostic(blocksSaid(seen));
  assert.ok(seen.small > 0, "the sends are read at all");
  assert.ok(
    seen.large <= seen.small * 1.3 + 10,
    `read ${seen.small} blocks for 20 leads beside 3,000 other sends of their workspace and ${seen.large} beside 9,000: a read that walks the workspace's sends grows with them (by heap and index: ${JSON.stringify(seen.small_by)} then ${JSON.stringify(seen.large_by)})`,
  );
});

test("why a lead is not planned is asked of the hundred longest on a list", { skip }, () => {
  const seen = rolledBack(`${DECLARE}
    begin
      ${workspace("t", "groups-bound")}
      insert into public.memberships (tenant_id, user_id, role) values (t, '${as.owner.id}', 'owner');
      perform set_config('request.jwt.claims', '{"sub":"${as.owner.id}","role":"authenticated"}', true);
      ${listed("t", 150, "stuck")}
      update public.leads set email_state = 'invalid' where tenant_id = t;
      select array_agg(l.id) into ids from public.leads l where l.tenant_id = t;
      select jsonb_build_object('needs', count(*) filter (where g.status_group = 'needs'),
                                'in', count(*) filter (where g.status_group = 'in'))
        into seen from public.lead_status_groups(t, ids) g;
    end;`);
  assert.deepEqual(
    seen,
    { needs: 100, in: 50 },
    "the rest stand as in a sequence, and a row on the page says its own why",
  );
});

test("the read grows with its own queued leads and no faster", { skip }, () => {
  const tables = ["leads", "lead_search_members", "sequence_steps", "sequence_sends"];
  const seen = rolledBack(`${DECLARE}
    begin
      ${workspace("t", "groups-queued")}
      insert into public.memberships (tenant_id, user_id, role) values (t, '${as.owner.id}', 'owner');
      -- Why a lead is not planned is told only to a member of its workspace, so this reads as one.
      perform set_config('request.jwt.claims', '{"sub":"${as.owner.id}","role":"authenticated"}', true);
      ${listed("t", 100, "first")}
      select array_agg(l.id) into ids from public.leads l where l.tenant_id = t;
      ${measured(tables, "small", "perform count(*) from public.lead_status_groups(t, ids);")}
      ${listed("t", 300, "more")}
      select array_agg(l.id) into ids from public.leads l where l.tenant_id = t;
      ${measured(tables, "large", "perform count(*) from public.lead_status_groups(t, ids);")}
      seen := cost;
    end;`);
  assert.ok(seen.small > 0);
  assert.ok(
    seen.large <= seen.small * 4.5,
    `read ${seen.small} blocks for 100 queued and ${seen.large} for 400: more than what four times the leads cost`,
  );
});

/* ------------------------------------------------------------------------------------------- what stands, of every lead -- */

test(
  "what stands of the leads is what the whole read says, and an open send under a newer one is not among it",
  { skip },
  async () => {
    const said = (rows) => rows.map((r) => [r.grp, r.sequence_id, r.lead_id, r.send_id, r.at].join(" ")).sort();
    const asked = async () => {
      const stands = ok(await as.owner.c.rpc("sequence_places", { p_tenant_id: A, p_standing_leads: true }));
      const whole = ok(await as.owner.c.rpc("sequence_places", { p_tenant_id: A }));
      assert.deepEqual(said(stands), said(whole.filter((r) => r.lead_id && !["done", "left"].includes(r.grp))));
      return stands;
    };
    assert.deepEqual(new Set(namesOf(await asked())), new Set([...NEEDS, ...IN]));

    const { sequence_id, batch_id } = ok(
      await db.from("sequence_sends").select("sequence_id, batch_id").eq("lead_id", W.next).single(),
    );
    const lead = await one(
      db.from("leads").insert({
        tenant_id: A,
        place_id: `ChIJfixtureGroups${stamp}under`,
        business_name: "Under Bookshop",
        stage: "ready",
      }),
    );
    const send = { tenant_id: A, sequence_id, lead_id: lead };
    const under = await one(
      db.from("sequence_sends").insert({
        ...send,
        batch_id,
        state: "planned",
        send_at: new Date(Date.now() + 3_600_000).toISOString(),
        created_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    // A lead has one send a batch, so what came after it is another's.
    const after = await one(
      db.from("sequence_batches").insert({
        tenant_id: A,
        sequence_id,
        name: "After",
        template_id: W.template,
        template_name: "fixture_groups_1",
        template_language: "en_US",
        state: "scheduled",
        scheduled_for: new Date().toISOString(),
      }),
    );
    ok(
      await db
        .from("sequence_sends")
        .insert({ ...send, batch_id: after, state: "sent", sent_at: new Date().toISOString() }),
    );
    const stands = await asked();
    assert.ok(
      !stands.some((r) => r.send_id === under),
      "the newest of a lead there says where it stands, and it was sent",
    );
  },
);

/* ------------------------------------------------------------------------------------- all that match, last: it acts -- */

test("all that match under a status filter acts on those rows alone", { skip }, async () => {
  const view = { search: W.F, class: "qualified", list: "all", status_group: ["in"] };
  const done = ok(await as.owner.c.rpc("lead_bulk", { p_tenant_id: A, p_action: "not_a_fit", p_view: view }));
  assert.equal(done.done, IN.length);
  const stages = ok(
    await db
      .from("leads")
      .select("id, stage")
      .in(
        "id",
        ALL.map((k) => W[k]),
      ),
  );
  const name = nameOf();
  const closed = stages.filter((l) => l.stage === "archived").map((l) => name.get(l.id));
  assert.deepEqual(new Set(closed), new Set(IN), "those rows, and nobody the page did not show under the filter");
});
