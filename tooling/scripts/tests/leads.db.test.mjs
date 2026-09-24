/**
 * The doors that work a lead, proved on a real Postgres with real sessions:
 * the stage and the six call outcomes, "Did you send it?", Not a fit, bulk
 * over a selection and over a view, erase, the export mark, the lists and
 * their counts, the page's sorts, the bell's two kinds, and the undo of each
 * (release B, migration 00142_the_leads_are_worked.sql; PRD v3 §9, §0.4).
 *
 * Runs the way lead-engine.db.test.mjs does: against the database
 * `supabase start` builds on this machine, never production. The sessions are
 * real -- users made with the admin API, signed in with a password through the
 * anon key -- so every door judges auth.uid() as the dashboard's client would.
 * A failed sign-in fails the test (review E11).
 *
 * The fixtures are fictional: every domain under .example, every phone in
 * 555-0100..0199, every place id ChIJfixture.... That database is shared with
 * every other worktree on this machine, so this suite leaves no row behind.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { leadSuppressionHash } from "@chanlytics/contracts";
import { stageArgs, LEAD_CONSENT_REFUSAL } from "../../../packages/contracts/src/leads.ts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and leads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

let db;
let A; // the workspace under test, in America/Chicago
let owner; // an owner of A
let operator; // an operator of A
let viewer; // a viewer of A
const users = [];
const ids = {}; // what the tests hand each other, in order

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
/** The error a door raised, as the client reads it. */
const said = async (p) => {
  const res = await p;
  assert.notEqual(res.error, null, `expected a refusal, got ${JSON.stringify(res.data)}`);
  return res.error.message;
};

/** A real session for a fresh user with this role in this workspace. */
async function memberClient(role, tenant) {
  const email = `leadsb-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

/** The stage door as the route calls it: the page's words, through contracts. */
const setStage = (who, leadId, input) => who.client.rpc("lead_set_stage", { p_lead_id: leadId, ...stageArgs(input) });
const leadRow = async (id) => ok(await db.from("leads").select("*").eq("id", id).single());
const events = async (subjectId) => ok(await db.from("events").select("kind, data").eq("subject_id", subjectId));

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `leads-b-${Date.now()}`, name: "Leads B", timezone: "America/Chicago" })
      .select("id")
      .single(),
  ).id;
  owner = await memberClient("owner", A);
  operator = await memberClient("operator", A);
  viewer = await memberClient("viewer", A);
  ids.search = ok(
    await db
      .from("lead_searches")
      .insert({
        tenant_id: A,
        created_by: owner.userId,
        via: "people",
        card: "local_businesses",
        name: "personal trainers",
        asked: "personal trainers in Austin",
        plan: { version: 1 },
      })
      .select("id")
      .single(),
  ).id;
  ids.round = ok(
    await db
      .from("lead_rounds")
      .insert({
        tenant_id: A,
        search_id: ids.search,
        seq: 1,
        purpose: "probe",
        plan: { version: 1 },
        plan_version: 1,
        target: 200,
        state: "queued",
        month: "2026-09",
        day: "2026-09-19",
        platform_day: "2026-09-19",
      })
      .select("id")
      .single(),
  ).id;
  // Six places: five qualified and counted, one in Needs review. The sixth has
  // no number, so the address-only conversion has something to take, and
  // found_at is explicit so every keyset tie-break is the same twice.
  for (let i = 1; i <= 6; i++) {
    const lead = ok(
      await db
        .from("leads")
        .insert({
          tenant_id: A,
          place_id: `ChIJfixtureB${i}`,
          business_name: `Fixture ${i}`,
          category: "Personal trainer",
          street: `${i} Fixture St`,
          city: "Austin",
          region: "TX",
          postal_code: "78704",
          website_host: `fixture${i}.example`,
          phone_e164: i === 6 ? null : `+151255501${String(i).padStart(2, "0")}`,
          phone_sources: i === 6 ? 0 : 2,
          email: `hello@fixture${i}.example`,
          email_state: i === 5 ? "catch_all" : "ok",
          rating: 4 + i / 10,
          reviews: 10 + i,
          found_at: `2026-09-19T10:0${i}:00Z`,
        })
        .select("id")
        .single(),
    ).id;
    ok(
      await db.from("lead_search_members").insert({
        search_id: ids.search,
        lead_id: lead,
        round_id: ids.round,
        tenant_id: A,
        judgment: { reasons: [], shares: [] },
        class: i === 5 ? "review" : "qualified",
        fit: i === 5 ? null : "strong",
        reason: "A fixture.",
        distance_m: 1200 + i,
        counted: i !== 5,
        counted_month: i === 5 ? null : "2026-09",
      }),
    );
    ids[`lead${i}`] = lead;
  }
});

// The local stack is shared with every other worktree, so this suite leaves
// nothing behind. Everything carrying a tenant_id cascades from the workspace;
// events have no foreign key to it, so they go by hand.
after(async () => {
  if (skip) return;
  await db.from("events").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "a stage click to Talking keeps the lead a lead: no person, converted false, and the event says stage",
  { skip },
  async () => {
    const a = ok(await setStage(operator, ids.lead1, { kind: "stage", stage: "converted" }));
    assert.equal(a.stage, "converted");
    assert.equal(a.converted, false, "a click says Talking; it never says convert");
    assert.equal(a.contact_id, null);
    const row = await leadRow(ids.lead1);
    assert.equal(row.contact_id, null);
    assert.equal(row.converted_at, null);
    assert.equal(row.version, 2, "the version the page sends back with an Undo");
    assert.deepEqual(
      (await events(ids.lead1)).map((e) => e.kind),
      ["lead.stage"],
    );
    const op = ok(await db.from("lead_operations").select("*").eq("id", a.op_id).single());
    assert.deepEqual([op.kind, op.version, op.lead_ids], ["stage", 2, [ids.lead1]]);
    assert.deepEqual([op.before.stage, op.after.stage], ["ready", "converted"]);
  },
);

test(
  "an Interested call makes a person with source lead, links it, and keeps the call and the note",
  { skip },
  async () => {
    const a = ok(
      await setStage(operator, ids.lead2, { kind: "outcome", outcome: "interested", note: "Wants a call Tuesday" }),
    );
    assert.deepEqual([a.converted, a.existed, a.stage], [true, false, "converted"]);
    const person = ok(await db.from("contacts").select("*").eq("id", a.contact_id).single());
    assert.equal(person.display_name, "Fixture 2", "named for the business until a person's name is known");
    assert.equal(person.phone_e164, "+15125550102");
    assert.equal(person.email, "hello@fixture2.example", "00125's door adds the lead's address");
    assert.deepEqual(
      [person.consent, person.marketing_consent],
      ["unknown", "unknown"],
      "their consent starts unknown",
    );
    const added = ok(
      await db.from("events").select("data").eq("subject_id", person.id).eq("kind", "contact.added").single(),
    );
    assert.equal(added.data.source, "lead", 'People\'s Came from reads it as "A lead you found" (00138)');
    const kinds = (await events(ids.lead2)).map((e) => e.kind).sort();
    assert.deepEqual(kinds, ["lead.call", "lead.converted"]);
    const row = await leadRow(ids.lead2);
    assert.deepEqual(
      [row.contact_id, row.last_outcome, row.last_note],
      [person.id, "interested", "Wants a call Tuesday"],
    );
    assert.ok(row.converted_at && row.contacted_at, "the lead is contacted and converted");
    ids.person2 = person.id;
  },
);

test(
  "a place whose number is already someone's converts into them; nothing makes a second person",
  { skip },
  async () => {
    const mine = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: A, phone_e164: "+15125550103", display_name: "Dana Reyes" })
        .select("id")
        .single(),
    ).id;
    const a = ok(await setStage(operator, ids.lead3, { kind: "outcome", outcome: "interested" }));
    assert.deepEqual([a.contact_id, a.existed], [mine, true]);
    const all = ok(
      await db.from("contacts").select("id, display_name").eq("tenant_id", A).eq("phone_e164", "+15125550103"),
    );
    assert.deepEqual(all, [{ id: mine, display_name: "Dana Reyes" }], "one person, with their own name (25)");
  },
);

test(
  'Wrong number marks the number and keeps the stage; "Did you send it?" moves them to Contacted',
  { skip },
  async () => {
    const a = ok(await setStage(operator, ids.lead4, { kind: "outcome", outcome: "wrong_number" }));
    assert.equal(a.stage, "ready", "the stage is kept");
    assert.equal((await leadRow(ids.lead4)).phone_wrong, true);
    ok(await setStage(operator, ids.lead4, { kind: "emailed" }));
    const row = await leadRow(ids.lead4);
    assert.equal(row.stage, "nurture");
    assert.ok(row.contacted_at);
    const kinds = (await events(ids.lead4)).map((e) => e.kind).sort();
    assert.deepEqual(kinds, ["lead.call", "lead.emailed"], "what was recorded is that the owner said they sent it");
  },
);

test(
  "Already a customer hides the place from every future search, and Undo takes the act and its suppression back, once",
  { skip },
  async () => {
    const a = ok(await setStage(operator, ids.lead5, { kind: "not_a_fit", why: "customer" }));
    const hash = await leadSuppressionHash(A, "ChIJfixtureB5");
    const hidden = ok(
      await db.from("lead_suppressions").select("what").eq("tenant_id", A).eq("kind", "place").eq("hash", hash),
    );
    assert.deepEqual(hidden, [{ what: "customer" }]);
    const why = ok(
      await db.from("events").select("data").eq("subject_id", ids.lead5).eq("kind", "lead.not_a_fit").single(),
    );
    assert.equal(why.data.why, "customer");
    assert.deepEqual(
      [(await leadRow(ids.lead5)).stage, (await leadRow(ids.lead5)).closed_reason],
      ["archived", "customer"],
    );
    const undone = ok(await owner.client.rpc("lead_undo", { p_op_id: a.op_id, p_version: a.version }));
    assert.equal(undone.ok, true);
    assert.deepEqual([(await leadRow(ids.lead5)).stage, (await leadRow(ids.lead5)).closed_reason], ["ready", null]);
    assert.deepEqual(
      ok(await db.from("lead_suppressions").select("what").eq("tenant_id", A).eq("hash", hash)),
      [],
      "the suppression this act wrote went with it",
    );
    assert.equal(
      ok(await owner.client.rpc("lead_undo", { p_op_id: a.op_id, p_version: a.version })).error,
      "undone",
      "undone once",
    );
  },
);

test("a person who was made is never unmade from a toast", { skip }, async () => {
  const op = ok(
    await db
      .from("lead_operations")
      .select("id, version")
      .eq("kind", "stage")
      .contains("lead_ids", [ids.lead2])
      .order("at", { ascending: false })
      .limit(1)
      .single(),
  );
  assert.equal(ok(await owner.client.rpc("lead_undo", { p_op_id: op.id, p_version: op.version })).error, "person");
});

test("a viewer is a stranger to both doors, and only an owner erases", { skip }, async () => {
  assert.equal(await said(setStage(viewer, ids.lead1, { kind: "stage", stage: "nurture" })), "Lead not found.");
  assert.equal(
    await said(viewer.client.rpc("lead_erase", { p_lead_id: ids.lead1 })),
    "Only an owner can erase a lead.",
  );
  assert.equal(
    await said(operator.client.rpc("lead_erase", { p_lead_id: ids.lead1 })),
    "Only an owner can erase a lead.",
  );
  const a = ok(await owner.client.rpc("lead_erase", { p_lead_id: ids.lead1 }));
  assert.deepEqual([a.erased, a.already], [true, false]);
  const row = await leadRow(ids.lead1);
  assert.ok(row.erased_at && row.blanked_at);
  assert.deepEqual(
    [row.place_id, row.business_name, row.phone_e164, row.email],
    [null, "", null, null],
    "nothing names or reaches the place",
  );
  const tombs = ok(await db.from("lead_suppressions").select("kind").eq("tenant_id", A).eq("what", "erased"));
  assert.deepEqual(tombs.map((t) => t.kind).sort(), ["email", "phone", "place"]);
  assert.equal(
    ok(await owner.client.rpc("lead_erase", { p_lead_id: ids.lead1 })).already,
    true,
    "a second request is answered, not re-executed",
  );
});

test("the export mark stamps each lead once, skips an erased one, and is the owner's", { skip }, async () => {
  assert.equal(
    ok(await owner.client.rpc("lead_export_mark", { p_tenant_id: A, p_ids: [ids.lead2, ids.lead3, ids.lead1] })),
    2,
  );
  assert.equal(
    ok(await owner.client.rpc("lead_export_mark", { p_tenant_id: A, p_ids: [ids.lead2] })),
    0,
    "a lead already charged is not charged twice",
  );
  assert.equal(
    await said(operator.client.rpc("lead_export_mark", { p_tenant_id: A, p_ids: [ids.lead4] })),
    "Workspace not found.",
  );
});

test(
  "bulk acts on every lead a view matches, refuses ids and a view together, and undoes as one, keeping what moved since",
  { skip },
  async () => {
    const a = ok(
      await operator.client.rpc("lead_bulk", {
        p_tenant_id: A,
        p_action: "contacted",
        p_ids: null,
        p_view: { list: "converted", class: "qualified" },
      }),
    );
    assert.equal(a.done, 2, "lead2 and lead3 were Talking");
    assert.equal(ok(await db.from("leads").select("id").eq("tenant_id", A).eq("stage", "nurture")).length, 3);
    const one = ok(
      await db
        .from("events")
        .select("data")
        .eq("tenant_id", A)
        .eq("kind", "lead.stage")
        .contains("data", { bulk: true }),
    );
    assert.equal(one.length, 1, "one event for the act, not one per lead");
    assert.equal(
      await said(
        operator.client.rpc("lead_bulk", {
          p_tenant_id: A,
          p_action: "contacted",
          p_ids: [ids.lead4],
          p_view: { list: "all" },
        }),
      ),
      "name the leads, or the view, and not both",
    );
    // One lead moves under the owner's feet before they press Undo.
    ok(await setStage(operator, ids.lead3, { kind: "stage", stage: "ready" }));
    const undone = ok(await owner.client.rpc("lead_undo", { p_op_id: a.op_id, p_version: a.version }));
    assert.deepEqual([undone.restored, undone.kept], [1, 1]);
    assert.equal((await leadRow(ids.lead2)).stage, "converted", "the untouched one is back where it was");
    assert.equal((await leadRow(ids.lead3)).stage, "ready", "the one that moved since is left alone");
  },
);

test(
  "the page takes the list, the direction and the three new sorts; A's six arguments still page as they did",
  { skip },
  async () => {
    const page = (args) => owner.client.rpc("leads_page", { p_tenant_id: A, p_search_id: ids.search, ...args });
    const a = ok(await page({ p_class: "qualified", p_sort: "found", p_after_key: null, p_limit: 200 }));
    assert.equal(a.length, 4, "the qualified leads that are left");
    const first = ok(await page({ p_class: "qualified", p_sort: "found", p_after_key: null, p_limit: 1 }));
    assert.equal(
      ok(await page({ p_class: "qualified", p_sort: "found", p_after_key: first[0].sort_key, p_limit: 200 })).length,
      3,
      "A's packed key still pages",
    );
    const names = (rows) => rows.map((r) => r.business_name);
    assert.deepEqual(
      names(ok(await page({ p_class: "qualified", p_sort: "business", p_list: "all", p_dir: "asc", p_limit: 200 }))),
      ["Fixture 2", "Fixture 3", "Fixture 4", "Fixture 6"],
    );
    assert.deepEqual(
      names(ok(await page({ p_class: "qualified", p_sort: "rating", p_list: "all", p_dir: "desc", p_limit: 200 }))),
      ["Fixture 6", "Fixture 4", "Fixture 3", "Fixture 2"],
      "best first",
    );
    assert.deepEqual(
      names(ok(await page({ p_class: "qualified", p_sort: "stage", p_list: "all", p_dir: "asc", p_limit: 200 }))),
      ["Fixture 6", "Fixture 3", "Fixture 4", "Fixture 2"],
      "Ready, then Contacted, then Talking, newest first inside each",
    );
    assert.equal(
      ok(await page({ p_class: "qualified", p_sort: "fit", p_list: "nurture", p_limit: 200 })).length,
      1,
      "the Contacted list",
    );
    assert.equal(
      ok(await page({ p_class: "review", p_sort: "fit", p_list: "all", p_limit: 200 })).length,
      1,
      "Needs review is a class, not a list",
    );
    const one = ok(await page({ p_class: "qualified", p_sort: "business", p_list: "all", p_dir: "asc", p_limit: 1 }));
    const next = ok(
      await page({
        p_class: "qualified",
        p_sort: "business",
        p_after_key: one[0].page_key,
        p_after_id: one[0].member_id,
        p_list: "all",
        p_dir: "asc",
        p_limit: 200,
      }),
    );
    assert.deepEqual(names(next), ["Fixture 3", "Fixture 4", "Fixture 6"], "the key and the row's id carry on");
    assert.deepEqual(
      ok(await owner.client.rpc("lead_list_counts", { p_tenant_id: A })),
      { all: 4, ready: 2, nurture: 1, converted: 1, said_no: 0, not_a_fit: 0 },
      "each lead counted once, however many searches found it",
    );
  },
);

test(
  "the bell rings twice: once when a round asks, on the pile it asks about, once when it ends, and never for one stopped or left unanswered",
  { skip },
  async () => {
    const bell = async (kind) =>
      ok(
        await db.from("notifications").select("id, title, body, route, subject_id").eq("tenant_id", A).eq("kind", kind),
      );
    // A phone hears what the bell hears (00162's push_send): these rows are the trigger's, so their jobs are too.
    const pushes = async (id) =>
      ok(await db.from("jobs").select("payload").eq("tenant_id", A).eq("kind", "push_send")).filter(
        (j) => j.payload?.notification_id === id,
      ).length;
    ok(await db.from("lead_rounds").update({ state: "probing" }).eq("id", ids.round));
    ok(
      await db
        .from("lead_rounds")
        .update({
          state: "waiting_on_owner",
          waiting_since: new Date().toISOString(),
          // The shape the runner keeps (core ports.ts RoundQuestion, through lead_collect_commit).
          question: {
            sentence: "Most of the first 25 were chain gyms. Keep leaving them out?",
            criterionKey: "chain",
            dropTerm: null,
            asked_at: new Date().toISOString(),
          },
        })
        .eq("id", ids.round),
    );
    const asked = await bell("leads_question");
    assert.equal(asked.length, 1);
    assert.equal(asked[0].title, "Your search for personal trainers is waiting for your answer");
    assert.equal(asked[0].body, "Most of the first 25 were chain gyms. Keep leaving them out?");
    assert.equal(
      asked[0].route,
      `clients/leads:s-${ids.search}:c-excluded`,
      "the pile the question is about: the counted view is empty while it waits",
    );
    assert.equal(await pushes(asked[0].id), 1, "one push for the question");
    ok(
      await db
        .from("lead_rounds")
        .update({ state: "waiting_on_owner", waiting_since: new Date().toISOString() })
        .eq("id", ids.round),
    );
    assert.equal((await bell("leads_question")).length, 1, "one question row per round");
    // A search the owner stopped, or removed, ends its round 'stopped'.
    const other = ok(
      await db
        .from("lead_searches")
        .insert({
          tenant_id: A,
          via: "people",
          card: "local_businesses",
          name: "yoga studios",
          asked: "yoga studios in Austin",
          plan: { version: 1 },
        })
        .select("id")
        .single(),
    ).id;
    const stopped = ok(
      await db
        .from("lead_rounds")
        .insert({
          tenant_id: A,
          search_id: other,
          seq: 1,
          purpose: "probe",
          plan: { version: 1 },
          plan_version: 1,
          target: 50,
          state: "queued",
          month: "2026-09",
          day: "2026-09-19",
          platform_day: "2026-09-19",
        })
        .select("id")
        .single(),
    ).id;
    ok(
      await db
        .from("lead_rounds")
        .update({ state: "ended", ending: "stopped", ended_at: new Date().toISOString() })
        .eq("id", stopped),
    );
    assert.deepEqual(await bell("leads_ready"), [], "nothing rings for a round the owner stopped");
    // A question nobody answered ends its round by itself after a day. Its own row already asked, and the strip says
    // "Stopped after a day without your answer": "is done · Nothing new was counted" over it was untrue.
    const quiet = ok(
      await db
        .from("lead_searches")
        .insert({
          tenant_id: A,
          via: "people",
          card: "local_businesses",
          name: "florists",
          asked: "florists in Austin",
          plan: { version: 1 },
        })
        .select("id")
        .single(),
    ).id;
    const unanswered = ok(
      await db
        .from("lead_rounds")
        .insert({
          tenant_id: A,
          search_id: quiet,
          seq: 1,
          purpose: "probe",
          plan: { version: 1 },
          plan_version: 1,
          target: 50,
          state: "queued",
          month: "2026-09",
          day: "2026-09-19",
          platform_day: "2026-09-19",
        })
        .select("id")
        .single(),
    ).id;
    ok(await db.from("lead_rounds").update({ state: "probing" }).eq("id", unanswered));
    ok(
      await db
        .from("lead_rounds")
        .update({
          state: "waiting_on_owner",
          waiting_since: new Date().toISOString(),
          question: {
            sentence: "Most of the first 25 are chains.",
            criterionKey: "chains",
            dropTerm: null,
            asked_at: new Date().toISOString(),
          },
        })
        .eq("id", unanswered),
    );
    ok(
      await db
        .from("lead_rounds")
        .update({ state: "ended", ending: "question_unanswered", ended_at: new Date().toISOString() })
        .eq("id", unanswered),
    );
    assert.deepEqual(await bell("leads_ready"), [], "nothing rings 'is done' for a question nobody answered");
    ok(await db.from("lead_rounds").update({ state: "running" }).eq("id", ids.round));
    ok(
      await db
        .from("lead_rounds")
        .update({ state: "ended", ending: "target_reached", ended_at: new Date().toISOString() })
        .eq("id", ids.round),
    );
    const done = await bell("leads_ready");
    assert.equal(done.length, 1, "one done row per round");
    assert.equal(done[0].title, "Your search for personal trainers is done");
    assert.equal(done[0].body, "4 found.");
    assert.equal(done[0].route, `clients/leads:s-${ids.search}`);
    assert.equal(await pushes(done[0].id), 1, "one push for the search that is done");
  },
);

test(
  "the view carries the round's ending, who can be emailed and called, and the operation Undo names for a day",
  { skip },
  async () => {
    const view = async () =>
      ok(await owner.client.from("lead_searches_view").select("*").eq("id", ids.search).single());
    let row = await view();
    assert.deepEqual([row.qualified, row.review], [4, 1], "a blanked membership is gone from Qualified");
    assert.equal(row.emails_checked, 4, "an address the check answered for");
    assert.equal(row.with_phone, 2, "a number nobody has marked wrong");
    assert.deepEqual([row.ending, row.ended_at === null], ["target_reached", false]);
    assert.equal(row.undo_op_id, null, "nothing to undo yet");
    const op = ok(
      await db
        .from("lead_operations")
        .insert({
          tenant_id: A,
          kind: "undo_search",
          search_id: ids.search,
          lead_ids: [],
          before: {},
          after: {},
          version: 1,
          by: owner.userId,
        })
        .select("id")
        .single(),
    ).id;
    row = await view();
    assert.deepEqual([row.undo_op_id, row.undo_version], [op, 1]);
    ok(
      await db
        .from("lead_operations")
        .update({ at: new Date(Date.now() - 25 * 3600_000).toISOString() })
        .eq("id", op),
    );
    assert.equal((await view()).undo_op_id, null, "and lets it go when the day is out");
  },
);

test("a lead with only an address converts into an email-only person, with the same event", { skip }, async () => {
  const a = ok(await setStage(operator, ids.lead6, { kind: "outcome", outcome: "interested" }));
  assert.deepEqual([a.converted, a.existed], [true, false]);
  const person = ok(await db.from("contacts").select("*").eq("id", a.contact_id).single());
  assert.equal(person.phone_e164, null, "a person with no number");
  assert.equal(person.email, "hello@fixture6.example", "the address is the identity");
  assert.equal(person.display_name, "Fixture 6");
  const added = ok(
    await db.from("events").select("data").eq("subject_id", person.id).eq("kind", "contact.added").single(),
  );
  assert.equal(added.data.source, "lead", "the same event says where they came from");
  assert.equal((await leadRow(ids.lead6)).contact_id, person.id);
});

test(
  "ACCEPTANCE: the Done strip's Undo removes what nobody touched, credits the month they counted in, and is itself undone",
  { skip },
  async () => {
    // A month with four leads spent on it, and a round about to end.
    ok(await db.from("lead_counters").insert({ tenant_id: A, kind: "allowance", period: "2026-09", used: 4 }));
    const search = ok(
      await db
        .from("lead_searches")
        .insert({
          tenant_id: A,
          via: "people",
          card: "local_businesses",
          name: "chiropractors",
          asked: "chiropractors in Austin",
          plan: { version: 1 },
        })
        .select("id")
        .single(),
    ).id;
    const round = ok(
      await db
        .from("lead_rounds")
        .insert({
          tenant_id: A,
          search_id: search,
          seq: 1,
          purpose: "probe",
          plan: { version: 1 },
          plan_version: 1,
          target: 50,
          state: "queued",
          month: "2026-09",
          day: "2026-09-19",
          platform_day: "2026-09-19",
        })
        .select("id")
        .single(),
    ).id;
    const now = new Date().toISOString();
    const four = {};
    for (const [name, extra] of [
      ["untouched", {}],
      ["worked", { stage: "nurture", contacted_at: now }], // the owner has been in touch
      ["exported", { exported_at: now }], // it has left the building
      ["untouched2", {}],
    ]) {
      four[name] = ok(
        await db
          .from("leads")
          .insert({
            tenant_id: A,
            place_id: `ChIJfixtureD${name}`,
            business_name: `Fixture ${name}`,
            city: "Austin",
            region: "TX",
            phone_e164: null,
            email: `hello@${name}.example`,
            email_state: "ok",
            ...extra,
          })
          .select("id")
          .single(),
      ).id;
      ok(
        await db.from("lead_search_members").insert({
          search_id: search,
          lead_id: four[name],
          round_id: round,
          tenant_id: A,
          judgment: {},
          class: "qualified",
          fit: "strong",
          reason: "A fixture.",
          counted: true,
          counted_month: "2026-09",
        }),
      );
    }
    const used = async () =>
      Number(
        ok(
          await db
            .from("lead_counters")
            .select("used")
            .eq("tenant_id", A)
            .eq("kind", "allowance")
            .eq("period", "2026-09")
            .single(),
        ).used,
      );
    const member = async (lead) =>
      ok(
        await db
          .from("lead_search_members")
          .select("blanked_at, counted, counted_month")
          .eq("search_id", search)
          .eq("lead_id", lead)
          .single(),
      );

    assert.equal(
      ok(await owner.client.rpc("lead_search_undo", { p_search_id: search })).error,
      "running",
      "a round still going has nothing to take back",
    );
    ok(
      await db.from("lead_rounds").update({ state: "ended", ending: "target_reached", ended_at: now }).eq("id", round),
    );
    assert.equal(
      await said(operator.client.rpc("lead_search_undo", { p_search_id: search })),
      "Search not found.",
      "an operator may work the leads; only the owner gives them back",
    );

    const a = ok(await owner.client.rpc("lead_search_undo", { p_search_id: search }));
    assert.deepEqual([a.removed, a.credited], [3, 2], "three left the search, two went back to the month");
    assert.equal((await member(four.worked)).blanked_at, null, "the one the owner worked stays");
    assert.equal((await member(four.worked)).counted, true, "and stays charged");
    assert.notEqual((await member(four.exported)).blanked_at, null, "the exported one leaves");
    assert.equal((await member(four.exported)).counted, true, "and keeps its charge");
    assert.equal((await member(four.untouched)).counted, false, "the untouched ones are given back");
    assert.equal(await used(), 2, "the month they counted in has two back");
    const op = ok(await db.from("lead_operations").select("before, kind").eq("id", a.op_id).single());
    assert.equal(op.kind, "undo_search");
    assert.deepEqual(
      op.before.credited,
      { [four.untouched]: "2026-09", [four.untouched2]: "2026-09" },
      "which leads were credited, and in which month",
    );
    assert.equal(
      ok(await owner.client.from("lead_searches_view").select("undo_op_id").eq("id", search).single()).undo_op_id,
      a.op_id,
      "the strip names it while it can be pressed",
    );

    const undone = ok(await owner.client.rpc("lead_undo", { p_op_id: a.op_id, p_version: a.version }));
    assert.deepEqual([undone.restored, undone.kept, undone.recharged], [2, 1, 2], "put back, and charged again");
    assert.equal(await used(), 4, "the month is charged again");
    assert.deepEqual(
      await member(four.untouched),
      { blanked_at: null, counted: true, counted_month: "2026-09" },
      "in the month it counted in",
    );
    assert.notEqual(
      (await member(four.exported)).blanked_at,
      null,
      "an exported lead stays where the act left it (E9)",
    );

    // A day later it is too late. A round is final once ended, so the day-old
    // one is a round of its own, ended with its own time.
    const old = ok(
      await db
        .from("lead_searches")
        .insert({
          tenant_id: A,
          via: "people",
          card: "local_businesses",
          name: "dentists",
          asked: "dentists in Austin",
          plan: { version: 1 },
        })
        .select("id")
        .single(),
    ).id;
    const oldRound = ok(
      await db
        .from("lead_rounds")
        .insert({
          tenant_id: A,
          search_id: old,
          seq: 1,
          purpose: "probe",
          plan: { version: 1 },
          plan_version: 1,
          target: 50,
          state: "queued",
          month: "2026-09",
          day: "2026-09-19",
          platform_day: "2026-09-19",
        })
        .select("id")
        .single(),
    ).id;
    ok(
      await db
        .from("lead_rounds")
        .update({
          state: "ended",
          ending: "target_reached",
          ended_at: new Date(Date.now() - 25 * 3600_000).toISOString(),
        })
        .eq("id", oldRound),
    );
    assert.equal(
      ok(await owner.client.rpc("lead_search_undo", { p_search_id: old })).error,
      "too_late",
      "twenty-four hours, and no longer",
    );
  },
);

test(
  "ACCEPTANCE: both consent doors refuse a converted lead's borrowed yes, accept their no, and leave everyone else alone",
  { skip },
  async () => {
    const other = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: A, phone_e164: "+15125550199", display_name: "Not from a lead" })
        .select("id")
        .single(),
    ).id;
    for (const call of [
      () =>
        owner.client.rpc("set_contact_consent", {
          p_contact_id: ids.person2,
          p_consent: "opted_in",
          p_source: "form",
          p_note: "they signed a slip",
        }),
      () =>
        owner.client.rpc("set_marketing_consent", {
          p_tenant_id: A,
          p_contact_id: ids.person2,
          p_consent: "opted_in",
          p_source: "form",
          p_note: "they signed a slip",
        }),
      () =>
        owner.client.rpc("set_marketing_consent", {
          p_tenant_id: A,
          p_contact_id: ids.person2,
          p_consent: "opted_in",
          p_source: "customer_message",
          p_message_id: "5e000000-0000-4000-8000-0000000000aa",
        }),
    ])
      assert.equal(await said(call()), LEAD_CONSENT_REFUSAL);
    assert.equal(
      ok(
        await owner.client.rpc("set_contact_consent", {
          p_contact_id: ids.person2,
          p_consent: "opted_out",
          p_source: "phone",
        }),
      ).consent,
      "opted_out",
      "a no is theirs to record",
    );
    assert.equal(
      ok(
        await owner.client.rpc("set_marketing_consent", {
          p_tenant_id: A,
          p_contact_id: ids.person2,
          p_consent: "opted_out",
          p_source: "phone",
        }),
      ).marketing_consent,
      "opted_out",
    );
    assert.equal(
      ok(
        await owner.client.rpc("set_contact_consent", {
          p_contact_id: other,
          p_consent: "opted_in",
          p_source: "form",
          p_note: "a paper slip",
        }),
      ).consent,
      "opted_in",
      "a person no lead is linked to is untouched",
    );
    assert.equal(
      ok(
        await db.rpc("set_marketing_consent", {
          p_tenant_id: A,
          p_contact_id: ids.person2,
          p_consent: "opted_in",
          p_source: "customer_message",
          p_evidence: { words: "YES OFFERS" },
        }),
      ).marketing_consent,
      "opted_in",
      "the edge holds the service key and no session: what they texted is still recorded",
    );
  },
);

// D3 (00145): Needs review has a next step. Check again schedules one lead_check job per round for the addresses
// whose last check did not answer, and bulk Keep and Exclude go through the member's own door once per lead. Its
// own search, round and leads, so nothing it counts moves a number another test pins.
const D3_STRANGER = "00000000-0000-4000-8000-0000000000d3";
test(
  "Check again: an address that did not answer is asked again under its own round once its search has finished; one that answered, one with no address and another workspace's are left as they are",
  { skip },
  async () => {
    const search = ok(
      await db
        .from("lead_searches")
        .insert({
          tenant_id: A,
          created_by: owner.userId,
          via: "people",
          card: "local_businesses",
          name: "florists",
          asked: "florists in Austin",
          plan: { version: 1 },
        })
        .select("id")
        .single(),
    ).id;
    const round = ok(
      await db
        .from("lead_rounds")
        .insert({
          tenant_id: A,
          search_id: search,
          seq: 1,
          purpose: "probe",
          plan: { version: 1 },
          plan_version: 1,
          target: 5,
          state: "queued",
          month: "2026-09",
          day: "2026-09-20",
          platform_day: "2026-09-20",
        })
        .select("id")
        .single(),
    ).id;
    // A round starts queued (a trigger refuses an ended insert) and ends through its door, as a real one does.
    assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: round, p_ending: "target_reached" })), true);
    const mk = async (n, over) => {
      const lead = ok(
        await db
          .from("leads")
          .insert({
            tenant_id: A,
            place_id: `ChIJfixtureD3${n}`,
            business_name: `Again ${n}`,
            category: "Florist",
            city: "Austin",
            region: "TX",
            website_host: `again${n}.example`,
            email: `hello@again${n}.example`,
            email_state: "unknown",
            found_at: `2026-09-20T10:0${n}:00Z`,
            ...over,
          })
          .select("id")
          .single(),
      ).id;
      ok(
        await db.from("lead_search_members").insert({
          search_id: search,
          lead_id: lead,
          round_id: round,
          tenant_id: A,
          judgment: { reasons: ["email:checking"], shares: [] },
          class: "review",
          fit: "look",
          reason: "A fixture.",
          counted: false,
        }),
      );
      return lead;
    };
    const silent1 = await mk(1, {});
    const silent2 = await mk(2, {});
    const answered = await mk(3, { email_state: "catch_all" });
    const noEmail = await mk(4, { email: null, email_state: "none" });
    const other = ok(
      await db
        .from("tenants")
        .insert({ slug: `leads-b-other-${Date.now()}`, name: "Other" })
        .select("id")
        .single(),
    ).id;
    const strangers = ok(
      await db
        .from("leads")
        .insert({
          tenant_id: other,
          place_id: "ChIJfixtureD3x",
          business_name: "Elsewhere",
          email: "hi@elsewhere.example",
          email_state: "unknown",
        })
        .select("id")
        .single(),
    ).id;
    // The switch stays off on this stack; this workspace is listed for the test, as the engine suite lists its own.
    const platform = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single());
    assert.deepEqual(
      ok(await owner.client.rpc("lead_check_again", { p_tenant_id: A, p_lead_ids: [silent1] })),
      { error: "paused" },
      "with searching off, nothing is scheduled",
    );
    ok(
      await db
        .from("lead_platform")
        .update({ tenants_on: [...(platform.tenants_on ?? []), A] })
        .eq("id", true),
    );
    try {
      assert.equal(
        await said(operator.client.rpc("lead_check_again", { p_tenant_id: A, p_lead_ids: [silent1] })),
        "Only an owner can check a lead again.",
      );
      const a = ok(
        await owner.client.rpc("lead_check_again", {
          p_tenant_id: A,
          p_lead_ids: [silent1, silent2, answered, noEmail, strangers, D3_STRANGER],
        }),
      );
      assert.deepEqual(a, { scheduled: 2, skipped: 4 });
      const states = ok(
        await db.from("leads").select("id, email_state").in("id", [silent1, silent2, answered, noEmail, strangers]),
      );
      assert.deepEqual(Object.fromEntries(states.map((l) => [l.id, l.email_state])), {
        [silent1]: "checking",
        [silent2]: "checking",
        [answered]: "catch_all",
        [noEmail]: "none",
        [strangers]: "unknown",
      });
      const jobs = ok(await db.from("jobs").select("payload, state").eq("tenant_id", A).eq("kind", "lead_check"));
      assert.equal(jobs.length, 1, "one job for the one round");
      assert.deepEqual(
        [
          jobs[0].state,
          jobs[0].payload.round_id,
          jobs[0].payload.batch,
          typeof jobs[0].payload.again,
          [...jobs[0].payload.lead_ids].sort(),
        ],
        ["scheduled", round, 0, "string", [silent1, silent2].sort()],
      );
      assert.deepEqual(
        ok(await owner.client.rpc("lead_check_again", { p_tenant_id: A, p_lead_ids: [silent1] })),
        { scheduled: 0, skipped: 1 },
        "an address already being checked is not asked twice",
      );
    } finally {
      await db
        .from("lead_platform")
        .update({ tenants_on: platform.tenants_on ?? [] })
        .eq("id", true);
      await db.from("tenants").delete().eq("id", other);
    }
    ids.d3 = { search, answered, noEmail, silent1 };
  },
);

test(
  "bulk Keep and Exclude over Needs review: the owner's, through the member's own door once per lead, each kept one counted through the month; an operator is refused; a lead not in Needs review is skipped",
  { skip },
  async () => {
    const { search, answered, noEmail, silent1 } = ids.d3;
    const month = ok(await db.rpc("lead_month", { p_tenant_id: A }));
    const allowance = async () =>
      Number(
        (
          await db
            .from("lead_counters")
            .select("used")
            .eq("tenant_id", A)
            .eq("kind", "allowance")
            .eq("period", month)
            .maybeSingle()
        ).data?.used ?? 0,
      );
    const before = await allowance();
    assert.equal(
      await said(operator.client.rpc("lead_bulk", { p_tenant_id: A, p_action: "keep", p_ids: [answered] })),
      "Only an owner can keep or exclude a lead.",
    );
    const kept = ok(
      await owner.client.rpc("lead_bulk", {
        p_tenant_id: A,
        p_action: "keep",
        p_ids: [answered, noEmail, D3_STRANGER],
        p_search_id: search,
      }),
    );
    assert.deepEqual(
      [kept.done, kept.skipped, kept.op_id],
      [2, 1, null],
      "two kept; a lead that is not in Needs review is skipped",
    );
    const members = ok(
      await db
        .from("lead_search_members")
        .select("lead_id, class, counted, counted_month, kept_by")
        .eq("search_id", search)
        .in("lead_id", [answered, noEmail]),
    );
    assert.deepEqual(
      members.map((m) => [m.class, m.counted, m.counted_month, m.kept_by]),
      [
        ["qualified", true, month, owner.userId],
        ["qualified", true, month, owner.userId],
      ],
    );
    assert.equal(await allowance(), before + 2, "each kept one counts through the month");
    const ops = ok(
      await db.from("lead_operations").select("kind, lead_ids").eq("search_id", search).eq("kind", "keep"),
    );
    assert.equal(ops.length, 2, "one operation per member, as the row's own Keep writes");
    const excluded = ok(await owner.client.rpc("lead_bulk", { p_tenant_id: A, p_action: "exclude", p_ids: [silent1] }));
    assert.deepEqual([excluded.done, excluded.skipped], [1, 0]);
    const m = ok(
      await db
        .from("lead_search_members")
        .select("class, excluded_by")
        .eq("search_id", search)
        .eq("lead_id", silent1)
        .single(),
    );
    assert.deepEqual(m, { class: "excluded", excluded_by: "owner" });
    assert.deepEqual(
      ok(await owner.client.rpc("lead_bulk", { p_tenant_id: A, p_action: "keep", p_ids: [silent1] })),
      { done: 0, skipped: 1, op_id: null, version: 1 },
      "an excluded member is not Needs review any more",
    );
    await said(
      owner.client.rpc("lead_bulk", {
        p_tenant_id: A,
        p_action: "keep",
        p_ids: null,
        p_view: { list: "all", class: "review" },
      }),
    );
  },
);
