/**
 * A send is checked before it goes (00191, Reach out Part 4 PRs 2–3), on a real database: the guard claims a checked
 * send only and holds one with a reason its owner can answer; a held send keeps its run open, closes with its canceled
 * run, and is found stale fourteen days from its planning (R10); the claim's due domains skip what waits to be checked
 * (R8); the audience takes a catch-all address only when asked, never a lead another chain of the workspace planned, and
 * its four-argument form still answers (R9); a search has one chain; a business's record carries the check's two code
 * facts; the sends to check are leased, round-robin by workspace, within the horizon, past their backoff, each with the
 * holds its owner included its lead past (R2, R3, R7); a check writes only at the words' version it read (R5); and the
 * check's own tick, over a scripted model, stores what it found. Local stack only: it makes workspaces.
 */
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { claimSends, recordCheck, uncheckedSends } from "@chanlytics/db";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const MIN = 60_000;
const H = 3_600_000;
const DAY = 24 * H;
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();

let db;
let A;
let B;
let search;
let template;
let root;
let rootRun;
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

const domainRow = (over = {}) =>
  one(
    db.from("sending_domains").insert({
      tenant_id: A,
      host: `checked-${stamp}-${++n}.example`,
      from_local: "sam",
      from_name: "Sam at Harbor",
      state: "verified",
      provider_status: "verified",
      dmarc: "found",
      verified_at: iso(Date.now() - 10 * DAY),
      clean_since: iso(Date.now() - 10 * DAY),
      ...over,
    }),
  );
const lead = (over = {}, tenant = A) => {
  n += 1;
  return one(
    db.from("leads").insert({
      tenant_id: tenant,
      place_id: `ChIJfixtureChecked${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      city: "Austin",
      region: "TX",
      email: `owner-${stamp}-${n}@fixture-checked.example`,
      email_state: "ok",
      stage: "ready",
      ...over,
    }),
  );
};
const member = (leadId, over = {}, s = search, tenant = A) =>
  one(
    db.from("lead_search_members").insert({
      search_id: s,
      lead_id: leadId,
      tenant_id: tenant,
      class: "qualified",
      counted: true,
      counted_month: new Date().toISOString().slice(0, 7),
      fit: "look",
      judgment: { answer: "yes", reasons: [], shares: [] },
      ...over,
    }),
  );
const newSearch = (tenant = A, name = "Other") =>
  one(
    db
      .from("lead_searches")
      .insert({ tenant_id: tenant, via: "people", card: "movers", name, asked: "movers", plan: {} }),
  );
/** A chain's root over a search of its own, in a workspace. */
const rootOf = async (tenant, s, over = {}) =>
  one(
    db.from("playbooks").insert({
      tenant_id: tenant,
      kind: "reach_out",
      policy_class: "outreach",
      gap_minutes: 12,
      template_id: template,
      template_name: `reach_checked_${stamp}`,
      template_language: "en",
      params: [],
      name: "Movers",
      trigger: "lead_first",
      lead_search_id: s,
      ...over,
    }),
  );
/** A run of its own for a case, on a far day no other case uses. */
let far = 0;
const runOf = (tenant, rootId, state = "scheduled") => {
  far += 1;
  return one(
    db.from("broadcasts").insert({
      tenant_id: tenant,
      name: "Movers",
      template_id: template,
      template_name: `reach_checked_${stamp}`,
      template_language: "en",
      audience: { kind: "reach_out", root_id: rootId, step_id: rootId, search_id: search },
      state,
      scheduled_for: iso(Date.now()),
      playbook_id: rootId,
      run_for: new Date(Date.UTC(2099, 0, far)).toISOString().slice(0, 10),
    }),
  );
};
/** A send, as the run plans one (not yet checked unless a case says so). */
async function sendIn(over = {}) {
  const id = crypto.randomUUID();
  ok(
    await db.from("reach_out_sends").insert({
      id,
      tenant_id: A,
      broadcast_id: rootRun,
      playbook_id: root,
      root_id: root,
      lead_id: over.lead_id ?? (await lead()),
      send_at: iso(Date.now() - MIN),
      ...over,
    }),
  );
  return id;
}
const row = async (id) => ok(await db.from("reach_out_sends").select("*").eq("id", id).single());

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `checked-a-${stamp}`, name: "Harbor Moving Co" }));
  B = await one(db.from("tenants").insert({ slug: `checked-b-${stamp}`, name: "Second Movers" }));
  for (const t of [A, B]) {
    ok(await db.rpc("provision_tenant", { p_tenant_id: t }));
    ok(await db.from("billing_accounts").upsert({ tenant_id: t, mode: "direct", status: "active" }));
  }
  search = await newSearch(A, "Movers in Austin");
  template = await one(
    db.from("templates").insert({
      tenant_id: A,
      channel: "email",
      source: "chanlytics",
      name: `reach_checked_${stamp}`,
      language: "en",
      category: "marketing",
      meta_status: "approved",
      components: [
        { type: "HEADER", text: "Quick one" },
        { type: "BODY", text: "{{opening}}\n\nI run Harbor." },
      ],
    }),
  );
  root = await rootOf(A, search);
  rootRun = await runOf(A, root);
});
// Each case starts from no send: the sends to check are the workspace's, and a lease is a case's own.
afterEach(async () => {
  if (skip || !A) return;
  for (const t of [A, B]) ok(await db.from("reach_out_sends").delete().eq("tenant_id", t));
  ok(await db.from("sending_domains").delete().eq("tenant_id", A));
});
after(async () => {
  if (skip) return;
  for (const t of [A, B]) if (t) ok(await db.from("tenants").delete().eq("id", t));
});

test(
  "a held send says why its owner can answer; nothing unchecked is claimed, by the claim or by hand",
  { skip },
  async () => {
    const d = await domainRow();
    const id = await sendIn({ domain_id: d });
    assert.deepEqual(await claimSends(db, { domainId: d, cap: 30, at: new Date(), limit: 5 }), []);
    const byHand = await db
      .from("reach_out_sends")
      .update({ state: "claimed", claimed_at: iso(Date.now()) })
      .eq("id", id);
    assert.match(byHand.error?.message ?? "", /claimed only once it is checked/);
    assert.match(
      (await db.from("reach_out_sends").update({ state: "held", reason: "nope" }).eq("id", id)).error?.message ?? "",
      /held_says_why/,
    );
    ok(
      await db
        .from("reach_out_sends")
        .update({ state: "held", reason: "chain", hold_detail: "site:3", checked_at: iso(Date.now()) })
        .eq("id", id),
    );
    assert.deepEqual(await claimSends(db, { domainId: d, cap: 30, at: new Date(), limit: 5 }), []);
    assert.match(
      (await db.from("reach_out_sends").update({ state: "claimed" }).eq("id", id)).error?.message ?? "",
      /held -> claimed refused/,
    );
    // Included: planned again, checked, and claimed.
    ok(
      await db
        .from("reach_out_sends")
        .update({ state: "planned", reason: null, included_for: ["chain"] })
        .eq("id", id),
    );
    const claimed = await claimSends(db, { domainId: d, cap: 30, at: new Date(), limit: 5 });
    assert.deepEqual(
      claimed.map((s) => s.id),
      [id],
    );
    // What the check stores keeps within its bounds.
    const bad = await sendIn({ included_for: ["not_a_hold"] }).catch((e) => e);
    assert.match(String(bad?.message ?? bad), /reach_out_sends_check_is_whole/);
  },
);

test("the claim's due domains skip a send not yet checked (R8)", { skip }, async () => {
  const d = await domainRow();
  const id = await sendIn({ domain_id: d, send_at: iso(Date.now() - H) });
  const due = async () =>
    ok(await db.rpc("reach_out_due_domains", { p_at: iso(Date.now()), p_limit: 50, p_tenant_id: A })).map((x) => x.id);
  assert.deepEqual(await due(), []);
  ok(
    await db
      .from("reach_out_sends")
      .update({ checked_at: iso(Date.now()) })
      .eq("id", id),
  );
  assert.deepEqual(await due(), [d]);
});

test(
  "a held send keeps its run open, closes with its canceled run, and is stale fourteen days from its planning",
  { skip },
  async () => {
    const run = await runOf(A, root);
    const id = await sendIn({
      broadcast_id: run,
      send_at: iso(Date.now() + MIN),
      state: "held",
      reason: "language",
      hold_detail: "es",
      checked_at: iso(Date.now()),
      created_at: iso(Date.now() - 15 * DAY),
    });
    const young = await sendIn({
      broadcast_id: run,
      send_at: iso(Date.now() + MIN),
      state: "held",
      reason: "chain",
      checked_at: iso(Date.now()),
    });
    const finishable = ok(await db.rpc("reach_out_finishable", { p_limit: 500, p_tenant_id: A }));
    assert.ok(!finishable.includes(run), "a held send keeps its run open");
    const stale = ok(
      await db.rpc("reach_out_held_stale", { p_before: iso(Date.now() - 14 * DAY), p_limit: 50, p_tenant_id: A }),
    );
    assert.deepEqual(
      stale.map((s) => s.id),
      [id],
      "by when it was planned, never by its last write",
    );
    assert.ok(!stale.some((s) => s.id === young));
    ok(await db.from("broadcasts").update({ state: "canceled" }).eq("id", run));
    const closed = ok(
      await db.rpc("reach_out_closed_sends", { p_stuck_before: iso(Date.now()), p_limit: 50, p_tenant_id: A }),
    );
    assert.ok(closed.some((c) => c.send.id === id) && closed.some((c) => c.send.id === young), "closed with its run");
  },
);

test(
  "the audience takes a catch-all address only when asked, never a lead another chain planned; its old form answers too",
  { skip },
  async () => {
    const s = await newSearch(A, "Audience");
    const chainOf = await rootOf(A, s);
    const plain = await lead();
    const catchAll = await lead({ email_state: "catch_all" });
    await member(plain, {}, s);
    await member(catchAll, {}, s);
    const ids = async (include) =>
      ok(
        await db.rpc("reach_out_audience", {
          p_tenant_id: A,
          p_search_id: s,
          p_limit: 50,
          ...(include === undefined ? {} : { p_include_unconfirmed: include }),
        }),
      ).map((r) => r.lead_id);
    assert.deepEqual((await ids()).sort(), [plain].sort(), "confirmed addresses by default");
    assert.deepEqual((await ids(true)).sort(), [plain, catchAll].sort());
    // The four-argument form, for an edge deployed before this migration (R9): confirmed addresses, the same rule.
    const old = ok(
      await db.rpc("reach_out_audience", { p_tenant_id: A, p_search_id: s, p_root_id: chainOf, p_limit: 50 }),
    ).map((r) => r.lead_id);
    assert.deepEqual(old, await ids(false));
    // Another chain of the workspace planned it: this one leaves it out.
    await sendIn({ lead_id: plain, send_at: iso(Date.now() + DAY) });
    assert.deepEqual(await ids(true), [catchAll]);
  },
);

test("a search has one chain; signed_by and include_unconfirmed are a root's alone", { skip }, async () => {
  const again = await db.from("playbooks").insert({
    tenant_id: A,
    kind: "reach_out",
    trigger: "lead_first",
    policy_class: "outreach",
    gap_minutes: 12,
    lead_search_id: search,
    name: "Again",
    template_id: template,
    template_name: "t",
    template_language: "en",
  });
  assert.match(again.error?.message ?? "", /playbooks_one_chain_per_search/);
  const step = await one(
    db.from("playbooks").insert({
      tenant_id: A,
      kind: "reach_out",
      trigger: "after_step",
      policy_class: "outreach",
      gap_minutes: 12,
      after_playbook_id: root,
      after_days: 3,
      name: "Nudge",
      template_id: template,
      template_name: "t",
      template_language: "en",
    }),
  );
  for (const patch of [{ signed_by: "Sam" }, { include_unconfirmed: true }])
    assert.match(
      (await db.from("playbooks").update(patch).eq("id", step)).error?.message ?? "",
      /playbooks_root_settings/,
    );
  ok(await db.from("playbooks").update({ signed_by: "Sam", include_unconfirmed: true }).eq("id", root));
  assert.match(
    (await db.from("playbooks").update({ signed_by: "   " }).eq("id", root)).error?.message ?? "",
    /playbooks_root_settings/,
  );
  ok(await db.from("playbooks").update({ signed_by: null, include_unconfirmed: false }).eq("id", root));
  ok(await db.from("playbooks").delete().eq("id", step));
});

test(
  "a business's record: the finder's reason, what the owner asked, and the check's two code facts",
  { skip },
  async () => {
    const site = `chain-${stamp}.example`;
    const shop = await lead({
      website_host: `www.${site}`,
      business_name: "Fit Co",
      about: "Since 2009.",
      rating: 4.9,
      reviews: 16,
      email: `owner@${site}`,
    });
    await lead({ website_host: site, business_name: "Fit Co" });
    await lead({ website_host: site, business_name: "Fit Co South" });
    await member(shop, { reason: "Independent studio with a booking page" });
    ok(await db.from("contacts").insert({ tenant_id: A, email: `front-desk@${site}` }));
    const [rec] = ok(await db.rpc("reach_out_record", { p_tenant_id: A, p_search_id: search, p_lead_id: shop }));
    assert.deepEqual(
      [
        rec.business_name,
        rec.site_listings,
        rec.name_listings,
        rec.email_domain_shared,
        rec.why_it_fits,
        rec.what_you_asked,
      ],
      ["Fit Co", 3, 2, true, "Independent studio with a booking page", "movers"],
    );
    assert.deepEqual(
      ok(await db.rpc("reach_out_record", { p_tenant_id: B, p_search_id: search, p_lead_id: shop })),
      [],
      "another workspace's business is none",
    );
    // The lead's own person (its first send made it) is not another who writes from its domain: a later step's check
    // never holds the lead for its own address.
    const own = `own-${stamp}.example`;
    const written = await lead({ email: `owner@${own}` });
    ok(await db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: written }));
    const [mine] = ok(await db.rpc("reach_out_record", { p_tenant_id: A, p_search_id: search, p_lead_id: written }));
    assert.equal(mine.email_domain_shared, false, "its own person is not a customer's domain");
    ok(await db.from("contacts").insert({ tenant_id: A, email: `front@${own}` }));
    const [theirs] = ok(await db.rpc("reach_out_record", { p_tenant_id: A, p_search_id: search, p_lead_id: written }));
    assert.equal(theirs.email_domain_shared, true, "another person at its domain is");
  },
);

test(
  "the sends to check are leased, round-robin, within the horizon and past their backoff, with their chain's inclusions",
  { skip },
  async () => {
    const take = (over = {}) =>
      uncheckedSends(db, { limit: 50, perWorkspace: 50, aheadMinutes: 120, tenantId: A, ...over });
    // Due within two hours, or waiting for its owner whatever its day; not one due next week in a run that goes ahead.
    const soon = await sendIn({ send_at: iso(Date.now() + H) });
    const later = await sendIn({ send_at: iso(Date.now() + 7 * DAY) });
    const waitingRun = await runOf(A, root, "pending_approval");
    const waiting = await sendIn({ broadcast_id: waitingRun, send_at: iso(Date.now() + 7 * DAY) });
    const backing = await sendIn({ check_after: iso(Date.now() + 5 * MIN) });
    // A nudge to a lead the owner included past a chain on the first email: it inherits it (R7).
    const l = await lead();
    await sendIn({
      lead_id: l,
      state: "sent",
      sent_at: iso(Date.now() - DAY),
      checked_at: iso(Date.now() - DAY),
      included_for: ["chain"],
    });
    const first = await sendIn({ lead_id: l, broadcast_id: await runOf(A, root), send_at: iso(Date.now() + H) });
    const got = await take();
    const ids = got.map((u) => u.send.id);
    for (const id of [soon, waiting, first]) assert.ok(ids.includes(id), `${id} is taken`);
    for (const id of [later, backing]) assert.ok(!ids.includes(id), `${id} is not`);
    assert.deepEqual(
      got.find((x) => x.send.id === first).included_for,
      ["chain"],
      "its lead's inclusion in this chain",
    );
    assert.deepEqual(got.find((x) => x.send.id === soon).included_for, []);
    const u = got.find((x) => x.send.id === soon);
    assert.deepEqual([u.template_id, u.template_language, u.signed_by, u.check_gen], [template, "en", null, 0]);
    assert.ok(u.record.business_name.startsWith("Fixture Movers"));
    assert.ok((await row(soon)).check_started_at, "leased");
    // Leased: a tick within two minutes takes none of them again.
    assert.deepEqual(await take(), []);
    ok(
      await db
        .from("reach_out_sends")
        .update({ check_started_at: iso(Date.now() - 3 * MIN) })
        .eq("tenant_id", A),
    );
    assert.ok((await take()).length >= 3, "a lease left two minutes is taken again");
    // A few of a workspace a tick, never its whole run (R2). (Asked of this workspace alone: a lease taken across every
    // workspace would be taken from the suites beside this one.)
    ok(await db.from("reach_out_sends").update({ check_started_at: null }).eq("tenant_id", A));
    assert.equal((await take({ perWorkspace: 2 })).length, 2);
  },
);

test(
  "a check writes only at the words' version it read, and only onto a send still planned and unchecked (R3, R5)",
  { skip },
  async () => {
    const id = await sendIn({ send_at: iso(Date.now() + H) });
    const [u] = (await uncheckedSends(db, { limit: 50, perWorkspace: 50, aheadMinutes: 120, tenantId: A })).filter(
      (x) => x.send.id === id,
    );
    // The owner's edit moves the words on while the check writes.
    ok(
      await db
        .from("reach_out_sends")
        .update({ check_gen: u.check_gen + 1 })
        .eq("id", id),
    );
    assert.equal(
      await recordCheck(db, { tenantId: A, id, gen: u.check_gen, patch: { checked_at: iso(Date.now()) } }),
      false,
    );
    assert.equal((await row(id)).checked_at, null);
    assert.equal(
      await recordCheck(db, { tenantId: A, id, gen: u.check_gen + 1, patch: { checked_at: iso(Date.now()) } }),
      true,
    );
    const r = await row(id);
    assert.deepEqual([!!r.checked_at, r.check_started_at], [true, null], "checked, its lease ended");
    assert.equal(
      await recordCheck(db, { tenantId: A, id, gen: u.check_gen + 1, patch: { opening: "Again." } }),
      false,
      "a check never undoes a check",
    );
  },
);

test(
  "the check's tick over a scripted model: the opening kept, a hold with its reason, nothing checked twice",
  { skip },
  async () => {
    const { checkSends } = await import(at("apps/edge/lib/reach-out/check.ts"));
    const { logger } = await import(at("apps/edge/lib/log.ts"));
    const L = logger({ suite: "reach_out_checked" });
    const customerHost = `customer-${stamp}.example`;
    const names = { plain: "Plain Movers", liar: "Liar Movers", customer: "Customer Movers" };
    const plain = await lead({ business_name: names.plain, rating: 4.9, reviews: 16 });
    const liar = await lead({ business_name: names.liar, rating: 4.9, reviews: 16 });
    const customer = await lead({
      business_name: names.customer,
      rating: 4.9,
      reviews: 16,
      email: `owner@${customerHost}`,
    });
    ok(await db.from("contacts").insert({ tenant_id: A, email: `front@${customerHost}` }));
    const ids = {};
    for (const [k, l] of Object.entries({ plain, liar, customer }))
      ids[k] = await sendIn({ lead_id: l, send_at: iso(Date.now() + H) });
    const WROTE = (opening) => ({ opening, angle: "their reviews", facts_used: ["rating"] });
    const READ = { backed: true, unbacked: "", pitch: false, language: "en" };
    const scripts = {
      [names.plain]: [WROTE("A 4.9 says people find you."), READ],
      [names.liar]: [WROTE("A 4.8 says it."), READ, WROTE("A 4.7 says it."), READ],
      [names.customer]: [WROTE("A 4.9 says it."), READ],
    };
    const ask = async (_system, user) => {
      const name = Object.keys(scripts).find((x) => user.includes(`name: ${x}`));
      const a = name ? scripts[name].shift() : undefined;
      return a ? { answer: a, tokens: { input: 1, output: 1 } } : null;
    };
    const out = await checkSends({ db, now: new Date(), started: Date.now(), log: L, tenantId: A, ask });
    assert.deepEqual([out.checked, out.held, out.errors], [3, 2, 0]);
    const p = await row(ids.plain);
    assert.deepEqual(
      [p.state, p.opening, p.angle, p.facts_used, !!p.checked_at, p.check_started_at, p.checked_words.length],
      ["planned", "A 4.9 says people find you.", "their reviews", ["rating"], true, null, 64],
    );
    const l = await row(ids.liar);
    assert.deepEqual([l.state, l.reason], ["held", "unbacked_fact"]);
    const c = await row(ids.customer);
    assert.deepEqual([c.state, c.reason, c.hold_detail], ["held", "customer_domain", customerHost]);
    const again = await checkSends({ db, now: new Date(), started: Date.now(), log: L, tenantId: A, ask });
    assert.equal(again.read, 0, "nothing checked twice");
  },
);

test("the check's clock is registered, and its trigger records that it looked", { skip }, async () => {
  const s = ok(await db.from("sweep_status").select("jobname, judged_by").eq("sweep", "reach_out_check").single());
  assert.deepEqual([s.jobname, s.judged_by], ["reach-out-check-sweep", "request"]);
  const { error } = await db.rpc("trigger_reach_out_check_sweep");
  assert.equal(error?.message ?? null, null);
});

test(
  "the check's spend is taken one attempt at a time, per workspace and UTC day, up to its cap",
  { skip },
  async () => {
    const take = (at, cap = 2, t = B) =>
      db.rpc("reach_out_check_take", { p_tenant_id: t, p_cap: cap, p_at: at }).then((r) => ok(r));
    // 23:30 UTC and 00:30 UTC the next day are two days, wherever the workspace is.
    const late = "2026-09-26T23:30:00Z";
    const next = "2026-09-27T00:30:00Z";
    assert.deepEqual([await take(late), await take(late), await take(late)], [true, true, false]);
    assert.equal(await take(next), true, "a new UTC day");
    assert.equal(await take(late, 0), false, "no cap is no attempt");
    const rows = ok(await db.from("reach_out_check_spend").select("day, attempts").eq("tenant_id", B).order("day"));
    assert.deepEqual(rows, [
      { day: "2026-09-26", attempts: 2 },
      { day: "2026-09-27", attempts: 1 },
    ]);
  },
);

test(
  "the check_unavailable holds left an hour go back to be checked in one statement; a hold for a rule keeps",
  { skip },
  async () => {
    const back = await sendIn({
      state: "held",
      reason: "check_unavailable",
      checked_at: iso(Date.now()),
      check_gen: 4,
      check_tries: 7,
      included_for: ["chain"],
    });
    const rule = await sendIn({
      state: "held",
      reason: "check_unavailable",
      hold_detail: "too_long",
      checked_at: iso(Date.now()),
    });
    const n = ok(await db.rpc("reach_out_release_unavailable", { p_before: iso(Date.now() + MIN), p_tenant_id: A }));
    assert.equal(n, 1);
    const b = await row(back);
    assert.deepEqual(
      [b.state, b.reason, b.checked_at, b.check_gen, b.check_tries, b.included_for],
      ["planned", null, null, 5, 0, ["chain"]],
    );
    assert.equal((await row(rule)).state, "held");
    assert.equal(
      ok(await db.rpc("reach_out_release_unavailable", { p_before: iso(Date.now() - H), p_tenant_id: A })),
      0,
    );
  },
);
