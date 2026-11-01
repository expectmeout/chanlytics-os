/**
 * 00459 on the database (one road from a lead to a sequence):
 *
 *   1. The pick is kept on the search (lead_search_aim): a member sets and clears it; only a sequence to leads of the
 *      workspace that has not ended; the search's view carries it.
 *   2. One creator: sequence_create makes a sequence to leads by name, a draft until Start (its first step paused), on a
 *      list holding the leads chosen; a copy takes another's steps; the search a pile works through takes it as its pick.
 *   3. Auto-add: a sequence draws its search's ready leads without a press, never one put off for later; one taken out
 *      stays out, and Put back brings it in again; the add door says such a lead is in already.
 *   4. Move: a lead nothing was sent to leaves one sequence as moved and joins another; one written to stays.
 *   5. Skip this email from step 2 moves the lead on to the next step; at step 1 it still leaves.
 *   5a. Put back (00502): a lead nothing reached goes back on its list, its first email free; one written to keeps its step.
 *   6. One reader: sequence_places, and the place of one lead (sequence_place) and of many (sequence_places_of), say what
 *      sequence_people says.
 *
 * Local stack only: it makes workspaces, members, leads, searches and sequences with the service key, and removes them.
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
      ? "refusing a database that is not on this machine: this suite writes leads and their sequences"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const stamp = Date.now().toString(36);
const at = (who) => `${who}-${stamp}@fixture-road.example`;
const month = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const DAY = 86_400_000;

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
  const email = `road-${label}-${stamp}-${tenant === A ? "a" : "b"}@fixture-road.example`;
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
      place_id: `ChIJfixtureRoad${stamp}${n}`,
      business_name: `Road Bookshop ${n}`,
      city: "Portland",
      region: "OR",
      stage: "ready",
      email: at(`l${n}`),
      email_state: "ok",
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
const search = (name) =>
  one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "people", card: "local_businesses", name, asked: "", plan: {} }),
  );
const create = (who, first, start = false) =>
  who.c.rpc("sequence_create", { p_tenant_id: A, p_first: { starts: "leads", ...first }, p_start: start });
const audience = async (listId) =>
  ok(await db.rpc("reach_out_audience", { p_tenant_id: A, p_search_id: listId, p_limit: 100 })).map((r) => r.lead_id);
const placeIn = async (seq, leadId) =>
  ok(
    await db
      .from("sequence_enrollments")
      .select("id, state, why, place, next_at")
      .eq("sequence_id", seq)
      .eq("lead_id", leadId),
  );
const rootOf = async (seq) => ok(await db.from("sequence_steps").select("*").eq("id", seq).single());
const stepsOf = async (seq) =>
  ok(
    await db
      .from("sequence_steps")
      .select("id, place, after_days, hand, template_id, state")
      .eq("sequence_id", seq)
      .order("place"),
  );

/** A run of a step, its sends planned, written as core's runReachOut writes it. */
async function planRun(root, step, leads, state = "pending_approval", runFor = today()) {
  const id = crypto.randomUUID();
  const r = await rootOf(root);
  const s = (await stepsOf(root)).find((x) => x.id === step);
  const t = ok(await db.from("templates").select("name, language").eq("id", s.template_id).single());
  ok(
    await db.rpc("reach_out_plan_run", {
      p_run: {
        id,
        tenant_id: A,
        playbook_id: step,
        run_for: runFor,
        name: "Run",
        template_id: s.template_id,
        template_name: t.name,
        template_language: t.language,
        state,
        scheduled_for: new Date(Date.now() + 3_600_000).toISOString(),
        recipient_count: leads.length,
        audience: { kind: "reach_out", root_id: root, step_id: step, search_id: r.lead_search_id },
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
/** A planned send that went, through the states a send moves by: claimed, queued, sent. */
async function markSent(batch, leadId, sentAt = new Date().toISOString()) {
  const sends = ok(await db.from("sequence_sends").select("id").eq("batch_id", batch).eq("lead_id", leadId));
  assert.equal(sends.length, 1, "its send was planned");
  ok(await db.from("sequence_sends").update({ checked_at: new Date().toISOString() }).eq("id", sends[0].id));
  for (const state of ["claimed", "queued"])
    ok(await db.from("sequence_sends").update({ state }).eq("id", sends[0].id));
  ok(
    await db
      .from("sequence_sends")
      .update({ state: "sent", sent_at: sentAt })
      .eq("batch_id", batch)
      .eq("lead_id", leadId),
  );
}
const sendOf = async (batch, leadId) =>
  ok(await db.from("sequence_sends").select("id, state, reason").eq("batch_id", batch).eq("lead_id", leadId).single());

const W = {};
before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db.from("tenants").insert({ slug: `road-a-${stamp}`, name: "Harbor Books", timezone: "America/Los_Angeles" }),
  );
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  B = await one(db.from("tenants").insert({ slug: `road-b-${stamp}`, name: "Elsewhere Co" }));
  for (const role of ["owner", "operator", "viewer"]) as[role] = await person(role);
  as.stranger = await person("owner", B, "stranger");
  // A finder search with its leads, each counted once.
  W.F = await search("Independent bookstores");
  for (const k of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
    W[k] = await lead();
    await member(W.F, W[k]);
  }
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
  "one creator: a sequence to leads by name is a draft on a list holding the leads, the pile's pick",
  { skip },
  async () => {
    refusedWith(await create(as.viewer, { name: "Viewer's", lead_ids: [W.a] }), "P0002");
    refusedWith(await create(as.operator, { name: "  ", lead_ids: [W.a] }), "22023");
    const made = ok(
      await create(as.operator, {
        name: "Bookstore intro",
        lead_ids: [W.a, W.b],
        aim_search_id: W.F,
        steps: [
          { subject: "A quick one for {{business name}}", body: "{{opening}} I run a studio." },
          { body: "Following up on my note.", after_days: 4 },
          { hand: { kind: "call", words: "Call them" }, after_days: 3 },
        ],
      }),
    );
    W.intro = made.id;
    assert.equal(made.state, "draft");
    assert.equal(made.steps, 3);
    assert.equal(made.added, 2);
    const seq = ok(await db.from("sequences").select("state, starts, name").eq("id", W.intro).single());
    assert.deepEqual([seq.state, seq.starts, seq.name], ["draft", "leads", "Bookstore intro"]);
    const steps = await stepsOf(W.intro);
    assert.equal(steps[0].state, "paused", "its first step waits for Start");
    assert.deepEqual(
      steps.map((s) => s.after_days),
      [null, 4, 3],
    );
    assert.equal(steps[2].hand.kind, "call", "the call step stays last");
    const root = await rootOf(W.intro);
    const list = ok(await db.from("lead_searches").select("via, name").eq("id", root.lead_search_id).single());
    assert.deepEqual([list.via, list.name], ["chosen", "Bookstore intro"]);
    assert.deepEqual((await audience(root.lead_search_id)).sort(), [W.a, W.b].sort(), "the leads chosen are on it");
    const aim = ok(await db.from("lead_searches_view").select("adds_to").eq("id", W.F).single());
    assert.equal(aim.adds_to, W.intro, "the search the pile works through picks it");
    // Started, it is on; a draft stays a draft while its first step is paused.
    ok(await db.from("sequence_steps").update({ name: "Bookstore intro" }).eq("id", W.intro));
    assert.equal(ok(await db.from("sequences").select("state").eq("id", W.intro).single()).state, "draft");

    // A copy: the same steps and words, on a list of its own; a blank one has one email still to write.
    const copy = ok(await create(as.owner, { name: "Gift shops", from: W.intro, lead_ids: [W.c] }));
    const copied = await stepsOf(copy.id);
    assert.deepEqual(
      copied.map((s) => s.after_days),
      [null, 4, 3],
    );
    const words = ok(await db.from("templates").select("components").eq("id", copied[0].template_id).single());
    assert.equal(words.components.find((c) => c.type === "HEADER").text, "A quick one for {{business name}}");
    assert.notEqual((await rootOf(copy.id)).lead_search_id, root.lead_search_id, "never a twin's list");
    const blank = ok(await create(as.owner, { name: "Coffee shops", lead_ids: [W.d] }));
    assert.equal(blank.steps, 1);
    const blankWords = ok(
      await db
        .from("templates")
        .select("components")
        .eq("id", (await stepsOf(blank.id))[0].template_id)
        .single(),
    );
    assert.equal(blankWords.components.find((c) => c.type === "BODY").text, "", "one email still to write");
    W.coffee = blank.id;
  },
);

test("the pick is kept on the search: a member's, a sequence to leads that has not ended", { skip }, async () => {
  const aim = (who, seq) => who.c.rpc("lead_search_aim", { p_tenant_id: A, p_search_id: W.F, p_sequence_id: seq });
  refusedWith(await aim(as.stranger, W.coffee), "P0002");
  ok(await aim(as.operator, W.coffee));
  assert.equal(ok(await db.from("lead_searches").select("adds_to").eq("id", W.F).single()).adds_to, W.coffee);
  ok(await aim(as.operator, null));
  assert.equal(ok(await db.from("lead_searches").select("adds_to").eq("id", W.F).single()).adds_to, null);
  ok(await db.from("sequences").update({ state: "ended" }).eq("id", W.coffee));
  refusedWith(await aim(as.operator, W.coffee), "P0002");
});

test(
  "auto-add: its search's ready leads join without a press; one taken out stays out until put back",
  { skip },
  async () => {
    const S = await search("Gift shops nearby");
    for (const k of ["e", "f", "g"]) await member(S, W[k]);
    ok(
      await db
        .from("lead_search_members")
        .update({ later_at: new Date().toISOString() })
        .eq("search_id", S)
        .eq("lead_id", W.g),
    );
    const made = ok(
      await create(as.owner, { name: "Gift shops, auto", from: W.intro, lead_ids: [W.h], source_search_id: S }),
    );
    const root = await rootOf(made.id);
    assert.equal(root.source_search_id, S);
    refusedWith(
      await create(as.owner, { name: "Twice", from: W.intro, lead_ids: [W.i], source_search_id: S }),
      "23505",
    );
    assert.deepEqual(
      (await audience(root.lead_search_id)).sort(),
      [W.e, W.f, W.h].sort(),
      "never one put off for later",
    );
    // The add door says a lead its search feeds is in already, and takes another.
    const dry = ok(await as.owner.c.rpc("reach_out_add", { p_root_id: made.id, p_lead_ids: [W.e, W.i], p_dry: true }));
    assert.deepEqual(
      dry.leads.map((l) => [l.lead_id, l.why]),
      [[W.e, "already"]],
    );
    assert.equal(dry.would_add, 1);
    // Taken out before anything was planned, it stays out of the audience; Put back brings it in again.
    const left = ok(
      await as.owner.c.rpc("sequence_leave", {
        p_tenant_id: A,
        p_sequence_id: made.id,
        p_enrollment_ids: [],
        p_lead_ids: [W.e],
      }),
    );
    assert.equal(left.left, 1);
    assert.deepEqual((await audience(root.lead_search_id)).sort(), [W.f, W.h].sort());
    ok(
      await as.owner.c.rpc("sequence_return", { p_tenant_id: A, p_sequence_id: made.id, p_undo_of: left.decision_id }),
    );
    assert.deepEqual((await audience(root.lead_search_id)).sort(), [W.e, W.f, W.h].sort());
  },
);

test(
  "move: a lead nothing was sent to leaves as moved and joins the other; one written to stays",
  { skip },
  async () => {
    // Bookstore intro, on: a's first email planned gives it a place.
    ok(await db.from("sequence_steps").update({ state: "running" }).eq("id", W.intro));
    const run = await planRun(W.intro, W.intro, [W.a, W.b]);
    assert.equal((await placeIn(W.intro, W.a))[0].state, "in");
    const target = ok(await create(as.owner, { name: "Bookshops, take two", from: W.intro, lead_ids: [W.j] }));
    refusedWith(
      await as.viewer.c.rpc("sequence_move", { p_tenant_id: A, p_lead_id: W.a, p_to_root: target.id }),
      "P0002",
    );
    const moved = ok(await as.owner.c.rpc("sequence_move", { p_tenant_id: A, p_lead_id: W.a, p_to_root: target.id }));
    assert.equal(moved.from, W.intro);
    const [old] = await placeIn(W.intro, W.a);
    assert.deepEqual([old.state, old.why], ["left", "moved"]);
    const s = await sendOf(run, W.a);
    assert.deepEqual([s.state, s.reason], ["skipped", "moved"]);
    const why = ok(await db.rpc("reach_out_why_not", { p_tenant_id: A, p_lead_ids: [W.a] }));
    assert.equal(why[0].why, null, "a moved first send does not count as written");
    assert.ok((await audience((await rootOf(target.id)).lead_search_id)).includes(W.a), "on the other's list");
    // Moved back (the move's undo): out of the other, on its old list again, added and not yet planned there.
    const back = ok(await as.owner.c.rpc("sequence_move", { p_tenant_id: A, p_lead_id: W.a, p_to_root: W.intro }));
    assert.equal(back.from, target.id);
    assert.ok(!(await audience((await rootOf(target.id)).lead_search_id)).includes(W.a), "off the other's list");
    const again = ok(await as.operator.c.rpc("sequence_place", { p_tenant_id: A, p_lead_id: W.a }));
    assert.deepEqual([again.sequence.id, again.place.group], [W.intro, "queued"], "added again, its old place gone");
    // b, written to in Bookstore intro, stays.
    await markSent(run, W.b);
    refusedWith(
      await as.owner.c.rpc("sequence_move", { p_tenant_id: A, p_lead_id: W.b, p_to_root: target.id }),
      "23505",
    );
  },
);

test(
  "put back: a lead nothing reached goes back on its list, its first email free; one written to keeps its step",
  { skip },
  async () => {
    const [fresh, written] = [await lead(), await lead()];
    for (const id of [fresh, written]) await member(W.F, id);
    const made = ok(
      await create(as.owner, { name: "Bookshops, take three", from: W.intro, lead_ids: [fresh, written] }, true),
    );
    const [first] = await stepsOf(made.id);
    const run = await planRun(made.id, first.id, [fresh, written]);
    const leave = async (leadId) =>
      ok(
        await as.owner.c.rpc("sequence_leave", {
          p_tenant_id: A,
          p_sequence_id: made.id,
          p_enrollment_ids: [],
          p_lead_ids: [leadId],
        }),
      );
    const putBack = async (left) =>
      ok(
        await as.owner.c.rpc("sequence_return", {
          p_tenant_id: A,
          p_sequence_id: made.id,
          p_undo_of: left.decision_id,
        }),
      );
    // Taken out of the batch before anything went: its email skipped, and the door says it was written to.
    const left = await leave(fresh);
    assert.deepEqual([(await sendOf(run, fresh)).state, (await sendOf(run, fresh)).reason], ["skipped", "removed"]);
    const before = ok(await db.rpc("reach_out_why_not", { p_tenant_id: A, p_lead_ids: [fresh] }));
    assert.equal(before[0].why, "written", "a skipped first email holds the lead until it is put back");
    // Put back: on its list again, its email free, nothing left out.
    const back = await putBack(left);
    assert.deepEqual([back.back, back.sends_out], [1, 0]);
    assert.equal((await sendOf(run, fresh)).reason, "moved");
    const [place] = await placeIn(made.id, fresh);
    assert.deepEqual([place.state, place.why], ["left", "moved"]);
    const after_ = ok(await db.rpc("reach_out_why_not", { p_tenant_id: A, p_lead_ids: [fresh] }));
    assert.equal(after_[0].why, null, "free to be written to");
    const list = (await rootOf(made.id)).lead_search_id;
    assert.ok((await audience(list)).includes(fresh), "its next batch plans its first email");
    const read = ok(await as.operator.c.rpc("sequence_place", { p_tenant_id: A, p_lead_id: fresh }));
    assert.deepEqual([read.sequence.id, read.place.group], [made.id, "queued"], "added again, not left");
    // Its next batch, tomorrow's (a step has one a day): a new first email, and its place in again.
    const tomorrow = new Date(Date.now() + DAY).toISOString().slice(0, 10);
    const next = await planRun(made.id, first.id, [fresh], "pending_approval", tomorrow);
    assert.equal((await sendOf(next, fresh)).state, "planned");
    assert.equal((await placeIn(made.id, fresh))[0].state, "in");
    // Pressed twice, nobody more comes back.
    assert.equal((await putBack(left)).back, 0);
    // A lead something reached keeps the step it reached, and is not offered to the list again.
    await markSent(run, written);
    const out = await leave(written);
    const again = await putBack(out);
    assert.equal(again.back, 1);
    assert.equal((await placeIn(made.id, written))[0].state, "in", "its place stands");
    const held = ok(await db.rpc("reach_out_why_not", { p_tenant_id: A, p_lead_ids: [written] }));
    assert.equal(held[0].why, "written", "a business is written to once");
  },
);

test(
  "skip this email from step 2 moves them on to the next step; at step 1 it still ends their place",
  { skip },
  async () => {
    const seq = ok(await create(as.owner, { name: "Three steps", from: W.intro, lead_ids: [W.c, W.d] }, true));
    const steps = await stepsOf(seq.id);
    const run1 = await planRun(seq.id, steps[0].id, [W.c, W.d]);
    // c's first email goes; d's is held at step 1.
    await markSent(run1, W.c, new Date(Date.now() - 5 * DAY).toISOString());
    ok(
      await db
        .from("sequence_sends")
        .update({ state: "held", reason: "unbacked_fact" })
        .eq("batch_id", run1)
        .eq("lead_id", W.d),
    );
    ok(await as.owner.c.rpc("reach_out_send_decide", { p_send_id: (await sendOf(run1, W.d)).id, p_decision: "skip" }));
    const [d] = await placeIn(seq.id, W.d);
    assert.deepEqual([d.state, d.why], ["left", "owner_skipped"], "at step 1 a skip still ends the place");
    // c's second email is held and skipped by its owner: on to step 3, after its wait.
    const run2 = await planRun(seq.id, steps[1].id, [W.c]);
    ok(
      await db
        .from("sequence_sends")
        .update({ state: "held", reason: "unbacked_fact" })
        .eq("batch_id", run2)
        .eq("lead_id", W.c),
    );
    ok(await as.owner.c.rpc("reach_out_send_decide", { p_send_id: (await sendOf(run2, W.c)).id, p_decision: "skip" }));
    const [c] = await placeIn(seq.id, W.c);
    assert.equal(c.state, "in", "still in it");
    assert.equal(c.place, 2);
    const due = Date.parse(c.next_at) - Date.now();
    assert.ok(due > 2.5 * DAY && due < 3.5 * DAY, "step 3 after its three days");
  },
);

test("one reader: one lead's place and many leads' say what the sequence's people say", { skip }, async () => {
  const draft = ok(await as.operator.c.rpc("sequence_people", { p_tenant_id: A, p_sequence_id: W.coffee }));
  assert.equal(draft.counts.queued, 1, "a draft's leads are queued on its list");
  // The overview counts them in it, says its span and that its one email is still to write (00459).
  const [coffee] = ok(await as.operator.c.rpc("sequence_overview", { p_tenant_id: A, p_sequence_id: W.coffee }));
  assert.equal(coffee.in_it, 1, "a draft's added leads are in it");
  assert.equal(coffee.unwritten, 1);
  assert.equal(coffee.days, 0);
  const [intro] = ok(await as.operator.c.rpc("sequence_overview", { p_tenant_id: A, p_sequence_id: W.intro }));
  assert.equal(intro.days, 7, "Day 1, then four days, then three");
  assert.equal(intro.unwritten, 0);
  const people = ok(await as.operator.c.rpc("sequence_people", { p_tenant_id: A, p_sequence_id: W.intro }));
  const rowOf = (id) => people.rows.find((r) => r.lead_id === id);
  const placeA = ok(await as.operator.c.rpc("sequence_place", { p_tenant_id: A, p_lead_id: W.a }));
  assert.equal(placeA.sequence.id, W.intro, "where its place stands: the sequence it moved back to");
  assert.equal(placeA.place.group, "queued", "on its list, nothing planned yet");
  assert.equal(rowOf(W.a).group, "queued", "its People row says the same");
  const placeB = ok(await as.operator.c.rpc("sequence_place", { p_tenant_id: A, p_lead_id: W.b }));
  assert.equal(placeB.sequence.id, W.intro);
  assert.equal(placeB.place.group, rowOf(W.b).group);
  assert.equal(placeB.sends.length, 1);
  assert.equal(placeB.sends[0].state, "sent");
  assert.equal(placeB.reads_replies, false, "no connected mailbox: replies are told");
  assert.equal(placeB.joined.auto, false, "added by hand");
  assert.ok(placeB.joined.at, "when they joined its list");
  const none = ok(await as.operator.c.rpc("sequence_place", { p_tenant_id: A, p_lead_id: W.i }));
  assert.equal(none, null, "in no sequence");
  const many = ok(await as.operator.c.rpc("sequence_places_of", { p_tenant_id: A, p_lead_ids: [W.a, W.b, W.i] }));
  assert.deepEqual(many.map((m) => m.lead_id).sort(), [W.a, W.b].sort(), "one row a lead in a sequence");
  assert.equal(many.find((m) => m.lead_id === W.b).group, rowOf(W.b).group);
  const stranger = ok(await as.stranger.c.rpc("sequence_places_of", { p_tenant_id: A, p_lead_ids: [W.a, W.b] }));
  assert.deepEqual(stranger, [], "another workspace reads nothing");
});
