/**
 * 00242 on the database (Reach out Part 7): a list of your own is a search.
 *
 *   1. A file's rows: each placed as the door says (new, joined counted outside the round, checked again, left out and
 *      why, a lead another round is checking left to it), a shared number or website marked, the search and its round
 *      made to be checked by the finder's own check, one lead of the month reserved per address checked; the check's
 *      answers then make the ones that check out Qualified and counted, the rest wait in Needs review, the month keeps
 *      only what counted, the bell says the list is checked, the audience writes to one business once, and Remove the
 *      ones you haven't touched gives back exactly what the list drew.
 *   2. What an import refuses: who may, the switch, the month's room, nothing to add, the limits; the check's floor is
 *      reserved whatever the caller estimates; a check that ended another way says the list could not be checked.
 *   3. Leads chosen on Leads: only a lead already counted joins, counted without drawing the month again and outside a
 *      round that ends as it is made and rings nothing, so nothing is given back; who may, nothing to add, the limit.
 *   4. A file of 500 rows in one call, well inside a signed-in member's statement timeout.
 *   5. The bell's function is 00163's body but for the list's lines, a lead's story 00241's but for one key, and the
 *      database runs both; the vias are held; the doors are a signed-in member's, never anon's.
 *
 * Local stack only: it makes workspaces, people and leads.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { showSecondFactor } from "../_second-factor.mjs";

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
/** One SQL read of the local stack, for what PostgREST does not serve (pg_proc, a hash a session may not ask for). */
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
/** A migration's text, by its number, its lines ended as git keeps them (a Windows checkout ends them in CRLF). */
const migration = (n) => {
  const dir = path.join(ROOT, "supabase/migrations");
  const file = path.join(
    dir,
    fs.readdirSync(dir).find((f) => f.startsWith(`${n}_`)),
  );
  return fs.readFileSync(file, "utf8").split("\r\n").join("\n");
};
const bodyIn = (src, header) => {
  const at = src.indexOf(header);
  assert.ok(at >= 0, `no ${header}`);
  const open = src.indexOf("as $$", at) + "as $$".length;
  return src.slice(open, src.indexOf("$$", open));
};
const liveBody = (name) =>
  query(
    `select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${name}'`,
  )[0]
    ?.prosrc?.split("\r\n")
    .join("\n");

const stamp = Date.now().toString(36);
const at = (who) => `${who}-${stamp}@fixture-lists.example`;
const month = () => new Date().toISOString().slice(0, 7);

let db;
let A;
let B;
const users = [];
const as = {};
const platformDays = new Set();
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

async function person(role, tenant = A) {
  const email = `lists-${role}-${stamp}-${tenant === A ? "a" : tenant === B ? "b" : "c"}@fixture-lists.example`;
  const password = `pw-${stamp}-${role}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }));
  // A partner's seat opens the finder's doors only on a session that showed its second factor (0013; 00261).
  if (role === "partner") await showSecondFactor(c);
  return { id: made.data.user.id, c };
}

const lead = (over = {}) => {
  n += 1;
  return one(
    db.from("leads").insert({
      tenant_id: A,
      place_id: `ChIJfixtureLists${stamp}${n}`,
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
      judgment: { answer: "yes", reasons: [], shares: [] },
      ...over,
    }),
  );
const allowance = async () =>
  ok(
    await db
      .from("lead_counters")
      .select("used, reserved")
      .eq("tenant_id", A)
      .eq("kind", "allowance")
      .eq("period", month()),
  )[0] ?? {
    used: 0,
    reserved: 0,
  };

/** The world: a finder's search with a counted lead (and its number), one in Needs review, one no list takes up and one with no address; a lead another round is checking; a person; a no. */
let W;
const world = () => (W ??= build());
async function build() {
  const finder = await one(
    db.from("lead_searches").insert({
      tenant_id: A,
      via: "people",
      card: "local_businesses",
      name: "Gyms · Austin",
      asked: "gyms",
      plan: {},
    }),
  );
  const counted = await lead({ email: at("counted"), email_state: "ok", phone_e164: "+15125550199" });
  await member(finder, counted);
  const review = await lead({ email: at("review"), email_state: "unknown" });
  await member(finder, review, {
    class: "review",
    counted: false,
    counted_month: null,
    fit: null,
    judgment: { reasons: ["email:unknown"] },
  });
  // One in Needs review that no list takes up, for the choice: never counted anywhere.
  const pending = await lead({ email: at("pending"), email_state: "unknown" });
  await member(finder, pending, {
    class: "review",
    counted: false,
    counted_month: null,
    fit: null,
    judgment: { reasons: ["email:unknown"] },
  });
  const nomail = await lead({ email: null, email_state: "none" });
  await member(finder, nomail);
  // One another search is checking now: a list leaves it to that round.
  const other = await one(
    db.from("lead_searches").insert({
      tenant_id: A,
      via: "people",
      card: "local_businesses",
      name: "Barres · Austin",
      asked: "barres",
      plan: {},
    }),
  );
  const live = await one(
    db.from("lead_rounds").insert({
      tenant_id: A,
      search_id: other,
      seq: 1,
      purpose: "probe",
      plan: {},
      plan_version: 1,
      target: 10,
      state: "queued",
      month: month(),
      day: new Date().toISOString().slice(0, 10),
      platform_day: new Date().toISOString().slice(0, 10),
    }),
  );
  ok(await db.from("lead_rounds").update({ state: "running" }).eq("id", live));
  const busy = await lead({ email: at("busy"), email_state: "checking" });
  await member(other, busy, {
    round_id: live,
    class: "review",
    counted: false,
    counted_month: null,
    fit: null,
    judgment: { reasons: ["email:checking"] },
  });
  await one(db.from("contacts").insert({ tenant_id: A, email: at("customer"), display_name: "A customer" }));
  const hash = query(`select public.lead_suppression_hash('${A}', '${at("never")}') as h`)[0].h;
  ok(await db.from("lead_suppressions").insert({ tenant_id: A, kind: "email", hash, what: "email_opt_out" }));
  const elsewhere = await one(
    db
      .from("leads")
      .insert({ tenant_id: B, business_name: "Elsewhere Gym", email: at("elsewhere"), email_state: "ok" }),
  );
  return { finder, counted, review, pending, nomail, busy, elsewhere };
}

const row = (name, email, over = {}) => ({ name, email, ...over });
const importAs = (who, over = {}) =>
  who.c.rpc("lead_search_import", {
    p_tenant_id: A,
    p_name: `Expo gyms ${stamp}`,
    p_asked: "gyms I met at the Austin expo",
    p_rows: [row("New Gym One", at("new1"))],
    p_estimate_usd: 0.5,
    ...over,
  });
const bellOf = async (round) =>
  ok(await db.from("notifications").select("kind, title, body, route").eq("tenant_id", A).eq("subject_id", round));

let C;
before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db.from("tenants").insert({ slug: `lists-a-${stamp}`, name: "Harbor Fitness Co", timezone: "America/Chicago" }),
  );
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  ok(await db.from("billing_accounts").upsert({ tenant_id: A, mode: "direct", status: "active" }));
  B = await one(db.from("tenants").insert({ slug: `lists-b-${stamp}`, name: "Elsewhere Co" }));
  // A workspace of its own for the file of 500, so its month has the room.
  C = await one(
    db.from("tenants").insert({ slug: `lists-c-${stamp}`, name: "Big List Co", timezone: "America/Chicago" }),
  );
  ok(await db.rpc("provision_tenant", { p_tenant_id: C }));
  for (const role of ["owner", "partner", "operator", "viewer"]) as[role] = await person(role);
  as.stranger = await person("owner", B);
  as.big = await person("owner", C);
  // The switch stays off for the platform; these workspaces are listed, as the finder's own suite lists its own.
  const p = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single());
  ok(
    await db
      .from("lead_platform")
      .update({ tenants_on: [...(p.tenants_on ?? []), A, C] })
      .eq("id", true),
  );
});

// Everything carrying a tenant_id cascades from the workspace; the platform's switch and its day counter do not.
after(async () => {
  if (skip) return;
  const p = await db.from("lead_platform").select("tenants_on").eq("id", true).single();
  if (p.data)
    await db
      .from("lead_platform")
      .update({ tenants_on: (p.data.tenants_on ?? []).filter((t) => t !== A && t !== C) })
      .eq("id", true);
  for (const id of [A, B, C].filter(Boolean)) {
    for (const r of (await db.from("lead_rounds").select("platform_day").eq("tenant_id", id)).data ?? [])
      platformDays.add(r.platform_day);
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  if (platformDays.size)
    await db
      .from("lead_counters")
      .delete()
      .is("tenant_id", null)
      .eq("kind", "day")
      .in("period", [...platformDays]);
  for (const u of users) await db.auth.admin.deleteUser(u).catch(() => {});
});

test(
  "a file's rows become a search checked first, and what checks out is a lead a reach-out may write to",
  { skip },
  async () => {
    const w = await world();
    const before_ = await allowance();
    const a = ok(
      await importAs(as.owner, {
        p_rows: [
          row("New Gym One", at("new1"), {
            phone: "+15125550101",
            website_host: "new1.example",
            city: "Austin",
            region: "TX",
            category: "Gym",
          }),
          row("New Gym Two", `  ${at("new2").toUpperCase()} `),
          row("New Gym One again", at("new1")),
          row("", at("noname")),
          row("Bad Address", "not-an-address"),
          row("A Customer", at("customer")),
          row("Said Never", at("never")),
          row("Counted Already", at("counted")),
          row("In Review", at("review")),
          row("Being Checked", at("busy")),
          // A number a found lead holds, and two rows of one website: one business each, never written to twice.
          row("Shared Number Gym", at("shared"), { phone: "+15125550199" }),
          row("Twin Gym A", at("twina"), { website_host: "twins.example" }),
          row("Twin Gym B", at("twinb"), { website_host: "twins.example" }),
        ],
      }),
    );
    assert.deepEqual(
      [a.added, a.checking, a.counted, a.left_out],
      [5, 6, 1, { unreadable: 2, twice: 1, customer: 1, never_again: 1, elsewhere: 1 }],
    );
    const s = ok(await db.from("lead_searches").select("via, card, name, asked, plan").eq("id", a.search_id).single());
    assert.deepEqual(
      [s.via, s.card, s.asked, s.plan.list, s.plan.criteria, s.plan.area],
      ["import", "local_businesses", "gyms I met at the Austin expo", "import", [], undefined],
    );
    const r = ok(
      await db
        .from("lead_rounds")
        .select("state, target, allowance_reserved, cost_reserved_usd, platform_day")
        .eq("id", a.round_id)
        .single(),
    );
    platformDays.add(r.platform_day);
    assert.deepEqual([r.state, r.target, r.allowance_reserved, Number(r.cost_reserved_usd)], ["checking", 6, 6, 0.5]);
    assert.equal(
      (await allowance()).reserved - before_.reserved,
      6,
      "one lead of the month reserved per address checked",
    );
    const jobs = ok(await db.from("jobs").select("payload").eq("tenant_id", A).eq("kind", "lead_check"));
    assert.deepEqual(
      jobs.filter((j) => j.payload.round_id === a.round_id).map((j) => j.payload.batch),
      [0],
    );

    const members = ok(
      await db
        .from("lead_search_members")
        .select("lead_id, round_id, class, counted, fit, judgment")
        .eq("search_id", a.search_id),
    );
    const byLead = new Map(members.map((m) => [m.lead_id, m]));
    const leads = ok(
      await db
        .from("leads")
        .select("id, email, email_state, phone_e164, website_host, region, category, place_id")
        .eq("tenant_id", A),
    );
    const id = Object.fromEntries(leads.map((l) => [l.email, l.id]));
    const byEmail = new Map(leads.map((l) => [l.email, l]));
    const new1 = byEmail.get(at("new1"));
    assert.deepEqual(
      [new1.email_state, new1.phone_e164, new1.website_host, new1.region, new1.category, new1.place_id],
      ["checking", "+15125550101", "new1.example", "TX", "Gym", null],
    );
    assert.ok(id[at("new2")], "the address is kept as an address, trimmed and lower-cased");
    for (const who of ["new1", "new2", "review", "shared", "twina", "twinb"]) {
      const m = byLead.get(id[at(who)]);
      assert.deepEqual(
        [m.class, m.counted, m.round_id, m.judgment.reasons],
        ["review", false, a.round_id, ["email:checking"]],
        `${who} waits for its address alone`,
      );
    }
    assert.equal(byEmail.get(at("review")).email_state, "checking", "a lead no search counted is checked again");
    const joined = byLead.get(w.counted);
    assert.deepEqual(
      [joined.class, joined.counted, joined.fit, joined.round_id],
      ["qualified", true, "strong", null],
      "joined outside the round",
    );
    assert.deepEqual(byLead.get(id[at("shared")]).judgment.shares, [{ kind: "phone", lead_id: w.counted }]);
    assert.deepEqual(byLead.get(id[at("twina")]).judgment.shares, []);
    assert.deepEqual(byLead.get(id[at("twinb")]).judgment.shares, [{ kind: "host", lead_id: id[at("twina")] }]);
    assert.equal(byLead.get(w.busy), undefined, "left to the round checking it");
    assert.equal(byEmail.get(at("busy")).email_state, "checking");
    assert.equal(members.length, 7);
    assert.ok(!byEmail.has(at("customer")) && !byEmail.has(at("never")), "no lead for a customer or a no");

    // The check answers: all check out but one.
    const answers = ["new1", "review", "shared", "twina", "twinb"].map((who) => ({
      lead_id: id[at(who)],
      email_state: "ok",
    }));
    const done = ok(
      await db.rpc("lead_check_commit", {
        p_round_id: a.round_id,
        p_run_id: null,
        p_results: [...answers, { lead_id: id[at("new2")], email_state: "invalid" }],
        p_usage_usd: 0,
        p_last: true,
      }),
    );
    assert.deepEqual([done.qualified, done.counted, done.ended], [5, 5, true]);
    const month_ = await allowance();
    assert.deepEqual(
      [month_.used - before_.used, month_.reserved - before_.reserved],
      [5, 0],
      "the month keeps what counted",
    );
    assert.deepEqual(await bellOf(a.round_id), [
      {
        kind: "leads_ready",
        title: `Your list Expo gyms ${stamp} is checked`,
        body: "5 have a checked address.",
        route: `clients/leads:s-${a.search_id}`,
      },
    ]);
    const view = ok(
      await db.from("lead_searches_view").select("qualified, review, counted").eq("id", a.search_id).single(),
    );
    assert.deepEqual(view, { qualified: 6, review: 1, counted: 6 });
    const audience = ok(await db.rpc("reach_out_audience", { p_tenant_id: A, p_search_id: a.search_id, p_limit: 10 }));
    assert.deepEqual(
      audience.map((x) => x.email).sort(),
      [at("counted"), at("new1"), at("review"), at("twina")].sort(),
      "one business is written to once: a shared number or website is never written to",
    );

    // Remove the ones you haven't touched gives back what the check counted, never the lead that joined counted.
    const undone = ok(await as.owner.c.rpc("lead_search_undo", { p_search_id: a.search_id }));
    assert.deepEqual(
      [undone.removed, undone.credited],
      [6, 5],
      "the untouched members of the round go; the five it counted come back",
    );
    assert.equal((await allowance()).used, before_.used, "the month has back exactly what the list drew");
    const still = ok(
      await db
        .from("lead_search_members")
        .select("counted, blanked_at")
        .eq("search_id", a.search_id)
        .eq("lead_id", w.counted)
        .single(),
    );
    assert.deepEqual(still, { counted: true, blanked_at: null });
  },
);

test(
  "an import refuses who may not, a paused switch, a full month, nothing to add and too much; a failed check says so",
  { skip },
  async () => {
    await world();
    refusedWith(await importAs(as.operator), "42501");
    refusedWith(await importAs(as.viewer), "42501");
    refusedWith(await importAs(as.stranger), "42501");
    // A partner imports; an estimate of nothing still reserves the checker run's floor.
    const part = ok(
      await importAs(as.partner, {
        p_name: `Partner's list ${stamp}`,
        p_rows: [row("Partner Gym", at("partner1"))],
        p_estimate_usd: 0,
      }),
    );
    const pr = ok(
      await db.from("lead_rounds").select("cost_reserved_usd, platform_day").eq("id", part.round_id).single(),
    );
    platformDays.add(pr.platform_day);
    assert.equal(Number(pr.cost_reserved_usd), 0.5);
    // Its check ends another way (searching paused): the bell says it could not be checked.
    query(`select public.lead_round_end('${part.round_id}', 'paused')`);
    assert.deepEqual(await bellOf(part.round_id), [
      {
        kind: "leads_ready",
        title: `Your list Partner's list ${stamp} could not be checked`,
        body: "Its addresses wait in Needs review.",
        route: `clients/leads:s-${part.search_id}`,
      },
    ]);
    refusedWith(await importAs(as.owner, { p_name: "  " }), "22023");
    refusedWith(
      await importAs(as.owner, { p_rows: Array.from({ length: 501 }, (_, i) => row(`Gym ${i}`, at(`many${i}`))) }),
      "22023",
    );
    const nothing = ok(await importAs(as.owner, { p_rows: [row("A Customer", at("customer")), row("", at("x"))] }));
    assert.equal(nothing.error, "nothing");
    assert.deepEqual(nothing.left_out, { unreadable: 1, twice: 0, customer: 1, never_again: 0, elsewhere: 0 });

    // The month's room: two addresses to check and one lead left.
    const c = ok(
      await db
        .from("lead_counters")
        .select("id, used, reserved")
        .eq("tenant_id", A)
        .eq("kind", "allowance")
        .eq("period", month())
        .single(),
    );
    ok(
      await db
        .from("lead_counters")
        .update({ used: 500 - c.reserved - 1 })
        .eq("id", c.id),
    );
    const full = ok(await importAs(as.owner, { p_rows: [row("Room One", at("room1")), row("Room Two", at("room2"))] }));
    assert.equal(full.error, "month_leads_used");
    assert.equal(full.left, 1);
    assert.match(full.sentence, /This list has 2 addresses to check and you have 1 lead left this month/);
    ok(await db.from("lead_counters").update({ used: c.used }).eq("id", c.id));
    assert.equal(
      ok(await db.from("lead_searches").select("id").eq("tenant_id", A).eq("via", "import")).length,
      2,
      "a refusal writes nothing",
    );

    // Paused: the workspace off the switch's list.
    const p = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single());
    ok(
      await db
        .from("lead_platform")
        .update({ tenants_on: (p.tenants_on ?? []).filter((t) => t !== A) })
        .eq("id", true),
    );
    try {
      assert.equal(ok(await importAs(as.owner)).error, "paused");
    } finally {
      ok(await db.from("lead_platform").update({ tenants_on: p.tenants_on }).eq("id", true));
    }
  },
);

test(
  "leads chosen on Leads: only counted ones join, counted once, outside a round that rings nothing",
  { skip },
  async () => {
    const w = await world();
    const chooseAs = (who, ids, name = `Chosen ${stamp}`) =>
      who.c.rpc("lead_search_choose", { p_tenant_id: A, p_name: name, p_lead_ids: ids });
    refusedWith(await chooseAs(as.viewer, [w.counted]), "42501");
    refusedWith(await chooseAs(as.stranger, [w.counted]), "42501");
    const before_ = await allowance();
    const a = ok(
      await chooseAs(as.operator, [w.counted, w.pending, w.nomail, w.elsewhere, crypto.randomUUID(), w.counted]),
    );
    assert.deepEqual([a.counted, a.left_out], [1, { not_counted: 1, no_email: 1, gone: 2 }]);
    const s = ok(await db.from("lead_searches").select("via, asked, plan").eq("id", a.search_id).single());
    assert.deepEqual([s.via, s.asked, s.plan.list], ["chosen", "", "chosen"]);
    const r = ok(
      await db.from("lead_rounds").select("state, ending, target, platform_day").eq("id", a.round_id).single(),
    );
    platformDays.add(r.platform_day);
    assert.deepEqual([r.state, r.ending, r.target], ["ended", "target_reached", 1]);
    const m = ok(
      await db
        .from("lead_search_members")
        .select("lead_id, round_id, class, counted, fit")
        .eq("search_id", a.search_id),
    );
    assert.deepEqual(m, [{ lead_id: w.counted, round_id: null, class: "qualified", counted: true, fit: "strong" }]);
    assert.deepEqual(await allowance(), before_, "nothing drawn again");
    assert.deepEqual(await bellOf(a.round_id), [], "a choice rings nothing");
    // Nothing to give back: it drew nothing.
    const undone = ok(await as.owner.c.rpc("lead_search_undo", { p_search_id: a.search_id }));
    assert.deepEqual([undone.removed, undone.credited], [0, 0]);
    assert.deepEqual(await allowance(), before_);
    const nothing = ok(await chooseAs(as.operator, [w.pending]));
    assert.equal(nothing.error, "nothing");
    refusedWith(
      await chooseAs(
        as.operator,
        Array.from({ length: 501 }, () => crypto.randomUUID()),
      ),
      "22023",
    );
    refusedWith(await chooseAs(as.operator, [w.counted], " "), "22023");
  },
);

test(
  "a file of 500 rows is taken in one call, well inside a signed-in member's statement timeout",
  { skip },
  async () => {
    const rows = Array.from({ length: 500 }, (_, i) =>
      row(`Big Gym ${i}`, at(`big${i}`), {
        phone: `+1512555${String(1000 + i).padStart(4, "0")}`,
        website_host: `big${i}.example`,
      }),
    );
    const t0 = Date.now();
    const a = ok(
      await as.big.c.rpc("lead_search_import", {
        p_tenant_id: C,
        p_name: "Big list",
        p_asked: "",
        p_rows: rows,
        p_estimate_usd: 0.58,
      }),
    );
    const ms = Date.now() - t0;
    const r = ok(await db.from("lead_rounds").select("platform_day, target").eq("id", a.round_id).single());
    platformDays.add(r.platform_day);
    assert.deepEqual([a.added, a.checking, r.target], [500, 500, 500]);
    assert.ok(ms < 4000, `500 rows in ${ms} ms: well inside the 8 s a signed-in member's statement may take`);
  },
);

test(
  "the bell is 00163's but for the list's lines, a lead's story 00241's but for one key; the vias are held; the doors are a member's",
  { skip },
  async () => {
    const w = await world();
    const now = bodyIn(migration("00242"), "create or replace function public.lead_rounds_notify(");
    assert.equal(liveBody("lead_rounds_notify"), now, "the database runs 00242's");
    const was = now
      .replace("  v_via  text;\n", "")
      .replace("select s.name, s.via into v_name, v_via from", "select s.name into v_name from")
      .replace(/ {2}-- A list: [^\n]*\n {2}if v_via = 'chosen'[^\n]*\n/, "")
      .replace(
        /'leads_ready',\n {11}case when v_via <> 'import' then (left\('Your search for ' \|\| v_name \|\| ' is done', 200\))\n[^\n]*\n[^\n]*\n {11}case when v_via <> 'import' then (case when v_n > 0 then v_n \|\| ' found\.' else 'Nothing new was counted\.' end)\n[^\n]*\n[^\n]*end,/,
        "'leads_ready', $1,\n           $2,",
      );
    assert.equal(was, bodyIn(migration("00163"), "create or replace function public.lead_rounds_notify("));

    const story = bodyIn(migration("00242"), "create or replace function public.reach_out_lead_timeline(");
    assert.equal(liveBody("reach_out_lead_timeline"), story, "the database runs 00242's");
    assert.equal(
      story.replace(/ {4}-- Found on a listing[^\n]*\n {4}'found_on_listing', v_lead\.place_id is not null,\n/, ""),
      bodyIn(migration("00241"), "create or replace function public.reach_out_lead_timeline("),
    );
    const [listed] = query(`select id from public.leads where tenant_id = '${A}' and email = '${at("new1")}'`);
    const fromList = ok(await as.owner.c.rpc("reach_out_lead_timeline", { p_tenant_id: A, p_lead_id: listed.id }));
    const found = ok(await as.owner.c.rpc("reach_out_lead_timeline", { p_tenant_id: A, p_lead_id: w.counted }));
    assert.deepEqual([fromList.found_on_listing, found.found_on_listing], [false, true]);

    const bad = await db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "other", card: "local_businesses", name: "x", asked: "", plan: {} });
    assert.equal(bad.error?.code, "23514");
    const grants = query(
      `select has_function_privilege('anon', 'public.lead_search_import(uuid, text, text, jsonb, numeric)', 'execute') as anon_import,
            has_function_privilege('authenticated', 'public.lead_search_import(uuid, text, text, jsonb, numeric)', 'execute') as member_import,
            has_function_privilege('anon', 'public.lead_search_choose(uuid, text, uuid[])', 'execute') as anon_choose,
            has_function_privilege('authenticated', 'public.lead_search_choose(uuid, text, uuid[])', 'execute') as member_choose`,
    )[0];
    assert.deepEqual(grants, { anon_import: false, member_import: true, anon_choose: false, member_choose: true });
  },
);
