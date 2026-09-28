/**
 * 00228 on the database (Reach out Part 5, PR 10; G20): a chain may end with a call or a note for the team.
 *
 *   1. reach_out_save makes a two-step chain whose second step is a call: its row has the hand and no template; a hand
 *      anywhere but last is refused, and a step that ran keeps what it is;
 *   2. the rows hold the shape: a hand on a moment, a hand beside a template, words past 280 characters, a template-less
 *      run that is no hand step's, all refused;
 *   3. with the first email's sent_at past the step's delay, the lead is the hand step's follower; its run makes one
 *      handed send and one step for the team, due that day; a second run the same day makes nothing; the lead is no
 *      longer a follower; a handed send never moves;
 *   4. the chain's report counts the hand step's lead as handed, and nothing of it as written.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces, people and leads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in as needs it"
        : false;

const DAY = 86_400_000;
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();
const today = () => new Date().toISOString().slice(0, 10);
let db;
let A;
let owner;
let session;
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;
const refusedWith = (res, code, words) => {
  assert.ok(res.error, "refused");
  assert.equal(res.error.code, code, res.error.message);
  if (words) assert.equal(res.error.message, words);
};

const CALL = { kind: "call", words: "ask whether the quote suited them" };
const chainOf = (search, steps) => ({
  name: "Reach out · Movers",
  search_id: search,
  include_unconfirmed: false,
  gap_minutes: 12,
  domain_ids: [],
  signed_by: "Sam",
  steps,
});
const FIRST = { subject: "Quick one for {{business}}", body: "{{opening}}\n\n{{your name}}", after_days: null };
const save = (chain) => db.rpc("reach_out_save", { p_tenant_id: A, p_user_id: owner, p_chain: chain });
const newSearch = () =>
  one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "people", card: "movers", name: `Movers ${(n += 1)}`, asked: "movers", plan: {} }),
  );

/** A chain whose second step is a call, and a lead its first email reached `ago` days back. */
async function chainWithACall(ago = 5) {
  const search = await newSearch();
  const saved = ok(await save(chainOf(search, [FIRST, { hand: CALL, after_days: 3 }])));
  const [root, hand] = saved.step_ids;
  n += 1;
  const address = `office-${n}@hand-${stamp}.example`;
  const person = await one(db.from("contacts").insert({ tenant_id: A, email: address, display_name: `Fixture ${n}` }));
  const lead = await one(
    db.from("leads").insert({
      tenant_id: A,
      place_id: `ChIJfixtureHand${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      city: "Austin",
      region: "TX",
      email: address,
      email_state: "ok",
      stage: "nurture",
      contact_id: person,
    }),
  );
  const { template_id, template_name } = ok(
    await db.from("playbooks").select("template_id, template_name").eq("id", root).single(),
  );
  const run = await one(
    db.from("broadcasts").insert({
      tenant_id: A,
      name: "Movers · sent",
      template_id,
      template_name,
      template_language: "en",
      audience: { kind: "reach_out", root_id: root, step_id: root },
      state: "sent",
      scheduled_for: iso(Date.now() - ago * DAY),
      playbook_id: root,
      run_for: new Date(Date.now() - ago * DAY).toISOString().slice(0, 10),
    }),
  );
  // The first email itself: the followers are read from the email that left (00226 reach_out_followers).
  const thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: person }));
  const sent = await one(
    db.from("messages").insert({
      tenant_id: A,
      conversation_id: thread,
      contact_id: person,
      channel: "email",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "Saw your shop on the map, and had a quick question.",
      status: "sent",
      meta: { email: { message_id: `<hand-${stamp}-${n}@send.example>` } },
      created_at: iso(Date.now() - ago * DAY),
    }),
  );
  ok(
    await db.from("reach_out_sends").insert({
      id: crypto.randomUUID(),
      tenant_id: A,
      broadcast_id: run,
      playbook_id: root,
      root_id: root,
      lead_id: lead,
      contact_id: person,
      state: "sent",
      send_at: iso(Date.now() - ago * DAY),
      sent_at: iso(Date.now() - ago * DAY),
      message_id: sent,
    }),
  );
  return { root, hand, lead, person };
}
const followers = async (c) =>
  ok(
    await db.rpc("reach_out_followers", {
      p_tenant_id: A,
      p_step_id: c.hand,
      p_parent_id: c.root,
      p_after_days: 3,
      p_limit: 50,
    }),
  ).map((f) => f.lead_id);
const handRun = (c, runId, items) =>
  db.rpc("reach_out_hand_run", { p_tenant_id: A, p_step_id: c.hand, p_run_id: runId, p_day: today(), p_items: items });
const itemFor = (c, words = "Call Fixture Movers: ask whether the quote suited them") => ({
  send_id: crypto.randomUUID(),
  lead_id: c.lead,
  contact_id: c.person,
  words,
  source_id: crypto.randomUUID(),
});

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db.from("tenants").insert({ slug: `hand-a-${stamp}`, name: "Harbor Moving Co", timezone: "America/Chicago" }),
  );
  const email = `hand-owner-${stamp}@fixture-hand.example`;
  const password = `pw-${stamp}-owner-Aa1!`;
  owner = ok(await db.auth.admin.createUser({ email, password, email_confirm: true })).user.id;
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: owner, role: "owner" }));
  session = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await session.auth.signInWithPassword({ email, password }));
});
after(async () => {
  if (skip) return;
  await db.from("events").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
  if (owner) await db.auth.admin.deleteUser(owner);
});

test(
  "a chain's last step may be a call: its row has the hand and no template; anywhere else it is refused",
  { skip },
  async () => {
    const c = await chainWithACall();
    const row = ok(
      await db
        .from("playbooks")
        .select("trigger, after_days, hand, template_id, template_name, name")
        .eq("id", c.hand)
        .single(),
    );
    assert.deepEqual(
      [row.trigger, row.after_days, row.hand, row.template_id, row.template_name],
      ["after_step", 3, CALL, null, null],
    );
    assert.equal(row.name, "Reach out · Movers · a call");
    const s = await newSearch();
    refusedWith(await save(chainOf(s, [{ ...FIRST, hand: CALL }])), "22023", "A call or a note ends the chain.");
    refusedWith(
      await save(chainOf(s, [FIRST, { hand: CALL, after_days: 3 }, { subject: null, body: "Again.", after_days: 4 }])),
      "22023",
      "A call or a note ends the chain.",
    );
  },
);

test("the rows hold the shape of a hand step, and of its run", { skip }, async () => {
  const c = await chainWithACall();
  const tpl = ok(await db.from("playbooks").select("template_id, template_name").eq("id", c.root).single());
  refusedWith(
    await db
      .from("playbooks")
      .update({ hand: { kind: "call", words: "x".repeat(281) } })
      .eq("id", c.hand),
    "23514",
  );
  refusedWith(
    await db
      .from("playbooks")
      .update({ hand: { kind: "visit", words: "x" } })
      .eq("id", c.hand),
    "23514",
  );
  refusedWith(
    await db
      .from("playbooks")
      .update({ hand: { ...CALL, extra: 1 } })
      .eq("id", c.hand),
    "23514",
  );
  refusedWith(await db.from("playbooks").update({ hand: CALL }).eq("id", c.root), "23514", undefined);
  refusedWith(
    await db
      .from("playbooks")
      .update({ template_id: tpl.template_id, template_name: tpl.template_name, template_language: "en" })
      .eq("id", c.hand),
    "23514",
  );
  refusedWith(
    await db.from("broadcasts").insert({
      tenant_id: A,
      name: "No template",
      audience: { kind: "reach_out", root_id: c.root, step_id: c.root },
      state: "scheduled",
      scheduled_for: iso(Date.now()),
    }),
    "23514",
  );
});

test("the hand step's run: one handed send and one step for the team, due that day, and once", { skip }, async () => {
  const c = await chainWithACall();
  assert.deepEqual(await followers(c), [c.lead], "past the step's delay, the lead is its follower");
  const runId = crypto.randomUUID();
  const item = itemFor(c);
  assert.deepEqual(ok(await handRun(c, runId, [item])), { run_id: runId, made: 1, already: 0 });
  const run = ok(
    await db
      .from("broadcasts")
      .select("state, template_id, audience, recipient_count, run_for")
      .eq("id", runId)
      .single(),
  );
  assert.deepEqual(
    [run.state, run.template_id, run.audience.hand, run.audience.root_id, run.recipient_count, run.run_for],
    ["sent", null, "call", c.root, 1, today()],
  );
  const send = ok(
    await db.from("reach_out_sends").select("state, sent_at, playbook_id").eq("id", item.send_id).single(),
  );
  assert.equal(send.state, "handed");
  assert.ok(send.sent_at);
  const steps = ok(
    await db.from("person_notes").select("due_on, body").eq("contact_id", c.person).eq("source_id", item.source_id),
  );
  assert.deepEqual(steps, [{ due_on: today(), body: item.words }]);

  assert.deepEqual(
    ok(await handRun(c, runId, [{ ...item }])),
    { run_id: runId, made: 0, already: 1 },
    "a replay makes nothing",
  );
  assert.deepEqual(await followers(c), [], "a handed lead is on the step");
  refusedWith(await db.from("reach_out_sends").update({ state: "planned" }).eq("id", item.send_id), "P0001");
  refusedWith(await handRun(c, crypto.randomUUID(), [itemFor(c)]), "23505", "This step has another run for that day.");
});

test(
  "a lead the reach-out has not waited on yet is not the step's; a step that ran keeps what it is",
  { skip },
  async () => {
    const early = await chainWithACall(1);
    assert.deepEqual(await followers(early), [], "the first email left a day ago; the call waits three");
    const c = await chainWithACall();
    ok(await handRun(c, crypto.randomUUID(), [itemFor(c)]));
    const search = ok(await db.from("playbooks").select("lead_search_id").eq("id", c.root).single()).lead_search_id;
    const edit = {
      ...chainOf(search, [
        { ...FIRST, id: c.root },
        { id: c.hand, subject: null, body: "Instead, an email.", after_days: 3 },
      ]),
      root_id: c.root,
    };
    refusedWith(await save(edit), "23503", "That step has run already. Add a new step instead.");
    const drop = { ...chainOf(search, [{ ...FIRST, id: c.root }]), root_id: c.root };
    refusedWith(await save(drop), "23503", "That step has written already. Pause the reach-out instead.");
  },
);

test("the chain's report counts the hand step's lead as handed, and nothing of it as written", { skip }, async () => {
  const c = await chainWithACall();
  const runId = crypto.randomUUID();
  ok(await handRun(c, runId, [itemFor(c)]));
  const r = ok(await session.rpc("reach_out_chain_report", { p_tenant_id: A, p_root_id: c.root }));
  const [first, call] = r.steps;
  assert.deepEqual([first.written, first.handed], [1, 0]);
  assert.deepEqual([call.written, call.handed, call.wrote_back, call.said_no], [0, 1, 0, 0]);
  const run = r.runs.find((x) => x.id === runId);
  assert.deepEqual([run.handed, run.written, run.state], [1, 0, "sent"]);
});
