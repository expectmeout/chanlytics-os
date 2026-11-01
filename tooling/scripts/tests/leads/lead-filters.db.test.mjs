/**
 * The Leads read narrows as the table did (decision 0083, Phase B; migration 00500_the_leads_read_takes_the_page_s_filters.sql):
 * one rule, lead_matches, asked by leads_page, lead_view_counts and lead_bulk's act by view, proved on a real Postgres
 * against the answers the browser's filters gave in Phase A (`tooling/scripts/tests/table/goldens/leads-shown.json`,
 * 240 cases of words, the Excluded view's criterion, a fit and the Filter's reaches over the twelve leads of
 * `tooling/scripts/tests/table/_fixtures.mjs`).
 *
 * The fixture's leads are seeded in their page's order, each found a minute before the last, so leads_page's `found`
 * sort answers them in the goldens' order. A golden holds both classes the fixture has; the read holds one class a
 * call, so each case is read once per class and compared with the golden's rows of that class.
 *
 * Runs the way leads.db.test.mjs does: against the database `supabase start` builds on this machine, never production,
 * with a real owner's session, so every read is judged by row security as the page's is. The fixtures are fictional,
 * and the suite leaves no row behind.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { toLeadRowVM } from "@chanlytics/contracts";
import { LEAD_CHIPS, LEAD_FITS, LEAD_REACH, LEAD_ROWS, LEAD_WORDS } from "../table/_fixtures.mjs";

const GOLDENS = JSON.parse(readFileSync(new URL("../table/goldens/leads-shown.json", import.meta.url), "utf8"));

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and leads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the owner's session needs it"
        : false;

let db;
let A; // the workspace
let owner; // its owner's session
let search; // the one search the fixture's leads were found by
const users = [];
const leadOf = new Map(); // fixture id -> lead id
const fixtureOf = new Map(); // lead id -> fixture id
const classOf = new Map(); // fixture id -> its membership's class
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** The chip as the page named it in Phase A (its words) and as the read takes it (the criterion's key). */
const CHIP_KEYS = { Chains: "chains", "Too far": "too_far" };

/** One golden case's filters, as the read takes them (contracts LeadsQuerySchema's q, excluded_by, fit and reach). */
const filtersOf = (q, chip, fit, reach) => ({
  ...(q ? { q } : {}),
  ...(chip ? { excluded_by: CHIP_KEYS[chip] } : {}),
  ...(fit ? { fit } : {}),
  ...(reach.length ? { reach } : {}),
});

/** Every case the goldens hold, with its key. */
const cases = () => {
  const out = [];
  for (const q of LEAD_WORDS)
    for (const chip of LEAD_CHIPS)
      for (const fit of LEAD_FITS)
        for (const reach of LEAD_REACH)
          out.push({
            key: [q || "-", chip ?? "-", fit ?? "-", reach.join("+") || "-"].join("|"),
            filters: filtersOf(q, chip, fit, reach),
          });
  return out;
};

/** A page of one class under these filters, as the page reads it (the owner's session), its rows as fixture ids. */
const pageOf = async (cls, filters) =>
  ok(
    await owner.client.rpc("leads_page", {
      p_tenant_id: A,
      p_search_id: search,
      p_class: cls,
      p_sort: "found",
      p_limit: 500,
      p_filters: Object.keys(filters).length ? filters : null,
    }),
  ).map((r) => fixtureOf.get(r.lead_id));

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `lead-filters-${Date.now()}`, name: "Lead filters", timezone: "America/Chicago" })
      .select("id")
      .single(),
  ).id;
  const email = `leadfilters-owner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  owner = { client, userId: made.data.user.id };

  search = ok(
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
        target: 200,
        state: "queued",
        month: "2026-09",
        day: "2026-09-19",
        platform_day: "2026-09-19",
      })
      .select("id")
      .single(),
  ).id;
  // The page's order is the newest first: each fixture lead is found a minute before the one above it.
  const first = Date.parse("2026-09-19T12:00:00Z");
  for (const [i, r] of LEAD_ROWS.entries()) {
    const lead = ok(
      await db
        .from("leads")
        .insert({
          tenant_id: A,
          place_id: r.place_id,
          business_name: r.business_name,
          category: r.category,
          street: r.street,
          city: r.city,
          region: r.state,
          postal_code: r.postal_code,
          phone_e164: r.phone,
          // A number the listing and the site agree on is on two sources (lead-page.ts: phone_agrees).
          phone_sources: r.phone ? (r.phone_agrees ? 2 : 1) : 0,
          phone_wrong: r.phone_wrong,
          email: r.email,
          email_state: r.email_state,
          rating: r.rating,
          reviews: r.reviews,
          found_at: new Date(first - i * 60_000).toISOString(),
        })
        .select("id")
        .single(),
    ).id;
    const m = r.member;
    ok(
      await db.from("lead_search_members").insert({
        search_id: search,
        lead_id: lead,
        round_id: round,
        tenant_id: A,
        judgment: { reasons: [], shares: [] },
        class: m.class,
        fit: m.fit,
        excluded_by: m.excluded_by,
        reason: m.reason,
        distance_m: m.distance_m,
        counted: m.class === "qualified",
        counted_month: m.class === "qualified" ? "2026-09" : null,
      }),
    );
    leadOf.set(r.id, lead);
    fixtureOf.set(lead, r.id);
    classOf.set(r.id, m.class);
  }
});

// The local stack is shared with every other worktree, so this suite leaves nothing behind. Everything carrying a
// tenant_id cascades from the workspace; events have no foreign key to it, so they go by hand.
after(async () => {
  if (skip) return;
  await db.from("events").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "every golden case: the read answers the rows the browser's filters left, in the order they stood",
  { skip },
  async () => {
    const all = cases();
    assert.equal(all.length, Object.keys(GOLDENS).length, "every golden case is read");
    const wrong = [];
    for (const { key, filters } of all) {
      const golden = GOLDENS[key].ids;
      for (const cls of ["qualified", "excluded"]) {
        const want = golden.filter((id) => classOf.get(id) === cls);
        const got = await pageOf(cls, filters);
        if (JSON.stringify(got) !== JSON.stringify(want))
          wrong.push(`${key} (${cls}): ${got.join(",")} != ${want.join(",")}`);
      }
    }
    assert.deepEqual(wrong, [], "lead_matches is the rule the table held");
  },
);

test("no filter asks nothing: null and an empty set read every row of the class", { skip }, async () => {
  const every = LEAD_ROWS.filter((r) => r.member.class === "qualified").map((r) => r.id);
  assert.deepEqual(await pageOf("qualified", {}), every);
  const empty = ok(
    await owner.client.rpc("leads_page", { p_tenant_id: A, p_search_id: search, p_sort: "found", p_filters: {} }),
  ).map((r) => fixtureOf.get(r.lead_id));
  assert.deepEqual(empty, every, "{} narrows nothing");
});

test(
  "a view's counts: its members, those that match, and each criterion's chip over the view without the filters",
  { skip },
  async () => {
    const count = async (cls, filters) =>
      ok(
        await owner.client.rpc("lead_view_counts", {
          p_tenant_id: A,
          p_search_id: search,
          p_class: cls,
          p_filters: Object.keys(filters).length ? filters : null,
        }),
      );
    const qualified = LEAD_ROWS.filter((r) => r.member.class === "qualified").length;
    for (const { key, filters } of cases().filter((c) => c.key.endsWith("|email") || c.key.startsWith("studio|"))) {
      const want = GOLDENS[key].ids.filter((id) => classOf.get(id) === "qualified").length;
      const c = await count("qualified", filters);
      assert.equal(c.view, qualified, `${key}: the view holds every qualified member`);
      assert.equal(c.matching, want, `${key}: matching is the rows the read answers`);
    }
    const excluded = await count("excluded", { excluded_by: "chains" });
    assert.equal(excluded.matching, 2);
    assert.deepEqual(excluded.excluded_by, { chains: 2, too_far: 1 }, "the chips count the view, not the chip picked");
  },
);

test(
  "Select all N that match, by view: the act reaches the rows the filters leave, and no other",
  { skip },
  async () => {
    const key = "-|-|strong|email";
    const want = GOLDENS[key].ids.filter((id) => classOf.get(id) === "qualified");
    assert.ok(want.length > 0 && want.length < LEAD_ROWS.length, "the case narrows to some, not none and not all");
    const a = ok(
      await owner.client.rpc("lead_bulk", {
        p_tenant_id: A,
        p_action: "contacted",
        p_ids: null,
        p_view: { search, class: "qualified", list: "all", sort: "fit", dir: "asc", fit: "strong", reach: ["email"] },
      }),
    );
    assert.equal(a.done, want.length);
    const rows = ok(await db.from("leads").select("id, stage").eq("tenant_id", A));
    const contacted = rows
      .filter((r) => r.stage === "nurture")
      .map((r) => fixtureOf.get(r.id))
      .sort();
    assert.deepEqual(contacted, [...want].sort(), "exactly the rows shown, none a filter hid");
  },
);

test(
  "the read's reach keeps exactly what the Reach column draws as Checked, mailbox and number alike",
  { skip },
  async () => {
    const checked = (slot) =>
      LEAD_ROWS.filter(
        (r) => toLeadRowVM(r, "America/Chicago", new Date("2026-09-20T12:00:00Z")).slots[slot].word === "Checked",
      )
        .map((r) => r.id)
        .sort();
    const read = async (reach) =>
      [...(await pageOf("qualified", { reach })), ...(await pageOf("excluded", { reach }))].sort();
    assert.deepEqual(await read(["email"]), checked("mailbox"), "Checked email");
    assert.deepEqual(await read(["phone"]), checked("phone"), "Checked phone");
  },
);
