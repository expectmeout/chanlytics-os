/**
 * 00631 on the database: a lead's name and city put right by its owner (lead_named).
 *
 *   1. Written as typed and marked: the name and the city, their spaces made single; facts.own says which are the
 *      owner's and what its listing said, kept the first time only; the version moves; the event names no word.
 *   2. Refused: nothing typed, the same again, a name too short or too long, a city too long; a lead of another
 *      workspace is not found, and a caller with no session reaches nothing. The listing's own name typed again is a
 *      change: it becomes the owner's.
 *   3. Their preview's workspace takes the name while it is a preview; one made theirs keeps its own.
 *   4. An email of theirs still waiting that holds a written line is sent back to be written again; one that holds none
 *      is left as it is.
 *
 * Local stack only: it makes workspaces, members, leads and a sequence with the service key, and removes them.
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
      ? "refusing a database that is not on this machine: this suite makes users and workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const ok = (r) => {
  assert.equal(r.error, null, r.error?.message);
  return r.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

let db;
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const at = (who) => `${who}-${stamp}@example.com`;
const users = [];
const tenants = [];
/** Chanlytics' own (ours: it makes previews), and an ordinary workspace. */
let A;
let B;
const as = {};
let n = 0;
let W;

async function person(role, tenant, name = role) {
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email: at(name), password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  if (tenant) ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email: at(name), password }));
  return { id: made.data.user.id, c };
}

const lead = (over = {}, tenant = A) => {
  n += 1;
  return one(
    db.from("leads").insert({
      tenant_id: tenant,
      place_id: `ChIJfixtureNamed${stamp}${n}`,
      business_name: `Fixture Barbers ${n}`,
      city: "Austin",
      region: "TX",
      stage: "ready",
      email: at(`l${n}`),
      email_state: "ok",
      ...over,
    }),
  );
};
const rowOf = async (id) =>
  ok(await db.from("leads").select("business_name, city, facts, version").eq("id", id).single());
const named = (c, id, over) => c.rpc("lead_named", { p_lead_id: id, ...over });
const tenantOf = async (id) => ok(await db.from("tenants").select("name, status").eq("id", id).single());
const newsOf = async (id) =>
  ok(
    await db
      .from("events")
      .select("data")
      .eq("tenant_id", A)
      .eq("subject_id", id)
      .eq("kind", "lead.named")
      .order("created_at"),
  );

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db
      .from("tenants")
      .insert({ slug: `named-a-${stamp}`, name: "Chanlytics", timezone: "America/New_York", ours: true }),
  );
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  B = await one(db.from("tenants").insert({ slug: `named-b-${stamp}`, name: "Elsewhere Co" }));
  ok(await db.rpc("provision_tenant", { p_tenant_id: B }));
  tenants.push(A, B);
  as.owner = await person("owner", A);
  as.operator = await person("operator", A, "operator");
  as.stranger = await person("owner", B, "stranger");
  as.claimer = await person(null, null, "claimer");
  W = {};
  W.template = await one(
    db.from("templates").insert({ tenant_id: A, channel: "email", name: "fixture_named_1", language: "en" }),
  );
  W.F = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "people", card: "local_businesses", name: "Barbers", asked: "", plan: {} }),
  );
});

after(async () => {
  if (skip) return;
  for (const id of tenants.filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const u of users) await db.auth.admin.deleteUser(u).catch(() => {});
});

test("written as typed and marked as the owner's own, with what its listing said kept once", { skip }, async () => {
  const id = await lead({ business_name: "FIXTURE BARBERS LLC" });
  const was = await rowOf(id);
  const said = ok(await named(as.owner.c, id, { p_business_name: "  Fixture   Barbers " }));
  assert.deepEqual(said, {
    ok: true,
    business_name: "Fixture Barbers",
    city: "Austin",
    again: 0,
    version: was.version + 1,
  });
  const first = await rowOf(id);
  assert.equal(first.business_name, "Fixture Barbers", "its spaces made single, nothing else");
  assert.equal(first.city, "Austin");
  assert.deepEqual(first.facts.own, { name: true, was: { name: "FIXTURE BARBERS LLC" } });
  assert.equal(first.version, was.version + 1);

  // Put right again, with its city: what the listing said stays what the LISTING said.
  ok(await named(as.owner.c, id, { p_business_name: "Fixture Barber Co", p_city: "Round Rock" }));
  const second = await rowOf(id);
  assert.deepEqual([second.business_name, second.city], ["Fixture Barber Co", "Round Rock"]);
  assert.deepEqual(second.facts.own, {
    name: true,
    city: true,
    was: { name: "FIXTURE BARBERS LLC", city: "Austin" },
  });

  const news = await newsOf(id);
  assert.deepEqual(
    news.map((e) => e.data),
    [
      { name: true, city: false, again: 0, by: as.owner.id },
      { name: true, city: true, again: 0, by: as.owner.id },
    ],
  );
  assert.ok(!/Fixture|Round Rock|Austin/.test(JSON.stringify(news)), "an event never holds a name or a city");
});

test("a lead's other facts are kept beside the mark", { skip }, async () => {
  const id = await lead({ facts: { size: "11 - 50" } });
  ok(await named(as.owner.c, id, { p_city: "Pflugerville" }));
  const row = await rowOf(id);
  assert.equal(row.facts.size, "11 - 50");
  assert.deepEqual(row.facts.own, { city: true, was: { city: "Austin" } });
});

test("refused: nothing typed, the same again, a name or a city out of its length", { skip }, async () => {
  const id = await lead({ business_name: "IKEA" });
  assert.deepEqual(ok(await named(as.owner.c, id, {})), { error: "nothing" });
  assert.deepEqual(ok(await named(as.owner.c, id, { p_business_name: "   ", p_city: " " })), { error: "nothing" });
  assert.deepEqual(ok(await named(as.owner.c, id, { p_business_name: "x" })), { error: "bad_name" });
  assert.deepEqual(ok(await named(as.owner.c, id, { p_business_name: "x".repeat(201) })), { error: "bad_name" });
  assert.deepEqual(ok(await named(as.owner.c, id, { p_city: "x".repeat(121) })), { error: "bad_city" });
  const untouched = await rowOf(id);
  assert.deepEqual([untouched.business_name, untouched.facts.own], ["IKEA", undefined]);

  // The listing's own name typed again IS a change: it becomes the owner's, said as typed from then on.
  assert.equal(ok(await named(as.owner.c, id, { p_business_name: "IKEA" })).ok, true);
  assert.equal((await rowOf(id)).facts.own.name, true);
  // And then it is what it says already.
  assert.deepEqual(ok(await named(as.owner.c, id, { p_business_name: "IKEA" })), { error: "nothing" });
});

test(
  "who may: the owner; not an operator, not another workspace's owner, not a caller with no session",
  { skip },
  async () => {
    const id = await lead();
    const operator = await named(as.operator.c, id, { p_city: "Round Rock" });
    assert.equal(operator.error?.code, "P0002", "an operator may not find leads, so the lead is not found");
    const stranger = await named(as.stranger.c, id, { p_city: "Round Rock" });
    assert.equal(stranger.error?.code, "P0002");
    const nobody = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const anon = await named(nobody, id, { p_city: "Round Rock" });
    assert.ok(anon.error, "the door is not anon's to call");
    assert.equal((await rowOf(id)).city, "Austin");
  },
);

test(
  "their preview's workspace takes the name while it is a preview; one made theirs keeps its own",
  { skip },
  async () => {
    const make = async (leadId) => {
      const p = ok(
        await db.rpc("preview_make", {
          p_tenant_id: A,
          p_lead_id: leadId,
          p_name: "Fixture Barbers",
          p_timezone: "America/Chicago",
          p_by: null,
        }),
      );
      tenants.push(p.preview_tenant_id);
      assert.equal(ok(await db.rpc("preview_built", { p_id: p.id, p_ok: true })), true);
      return p;
    };
    const open = await lead();
    const p = await make(open);
    ok(await named(as.owner.c, open, { p_business_name: "Barbers of Fixture" }));
    assert.deepEqual(await tenantOf(p.preview_tenant_id), { name: "Barbers of Fixture", status: "preview" });
    // A city alone leaves its name.
    ok(await named(as.owner.c, open, { p_city: "Round Rock" }));
    assert.equal((await tenantOf(p.preview_tenant_id)).name, "Barbers of Fixture");

    const taken = await lead();
    const q = await make(taken);
    ok(await as.claimer.c.rpc("preview_claim", { p_token: q.token }));
    const theirs = await tenantOf(q.preview_tenant_id);
    assert.equal(theirs.status, "active");
    ok(await named(as.owner.c, taken, { p_business_name: "Somebody Else's Idea" }));
    assert.equal((await tenantOf(q.preview_tenant_id)).name, theirs.name, "one made theirs is theirs to name");
  },
);

test(
  "an email of theirs still waiting with a written line is written again; one with none is left",
  { skip },
  async () => {
    const withLine = await lead();
    const without = await lead();
    for (const id of [withLine, without])
      ok(
        await db.from("lead_search_members").insert({
          search_id: W.F,
          lead_id: id,
          tenant_id: A,
          class: "qualified",
          counted: true,
          counted_month: new Date().toISOString().slice(0, 7),
          fit: "strong",
          reason: "",
          judgment: { answer: "yes", reasons: [], shares: [] },
        }),
      );
    const chosen = ok(
      await as.owner.c.rpc("lead_search_choose", {
        p_tenant_id: A,
        p_name: `Austin barbers ${stamp}`,
        p_lead_ids: [withLine, without],
      }),
    );
    const step = await one(
      db.from("sequence_steps").insert({
        tenant_id: A,
        kind: "reach_out",
        name: "Austin barbers",
        trigger: "lead_first",
        policy_class: "outreach",
        state: "running",
        lead_search_id: chosen.search_id,
        gap_minutes: 12,
        template_id: W.template,
        template_language: "en",
        template_name: "fixture_named_1",
      }),
    );
    const sends = { [withLine]: crypto.randomUUID(), [without]: crypto.randomUUID() };
    const due = new Date(Date.now() + 3_600_000).toISOString();
    ok(
      await db.rpc("reach_out_plan_run", {
        p_run: {
          id: crypto.randomUUID(),
          tenant_id: A,
          playbook_id: step,
          run_for: new Date().toISOString().slice(0, 10),
          name: "Run",
          template_id: W.template,
          template_name: "fixture_named_1",
          template_language: "en",
          state: "pending_approval",
          scheduled_for: due,
          recipient_count: 2,
          audience: { kind: "reach_out", root_id: step, step_id: step, search_id: chosen.search_id },
        },
        p_sends: [withLine, without].map((id) => ({
          id: sends[id],
          lead_id: id,
          contact_id: null,
          send_at: due,
          state: "planned",
        })),
      }),
    );
    const checked = { checked_at: new Date().toISOString(), checked_words: "mark-1" };
    ok(
      await db
        .from("sequence_sends")
        .update({ ...checked, opening: "A line about Fixture Barbers.", angle: "listing" })
        .eq("id", sends[withLine]),
    );
    ok(await db.from("sequence_sends").update(checked).eq("id", sends[without]));
    const sendOf = async (id) =>
      ok(
        await db
          .from("sequence_sends")
          .select("state, opening, angle, checked_at, checked_words, check_gen")
          .eq("id", id)
          .single(),
      );
    const gen = (await sendOf(sends[withLine])).check_gen;

    assert.equal(ok(await named(as.owner.c, withLine, { p_business_name: "Barbers of Fixture" })).again, 1);
    assert.deepEqual(await sendOf(sends[withLine]), {
      state: "planned",
      opening: null,
      angle: null,
      checked_at: null,
      checked_words: null,
      check_gen: gen + 1,
    });
    assert.deepEqual((await newsOf(withLine)).at(-1).data, { name: true, city: false, again: 1, by: as.owner.id });

    // An email that holds no written line says the name from its blank as it goes: nothing to write again.
    assert.equal(ok(await named(as.owner.c, without, { p_business_name: "Fixture Cuts" })).again, 0);
    const left = await sendOf(sends[without]);
    assert.deepEqual([left.state, left.checked_words], ["planned", "mark-1"]);
    assert.notEqual(left.checked_at, null);
  },
);
