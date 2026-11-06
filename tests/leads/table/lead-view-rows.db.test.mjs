/**
 * 00554 on the database: Leads is read through one door (lead_view_rows, decision 0103), so what the page shows, what the foot
 * counts and what "all that match" acts on cannot disagree. One row a lead; each word of the box found on its own; an empty
 * value last, whichever way a sort goes; the rating weighed by how many reviewed. The queue's own order is
 * finder/lead-status-groups.db.test.mjs's, and the filters the table held are lead-filters.db.test.mjs's, against its goldens.
 *
 * Local stack only: it makes a workspace, its owner, searches and leads with the service key, and removes them.
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
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and leads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the owner's session needs it"
        : false;

const stamp = Date.now().toString(36);
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;
const month = () => new Date().toISOString().slice(0, 7);

let db;
let A;
let B;
const users = [];
const as = {};
const W = {};

/** The leads, newest found first, each with what the tests below look for in it. Nothing here names a real business. */
const LEADS = {
  plumber: {
    business_name: "Hill Country Drains",
    category: "Plumber",
    neighborhood: "Zilker",
    street: "12 Oak St",
    city: "Austin",
    region: "TX",
    postal_code: "78704",
    email: "hello@hillcountry.example",
    email_state: "ok",
    website_host: "drains.example",
    phone_e164: "+15125550142",
    phone_sources: 2,
    rating: 4.8,
    reviews: 900,
  },
  once: {
    business_name: "Single Review Cafe",
    category: "Cafe",
    city: "Portland",
    region: "OR",
    rating: 5,
    reviews: 1,
  },
  percent: {
    business_name: "100% Organic",
    category: "Grocer",
    city: "Portland",
    region: "OR",
    rating: 4.1,
    reviews: 40,
  },
  under: {
    business_name: "Under_Score Co",
    category: "Printer",
    city: "Salem",
    region: "OR",
    rating: 3.9,
    reviews: 12,
  },
  slash: {
    business_name: "Back\\Slash Studio",
    category: "Studio",
    city: "Bend",
    region: "OR",
    rating: 4.5,
    reviews: 80,
  },
  contacted: {
    business_name: "Quiet Bookshop",
    category: "Bookshop",
    city: "Eugene",
    region: "OR",
    stage: "nurture",
    contacted_at: "2026-10-20T12:00:00Z",
    rating: 4.2,
    reviews: 30,
  },
  closed: {
    business_name: "Closed Bakery",
    category: "Bakery",
    city: "Medford",
    region: "OR",
    stage: "archived",
    closed_reason: "not_a_fit",
    rating: 4,
    reviews: 10,
  },
  bare: { business_name: "Nothing Known" },
};
const NAMES = Object.keys(LEADS);

const member = (search, leadId, over = {}) =>
  db.from("lead_search_members").insert({
    search_id: search,
    lead_id: leadId,
    tenant_id: A,
    class: "qualified",
    counted: true,
    counted_month: month(),
    fit: "strong",
    reason: "",
    judgment: { reasons: [], shares: [] },
    ...over,
  });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `view-rows-${stamp}`, name: "View rows" }));
  B = await one(db.from("tenants").insert({ slug: `view-rows-b-${stamp}`, name: "Elsewhere" }));
  const person = async (tenant, label) => {
    const email = `view-rows-${label}-${stamp}@example.com`;
    const password = `pw-${stamp}-${label}-Aa1!`;
    const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(made.error, null, made.error?.message);
    users.push(made.data.user.id);
    ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role: "owner" }));
    const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    ok(await c.auth.signInWithPassword({ email, password }));
    return { id: made.data.user.id, c };
  };
  as.owner = await person(A, "owner");
  as.stranger = await person(B, "stranger");
  const search = (name) =>
    one(db.from("lead_searches").insert({ tenant_id: A, via: "people", card: "fixture", name, asked: "", plan: {} }));
  W.F = await search("Found");
  W.G = await search("Second");
  W.X = await search("Left out");
  const started = Date.parse("2026-11-01T12:00:00Z");
  for (const [i, k] of NAMES.entries()) {
    W[k] = await one(
      db.from("leads").insert({
        tenant_id: A,
        place_id: `ChIJfixtureView${stamp}${i}`,
        found_at: new Date(started - i * 60_000).toISOString(),
        ...LEADS[k],
      }),
    );
    ok(await member(W.F, W[k], { distance_m: k === "plumber" ? 1000 : k === "once" ? 5000 : null }));
  }
  // One lead two more searches hold: a weaker fit, and left out.
  ok(await member(W.G, W.plumber, { fit: "look" }));
  ok(
    await member(W.X, W.plumber, {
      class: "excluded",
      counted: false,
      counted_month: null,
      fit: null,
      excluded_by: "chains",
    }),
  );
});

after(async () => {
  if (skip) return;
  for (const id of [A, B].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const u of users) await db.auth.admin.deleteUser(u).catch(() => {});
});

const nameOf = () => new Map(NAMES.map((k) => [W[k], k]));
const namesOf = (rows) => {
  const name = nameOf();
  return rows.map((r) => name.get(r.lead_id));
};
const page = async (args = {}, who = as.owner) =>
  ok(await who.c.rpc("leads_page", { p_tenant_id: A, p_class: "qualified", p_limit: 500, ...args }));
const find = async (q) => namesOf(await page({ p_sort: "found", p_filters: { q } }));
const countsOf = async (filters) =>
  ok(await as.owner.c.rpc("lead_view_counts", { p_tenant_id: A, p_class: "qualified", p_filters: filters }));

test("the door is a signed-in member's, and another workspace's leads are not read through it", { skip }, async () => {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ok((await anon.rpc("lead_view_rows", { p_tenant_id: A })).error, "not anon's");
  assert.deepEqual(ok(await as.stranger.c.rpc("lead_view_rows", { p_tenant_id: A })), [], "a stranger reads nothing");
  assert.deepEqual(ok(await as.owner.c.rpc("lead_view_rows", { p_tenant_id: B })), [], "nor a member, of another");
  assert.equal(ok(await as.owner.c.rpc("lead_view_rows", { p_tenant_id: A })).length, NAMES.length);
});

test(
  "one lead in two searches is one row: the membership the filters keep, then its strongest fit",
  { skip },
  async () => {
    const all = await page({ p_sort: "found" });
    const rows = all.filter((r) => r.lead_id === W.plumber);
    assert.equal(rows.length, 1, "All leads holds it once");
    assert.deepEqual([rows[0].fit, rows[0].search_id], ["strong", W.F], "under its strongest fit");
    assert.equal((await countsOf(null)).view, all.length, "the foot counts what the page shows");
    const look = await page({ p_sort: "found", p_filters: { fit: "look" } });
    assert.deepEqual(
      look.map((r) => [r.lead_id, r.fit, r.search_id]),
      [[W.plumber, "look", W.G]],
      "a filter on the fit finds the membership that has it",
    );
    const out = await page({ p_sort: "found", p_class: "excluded" });
    assert.deepEqual(
      out.map((r) => [r.lead_id, r.excluded_by]),
      [[W.plumber, "chains"]],
      "a class is its own view",
    );
    const second = await page({ p_sort: "found", p_search_id: W.G });
    assert.deepEqual(
      second.map((r) => [r.lead_id, r.fit]),
      [[W.plumber, "look"]],
      "and one search's view says that search's",
    );
  },
);

test("each word typed is found on its own, in any order, in more of the lead", { skip }, async () => {
  for (const q of [
    "austin plumber",
    "plumber austin",
    "austin, tx",
    "drains hill",
    "78704 · austin, tx",
    "oak",
    "zilker",
    "hillcountry",
    "drains.example",
  ])
    assert.deepEqual(await find(q), ["plumber"], q);
  assert.deepEqual(await find("plumber portland"), [], "every word must be found");
});

test("a number is looked for in the phone too; two digits are not", { skip }, async () => {
  for (const q of ["555 0142", "(512) 555-0142", "5125550142"]) assert.deepEqual(await find(q), ["plumber"], q);
  assert.deepEqual(await find("78704"), ["plumber"], "and where it is written");
  assert.deepEqual(await find("55"), [], "a word of two digits is no number");
});

test("the first six words are read; punctuation alone asks nothing; %, _ and \\ are themselves", { skip }, async () => {
  assert.deepEqual(await find("hill country drains plumber austin tx nosuchword"), ["plumber"], "the seventh goes");
  assert.equal((await find(" , · ")).length, NAMES.length, "nothing asked, nothing narrowed");
  assert.deepEqual(await find("%"), ["percent"]);
  assert.deepEqual(await find("_"), ["under"]);
  assert.deepEqual(await find("\\"), ["slash"]);
});

test("an empty value sorts last, whichever way", { skip }, async () => {
  const valued = {
    rating: (r) => r.rating !== null,
    reviews: (r) => r.reviews !== null,
    contacted: (r) => r.contacted_at !== null,
    distance: (r) => r.distance_m !== null,
    category: (r) => !!r.category,
    city: (r) => !!r.city,
    region: (r) => !!r.region,
    fit: (r) => r.fit !== null,
  };
  for (const [sort, has] of Object.entries(valued))
    for (const dir of ["asc", "desc"]) {
      const flags = (await page({ p_sort: sort, p_dir: dir })).map(has);
      assert.deepEqual(
        flags,
        [...flags].sort((a, b) => Number(b) - Number(a)),
        `${sort} ${dir}`,
      );
      assert.ok(flags.length === NAMES.length, `${sort} ${dir}: every lead`);
    }
});

test("a page goes on across the empty values, both ways, with no row twice", { skip }, async () => {
  for (const sort of ["rating", "distance", "contacted", "city", "business", "stage", "found"])
    for (const dir of ["asc", "desc"]) {
      const walked = [];
      let cursor = {};
      for (let turn = 0; turn <= NAMES.length; turn += 1) {
        const rows = await page({ p_sort: sort, p_dir: dir, p_limit: 3, ...cursor });
        if (!rows.length) break;
        walked.push(...namesOf(rows));
        const last = rows[rows.length - 1];
        cursor = { p_after_key: last.page_key, p_after_id: last.member_id };
      }
      assert.deepEqual([...walked].sort(), [...NAMES].sort(), `${sort} ${dir}: every lead once`);
    }
});

test("the rating is weighed by how many reviewed", { skip }, async () => {
  const best = namesOf(await page({ p_sort: "rating", p_dir: "desc" }));
  assert.ok(best.indexOf("plumber") < best.indexOf("once"), "4.8 from 900 before 5.0 from one");
  assert.equal(best.at(-1), "bare", "and no rating last");
});

test("reviews, contacted, kind, city and state sort", { skip }, async () => {
  assert.equal(namesOf(await page({ p_sort: "reviews", p_dir: "desc" }))[0], "plumber");
  assert.equal(namesOf(await page({ p_sort: "contacted", p_dir: "desc" }))[0], "contacted");
  assert.equal(namesOf(await page({ p_sort: "category", p_dir: "asc" }))[0], "closed", "Bakery");
  assert.equal(namesOf(await page({ p_sort: "city", p_dir: "asc" }))[0], "plumber", "Austin");
  assert.equal(namesOf(await page({ p_sort: "region", p_dir: "desc" }))[0], "plumber", "TX");
});

test("a rail's list keeps its own, and its reason", { skip }, async () => {
  assert.deepEqual(namesOf(await page({ p_sort: "found", p_list: "nurture" })), ["contacted"]);
  assert.deepEqual(namesOf(await page({ p_sort: "found", p_list: "not_a_fit" })), ["closed"]);
  assert.equal((await page({ p_sort: "found", p_list: "said_no" })).length, 0);
  assert.equal((await countsOf(null)).view, NAMES.length, "All leads holds every stage");
});

test("the counts say what the door holds", { skip }, async () => {
  const filters = { q: "or" };
  const rows = ok(
    await as.owner.c.rpc("lead_view_rows", { p_tenant_id: A, p_filters: filters, p_status: true, p_hits: false }),
  );
  const c = await countsOf(filters);
  assert.equal(c.view, rows.length);
  assert.equal(c.matching, rows.filter((r) => r.hit).length);
  assert.ok(c.matching > 0 && c.matching < c.view, "the words narrow it to some");
  assert.equal(c.with_email, rows.filter((r) => r.hit && r.email_ok).length);
  assert.equal(c.with_phone, rows.filter((r) => r.hit && r.phone_ok).length);
  const hits = ok(await as.owner.c.rpc("lead_view_rows", { p_tenant_id: A, p_filters: filters, p_hits: true }));
  assert.equal(hits.length, c.matching, "p_hits leaves out what the filters do not keep");
});

test("all that match acts on the rows a word in the box keeps, and no other", { skip }, async () => {
  const want = await find("portland");
  assert.deepEqual([...want].sort(), ["once", "percent"]);
  const done = ok(
    await as.owner.c.rpc("lead_bulk", {
      p_tenant_id: A,
      p_action: "contacted",
      p_view: { class: "qualified", list: "all", q: "portland" },
    }),
  );
  assert.equal(done.done, want.length);
  const moved = ok(await db.from("leads").select("id").eq("tenant_id", A).eq("stage", "nurture"));
  assert.deepEqual(new Set(namesOf(moved.map((r) => ({ lead_id: r.id })))), new Set([...want, "contacted"]));
});
