/**
 * A converted lead's yes comes only from them, permanently (PRD v3 §0.4,
 * decision 19), proved where the rule lives: on the database.
 *
 * consent-paths.test.mjs proves that every route a member can reach goes
 * through one of the two consent doors and carries its refusal back in words.
 * This file proves the other half: that the two doors are the only definer
 * doors a member can call that record an answer at all, that neither will
 * write a yes for a person a lead is linked to, and that a member cannot write
 * consent around them -- contacts has no member UPDATE policy, so a forbidden
 * UPDATE succeeds with zero rows.
 *
 * Runs against the database `supabase start` builds on this machine, never
 * production, the way lead-engine.db.test.mjs does; the catalog is read
 * through the CLI the way privileges.db.test.mjs reads it (SUPABASE_CLI names
 * the binary when `supabase` is not on PATH). A failed sign-in fails the test
 * (review E11).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { LEAD_CONSENT_REFUSAL } from "../../../../packages/contracts/src/leads/leads.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and leads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the session this suite signs in with needs it"
        : false;

/** One statement through `supabase db query --local`, and the rows it returned. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0)
    throw new Error(
      `supabase db query exited ${r.status}: ${[r.stderr, r.stdout]
        .map((s) => (s ?? "").trim())
        .filter(Boolean)
        .join("\n")
        .slice(-800)}`,
    );
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const end = out.lastIndexOf(out[start] === "{" ? "}" : "]");
  const parsed = JSON.parse(out.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

let db;
let A;
let owner;
let fromALead; // a person a lead is linked to
let anyoneElse; // a person no lead is linked to
const users = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `consent-paths-${Date.now()}`, name: "Consent paths" })
      .select("id")
      .single(),
  ).id;
  const email = `consent-owner-${Date.now()}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  owner = { client, userId: made.data.user.id };
  // A person a lead you found is linked to -- as an Interested call leaves
  // them (leads.db.test.mjs makes one through the door; here the shape is
  // what matters, so it is written directly with the service key).
  fromALead = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: A, phone_e164: "+15125550151", display_name: "Fixture Strength Lab" })
      .select("id")
      .single(),
  ).id;
  anyoneElse = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: A, phone_e164: "+15125550152", display_name: "Walked in" })
      .select("id")
      .single(),
  ).id;
  ok(
    await db.from("leads").insert({
      tenant_id: A,
      place_id: "ChIJfixtureConsent1",
      business_name: "Fixture Strength Lab",
      city: "Austin",
      region: "TX",
      phone_e164: "+15125550151",
      email: "hello@fixturestrength.example",
      email_state: "ok",
      stage: "converted",
      contact_id: fromALead,
      converted_at: new Date().toISOString(),
    }),
  );
});

after(async () => {
  if (skip) return;
  await db.from("events").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "ACCEPTANCE: neither door will write a yes for a person a lead is linked to, and both say the same sentence",
  { skip },
  async () => {
    for (const call of [
      () =>
        owner.client.rpc("set_contact_consent", {
          p_contact_id: fromALead,
          p_consent: "opted_in",
          p_source: "form",
          p_note: "they signed a slip",
        }),
      () =>
        owner.client.rpc("set_marketing_consent", {
          p_tenant_id: A,
          p_contact_id: fromALead,
          p_consent: "opted_in",
          p_source: "form",
          p_note: "they signed a slip",
        }),
      // The desk's own-message door (00137, #675) names a real message and is
      // still refused: the yes has to come through the edge.
      () =>
        owner.client.rpc("set_marketing_consent", {
          p_tenant_id: A,
          p_contact_id: fromALead,
          p_consent: "opted_in",
          p_source: "customer_message",
          p_message_id: "5e000000-0000-4000-8000-0000000000aa",
        }),
    ]) {
      const res = await call();
      assert.notEqual(res.error, null, `expected a refusal, got ${JSON.stringify(res.data)}`);
      assert.equal(res.error.message, LEAD_CONSENT_REFUSAL);
    }
    const after_ = ok(await db.from("contacts").select("consent, marketing_consent").eq("id", fromALead).single());
    assert.deepEqual(after_, { consent: "unknown", marketing_consent: "unknown" }, "nothing moved");
    // A no, and unknown, stay the owner's to record; so does anyone else's yes.
    assert.equal(
      ok(
        await owner.client.rpc("set_contact_consent", {
          p_contact_id: fromALead,
          p_consent: "opted_out",
          p_source: "phone",
        }),
      ).consent,
      "opted_out",
    );
    assert.equal(
      ok(
        await owner.client.rpc("set_marketing_consent", {
          p_tenant_id: A,
          p_contact_id: fromALead,
          p_consent: "unknown",
          p_source: "operator",
        }),
      ).marketing_consent,
      "unknown",
    );
    assert.equal(
      ok(
        await owner.client.rpc("set_contact_consent", {
          p_contact_id: anyoneElse,
          p_consent: "opted_in",
          p_source: "form",
          p_note: "a paper slip",
        }),
      ).consent,
      "opted_in",
    );
  },
);

test(
  "ACCEPTANCE: the paths with no session -- the edge and the yes page -- still land a yes on a converted lead",
  { skip },
  async () => {
    // The edge holds the service key, so auth.uid() is null: it records what the
    // customer texted, with the evidence it read. The yes page's 'form' is the
    // same path. Both are accepted by design (§0.4).
    assert.equal(
      ok(
        await db.rpc("set_marketing_consent", {
          p_tenant_id: A,
          p_contact_id: fromALead,
          p_consent: "opted_in",
          p_source: "customer_message",
          p_evidence: { words: "YES OFFERS", channel: "sms" },
        }),
      ).marketing_consent,
      "opted_in",
    );
  },
);

test(
  "ACCEPTANCE: a member cannot write consent except through a door: a direct update changes nothing",
  { skip },
  async () => {
    const { data, error } = await owner.client
      .from("contacts")
      .update({ consent: "opted_in", consent_source: "in_person" })
      .eq("id", fromALead)
      .select("id");
    // contacts has no member UPDATE policy, and since 00471 no member UPDATE privilege either: the write is refused
    // outright, where row security alone answered success with no rows.
    assert.equal(error?.code, "42501", "a member may not update contacts at all");
    assert.equal(data, null);
    assert.equal(
      ok(await db.from("contacts").select("consent").eq("id", fromALead).single()).consent,
      "opted_out",
      "still the answer they gave",
    );
  },
);

test(
  "ACCEPTANCE: the definer doors a member can call that write consent are the two answer doors, the erasure and the merge",
  { skip },
  () => {
    const rows = query(`select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
       and p.prosrc ~* 'update\\s+(public\\.)?contacts\\s+set[^;]*consent\\s*=' order by 1`);
    assert.deepEqual(
      rows.map((r) => r.name),
      ["erase_contact", "merge_people", "set_contact_consent", "set_marketing_consent"],
    );
    // erase_contact is the right to be forgotten (00027), and the only value it
    // writes is the absence of an answer: it can record no yes for anybody.
    // merge_people (00326) writes the more careful of two answers the person
    // already gave, never a new one (people/merge/merge-people.db.test.mjs).
    const erase = query(`select p.prosrc ~ 'consent\\s*=\\s*''unknown''' as clears,
                              p.prosrc ~ 'consent\\s*=\\s*''opted_in''' as grants
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'erase_contact'`);
    assert.deepEqual(erase, [{ clears: true, grants: false }]);
    // And the two that do record an answer both refuse a converted lead's in the
    // same words, so an owner reads one sentence whichever of them refused.
    const both = query(`select p.proname as name, position(${sqlLiteral(LEAD_CONSENT_REFUSAL)} in p.prosrc) > 0 as says
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('set_contact_consent', 'set_marketing_consent') order by 1`);
    assert.deepEqual(both, [
      { name: "set_contact_consent", says: true },
      { name: "set_marketing_consent", says: true },
    ]);
  },
);

/** The sentence as SQL reads it: contracts' words, quoted for the catalog query. */
function sqlLiteral(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

test("ACCEPTANCE: no member policy lets anyone write a contact's row directly", { skip }, () => {
  const rows = query(`select cmd, roles::text as roles from pg_policies
     where schemaname = 'public' and tablename = 'contacts' and cmd in ('UPDATE', 'ALL', 'INSERT') order by 1`);
  assert.deepEqual(
    rows.filter((r) => r.roles.includes("authenticated")),
    [],
  );
});

/* ---- A person's answer and its line in their history are one write (00356 record_consent) ---- */

const record = (client, args) =>
  client.rpc("record_consent", { p_contact_id: anyoneElse, p_purpose: "conversational", ...args });
const linesOf = async (contactId) =>
  ok(
    await db
      .from("decisions")
      .select("verb, actor_type, actor_user_id, payload, undo_of")
      .eq("tenant_id", A)
      .eq("subject_type", "contact")
      .eq("subject_id", contactId)
      .order("created_at", { ascending: true }),
  );
const changesOf = async (contactId) =>
  ok(
    await db
      .from("events")
      .select("kind")
      .eq("tenant_id", A)
      .eq("subject_id", contactId)
      .in("kind", ["contact.consent_changed", "contact.marketing_consent_changed"]),
  ).length;

test(
  "a member's one call records the answer, its event and the line in the person's history as theirs, for each purpose",
  { skip },
  async () => {
    const person = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: A, phone_e164: "+15125550161", display_name: "At the desk" })
        .select("id")
        .single(),
    ).id;
    const visit = ok(
      await owner.client.rpc("record_consent", {
        p_contact_id: person,
        p_purpose: "conversational",
        p_consent: "opted_in",
        p_source: "in_person",
        p_note: "said yes at the desk",
        p_via: "ask",
      }),
    );
    // What the door answers, with the decision beside it.
    assert.equal(visit.consent, "opted_in");
    assert.equal(visit.previous, "unknown");
    assert.match(visit.decision_id, /^[0-9a-f-]{36}$/);
    const offers = ok(
      await owner.client.rpc("record_consent", {
        p_contact_id: person,
        p_purpose: "marketing",
        p_consent: "opted_out",
        p_source: "phone",
        p_batch: 12,
      }),
    );
    assert.equal(offers.marketing_consent, "opted_out");
    assert.deepEqual(
      ok(await db.from("contacts").select("consent, marketing_consent, dnc").eq("id", person).single()),
      { consent: "opted_in", marketing_consent: "opted_out", dnc: false },
      "each answer in its own column; a no to offers is no request to stop hearing about a visit",
    );
    assert.equal(await changesOf(person), 2, "each door kept its event");
    assert.deepEqual(await linesOf(person), [
      {
        verb: "consent_change",
        actor_type: "user",
        actor_user_id: owner.userId,
        payload: {
          consent: "opted_in",
          source: "in_person",
          note: "said yes at the desk",
          previous: "unknown",
          via: "ask",
        },
        undo_of: null,
      },
      {
        verb: "consent_change",
        actor_type: "user",
        actor_user_id: owner.userId,
        payload: {
          consent: "opted_out",
          source: "phone",
          note: null,
          previous: "unknown",
          purpose: "marketing",
          batch: 12,
        },
        undo_of: null,
      },
    ]);
  },
);

test(
  "an answer the door refuses writes nothing at all: no change, no event and no line; a stranger and a purpose nobody asks are refused before the door",
  { skip },
  async () => {
    // A converted lead's yes, by either purpose: the door's own sentence, and the person as they were.
    const before = {
      row: ok(await db.from("contacts").select("consent, marketing_consent").eq("id", fromALead).single()),
      lines: (await linesOf(fromALead)).length,
      changes: await changesOf(fromALead),
    };
    for (const purpose of ["conversational", "marketing"]) {
      const res = await owner.client.rpc("record_consent", {
        p_contact_id: fromALead,
        p_purpose: purpose,
        p_consent: "opted_in",
        p_source: "form",
      });
      assert.equal(res.error?.message, LEAD_CONSENT_REFUSAL, purpose);
      assert.equal(res.error?.code, "42501", "the door's own code travels, so the route words it as the door did");
    }
    assert.deepEqual(
      ok(await db.from("contacts").select("consent, marketing_consent").eq("id", fromALead).single()),
      before.row,
    );
    assert.equal((await linesOf(fromALead)).length, before.lines, "a refused answer is not a decision");
    assert.equal(await changesOf(fromALead), before.changes, "and kept no event");

    // A spoken yes to offers is the offers door's to refuse, and it does, through this call as through its own.
    const spoken = await record(owner.client, { p_purpose: "marketing", p_consent: "opted_in", p_source: "phone" });
    assert.notEqual(spoken.error, null, "a yes to offers is written or it is not recorded");

    assert.equal(
      (await record(owner.client, { p_purpose: "offers", p_consent: "opted_out", p_source: "phone" })).error?.code,
      "22023",
      "a purpose that is neither question",
    );
    const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.equal(
      (await record(anon, { p_consent: "opted_out", p_source: "phone" })).error?.code,
      "42501",
      "signed out: no right to call it",
    );
    // A member of another workspace is a stranger to this person: not found, and nothing learned.
    const B = ok(
      await db
        .from("tenants")
        .insert({ slug: `consent-other-${Date.now()}`, name: "Another" })
        .select("id")
        .single(),
    ).id;
    const email = `consent-stranger-${Date.now()}@example.com`;
    const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
    const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(made.error, null, made.error?.message);
    users.push(made.data.user.id);
    ok(await db.from("memberships").insert({ tenant_id: B, user_id: made.data.user.id, role: "owner" }));
    const stranger = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.equal((await stranger.auth.signInWithPassword({ email, password })).error, null);
    assert.equal((await record(stranger, { p_consent: "opted_out", p_source: "phone" })).error?.code, "P0002");
    await db.from("tenants").delete().eq("id", B);
  },
);

test(
  "an undo names the line it reverses, and one that names a line nobody holds is recorded without it",
  { skip },
  async () => {
    const first = ok(await record(owner.client, { p_consent: "opted_out", p_source: "phone" }));
    const back = ok(
      await record(owner.client, { p_consent: "unknown", p_source: "operator", p_undo_of: first.decision_id }),
    );
    assert.equal(back.undo_dropped, false);
    const lost = ok(
      await record(owner.client, {
        p_consent: "opted_out",
        p_source: "phone",
        p_undo_of: "00000000-0000-4000-8000-0000000000ff",
      }),
    );
    assert.equal(lost.undo_dropped, true);
    const lines = await linesOf(anyoneElse);
    assert.deepEqual(
      lines.slice(-2).map((l) => [l.payload.consent, l.undo_of]),
      [
        ["unknown", first.decision_id],
        ["opted_out", null],
      ],
    );
  },
);
