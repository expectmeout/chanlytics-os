/**
 * The people card on the database (00429): a lead that is a company, with the people its source named.
 *
 *   1. The door (lead_people_search_create): refused while the card finds no leads (lead_card_live), and once it does,
 *      the search, its one round and its start, the month reserved; an estimate past its ceiling is refused.
 *   2. A page of companies (lead_company_upsert): a company is kept with its people but anyone on the never-again list
 *      or in People; its addressee the one its source chose while still kept, else the first with an address; one with
 *      nobody to write to, or whose domain is on the never-again list, is left out; one held already gains the people it
 *      lacked; one that shares a website with a place is marked so.
 *   3. The addressee comes from Leads (reach_out_person): their source's name, ranked as a list's.
 *   4. Erasure: a person named at a company leaves it, their address on the never-again list, so no search names them
 *      again; an erased company's domain is never made again (leads_erase_on_contact, lead_erase).
 *   5. Who a company's reach-out writes to (lead_addressee_choose): chosen by its owner among the people named with a
 *      work address, never while a check of its address is on its way or its round still runs; the new address asked of
 *      the mailbox check under the round (lead_check_ask), the one it leaves keeping its check for a choice back that asks
 *      none; refused for an address another lead holds, one on the never-again list, and a company written to by hand.
 *
 * Local stack only: it makes a workspace, members and leads, and lists the workspace on the platform's switch.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { peopleEstimateUsd, peoplePlanFrom } from "@chanlytics/contracts";
import { takeLock } from "../_file-lock.mjs";

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
const site = (name) => `${name}-${stamp}.example`;
const mail = (who, name) => `${who}@${site(name)}`;
let db;
let A;
let owner;
let round;
const users = [];
let release = null;
let cardsWere = null;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

const plan = (count = 10) =>
  peoplePlanFrom({
    name: "Marketing managers",
    asked: "marketing managers at agencies in Texas",
    count,
    titles: ["marketing manager"],
    seniority: [],
    industries: [],
    sizes: [],
    states: ["TX"],
  });
const estimate = (count) => peopleEstimateUsd(count, { perPerson: 0.002, perCheck: 0.00089, start: 0.01 });

/** A company as the people card's runner hands it (core companiesOf). */
const company = (name, people, over = {}) => ({
  source_key: site(name),
  name: `${name} Co`,
  category: "Marketing & Advertising",
  city: "Austin",
  region: "TX",
  country: "US",
  linkedin_url: null,
  about: null,
  email: people.find((p) => p.email)?.email ?? null,
  facts: { people, addressee: 0, size: "11 - 50" },
  reason: "Marketing Manager · 11 - 50 people",
  ...over,
});
const someone = (name, email, role = "manager") => ({
  name,
  first_name: name.split(" ")[0],
  title: "Marketing Manager",
  role,
  email,
  profile_url: null,
});
const leadByKey = async (name) =>
  (
    await db
      .from("leads")
      .select("*")
      .eq("tenant_id", A)
      .eq("source", "people_at_companies")
      .eq("source_key", site(name))
  ).data?.[0] ?? null;
const suppressed = async (value) => ok(await db.rpc("lead_address_suppressed", { p_tenant_id: A, p_address: value }));
const hashOf = (value) => db.rpc("lead_suppression_hash", { p_tenant_id: A, p_value: value });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db.from("tenants").insert({ slug: `people-${stamp}`, name: "Harbor Agency", timezone: "America/Chicago" }),
  );
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  ok(await db.from("billing_accounts").upsert({ tenant_id: A, mode: "direct", status: "active" }));
  const email = `people-owner-${stamp}@fixture-people.example`;
  const password = `pw-${stamp}-owner-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }));
  owner = { id: made.data.user.id, c };
  // The platform's switch is one row every finder suite writes: held while this suite lists itself on it.
  release = await takeLock("lead-platform-list");
  const p = ok(await db.from("lead_platform").select("tenants_on, cards_on").eq("id", true).single());
  cardsWere = p.cards_on;
  ok(
    await db
      .from("lead_platform")
      .update({ tenants_on: [...(p.tenants_on ?? []), A], cards_on: ["local_businesses"] })
      .eq("id", true),
  );
});

after(async () => {
  if (skip) return;
  const p = await db.from("lead_platform").select("tenants_on").eq("id", true).single();
  if (p.data)
    await db
      .from("lead_platform")
      .update({
        tenants_on: (p.data.tenants_on ?? []).filter((t) => t !== A),
        cards_on: cardsWere ?? ["local_businesses"],
      })
      .eq("id", true);
  const days = new Set(
    ((await db.from("lead_rounds").select("platform_day").eq("tenant_id", A)).data ?? []).map((r) => r.platform_day),
  );
  await db.from("events").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
  if (days.size)
    await db
      .from("lead_counters")
      .delete()
      .is("tenant_id", null)
      .eq("kind", "day")
      .in("period", [...days]);
  for (const u of users) await db.auth.admin.deleteUser(u).catch(() => {});
  await release?.();
});

test("the door: shut while the card finds no leads, then the search, its round and its start", { skip }, async () => {
  const shut = ok(
    await owner.c.rpc("lead_people_search_create", {
      p_tenant_id: A,
      p_plan: plan(10),
      p_via: "people",
      p_estimate_usd: estimate(10),
    }),
  );
  assert.equal(shut.error, "no_card", "nothing is started while the card is not live");
  assert.equal(ok(await db.rpc("lead_card_live", { p_card: "people_at_companies" })), false);
  ok(
    await db
      .from("lead_platform")
      .update({ cards_on: ["local_businesses", "people_at_companies"] })
      .eq("id", true),
  );
  const over = await owner.c.rpc("lead_people_search_create", {
    p_tenant_id: A,
    p_plan: plan(10),
    p_via: "people",
    p_estimate_usd: estimate(10) + 50,
  });
  assert.equal(over.error?.code, "22023", "an estimate past its ceiling is refused");
  const made = ok(
    await owner.c.rpc("lead_people_search_create", {
      p_tenant_id: A,
      p_plan: plan(10),
      p_via: "people",
      p_estimate_usd: estimate(10),
    }),
  );
  assert.ok(made.search_id && made.round_id, JSON.stringify(made));
  const r = ok(await db.from("lead_rounds").select("*").eq("id", made.round_id).single());
  assert.deepEqual([r.state, r.purpose, r.target, r.allowance_reserved], ["queued", "main", 10, 10]);
  const s = ok(await db.from("lead_searches").select("card, via").eq("id", made.search_id).single());
  assert.deepEqual([s.card, s.via], ["people_at_companies", "people"]);
  const jobs = ok(await db.from("jobs").select("kind, payload").eq("tenant_id", A).eq("kind", "lead_round_start"));
  assert.ok(
    jobs.some((j) => j.payload.round_id === made.round_id),
    "its start is queued",
  );
  round = made.round_id;
});

test(
  "a page of companies: who is kept, its addressee, a company held already, a shared website, what is left out",
  { skip },
  async () => {
    // On the never-again list: Sue's address, and one company's whole domain.
    for (const [kind, value] of [
      ["email", mail("sue", "beta")],
      ["domain", site("gone")],
    ])
      ok(
        await db
          .from("lead_suppressions")
          .insert({ tenant_id: A, kind, hash: ok(await hashOf(value)), what: "said_no" }),
      );
    // In People: Pat, a customer.
    ok(await db.from("contacts").insert({ tenant_id: A, email: mail("pat", "gamma"), display_name: "Pat Customer" }));
    // A place Maps found with the website a company has.
    const place = await one(
      db.from("leads").insert({
        tenant_id: A,
        place_id: `ChIJfixturePeople${stamp}`,
        business_name: "Delta Studio",
        website_host: site("delta"),
        email: `hello@delta-mail-${stamp}.example`,
        email_state: "ok",
        stage: "ready",
      }),
    );
    const page = [
      company("acme", [someone("Ann Lee", mail("ann", "acme"), "owner"), someone("Bob Ray", mail("bob", "acme"))]),
      company("beta", [someone("Sue Kim", mail("sue", "beta"), "owner"), someone("Tom Fox", mail("tom", "beta"))]),
      company("gone", [someone("Gil Moe", mail("gil", "gone"))]),
      company("blank", [someone("Nia Roe", null)]),
      company("gamma", [
        someone("Pat Customer", mail("pat", "gamma"), "owner"),
        someone("Quinn Hale", mail("quinn", "gamma")),
      ]),
      company("delta", [someone("Dee Park", mail("dee", "delta"))]),
    ];
    const first = ok(await db.rpc("lead_company_upsert", { p_round_id: round, p_companies: page }));
    assert.deepEqual([first.ok, first.made, first.held, first.left_out], [true, 4, 0, 2]);

    const acme = await leadByKey("acme");
    assert.deepEqual([acme.kind, acme.email, acme.email_state], ["company", mail("ann", "acme"), "checking"]);
    assert.deepEqual(
      acme.facts.people.map((p) => p.name),
      ["Ann Lee", "Bob Ray"],
    );
    assert.equal(acme.facts.addressee, 0);
    const beta = await leadByKey("beta");
    assert.deepEqual(
      beta.facts.people.map((p) => p.name),
      ["Tom Fox"],
      "nobody on the never-again list is kept",
    );
    assert.deepEqual([beta.email, beta.facts.addressee], [mail("tom", "beta"), 0], "the addressee is who is left");
    const gamma = await leadByKey("gamma");
    assert.deepEqual(
      gamma.facts.people.map((p) => p.name),
      ["Quinn Hale"],
      "nobody in People is kept on a lead",
    );
    assert.equal(await leadByKey("gone"), null, "a company whose domain is on the never-again list is never made");
    assert.equal(await leadByKey("blank"), null, "a company with nobody to write to is no lead");
    const delta = await leadByKey("delta");
    const [member] = ok(await db.from("lead_search_members").select("class, judgment").eq("lead_id", delta.id));
    assert.equal(member.class, "review", "it waits in Needs review on its address");
    assert.deepEqual(member.judgment.shares, [{ kind: "host", lead_id: place }], "the website it shares is marked");

    // The same page read again, with a person more at Acme: one company, its people grown, its addressee kept.
    page[0].facts.people.push(someone("Cal Ito", mail("cal", "acme")));
    const again = ok(await db.rpc("lead_company_upsert", { p_round_id: round, p_companies: [page[0]] }));
    assert.deepEqual([again.made, again.held], [0, 1]);
    const grown = await leadByKey("acme");
    assert.deepEqual(
      grown.facts.people.map((p) => p.name),
      ["Ann Lee", "Bob Ray", "Cal Ito"],
    );
    assert.equal(grown.facts.addressee, 0);
  },
);

test("the addressee comes from Leads, named as a list names a person", { skip }, async () => {
  const beta = await leadByKey("beta");
  ok(await db.from("leads").update({ email_state: "ok" }).eq("id", beta.id));
  const made = ok(await db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: beta.id }));
  assert.ok(made.contact_id, JSON.stringify(made));
  const c = ok(await db.from("contacts").select("display_name, name_source, email").eq("id", made.contact_id).single());
  assert.deepEqual([c.display_name, c.name_source, c.email], ["Tom Fox", "import", mail("tom", "beta")]);
});

test(
  "erasure: a person named at a company leaves it and is never named again; an erased company is never made again",
  { skip },
  async () => {
    // Bob, named at Acme and not its addressee, is in People and asks to be forgotten.
    const bob = await one(
      db.from("contacts").insert({ tenant_id: A, email: mail("bob", "acme"), display_name: "Bob Ray" }),
    );
    ok(await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", bob));
    const acme = await leadByKey("acme");
    assert.deepEqual(
      acme.facts.people.map((p) => p.name),
      ["Ann Lee", "Cal Ito"],
      "Bob leaves the company",
    );
    assert.equal(acme.facts.addressee, 0, "Ann is still who it writes to");
    assert.equal(await suppressed(mail("bob", "acme")), true, "Bob's address is on the never-again list");
    // The next search that finds Acme names him no more.
    ok(
      await db.rpc("lead_company_upsert", {
        p_round_id: round,
        p_companies: [
          company("acme", [someone("Bob Ray", mail("bob", "acme")), someone("Dot Wu", mail("dot", "acme"))]),
        ],
      }),
    );
    assert.ok(!(await leadByKey("acme")).facts.people.some((p) => p.name === "Bob Ray"));

    // Ann, the addressee and its person, is erased: the company goes, and its domain with it.
    const ann = ok(await db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: acme.id }));
    ok(await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", ann.contact_id));
    const gone = ok(await db.from("leads").select("erased_at, facts, source_key").eq("id", acme.id).single());
    assert.ok(gone.erased_at, "the company is erased with its only person");
    assert.deepEqual([gone.facts, gone.source_key], [{}, null]);
    assert.equal(await suppressed(mail("eve", "acme")), true, "every address at the company's domain is refused now");
    const remade = ok(
      await db.rpc("lead_company_upsert", {
        p_round_id: round,
        p_companies: [company("acme", [someone("Eve Ash", mail("eve", "acme"))])],
      }),
    );
    assert.deepEqual([remade.made, remade.left_out], [0, 1], "the erased company is never made again");

    // An owner's erase of a company lead does the same.
    const gamma = await leadByKey("gamma");
    ok(await owner.c.rpc("lead_erase", { p_lead_id: gamma.id }));
    assert.equal(await suppressed(mail("anyone", "gamma")), true, "an erased company's domain is never written to");
  },
);

// Last: it ends the suite's round, which the cases above still write companies under.
test(
  "who a company's reach-out writes to: chosen by its owner, the new address checked first, the old check kept for a way back",
  { skip },
  async () => {
    ok(
      await db.rpc("lead_company_upsert", {
        p_round_id: round,
        p_companies: [
          company("omega", [
            someone("Ola Berg", mail("ola", "omega"), "owner"),
            someone("Pia Lund", mail("pia", "omega")),
            someone("Rex Nord", null),
          ]),
        ],
      }),
    );
    const omega = await leadByKey("omega");
    const choose = async (person) =>
      ok(await owner.c.rpc("lead_addressee_choose", { p_lead_id: omega.id, p_person: person }));
    const checks = async () =>
      ok(await db.from("jobs").select("payload").eq("tenant_id", A).eq("kind", "lead_check")).filter((j) =>
        (j.payload.lead_ids ?? []).includes(omega.id),
      ).length;

    assert.equal(
      (await choose(1)).error,
      "checking",
      "its first check is on its way: a choice would land on the new address",
    );
    ok(
      await db
        .from("leads")
        .update({ email_state: "ok", email_checked_at: new Date().toISOString() })
        .eq("id", omega.id),
    );
    assert.equal((await choose(0)).error, "already");
    assert.equal((await choose(2)).error, "no_address", "Rex has no work address");
    assert.equal((await choose(5)).error, "no_person");
    assert.equal((await choose(1)).error, "searching", "a check runs under a round, and this one still runs");

    ok(await db.rpc("lead_round_end", { p_round_id: round, p_ending: "stopped" }));
    const before = await checks();
    const chosen = await choose(1);
    assert.deepEqual([chosen.ok, chosen.addressee, chosen.email_state], [true, 1, "checking"]);
    const pia = ok(await db.from("leads").select("email, email_state, facts").eq("id", omega.id).single());
    assert.deepEqual([pia.email, pia.email_state, pia.facts.addressee], [mail("pia", "omega"), "checking", 1]);
    assert.deepEqual(
      [pia.facts.people[0].check.email, pia.facts.people[0].check.state],
      [mail("ola", "omega"), "ok"],
      "Ola keeps the check her address had",
    );
    assert.equal(await checks(), before + 1, "Pia's address is asked of the mailbox check, under the round");
    const [event] = ok(
      await db.from("events").select("data").eq("subject_id", omega.id).eq("kind", "lead.addressee_chosen"),
    );
    assert.deepEqual([event.data.person, event.data.checking, event.data.by], [1, true, owner.id]);
    assert.equal((await choose(0)).error, "checking", "nothing more until Pia's check lands");

    // Pia's check lands; Ola is chosen back, on the check she kept: no check asked again.
    ok(
      await db
        .from("leads")
        .update({ email_state: "ok", email_checked_at: new Date().toISOString() })
        .eq("id", omega.id),
    );
    const back = await choose(0);
    assert.deepEqual([back.ok, back.email_state], [true, "ok"]);
    assert.equal(await checks(), before + 1, "a check under thirty days stands");
    const ola = ok(await db.from("leads").select("email, facts").eq("id", omega.id).single());
    assert.deepEqual(
      [ola.email, ola.facts.addressee, ola.facts.people[1].check.state],
      [mail("ola", "omega"), 0, "ok"],
    );

    // Pia's address held by another lead, then on the never-again list; and a company written to by hand.
    ok(
      await db.from("leads").insert({
        tenant_id: A,
        place_id: `ChIJfixtureOmega${stamp}`,
        business_name: "Omega Desk",
        email: mail("pia", "omega"),
        email_state: "ok",
        stage: "ready",
      }),
    );
    assert.equal((await choose(1)).error, "address_taken", "one business is written to once");
    ok(
      await db
        .from("lead_suppressions")
        .insert({ tenant_id: A, kind: "email", hash: ok(await hashOf(mail("pia", "omega"))), what: "said_no" }),
    );
    assert.equal((await choose(1)).error, "suppressed");
    ok(await db.from("leads").update({ contacted_at: new Date().toISOString() }).eq("id", omega.id));
    assert.equal((await choose(1)).error, "written", "written to by hand: who it writes to stays");
  },
);
