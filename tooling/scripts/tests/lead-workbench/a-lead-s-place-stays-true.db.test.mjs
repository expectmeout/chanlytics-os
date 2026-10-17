/**
 * 00455 on the database (the lead sheet, in Sequences' words): a lead's place in its sequence stays true.
 *
 *   1. Take out takes a lead by its id: by its place while it stands, and one on a list-fed sequence's list that
 *      nothing has been planned for comes off the list; Put back puts each back as it was; a viewer and another
 *      workspace's owner find nobody.
 *   2. A later step passes over by name (sequence_leads_leave): each place still standing leaves with its why and a
 *      send of theirs not yet gone is skipped with it; the service role's alone.
 *   3. Stop writing ends their place where nothing of theirs is on its way.
 *   4. Who wrote back and waits for an answer is People's own group, replied, with their reading, and stands there
 *      alone: a reading that asks for no answer (no, away) is not one.
 *
 * Local stack only: it makes workspaces, members, leads, a list and its sequence, with the service key, and removes them.
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
const at = (who) => `${who}-${stamp}@fixture-place.example`;
const month = () => new Date().toISOString().slice(0, 7);

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
  const email = `place-${label}-${stamp}-${tenant === A ? "a" : "b"}@fixture-place.example`;
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
      place_id: `ChIJfixturePlace${stamp}${n}`,
      business_name: `Fixture Bookshop ${n}`,
      city: "Portland",
      region: "OR",
      stage: "ready",
      email: at(`l${n}`),
      email_state: "ok",
      ...over,
    }),
  );
};
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
const onList = async (searchId) =>
  ok(await db.from("lead_search_members").select("lead_id").eq("search_id", searchId).is("blanked_at", null)).map(
    (r) => r.lead_id,
  );
const placeOf = async (leadId) =>
  ok(await db.from("sequence_enrollments").select("id, state, why").eq("sequence_id", W.R).eq("lead_id", leadId));

/** A run of the sequence's first step, its sends planned, written as core's runReachOut writes it. */
async function planRun(leads) {
  const id = crypto.randomUUID();
  ok(
    await db.rpc("reach_out_plan_run", {
      p_run: {
        id,
        tenant_id: A,
        playbook_id: W.R,
        run_for: new Date().toISOString().slice(0, 10),
        name: "Run",
        template_id: W.template,
        template_name: "fixture_place_1",
        template_language: "en_US",
        state: "pending_approval",
        scheduled_for: new Date(Date.now() + 3_600_000).toISOString(),
        recipient_count: leads.length,
        audience: { kind: "reach_out", root_id: W.R, step_id: W.R, search_id: W.L },
      },
      p_sends: leads.map((leadId) => ({
        id: crypto.randomUUID(),
        lead_id: leadId,
        contact_id: null,
        domain_id: null,
        send_at: new Date(Date.now() + 3_600_000).toISOString(),
        state: "planned",
      })),
    }),
  );
  return id;
}

/** The world: a finder search the leads were found by, a list chosen from it, and the list's sequence. */
let W;
before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db.from("tenants").insert({ slug: `place-a-${stamp}`, name: "Harbor Books", timezone: "America/Los_Angeles" }),
  );
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  B = await one(db.from("tenants").insert({ slug: `place-b-${stamp}`, name: "Elsewhere Co" }));
  for (const role of ["owner", "operator", "viewer"]) as[role] = await person(role);
  as.stranger = await person("owner", B, "stranger");
  W = {};
  W.template = await one(
    db.from("templates").insert({ tenant_id: A, channel: "whatsapp", name: "fixture_place_1", language: "en_US" }),
  );
  W.F = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "people", card: "local_businesses", name: "Bookshops", asked: "", plan: {} }),
  );
  for (const k of ["waits", "placed", "planned", "stop", "wrote", "said_no"]) {
    W[k] = await lead();
    await member(W.F, W[k]);
  }
  const chosen = ok(
    await as.owner.c.rpc("lead_search_choose", {
      p_tenant_id: A,
      p_name: `Portland bookshops ${stamp}`,
      p_lead_ids: [W.waits, W.placed, W.planned, W.stop, W.wrote, W.said_no],
    }),
  );
  W.L = chosen.search_id;
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
      template_name: "fixture_place_1",
    }),
  );
  // Every lead on the list but one has its first email planned, which gives each a place in the sequence.
  W.run = await planRun([W.placed, W.planned, W.stop, W.wrote, W.said_no]);
});

after(async () => {
  if (skip) return;
  for (const id of [A, B].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const u of users) await db.auth.admin.deleteUser(u).catch(() => {});
});

test("Take out takes a lead on the list nothing was planned for; Put back puts it on again", { skip }, async () => {
  assert.deepEqual(await placeOf(W.waits), [], "nothing planned: no place yet");
  assert.ok((await onList(W.L)).includes(W.waits));
  const leave = (who, leads, ids = []) =>
    who.c.rpc("sequence_leave", {
      p_tenant_id: A,
      p_sequence_id: W.R,
      p_enrollment_ids: ids,
      p_lead_ids: leads,
    });
  refusedWith(await leave(as.viewer, [W.waits]), "P0002");
  refusedWith(await leave(as.stranger, [W.waits]), "P0002");
  // A lead with a place, named by its id, leaves by its place, and stays on the list it was found on.
  const byPlace = ok(await leave(as.operator, [W.placed]));
  assert.equal(byPlace.left, 1);
  const [gone] = await placeOf(W.placed);
  assert.deepEqual([gone.state, gone.why], ["left", "removed"]);
  assert.ok((await onList(W.L)).includes(W.placed), "a lead with a place stays on the list");
  const placeBack = ok(
    await as.operator.c.rpc("sequence_return", { p_tenant_id: A, p_sequence_id: W.R, p_undo_of: byPlace.decision_id }),
  );
  assert.equal(placeBack.back, 1);
  assert.equal((await placeOf(W.placed))[0].state, "in", "its place put back");

  const left = ok(await leave(as.operator, [W.waits]));
  assert.equal(left.left, 1);
  assert.ok(!(await onList(W.L)).includes(W.waits), "off the list");
  const decision = ok(await db.from("decisions").select("payload").eq("id", left.decision_id).single());
  assert.equal(decision.payload.put_back.members.length, 1, "the membership kept for Put back");
  assert.equal(decision.payload.put_back.members[0].lead_id, W.waits);

  const back = ok(
    await as.operator.c.rpc("sequence_return", { p_tenant_id: A, p_sequence_id: W.R, p_undo_of: left.decision_id }),
  );
  assert.equal(back.back, 1, "put back");
  assert.ok((await onList(W.L)).includes(W.waits), "on the list again");
});

test(
  "a later step passes over by name: each place leaves with its why, a send not yet gone skipped; the service role's",
  { skip },
  async () => {
    const [was] = await placeOf(W.wrote);
    assert.equal(was.state, "in");
    refusedWith(
      await as.operator.c.rpc("sequence_leads_leave", {
        p_tenant_id: A,
        p_sequence_id: W.R,
        p_leads: [{ lead_id: W.wrote, why: "outreach_wrote_back" }],
      }),
      "42501",
    );
    const n = ok(
      await db.rpc("sequence_leads_leave", {
        p_tenant_id: A,
        p_sequence_id: W.R,
        p_leads: [
          { lead_id: W.wrote, why: "outreach_wrote_back" },
          { lead_id: W.said_no, why: "outreach_lead_closed" },
          { lead_id: W.waits, why: "outreach_wrote_back" },
        ],
      }),
    );
    assert.equal(n, 2, "the two with a place; one with none is nobody here");
    const [wrote] = await placeOf(W.wrote);
    assert.deepEqual([wrote.state, wrote.why], ["left", "outreach_wrote_back"]);
    const [no] = await placeOf(W.said_no);
    assert.deepEqual([no.state, no.why], ["left", "outreach_lead_closed"]);
    const sends = ok(await db.from("sequence_sends").select("lead_id, state, reason").eq("batch_id", W.run));
    const of = (id) => sends.find((s) => s.lead_id === id);
    assert.deepEqual([of(W.wrote).state, of(W.wrote).reason], ["skipped", "outreach_wrote_back"]);
    assert.equal(of(W.planned).state, "planned", "nobody else's");
    assert.equal(
      ok(await db.rpc("sequence_leads_leave", { p_tenant_id: A, p_sequence_id: W.R, p_leads: [] })),
      0,
      "nobody named: nothing",
    );
  },
);

test("Stop writing ends their place where nothing of theirs is on its way", { skip }, async () => {
  // The planned email is skipped by the stop, which ends the place with it; and a place between steps ends too.
  const r = ok(await as.operator.c.rpc("reach_out_lead_stop", { p_lead_id: W.stop }));
  assert.equal(r.stopped, true);
  const [place] = await placeOf(W.stop);
  assert.equal(place.state, "left", "no place stands after a stop");
});

test(
  "who wrote back and waits for an answer is People's own group, with their reading, and stands there alone",
  { skip },
  async () => {
    // A person who asked a question about the email that went to them, read now.
    const contact = await one(db.from("contacts").insert({ tenant_id: A, email: at("planned"), display_name: "Dana" }));
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
    const send = ok(
      await db.from("sequence_sends").select("id").eq("batch_id", W.run).eq("lead_id", W.planned).single(),
    );
    const reading = (over) =>
      db.from("sequence_replies").insert({
        message_id: message,
        tenant_id: A,
        conversation_id: thread,
        contact_id: contact,
        lead_id: W.planned,
        send_id: send.id,
        claim: "person",
        intent: "question",
        summary: "Asks whether calls on Sundays are answered",
        ...over,
      });
    ok(await reading({}));
    const people = ok(await as.operator.c.rpc("sequence_people", { p_tenant_id: A, p_sequence_id: W.R }));
    const replied = people.rows.filter((r) => r.group === "replied");
    assert.equal(people.counts.replied, 1);
    assert.deepEqual(
      [replied[0].lead_id, replied[0].reply],
      [
        W.planned,
        { intent: "question", summary: "Asks whether calls on Sundays are answered", conversation_id: thread },
      ],
    );
    assert.ok(replied[0].enrollment_id, "their place, while it stands, for Take out");
    assert.equal(
      people.rows.filter((r) => r.lead_id === W.planned).length,
      1,
      "shown where they wrote back alone, not again where their place stands",
    );
    assert.ok(
      people.rows.every((r) => r.group === "replied" || r.reply === null),
      "every other row carries no reading",
    );
    // Read as a no, it asks for no answer: not one of the group, as the overview counts none.
    ok(await db.from("sequence_replies").update({ intent: "no" }).eq("message_id", message));
    const after = ok(await as.operator.c.rpc("sequence_people", { p_tenant_id: A, p_sequence_id: W.R }));
    assert.equal(after.counts.replied ?? 0, 0);
    assert.equal(after.rows.filter((r) => r.lead_id === W.planned).length, 1, "back where their place stands");
  },
);
