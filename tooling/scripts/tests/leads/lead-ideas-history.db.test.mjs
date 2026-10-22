/**
 * The ideas' two doors on a real database (00398, 00399, 00400): what a workspace's searches found, read as the ideas
 * are written from it (lead_suggest_history: counts, moments and the plan's own words, never a business's name); a
 * round that ends adding to its kind's platform-wide counts (lead_niche_priors, by the plan's category_key); and the
 * one writer of the ideas, lead_suggestions_write, by act: a second claim refused while the first stands, a keep under
 * a claim since let go refused, a failure under a stale claim changing nothing, the owner's line clearing a claim, New
 * ideas (00470's again) keeping what was shown, and the event a keep, a line and an again write. Both doors are the service's alone. Local stack only: it makes a workspace.
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
      ? "refusing a database that is not on this machine: this suite makes a workspace"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env"
        : false;

const stamp = Date.now().toString(36);
const KIND = `zz_probe_${stamp}`;
let db;
let A;
const ids = {};
const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
const area = {
  kind: "zip",
  label: "near 78704",
  state: "TX",
  center: null,
  radius_m: 8000,
  zip: "78704",
  query: "78704, TX, USA",
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `ideas-${stamp}`, name: "Ideas Co", timezone: "America/Chicago" })
      .select("id")
      .single(),
    "tenant",
  ).id;
  ok(
    await db.from("business_records").insert({
      tenant_id: A,
      legal_name: "Ideas Co LLC",
      street: "1 Fixture St",
      city: "Austin",
      region: "TX",
      postal_code: "78704",
      website_url: "https://ideas.example",
      contact_first_name: "Ada",
      contact_last_name: "Fixture",
      contact_email: `ada-${stamp}@fixture-ideas.example`,
      contact_phone: "+15125550100",
    }),
    "business record",
  );
  // One search from an idea, its probe round, and two places it judged: one kept with an email and contacted, one
  // left out as not the kind.
  ids.search = ok(
    await db
      .from("lead_searches")
      .insert({
        tenant_id: A,
        via: "people",
        card: "local_businesses",
        name: "chiropractors",
        asked: "Chiropractors near 78704",
        plan: {
          version: 1,
          card: "local_businesses",
          name: "chiropractors",
          category_key: KIND,
          from: "idea",
          terms: ["chiropractor"],
          area,
          count: 50,
          contact: "email",
          criteria: [],
          exclusions: [{ key: "chains", text: "chains", origin: "claude" }],
        },
      })
      .select("id")
      .single(),
    "search",
  ).id;
  ids.round = ok(
    await db
      .from("lead_rounds")
      .insert({
        tenant_id: A,
        search_id: ids.search,
        seq: 1,
        purpose: "probe",
        plan: { version: 1, category_key: KIND },
        plan_version: 1,
        target: 25,
        state: "queued",
        month: "2026-10",
        day: "2026-10-11",
      })
      .select("id")
      .single(),
    "round",
  ).id;
  // A round starts queued and runs before it ends (lead_rounds_guard).
  ok(await db.from("lead_rounds").update({ state: "running" }).eq("id", ids.round), "running");
  ids.kept = ok(
    await db
      .from("leads")
      .insert({
        tenant_id: A,
        business_name: "Fixture Back Clinic",
        email: `hello-${stamp}@fixture-ideas.example`,
        contacted_at: "2026-10-09T15:00:00Z",
      })
      .select("id")
      .single(),
    "lead kept",
  ).id;
  ids.out = ok(
    await db.from("leads").insert({ tenant_id: A, business_name: "Fixture Gym" }).select("id").single(),
    "lead out",
  ).id;
  ok(
    await db.from("lead_search_members").insert([
      {
        search_id: ids.search,
        lead_id: ids.kept,
        round_id: ids.round,
        tenant_id: A,
        class: "qualified",
        fit: "strong",
      },
      {
        search_id: ids.search,
        lead_id: ids.out,
        round_id: ids.round,
        tenant_id: A,
        class: "excluded",
        excluded_by: "kind",
      },
    ]),
    "members",
  );
});

after(async () => {
  if (skip || !db) return;
  await db.from("lead_niche_priors").delete().eq("category_key", KIND);
  if (A) await db.from("tenants").delete().eq("id", A);
});

test(
  "what the searches found is read in counts, moments and the plan's own words, never a business's name",
  { skip },
  async () => {
    const h = ok(await db.rpc("lead_suggest_history", { p_tenant_id: A }), "history");
    assert.deepEqual(h.home, { city: "Austin", region: "TX", zip: "78704" });
    assert.equal(h.searches.length, 1);
    const s = h.searches[0];
    assert.equal(s.kind, KIND);
    assert.equal(s.from_idea, true, "the plan says it came from an idea");
    assert.equal(s.state, "running");
    assert.deepEqual(s.found, { qualified: 1, review: 0, excluded: 1 });
    assert.deepEqual(s.left_out, { kind: 1 });
    assert.deepEqual([s.leads.contacted, s.leads.with_email, s.leads.with_phone], [1, 1, 0]);
    assert.equal(new Date(s.leads.last_contacted_at).toISOString(), "2026-10-09T15:00:00.000Z");
    assert.deepEqual(s.reach, { sent: 0, replied: 0, interested: 0, declined: 0, last_sent_at: null });
    assert.deepEqual(
      s.exclusions.map((x) => x.text),
      ["chains"],
    );
    assert.doesNotMatch(
      JSON.stringify(h),
      /Fixture Back Clinic|Fixture Gym|fixture-ideas\.example/,
      "no business, no address",
    );
    assert.equal(h.basis, null, "no round has ended yet");
  },
);

test("a round that ends adds what it judged to its kind's platform-wide counts, once", { skip }, async () => {
  ok(
    await db
      .from("lead_rounds")
      .update({ state: "ended", ending: "target_reached", ended_at: new Date().toISOString() })
      .eq("id", ids.round),
    "ended",
  );
  const prior = ok(
    await db.from("lead_niche_priors").select("places, matched, with_email").eq("category_key", KIND).maybeSingle(),
  );
  assert.deepEqual(prior, { places: 2, matched: 1, with_email: 1 });
  // The newest ended round is now what ideas are written over.
  const h = ok(await db.rpc("lead_suggest_history", { p_tenant_id: A }));
  assert.ok(h.basis, "the basis is the round's end");
  assert.equal(h.searches[0].ending, "target_reached");
});

/** The one door, by act. */
const write = (args) => db.rpc("lead_suggestions_write", { p_tenant_id: A, ...args });
const row = () =>
  db
    .from("lead_suggestions")
    .select("business_line, by_owner, items, basis, passed, making_at, failed_at")
    .eq("tenant_id", A)
    .single();

test(
  "the claim is one read's: a second is refused while it stands, a keep under a claim since let go is refused, and a stale failure changes nothing",
  { skip },
  async () => {
    const claim = ok(await write({ p_act: "claim", p_line: "Ideas Co: back care supplies" }), "claim").claim;
    assert.ok(typeof claim === "string" && Number.isFinite(Date.parse(claim)), "the claim's own moment");
    assert.equal(ok(await write({ p_act: "claim", p_line: "Ideas Co" })).claim, null, "a second claim waits");
    assert.equal(ok(await row()).business_line, "Ideas Co: back care supplies", "the row is made with the line");
    // A keep under another moment is refused: nothing written.
    const wrong = ok(
      await write({
        p_act: "keep",
        p_claim: "2020-01-01T00:00:00Z",
        p_line: "someone else's",
        p_by_owner: false,
        p_items: [{ words: "x" }],
        p_basis: "b",
        p_passed: [],
      }),
    );
    assert.equal(wrong.kept, false);
    assert.equal(ok(await row()).business_line, "Ideas Co: back care supplies");
    // Under its own claim: kept, and the claim let go.
    const items = [
      {
        words: "Chiropractors near 78704",
        who_for: "why",
        category_key: KIND,
        reach: null,
        plan: null,
        ask: "Find 50",
      },
    ];
    const kept = ok(
      await write({
        p_act: "keep",
        p_claim: claim,
        p_line: "a back care supplier in Austin",
        p_by_owner: false,
        p_items: items,
        p_basis: "2026-10-11T00:00:00.000Z",
        p_passed: [{ key: "cafe", place: "near 78702", label: "near 78702", times: 1 }],
      }),
    );
    assert.equal(kept.kept, true);
    const after1 = ok(await row());
    assert.deepEqual(
      [after1.business_line, after1.by_owner, after1.basis, after1.making_at, after1.failed_at],
      ["a back care supplier in Austin", false, "2026-10-11T00:00:00.000Z", null, null],
    );
    assert.deepEqual(after1.items, items);
    assert.equal(after1.passed[0].times, 1);
    // A failure under the stale claim changes nothing; under a live claim it is kept and the claim let go.
    assert.equal(ok(await write({ p_act: "fail", p_claim: claim })).failed, false, "a stale claim fails nothing");
    assert.equal(ok(await row()).failed_at, null);
    const again = ok(await write({ p_act: "claim", p_line: "x" })).claim;
    assert.equal(ok(await write({ p_act: "fail", p_claim: again })).failed, true);
    const after2 = ok(await row());
    assert.ok(after2.failed_at, "the failure is kept");
    assert.equal(after2.making_at, null, "and the claim let go");
    assert.equal(after2.business_line, "a back care supplier in Austin", "the line stands");
  },
);

test("the owner's line clears a claim in flight, and a keep and a line each write their event", { skip }, async () => {
  const inFlight = ok(await write({ p_act: "claim", p_line: "x" })).claim;
  assert.ok(inFlight, "a claim stands");
  assert.deepEqual(ok(await write({ p_act: "line", p_line: "A back care supplier, Austin" })), { saved: true });
  const after = ok(await row());
  assert.deepEqual(
    [after.business_line, after.by_owner, after.items, after.basis, after.passed, after.making_at, after.failed_at],
    ["A back care supplier, Austin", true, [], null, [], null, null],
    "the owner's words, with no ideas, no basis and nothing passed on",
  );
  const late = ok(await write({ p_act: "keep", p_claim: inFlight, p_line: "late", p_items: [], p_basis: "b" }));
  assert.equal(late.kept, false, "the write in flight finds its claim gone");
  // A record for Reports: how the ideas came to be written, how many, and whose words they are from.
  const events = ok(
    await db
      .from("events")
      .select("kind, data")
      .eq("tenant_id", A)
      .eq("kind", "lead.ideas_written")
      .order("created_at"),
  );
  assert.deepEqual(
    events.map((e) => [e.data.how, e.data.count, e.data.by_owner]),
    [
      ["written", 1, false],
      ["line", 0, true],
    ],
  );
  const bad = await write({ p_act: "eat" });
  assert.match(bad.error?.message ?? "", /act is claim, keep, fail, line or again/);
  const short = await write({ p_act: "line", p_line: "no" });
  assert.match(short.error?.message ?? "", /at least three characters/);
});

test(
  "New ideas (00470's again) keeps the ideas shown to be passed on, lets the claim go and asks at once",
  { skip },
  async () => {
    const claim = ok(await write({ p_act: "claim", p_line: "x" })).claim;
    const items = [
      {
        words: "Physical therapists near 78704",
        who_for: "why",
        category_key: KIND,
        reach: null,
        plan: null,
        ask: "Find 50",
      },
    ];
    ok(
      await write({
        p_act: "keep",
        p_claim: claim,
        p_line: "A back care supplier, Austin",
        p_items: items,
        p_basis: "b",
      }),
    );
    const inFlight = ok(await write({ p_act: "claim", p_line: "x" })).claim;
    assert.ok(inFlight, "a write is in flight");
    assert.deepEqual(ok(await write({ p_act: "again" })), { again: true });
    const after = ok(await row());
    assert.deepEqual(
      [after.business_line, after.by_owner, after.basis, after.making_at, after.failed_at],
      ["A back care supplier, Austin", false, null, null, null],
      "the same line, no basis (so the next read writes), no claim and no failure",
    );
    assert.deepEqual(after.items, items, "what was shown stays, for the next write to pass on");
    const late = ok(await write({ p_act: "keep", p_claim: inFlight, p_line: "late", p_items: [], p_basis: "b" }));
    assert.equal(late.kept, false, "the write in flight finds its claim gone");
    const [event] = ok(
      await db
        .from("events")
        .select("data")
        .eq("tenant_id", A)
        .eq("kind", "lead.ideas_written")
        .order("created_at", { ascending: false })
        .limit(1),
    );
    assert.deepEqual([event.data.how, event.data.count], ["again", 0]);
    // A workspace with no ideas yet has nothing to write again.
    assert.deepEqual(
      ok(await db.rpc("lead_suggestions_write", { p_tenant_id: globalThis.crypto.randomUUID(), p_act: "again" })),
      {
        again: false,
      },
    );
  },
);

test("the two doors are the service's alone", { skip }, async () => {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  for (const [fn, args] of [
    ["lead_suggest_history", { p_tenant_id: A }],
    ["lead_suggestions_write", { p_tenant_id: A, p_act: "claim", p_line: "x" }],
  ]) {
    const r = await anon.rpc(fn, args);
    assert.ok(r.error, `${fn} refuses anon`);
    assert.match(r.error.message, /permission denied|not found/i, `${fn}: ${r.error.message}`);
  }
});
