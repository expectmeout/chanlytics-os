/**
 * The lead engine on the stack: a lead carries what the listing shows, its neighbourhood and fit, and its mark, kept as
 * ours.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leadMonth } from "@chanlytics/contracts";
import { A, TZ, commit, db, leadByPlace, ok, owner, place, plan, runOf, skip } from "./_engine.mjs";

// D2 (00144): what the listing shows about the business rides the same commit, comes back from leads_page, fills an
// already-known place only where it was empty, and goes with the rest when the lead is blanked. Its own search, round
// and run, made the way leads.db.test.mjs makes them, so nothing it counts moves a number another test pins.
test(
  "the lead carries what the listing shows: written by the commit, read by the page, filled where empty for a known place, blanked with the rest",
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
          name: "wedding venues",
          asked: "wedding venues in Austin",
          plan: plan(5),
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
          plan: plan(5),
          plan_version: 1,
          target: 5,
          state: "queued",
          month: leadMonth(TZ, new Date()),
          day: "2026-09-20",
          platform_day: "2026-09-20",
          allowance_reserved: 5,
        })
        .select("id")
        .single(),
    ).id;
    const run = await runOf(round, "wedding venue", "w9");
    const shown = {
      about: "Waterfront venue for weddings.",
      hours: [{ day: "Monday", hours: "9 AM to 6 PM" }],
      image_url: "https://lh3.example/p.jpg",
      price: "$$",
      reviews_dist: { one: 1, two: 0, three: 2, four: 8, five: 30 },
      facebook_url: "https://www.facebook.example/p",
      linkedin_url: null,
      tiktok_url: null,
      claimed: true,
      maps_url: "https://maps.example/?cid=904",
      rank: 3,
    };
    const rich = place(904, "qualified");
    rich.place = { ...rich.place, ...shown };
    // A round starts queued and the first page moves it, as the shared-phone test above does.
    const r = ok(await commit(run.id, "w9", run.gen, 0, 1, { places: [rich], round: { state: "probing" } }));
    assert.equal(r.counted, 1);
    const rows = ok(
      await owner.client.rpc("leads_page", {
        p_tenant_id: A,
        p_search_id: search,
        p_class: "qualified",
        p_sort: "found",
        p_after_key: null,
        p_limit: 50,
      }),
    );
    const row = rows.find((x) => x.place_id === "ChIJfixture0904");
    assert.deepEqual(
      [
        row.about,
        row.hours,
        row.image_url,
        row.price,
        row.reviews_dist,
        row.facebook_url,
        row.linkedin_url,
        row.claimed,
        row.maps_url,
        row.rank,
      ],
      [
        shown.about,
        shown.hours,
        shown.image_url,
        shown.price,
        shown.reviews_dist,
        shown.facebook_url,
        null,
        shown.claimed,
        shown.maps_url,
        shown.rank,
      ],
      "the page returns what the commit wrote",
    );
    // The same place found again by another page: what it already shows stays; what was empty is filled; nothing else moves.
    const lead = await leadByPlace("ChIJfixture0904");
    ok(await db.from("leads").update({ stage: "nurture" }).eq("id", lead.id));
    const again = place(904, "qualified");
    again.place = {
      ...again.place,
      about: "A different line.",
      linkedin_url: "https://www.linkedin.example/p",
      claimed: false,
    };
    ok(await commit(run.id, "w9", run.gen, 1, 2, { places: [again] }));
    const after = ok(await db.from("leads").select("about, linkedin_url, claimed, stage").eq("id", lead.id).single());
    assert.deepEqual(
      after,
      { about: shown.about, linkedin_url: "https://www.linkedin.example/p", claimed: true, stage: "nurture" },
      "filled where empty, kept where not, and the worked stage untouched",
    );
    // Blanked with the rest.
    ok(await db.rpc("lead_blank", { p_lead_id: lead.id }));
    const blanked = ok(
      await db
        .from("leads")
        .select("about, hours, image_url, reviews_dist, facebook_url, linkedin_url, claimed, maps_url, rank, email")
        .eq("id", lead.id)
        .single(),
    );
    assert.deepEqual(blanked, {
      about: null,
      hours: [],
      image_url: null,
      reviews_dist: null,
      facebook_url: null,
      linkedin_url: null,
      claimed: null,
      maps_url: null,
      rank: null,
      email: null,
    });
  },
);

// D3 (00145): the two commits after a round ended. A check run started by Check again commits its page on the
// ended round (it decides nothing, and nothing of the round is outstanding), and a mailbox that now answers makes
// the member Qualified and counted through the month's allowance the way Keep is, not through the reservation the
// round already gave back. A discover run's page is refused as before.
test(
  "after a round ended, a check run still commits its page and usage, and a member whose address now checks out counts through the month, not the round",
  { skip },
  async () => {
    const month = leadMonth(TZ, new Date());
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
          plan: plan(5),
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
          plan: plan(5),
          plan_version: 1,
          target: 5,
          state: "queued",
          allowance_reserved: 5,
          allowance_used: 2,
          cost_reserved_usd: 1,
          cost_usd: 0.4,
          month,
          day: "2026-09-20",
          platform_day: "2026-09-20",
        })
        .select("id")
        .single(),
    ).id;
    // A round starts queued (a trigger refuses an ended insert) and ends through its door, giving its unused reservation back.
    assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: round, p_ending: "target_reached" })), true);
    const lead = ok(
      await db
        .from("leads")
        .insert({
          tenant_id: A,
          place_id: "ChIJfixtureD3E1",
          business_name: "Again 1",
          category: "Florist",
          city: "Austin",
          region: "TX",
          website_host: "againe1.example",
          email: "hello@againe1.example",
          email_state: "checking",
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
    const read = async (kind) => {
      const r = await db
        .from("lead_counters")
        .select("used, reserved")
        .eq("tenant_id", A)
        .eq("kind", kind)
        .eq("period", month)
        .maybeSingle();
      return { used: Number(r.data?.used ?? 0), reserved: Number(r.data?.reserved ?? 0) };
    };
    const budget0 = await read("budget");
    const allowance0 = await read("allowance");
    // A check run under the ended round, claimed, started and leased as the runner does it.
    const run = ok(
      await db
        .from("lead_runs")
        .insert({
          tenant_id: A,
          round_id: round,
          purpose: "check",
          term: "again:n1:0",
          actor: "bounceverify/bounceverify-email-verifier",
          build: "1",
          webhook_token_hash: `hash-again-${Date.now()}`,
        })
        .select("id")
        .single(),
    );
    assert.equal(ok(await db.rpc("lead_run_claim", { p_run_id: run.id, p_owner: "again-1" })), true);
    assert.equal(
      ok(
        await db.rpc("lead_run_record_start", {
          p_run_id: run.id,
          p_owner: "again-1",
          p_apify_run_id: `apr-${run.id}`,
          p_dataset_id: `ds-${run.id}`,
          p_cap_usd: 0.5,
        }),
      ),
      true,
    );
    const gen = ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: "again-1", p_seconds: 60 }));
    const page = ok(
      await commit(run.id, "again-1", gen, 0, 1, {
        judgment: null,
        places: [],
        usage_usd: 0.01,
        items_seen: 1,
        run_state: "succeeded",
        next: null,
        round: null,
      }),
    );
    assert.equal(page.ok, true, `a check run's page commits after the round ended: ${JSON.stringify(page)}`);
    const runRow = ok(await db.from("lead_runs").select("state, usage_usd").eq("id", run.id).single());
    assert.deepEqual([runRow.state, Number(runRow.usage_usd)], ["succeeded", 0.01]);
    const budget1 = await read("budget");
    assert.deepEqual(
      [Math.round((budget1.used - budget0.used) * 10_000) / 10_000, budget1.reserved],
      [0.01, budget0.reserved],
      "the usage settles against nothing outstanding: reserved does not move",
    );
    const a = ok(
      await db.rpc("lead_check_commit", {
        p_round_id: round,
        p_run_id: run.id,
        p_results: [{ lead_id: lead, email_state: "ok", checked_at: new Date().toISOString() }],
        p_usage_usd: 0.01,
        p_last: false,
      }),
    );
    assert.deepEqual([a.ok, a.qualified, a.counted, a.ended], [true, 1, 1, false]);
    const m = ok(
      await db
        .from("lead_search_members")
        .select("class, counted, counted_month, judgment")
        .eq("search_id", search)
        .eq("lead_id", lead)
        .single(),
    );
    assert.deepEqual([m.class, m.counted, m.counted_month, m.judgment.reasons], ["qualified", true, month, []]);
    const r = ok(await db.from("lead_rounds").select("state, allowance_used, cost_usd").eq("id", round).single());
    assert.deepEqual(
      [r.state, r.allowance_used, Number(r.cost_usd)],
      ["ended", 2, 0.4],
      "the round is final: neither reopened, nor charged a lead it did not reserve, nor the cents the month's counter carries",
    );
    const allowance1 = await read("allowance");
    assert.deepEqual(
      [allowance1.used - allowance0.used, allowance1.reserved],
      [1, allowance0.reserved],
      "counted through the month, as Keep is",
    );
    assert.equal(ok(await db.from("leads").select("email_state").eq("id", lead).single()).email_state, "ok");
    const disc = await runOf(round, "florist", "w-d3");
    assert.deepEqual(
      ok(
        await commit(disc.id, "w-d3", disc.gen, 0, 1, {
          judgment: null,
          places: [],
          usage_usd: 0,
          items_seen: 0,
          run_state: null,
          next: null,
          round: null,
        }),
      ),
      { ok: false, why: "ended" },
      "a discover run's page is still refused after the round ended",
    );
  },
);

// D3 (00145): a round that ran dry writes where to look next with its ending, and the view carries it to the page.
test(
  "a round's nearby areas ride the commit with the ending and come back from lead_searches_view",
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
          plan: plan(5),
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
          plan: plan(5),
          plan_version: 1,
          target: 5,
          state: "queued",
          month: leadMonth(TZ, new Date()),
          day: "2026-09-20",
          platform_day: "2026-09-20",
        })
        .select("id")
        .single(),
    ).id;
    const run = await runOf(round, "florist", "w-n1");
    const far = [
      {
        kind: "zip",
        label: "near 78660",
        state: "TX",
        center: { lat: 30.44, lng: -97.62 },
        radius_m: 8000,
        zip: "78660",
        query: "78660, TX, USA",
      },
    ];
    assert.deepEqual(
      ok(await db.from("lead_searches_view").select("nearby").eq("id", search).single()),
      { nearby: [] },
      "nothing before the round wrote it",
    );
    // A round starts queued and the first page moves it to probing; the ending and its nearby ride a later page, as the runner writes them.
    let r = ok(
      await commit(run.id, "w-n1", run.gen, 0, 1, {
        judgment: null,
        places: [],
        usage_usd: 0,
        items_seen: 0,
        run_state: null,
        next: null,
        round: { state: "probing", question: null, ending: null },
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    r = ok(
      await commit(run.id, "w-n1", run.gen, 1, 2, {
        judgment: null,
        places: [],
        usage_usd: 0,
        items_seen: 0,
        run_state: null,
        next: null,
        round: { state: null, question: null, ending: null, ending_pending: "searched_everything", nearby: far },
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(ok(await db.from("lead_rounds").select("nearby, ending_pending").eq("id", round).single()), {
      nearby: far,
      ending_pending: "searched_everything",
    });
    assert.deepEqual(
      ok(await db.from("lead_searches_view").select("nearby").eq("id", search).single()),
      { nearby: far },
      "the view carries it to the page",
    );
  },
);

// D5 (00146): the neighbourhood rides the same commit as the listing's other facts, comes back from leads_page beside
// the coordinates it already returned, fills a known place only where it was empty, and goes with the rest when the
// lead is blanked; and lead_searches_view splits a search's qualified members by fit band for the band bar.
test(
  "the row reads the neighbourhood and the band reads the fit split: written by the commit, returned by the page and the view, filled where empty, blanked with the rest",
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
          name: "bookstores",
          asked: "bookstores in Austin",
          plan: plan(5),
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
          plan: plan(5),
          plan_version: 1,
          target: 5,
          state: "queued",
          allowance_reserved: 5,
          cost_reserved_usd: 1,
          month: leadMonth(TZ, new Date()),
          day: "2026-09-20",
          platform_day: "2026-09-20",
        })
        .select("id")
        .single(),
    ).id;
    const run = await runOf(round, "bookstore", "w-n5");
    const withFit = (n, cls, fit, neighborhood) => {
      const p = place(n, cls);
      p.member.fit = fit;
      p.place = { ...p.place, neighborhood };
      return p;
    };
    const places = [
      withFit(921, "qualified", "strong", "Hawthorne"),
      withFit(922, "qualified", "strong", null),
      withFit(923, "qualified", "look", "Buckman"),
      withFit(924, "qualified", "long", null),
      withFit(925, "review", "look", "Sellwood"),
    ];
    let r = ok(
      await commit(run.id, "w-n5", run.gen, 0, 1, {
        judgment: null,
        places,
        usage_usd: 0,
        items_seen: 5,
        run_state: null,
        next: null,
        round: { state: "probing", question: null, ending: null },
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    const rows = ok(
      await owner.client.rpc("leads_page", {
        p_tenant_id: A,
        p_search_id: search,
        p_class: "qualified",
        p_sort: "found",
        p_after_key: null,
        p_limit: 50,
      }),
    );
    const row = rows.find((x) => x.place_id === "ChIJfixture0921");
    assert.deepEqual(
      [row.neighborhood, typeof row.lat, typeof row.lng],
      ["Hawthorne", "number", "number"],
      "the page returns the neighbourhood beside the coordinates",
    );
    assert.equal(
      rows.find((x) => x.place_id === "ChIJfixture0922").neighborhood,
      null,
      "null when the source did not say",
    );
    const band = ok(
      await db.from("lead_searches_view").select("strong, look, long, qualified, review").eq("id", search).single(),
    );
    assert.deepEqual(
      band,
      { strong: 2, look: 1, long: 1, qualified: 4, review: 1 },
      "the qualified members by fit band; a review member counts in none",
    );
    // The same place found again: what it already says stays; what was empty is filled.
    const again = [withFit(921, "qualified", "strong", "Elsewhere"), withFit(922, "qualified", "strong", "Irvington")];
    r = ok(
      await commit(run.id, "w-n5", run.gen, 1, 2, {
        judgment: null,
        places: again,
        usage_usd: 0,
        items_seen: 2,
        run_state: null,
        next: null,
        round: null,
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    const lead1 = await leadByPlace("ChIJfixture0921");
    const lead2 = await leadByPlace("ChIJfixture0922");
    assert.deepEqual(
      [lead1.neighborhood, lead2.neighborhood],
      ["Hawthorne", "Irvington"],
      "kept where it was said, filled where it was empty",
    );
    ok(await db.rpc("lead_blank", { p_lead_id: lead1.id }));
    assert.equal(
      ok(await db.from("leads").select("neighborhood").eq("id", lead1.id).single()).neighborhood,
      null,
      "blanked with the rest",
    );
  },
);

// 00237: whether the listing's website is its host's root rides the same commit, and a place found again gains it
// where it had none (a lead found before it was kept), never overwriting what it says.
test(
  "the lead says whether its website is its own: written by the commit, filled where it was not known",
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
          plan: plan(3),
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
          plan: plan(3),
          plan_version: 1,
          target: 3,
          state: "queued",
          allowance_reserved: 3,
          cost_reserved_usd: 1,
          month: leadMonth(TZ, new Date()),
          day: "2026-09-20",
          platform_day: "2026-09-20",
        })
        .select("id")
        .single(),
    ).id;
    const run = await runOf(round, "florist", "w-root");
    const rooted = (n, root) => {
      const p = place(n, "qualified");
      p.place = { ...p.place, website_root: root };
      return p;
    };
    const page = (places, from) =>
      commit(run.id, "w-root", run.gen, from, from + 1, {
        judgment: null,
        places,
        usage_usd: 0,
        items_seen: places.length,
        run_state: null,
        next: null,
        round: from === 0 ? { state: "probing", question: null, ending: null } : null,
      });
    let r = ok(await page([rooted(931, true), rooted(932, false), rooted(933, null)], 0));
    assert.equal(r.ok, true, JSON.stringify(r));
    const rootOf = async (n) => (await leadByPlace(`ChIJfixture0${n}`)).website_root;
    assert.deepEqual([await rootOf(931), await rootOf(932), await rootOf(933)], [true, false, null]);
    // Found again: the one not known learns it; the ones that say already keep what they say.
    r = ok(await page([rooted(931, false), rooted(932, true), rooted(933, false)], 1));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual([await rootOf(931), await rootOf(932), await rootOf(933)], [true, false, false]);
  },
);

// D6 (00147): the business's own mark rides the same commit as every other fact about it, fills a known place only
// where it was empty, and goes with the rest when the lead is blanked. Since 00161 the page returns the copy we keep
// (the next case) and not this address, which the dashboard could never draw; the address is read from the row.
test(
  "the lead wears its own mark: written by the commit, filled where empty, blanked with the rest",
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
          name: "barbers",
          asked: "barbers in Austin",
          plan: plan(5),
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
          plan: plan(5),
          plan_version: 1,
          target: 5,
          state: "queued",
          allowance_reserved: 5,
          cost_reserved_usd: 1,
          month: leadMonth(TZ, new Date()),
          day: "2026-09-20",
          platform_day: "2026-09-20",
        })
        .select("id")
        .single(),
    ).id;
    const run = await runOf(round, "barber", "w-m6");
    const marked = (n, logo) => {
      const x = place(n, "qualified");
      x.place = { ...x.place, logo_url: logo };
      return x;
    };
    let r = ok(
      await commit(run.id, "w-m6", run.gen, 0, 1, {
        judgment: null,
        places: [marked(931, "https://cdn.example/mark.png"), marked(932, null)],
        usage_usd: 0,
        items_seen: 2,
        run_state: null,
        next: null,
        round: { state: "probing", question: null, ending: null },
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(
      (await leadByPlace("ChIJfixture0931")).logo_url,
      "https://cdn.example/mark.png",
      "the row holds what the commit wrote",
    );
    assert.equal((await leadByPlace("ChIJfixture0932")).logo_url, null, "a site that declared none keeps none");
    // The same place found again: a mark it already wears stays, and one it was missing is filled.
    r = ok(
      await commit(run.id, "w-m6", run.gen, 1, 2, {
        judgment: null,
        places: [marked(931, "https://cdn.example/other.png"), marked(932, "https://place932.example/icon.svg")],
        usage_usd: 0,
        items_seen: 2,
        run_state: null,
        next: null,
        round: null,
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    const one = await leadByPlace("ChIJfixture0931");
    const two = await leadByPlace("ChIJfixture0932");
    assert.deepEqual(
      [one.logo_url, two.logo_url],
      ["https://cdn.example/mark.png", "https://place932.example/icon.svg"],
      "kept where it was worn, filled where it was empty",
    );
    ok(await db.rpc("lead_blank", { p_lead_id: one.id }));
    assert.equal(
      ok(await db.from("leads").select("logo_url").eq("id", one.id).single()).logo_url,
      null,
      "blanked with the rest",
    );
  },
);

// 00161: the copy of the mark we keep. The commit writes its name only when it is a name we write, the page returns
// it in place of the site's address, a known place keeps the copy it wears, the column refuses anything else, and
// blanking lets go of it. The bucket is public to read, and holds only the kinds of image we keep.
test(
  "the lead's mark is ours: the name of a kept copy is written, returned, kept, refused when it is not ours, and blanked",
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
          plan: plan(5),
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
          plan: plan(5),
          plan_version: 1,
          target: 5,
          state: "queued",
          allowance_reserved: 5,
          cost_reserved_usd: 1,
          month: leadMonth(TZ, new Date()),
          day: "2026-09-20",
          platform_day: "2026-09-20",
        })
        .select("id")
        .single(),
    ).id;
    const run = await runOf(round, "florist", "w-m7");
    const KEPT = `${"a1".repeat(32)}.png`;
    const OTHER = `${"b2".repeat(32)}.webp`;
    const kept = (n, name) => {
      const x = place(n, "qualified");
      x.place = { ...x.place, logo_url: `https://fixture${n}.example/touch.png`, mark_path: name };
      return x;
    };
    let r = ok(
      await commit(run.id, "w-m7", run.gen, 0, 1, {
        judgment: null,
        // A kept copy; none yet; and a name that is not one of ours, which the door drops rather than refusing the page.
        places: [kept(941, KEPT), kept(942, null), kept(943, "https://fixture943.example/touch.png")],
        usage_usd: 0,
        items_seen: 3,
        run_state: null,
        next: null,
        round: { state: "probing", question: null, ending: null },
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    const rows = ok(
      await owner.client.rpc("leads_page", {
        p_tenant_id: A,
        p_search_id: search,
        p_class: "qualified",
        p_sort: "found",
        p_after_key: null,
        p_limit: 50,
      }),
    );
    const onPage = (n) => rows.find((x) => x.place_id === `ChIJfixture0${n}`);
    assert.deepEqual(
      [onPage(941).mark_path, onPage(942).mark_path, onPage(943).mark_path],
      [KEPT, null, null],
      "the page returns the name the commit wrote, and nothing for a name that was not ours",
    );
    assert.equal("logo_url" in onPage(941), false, "and not the site's own address, which could never draw");

    // Found again: a copy it wears stays, and one it was missing is filled.
    r = ok(
      await commit(run.id, "w-m7", run.gen, 1, 2, {
        judgment: null,
        places: [kept(941, OTHER), kept(942, OTHER)],
        usage_usd: 0,
        items_seen: 2,
        run_state: null,
        next: null,
        round: null,
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    const one = await leadByPlace("ChIJfixture0941");
    const two = await leadByPlace("ChIJfixture0942");
    assert.deepEqual(
      [one.mark_path, two.mark_path],
      [KEPT, OTHER],
      "kept where it was worn, filled where it was empty",
    );

    // The column itself holds only our names, whoever writes it.
    const bad = await db.from("leads").update({ mark_path: "../../media/call.wav" }).eq("id", two.id);
    assert.ok(bad.error, "a name that is not ours is refused by the column");
    assert.match(bad.error.message, /leads_mark_path_shape/);

    ok(await db.rpc("lead_blank", { p_lead_id: one.id }));
    assert.equal(
      ok(await db.from("leads").select("mark_path").eq("id", one.id).single()).mark_path,
      null,
      "blanked with the rest",
    );

    const bucket = ok(await db.storage.getBucket("lead-marks"));
    assert.equal(bucket.public, true, "public to read: a logo is what a business shows the world");
    assert.equal(bucket.file_size_limit, 524288, "a logo's size, as core's check keeps");
    assert.deepEqual(
      [...bucket.allowed_mime_types].sort(),
      ["image/gif", "image/jpeg", "image/png", "image/webp", "image/x-icon"],
      "the five kinds core keeps, and never an SVG",
    );
  },
);
