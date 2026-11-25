/**
 * The lead engine on the stack: the month's ceilings read through a door, a round reserving the count and the estimate
 * in one transaction, a lost start found by the sweep, a round's end releasing what it did not use, and the allowance.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_PERMS, leadMonth, hashLegacyLeadSuppression } from "@chanlytics/contracts";
import {
  A,
  TZ,
  commit,
  counter,
  db,
  ids,
  leadByPlace,
  member,
  ok,
  operator,
  owner,
  partner,
  place,
  plan,
  runOf,
  skip,
  stranger,
} from "./_engine.mjs";
// the UTC day rows this suite's rounds reserved in: they carry no workspace, so they never cascade

// The plan card is the only thing that reads the month's two ceilings, and it
// reads them as the member, through the dashboard's own client. lead_counters
// is revoked from authenticated and has no policy (00140), so the card's read
// of the table raised every time and Ask answered "that could not be checked":
// no owner could ever be shown a plan, and nothing was ever searched.
test("the month's ceilings are read through a door, because the table is nobody's to read", { skip }, async () => {
  const period = leadMonth(TZ, new Date());
  ok(await db.from("lead_counters").insert({ tenant_id: A, kind: "allowance", period, used: 40, reserved: 10 }));
  ok(await db.from("lead_counters").insert({ tenant_id: A, kind: "budget", period, used: 3, reserved: 1 }));

  // What the card used to do, and why it could not.
  const direct = await owner.client.from("lead_counters").select("used, reserved").eq("tenant_id", A);
  assert.ok(direct.error || (direct.data ?? []).length === 0, "the table itself is closed to a member");

  // What it does now: one read, both ceilings, this workspace's own.
  const mine = ok(await owner.client.rpc("lead_month_used", { p_tenant_id: A, p_period: period }));
  assert.deepEqual(mine, { allowance: { used: 40, reserved: 10 }, budget: { used: 3, reserved: 1 } });

  // A month nothing has spent in is zeros, never a missing row the card must guess at.
  assert.deepEqual(ok(await owner.client.rpc("lead_month_used", { p_tenant_id: A, p_period: "1999-01" })), {
    allowance: { used: 0, reserved: 0 },
    budget: { used: 0, reserved: 0 },
  });

  // Finding is the owner's alone, so reading what finding has left is too.
  const byOperator = await operator.client.rpc("lead_month_used", { p_tenant_id: A, p_period: period });
  assert.ok(byOperator.error, "an operator cannot read the month's ceilings");
  const byStranger = await stranger.client.rpc("lead_month_used", { p_tenant_id: A, p_period: period });
  assert.ok(byStranger.error, "and neither can an owner of another workspace");

  ok(await db.from("lead_counters").delete().eq("tenant_id", A).eq("period", period));
  ok(await db.from("lead_counters").delete().eq("tenant_id", A).eq("period", "1999-01"));
});

test(
  "has_permission is ROLE_PERMS in SQL: every role and permission agree, and find is the owner's and the partner's",
  { skip },
  async () => {
    const who = { owner: owner.userId, operator: operator.userId, partner: partner.userId };
    for (const [role, perms] of Object.entries(ROLE_PERMS)) {
      if (role === "viewer") continue; // no viewer is seeded here; tenancy.db.test.mjs signs one in
      for (const [perm, may] of Object.entries(perms)) {
        assert.equal(
          ok(await db.rpc("has_permission", { p_user: who[role], p_tenant_id: A, p_permission: perm })),
          may,
          `${role}.${perm}`,
        );
      }
    }
    assert.equal(
      ok(await db.rpc("has_permission", { p_user: stranger.userId, p_tenant_id: A, p_permission: "find" })),
      false,
      "a member of another workspace has nothing here",
    );
    // It takes an arbitrary user id, so a signed-in member could read anyone's
    // role with it: it is the service role's, and the doors call it as definer.
    const asOwner = await owner.client.rpc("has_permission", {
      p_user: owner.userId,
      p_tenant_id: A,
      p_permission: "find",
    });
    assert.equal(asOwner.data, null, "an owner's own session reads nothing from has_permission");
    assert.equal(asOwner.error?.code, "42501", `has_permission is service_role only: ${JSON.stringify(asOwner.error)}`);
    assert.equal(
      ok(await db.rpc("lead_month", { p_tenant_id: A, p_at: "2026-10-01T03:30:00Z" })),
      "2026-09",
      "still September in Chicago",
    );
    assert.equal(
      ok(
        await db.rpc("lead_suppression_hash", {
          p_tenant_id: "11111111-1111-4111-8111-111111111111",
          p_value: "+15125550100",
        }),
      ).length,
      64,
    );
  },
);

test("the suppression hash in SQL is contracts' keyed digest, byte for byte", { skip }, async () => {
  // lead_suppression_hash is the service role's; the digest is compared through a door that uses it: none reads it back, so compare the function itself.
  const t = "11111111-1111-4111-8111-111111111111";
  const fromSql = ok(await db.rpc("lead_suppression_hash", { p_tenant_id: t, p_value: "+15125550100" }));
  assert.equal(fromSql, await hashLegacyLeadSuppression(t, "+15125550100"));
});

test(
  "create reserves the count and the estimate in one transaction, writes the probe round, its start job and the event; the switch and the card refuse first",
  { skip },
  async () => {
    ok(await db.from("lead_platform").update({ tenants_on: [] }).eq("id", true));
    let r = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(5),
        p_via: "people",
        p_estimate_usd: 0.05,
      }),
    );
    assert.equal(r.error, "paused", JSON.stringify(r));
    const p = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single());
    ok(
      await db
        .from("lead_platform")
        .update({ tenants_on: [...(p.tenants_on ?? []), A] })
        .eq("id", true),
    );
    r = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: { ...plan(5), card: "etsy_shops" },
        p_via: "people",
        p_estimate_usd: 0.05,
      }),
    );
    assert.equal(r.error, "no_card", "an unapproved card never runs for an owner");
    const demand = ok(await db.from("events").select("data").eq("tenant_id", A).eq("kind", "lead.no_card"));
    assert.equal(demand.length, 1, "the ask is logged as demand");
    assert.equal(demand[0].data.card, "etsy_shops");

    r = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(5),
        p_via: "people",
        p_estimate_usd: 0.05,
      }),
    );
    assert.ok(r.search_id && r.round_id, JSON.stringify(r));
    ids.search1 = r.search_id;
    ids.round1 = r.round_id;
    const round = ok(await db.from("lead_rounds").select("*").eq("id", r.round_id).single());
    const month = leadMonth(TZ, new Date());
    assert.deepEqual(
      [
        round.state,
        round.seq,
        round.purpose,
        round.target,
        round.allowance_reserved,
        Number(round.cost_reserved_usd),
        round.plan_version,
        round.month,
      ],
      ["queued", 1, "probe", 5, 5, 0.05, 1, month],
    );
    assert.deepEqual(await counter("allowance", month), { used: 0, reserved: 5 });
    assert.deepEqual(await counter("budget", month), { used: 0, reserved: 0.05 });
    assert.deepEqual(await counter("day", round.day), { used: 0, reserved: 0.05 });
    // What the door wrote, not what the ledger did with it: jobs are claimed by
    // whatever heartbeat is running, and another database suite's claim may be
    // holding this one by the time it is read.
    const job = ok(
      await db
        .from("jobs")
        .select("tenant_id, payload")
        .eq("kind", "lead_round_start")
        .eq("payload->>round_id", r.round_id),
    );
    assert.deepEqual(
      job,
      [{ tenant_id: A, payload: { round_id: r.round_id } }],
      "the start job is written with the round, once",
    );
    const ev = ok(
      await db.from("events").select("data").eq("tenant_id", A).eq("kind", "lead.round").eq("subject_id", r.round_id),
    );
    assert.equal(ev[0].data.state, "queued");

    const denied = await operator.client.rpc("lead_search_create", {
      p_tenant_id: A,
      p_plan: plan(5),
      p_via: "people",
      p_estimate_usd: 0.05,
    });
    assert.match(
      denied.error?.message ?? "",
      /Only an owner can find businesses for you/,
      "an operator may not start a search",
    );
    const other = await stranger.client.rpc("lead_search_create", {
      p_tenant_id: A,
      p_plan: plan(5),
      p_via: "people",
      p_estimate_usd: 0.05,
    });
    assert.match(other.error?.message ?? "", /Only an owner/, "nor an owner of another workspace");
  },
);

test(
  "the allowance refuses in a sentence: the month's 500 are reserved once, and the 501st is refused with what is left",
  { skip },
  async () => {
    let r = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(496),
        p_via: "ask",
        p_estimate_usd: 0.5,
      }),
    );
    assert.equal(r.error, "month_leads_used");
    assert.equal(r.left, 495);
    assert.match(
      r.sentence,
      /^You have 495 leads left this month\. Find 495 now, or all 496 when your leads renew on [A-Z][a-z]{2} 1\?$/,
    );
    r = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(495),
        p_via: "ask",
        p_estimate_usd: 0.5,
      }),
    );
    assert.ok(r.search_id, "the rest of the month is taken");
    ids.search2 = r.search_id;
    ids.round2 = r.round_id;
    r = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(1),
        p_via: "people",
        p_estimate_usd: 0.01,
      }),
    );
    assert.equal(r.error, "month_leads_used");
    assert.equal(r.left, 0);
    assert.match(r.sentence, /^You have found this month's 500 leads\. Your leads renew on [A-Z][a-z]{2} 1\.$/);
  },
);

test(
  "the run is claimed once, leased by owner and generation, and a page commits by compare-and-set: five asked, twenty qualified, five counted, paid once",
  { skip },
  async () => {
    const run = ok(
      await db
        .from("lead_runs")
        .insert({
          tenant_id: A,
          round_id: ids.round1,
          purpose: "discover",
          term: "personal trainer",
          actor: "card-a",
          build: "1",
          webhook_token_hash: "hash1",
        })
        .select("id")
        .single(),
    );
    ids.run1 = run.id;
    assert.equal(ok(await db.rpc("lead_run_claim", { p_run_id: run.id, p_owner: "w1" })), true, "the first claim wins");
    assert.equal(
      ok(await db.rpc("lead_run_claim", { p_run_id: run.id, p_owner: "w2" })),
      false,
      "the second finds it taken",
    );
    assert.equal(
      ok(
        await db.rpc("lead_run_record_start", {
          p_run_id: run.id,
          p_owner: "w2",
          p_apify_run_id: "apr1",
          p_dataset_id: "ds1",
          p_cap_usd: 0.5,
        }),
      ),
      false,
      "only the claimer records",
    );
    assert.equal(
      ok(
        await db.rpc("lead_run_record_start", {
          p_run_id: run.id,
          p_owner: "w1",
          p_apify_run_id: "apr1",
          p_dataset_id: "ds1",
          p_cap_usd: 0.5,
        }),
      ),
      true,
    );
    assert.equal(
      ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: "w1", p_seconds: 60 })),
      0,
      "the first lease is generation 0",
    );
    assert.equal(
      ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: "w2", p_seconds: 60 })),
      null,
      "held by another",
    );

    const page = {
      judgment: {
        op_id: "ec31567347b5b6e5a548512052a70322c51e2c167b1b1675457ef91e00349f73",
        request_hash: "rh",
        answer: { places: [] },
        model: "the-judge",
        tokens: 1200,
        batch: 1,
      },
      places: Array.from({ length: 20 }, (_, i) => place(i + 1, "qualified")),
      usage_usd: 0.02,
      items_seen: 20,
      run_state: null,
      next: { kind: "lead_collect", seq: "p20", run_after_seconds: 15 },
      round: { state: "probing" },
    };
    assert.deepEqual(ok(await commit(run.id, "w1", 1, 0, 20, page)), { ok: false, why: "lease" }, "a wrong generation");
    assert.deepEqual(ok(await commit(run.id, "w2", 0, 0, 20, page)), { ok: false, why: "lease" }, "a wrong owner");
    assert.deepEqual(ok(await commit(run.id, "w1", 0, 5, 20, page)), { ok: false, why: "offset" }, "a wrong offset");
    const r = ok(await commit(run.id, "w1", 0, 0, 20, page));
    assert.deepEqual(r, { ok: true, counted: 5, qualified: 20, review: 0, excluded: 0, round_state: "probing" });
    const round = ok(await db.from("lead_rounds").select("*").eq("id", ids.round1).single());
    assert.deepEqual(
      [round.allowance_used, Number(round.cost_usd), round.judge_tokens, round.judge_model, round.state],
      [5, 0.02, 1200, "the-judge", "probing"],
    );
    const month = leadMonth(TZ, new Date());
    assert.deepEqual(
      await counter("allowance", month),
      { used: 5, reserved: 495 },
      "five used; the other search's 495 still reserved",
    );
    assert.deepEqual(await counter("budget", month), { used: 0.02, reserved: 0.53 });
    const { count: leads } = await db.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", A);
    assert.equal(leads, 20);
    const { count: counted } = await db
      .from("lead_search_members")
      .select("id", { count: "exact", head: true })
      .eq("search_id", ids.search1)
      .eq("counted", true);
    assert.equal(counted, 5, "five asked, twenty qualified, five counted");
    const { count: nextJobs } = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("kind", "lead_collect")
      .eq("payload->>run_id", run.id)
      .eq("payload->>seq", "p20");
    assert.equal(nextJobs, 1, "the next collect is written");

    assert.deepEqual(
      ok(await commit(run.id, "w1", 0, 0, 20, page)),
      { ok: false, why: "offset" },
      "a replayed page is refused, so nothing doubles",
    );
    const again = ok(
      await commit(run.id, "w1", 0, 20, 23, {
        judgment: [
          {
            op_id: "ec31567347b5b6e5a548512052a70322c51e2c167b1b1675457ef91e00349f73",
            tokens: 1200,
            model: "the-judge",
            answer: {},
          },
        ],
        places: [20, 21, 22].map((n) => place(n, "qualified")),
        usage_usd: 0.03,
        items_seen: 23,
        next: { kind: "lead_collect", seq: "p20", run_after_seconds: 15 },
      }),
    );
    assert.deepEqual([again.qualified, again.counted], [2, 0], "two new places; the reservation is spent");
    assert.equal(
      ok(await db.from("lead_rounds").select("judge_tokens, cost_usd").eq("id", ids.round1).single()).judge_tokens,
      1200,
      "the judgment was kept and paid once",
    );
    const { count: stillOne } = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("kind", "lead_collect")
      .eq("payload->>run_id", run.id)
      .eq("payload->>seq", "p20");
    assert.equal(stillOne, 1, "the next collect is written once however often it is asked for");
    assert.equal(ok(await db.rpc("lead_run_release", { p_run_id: run.id, p_owner: "w2", p_gen: 0 })), false);
    assert.equal(ok(await db.rpc("lead_run_release", { p_run_id: run.id, p_owner: "w1", p_gen: 1 })), false);
    assert.equal(
      ok(await db.rpc("lead_run_release", { p_run_id: run.id, p_owner: "w1", p_gen: 0 })),
      true,
      "released by the holder with the generation",
    );
  },
);

test(
  "a start whose answer was lost is unknown until the sweep finds it in the provider's list, and reconciles only from unknown",
  { skip },
  async () => {
    const lost = ok(
      await db
        .from("lead_runs")
        .insert({
          tenant_id: A,
          round_id: ids.round1,
          purpose: "discover",
          term: "lost",
          actor: "card-a",
          build: "1",
          webhook_token_hash: `lost-${Date.now()}`,
        })
        .select("id")
        .single(),
    );
    assert.equal(
      ok(await db.rpc("lead_run_mark_unknown", { p_run_id: lost.id, p_owner: "w9" })),
      false,
      "nothing is unknown before it is claimed",
    );
    assert.equal(ok(await db.rpc("lead_run_claim", { p_run_id: lost.id, p_owner: "w9" })), true);
    assert.equal(
      ok(await db.rpc("lead_run_mark_unknown", { p_run_id: lost.id, p_owner: "w8" })),
      false,
      "and only the claimer says so",
    );
    assert.equal(ok(await db.rpc("lead_run_mark_unknown", { p_run_id: lost.id, p_owner: "w9" })), true);
    assert.equal(
      ok(await db.from("lead_runs").select("state").eq("id", lost.id).single()).state,
      "unknown",
      "never blindly started again",
    );
    const apr = `apr-lost-${Date.now()}`;
    assert.equal(
      ok(
        await db.rpc("lead_run_reconcile", {
          p_run_id: lost.id,
          p_apify_run_id: apr,
          p_dataset_id: "ds-lost",
          p_state: "succeeded",
        }),
      ),
      true,
      "the sweep found it, with the state the provider gave",
    );
    const back = ok(
      await db.from("lead_runs").select("state, apify_run_id, dataset_id, finished_at").eq("id", lost.id).single(),
    );
    assert.deepEqual(
      [back.state, back.apify_run_id, back.dataset_id, back.finished_at !== null],
      ["succeeded", apr, "ds-lost", true],
    );
    assert.equal(
      ok(
        await db.rpc("lead_run_reconcile", {
          p_run_id: lost.id,
          p_apify_run_id: apr,
          p_dataset_id: "ds-lost",
          p_state: "running",
        }),
      ),
      false,
      "and only from unknown",
    );
    const bad = await db.rpc("lead_run_reconcile", {
      p_run_id: lost.id,
      p_apify_run_id: apr,
      p_dataset_id: "ds-lost",
      p_state: "queued",
    });
    assert.match(bad.error?.message ?? "", /running or finished/, "a state the provider never gives is a caller's bug");
  },
);

test(
  "the shared-phone triple: three places with one number, one already in the workspace; the other two are delivered and marked, and no person is made",
  { skip },
  async () => {
    const person = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: A, phone_e164: "+15125550177", display_name: "Corner Deli" })
        .select("id")
        .single(),
    );
    const run = await runOf(ids.round2, "deli", "w1");
    let r = ok(
      await commit(run.id, "w1", run.gen, 0, 1, {
        places: [place(101, "qualified", { phone: "+15125550177" })],
        round: { state: "probing" },
      }),
    );
    assert.equal(r.counted, 1);
    const held = (await leadByPlace("ChIJfixture0101")).id;
    const { count: before } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", A);
    const shares = [
      { kind: "phone", lead_id: held },
      { kind: "phone", contact_id: person.id },
    ];
    r = ok(
      await commit(run.id, "w1", run.gen, 1, 3, {
        places: [
          place(102, "qualified", { phone: "+15125550177", shares }),
          place(103, "qualified", { phone: "+15125550177", shares }),
        ],
      }),
    );
    assert.deepEqual([r.counted, r.qualified], [2, 2], "the other two are delivered");
    const { count: withNumber } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", A)
      .eq("phone_e164", "+15125550177");
    assert.equal(withNumber, 3, "three places, three leads, one number: never merged");
    for (const pid of ["ChIJfixture0102", "ChIJfixture0103"]) {
      const m = await member(ids.search2, (await leadByPlace(pid)).id);
      // The values are the page's; what is pinned is where the engine put them
      // and what else it wrote: the page's shares land on the MEMBERSHIP's
      // judgment beside the judge's reasons, and nothing else is added.
      assert.deepEqual(
        m.judgment,
        { reasons: [], shares },
        "the judgment is the judge's reasons and the page's shares, and nothing more",
      );
    }
    const { count: after_ } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", A);
    assert.equal(after_, before, "no person was made");
    ids.run2 = run.id;
    ids.gen2 = run.gen;
  },
);

test(
  "a duplicate listing folds into the lead already held; an erased or customer place is never inserted (erasure mid-run)",
  { skip },
  async () => {
    const held = (await leadByPlace("ChIJfixture0101")).id;
    ok(
      await db.from("lead_suppressions").insert([
        { tenant_id: A, kind: "place", hash: await hashLegacyLeadSuppression(A, "ChIJfixture0105"), what: "erased" },
        { tenant_id: A, kind: "place", hash: await hashLegacyLeadSuppression(A, "ChIJfixture0106"), what: "customer" },
      ]),
    );
    const r = ok(
      await commit(ids.run2, "w1", ids.gen2, 3, 6, {
        places: [
          place(104, "qualified", { duplicateOf: "ChIJfixture0101" }),
          place(105, "qualified"),
          place(106, "qualified"),
        ],
      }),
    );
    assert.equal(r.qualified, 0, "the duplicate is the lead already held (a member once), the hidden two are skipped");
    assert.equal(
      ok(await db.from("lead_places").select("lead_id").eq("tenant_id", A).eq("place_id", "ChIJfixture0104").single())
        .lead_id,
      held,
    );
    const { count } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", A)
      .in("place_id", ["ChIJfixture0104", "ChIJfixture0105", "ChIJfixture0106"]);
    assert.equal(count, 0);
  },
);

test("ending a round releases what it reserved and did not use", { skip }, async () => {
  const month = leadMonth(TZ, new Date());
  assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: ids.round2, p_ending: "stopped" })), true);
  assert.equal(
    ok(await db.rpc("lead_round_end", { p_round_id: ids.round2, p_ending: "stopped" })),
    false,
    "and only once",
  );
  assert.deepEqual(
    await counter("allowance", month),
    { used: 8, reserved: 0 },
    "eight counted so far; the 495 reservation is released",
  );
  const ev = ok(
    await db
      .from("events")
      .select("data")
      .eq("tenant_id", A)
      .eq("kind", "lead.round")
      .eq("subject_id", ids.round2)
      .order("created_at", { ascending: false })
      .limit(1),
  );
  assert.deepEqual([ev[0].data.state, ev[0].data.ending], ["ended", "stopped"]);
});

test(
  "keep, exclude and put back write their operation rows; undo refuses a changed version and credits the month it counted in; a hidden or out-of-area place is never put back",
  { skip },
  async () => {
    const month = leadMonth(TZ, new Date());
    assert.equal(ok(await db.rpc("lead_run_lease", { p_run_id: ids.run1, p_owner: "w3", p_seconds: 60 })), 0);
    const r0 = ok(
      await commit(ids.run1, "w3", 0, 23, 28, {
        places: [
          place(201, "review", { reasons: ["email:catch_all"] }),
          place(202, "review", { reasons: ["unknown:chain"] }),
          place(203, "excluded"),
          place(204, "excluded", { reasons: ["fail:chain", "out_of_area"] }),
          place(205, "excluded"),
        ],
      }),
    );
    assert.deepEqual([r0.review, r0.excluded], [2, 3]);
    const a = (await leadByPlace("ChIJfixture0201")).id;
    const b = (await leadByPlace("ChIJfixture0202")).id;
    const c = (await leadByPlace("ChIJfixture0203")).id;
    const d = (await leadByPlace("ChIJfixture0204")).id;

    const denied = await operator.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: a });
    assert.match(
      denied.error?.message ?? "",
      /Search not found/,
      "an operator may not keep: the door does not even say the search exists",
    );
    let r = ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: a }));
    assert.ok(r.op_id && r.version === 2 && r.counted === true, JSON.stringify(r));
    let m = await member(ids.search1, a);
    assert.deepEqual(
      [m.class, m.counted, m.counted_month, m.kept_by, m.version],
      ["qualified", true, month, owner.userId, 2],
    );
    assert.deepEqual(await counter("allowance", month), { used: 9, reserved: 0 }, "keep counts");
    const op = ok(await db.from("lead_operations").select("*").eq("id", r.op_id).single());
    assert.deepEqual(
      [op.kind, op.before.class, op.after.class, op.version, op.by],
      ["keep", "review", "qualified", 2, owner.userId],
    );
    assert.equal(
      ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: a })).error,
      "state",
      "kept twice is refused",
    );

    assert.equal(
      ok(await owner.client.rpc("lead_undo", { p_op_id: r.op_id, p_version: 1 })).error,
      "changed",
      "undo with the version the client did not see",
    );

    // "The lead goes back to the allowance of the month it counted in" (S11) is
    // only a claim while that month is this one. Move the keep back a month --
    // the member's row and the operation's record of it -- and seed that
    // month's counter, so the credit has somewhere else to land.
    const last = leadMonth(TZ, new Date(Date.now() - 45 * 86_400_000));
    assert.notEqual(last, month, "a month that is not this one");
    ok(
      await db
        .from("lead_search_members")
        .update({ counted_month: last })
        .eq("search_id", ids.search1)
        .eq("lead_id", a),
    );
    ok(
      await db
        .from("lead_operations")
        .update({ after: { ...op.after, counted_month: last } })
        .eq("id", op.id),
    );
    ok(await db.from("lead_counters").insert({ tenant_id: A, kind: "allowance", period: last, used: 3 }));

    r = ok(await owner.client.rpc("lead_undo", { p_op_id: r.op_id, p_version: 2 }));
    assert.deepEqual(r, { ok: true, version: 3 });
    m = await member(ids.search1, a);
    assert.deepEqual([m.class, m.counted, m.counted_month, m.version], ["review", false, null, 3], "back in review");
    assert.deepEqual(
      await counter("allowance", last),
      { used: 2, reserved: 0 },
      "undo credits the month it counted in",
    );
    assert.deepEqual(await counter("allowance", month), { used: 9, reserved: 0 }, "and never this one");
    assert.equal(
      ok(await owner.client.rpc("lead_undo", { p_op_id: op.id, p_version: 2 })).error,
      "undone",
      "undone once",
    );

    r = ok(await owner.client.rpc("lead_member_exclude", { p_search_id: ids.search1, p_lead_id: b }));
    assert.equal(r.version, 2);
    m = await member(ids.search1, b);
    assert.deepEqual([m.class, m.excluded_by, m.counted], ["excluded", "owner", false], "excluded by the owner, free");
    r = ok(await owner.client.rpc("lead_member_put_back", { p_search_id: ids.search1, p_lead_id: b }));
    assert.deepEqual([r.version, r.counted], [3, true], "put back counts");
    m = await member(ids.search1, b);
    assert.deepEqual([m.class, m.counted, m.excluded_by], ["qualified", true, null]);
    assert.equal(ok(await db.from("lead_operations").select("kind").eq("id", r.op_id).single()).kind, "put_back");

    ok(
      await db.from("lead_suppressions").insert({
        tenant_id: A,
        kind: "place",
        hash: await hashLegacyLeadSuppression(A, "ChIJfixture0203"),
        what: "customer",
      }),
    );
    assert.equal(
      ok(await owner.client.rpc("lead_member_put_back", { p_search_id: ids.search1, p_lead_id: c })).error,
      "hidden",
      "a customer is hidden",
    );
    assert.equal(
      ok(await owner.client.rpc("lead_member_put_back", { p_search_id: ids.search1, p_lead_id: d })).error,
      "out_of_area",
      "out of area stays out",
    );
    assert.equal(
      ok(await owner.client.rpc("lead_member_exclude", { p_search_id: ids.search1, p_lead_id: c })).error,
      "state",
      "exclude wants a member in review",
    );
    // Neither Put back nor Keep revives a hidden or an out-of-area place (§0.1).
    // Put back is refused by name above; Keep never reaches either, because the
    // only members it takes are in review or qualified and not yet counted, and
    // both of these were left out.
    assert.equal(
      ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: c })).error,
      "state",
      "a customer's place is never kept either",
    );
    assert.equal(
      ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: d })).error,
      "state",
      "nor an out-of-area one",
    );
    assert.equal(
      ok(
        await owner.client.rpc("lead_member_keep", {
          p_search_id: ids.search1,
          p_lead_id: "00000000-0000-4000-8000-000000000000",
        }),
      ).error,
      "not_found",
    );
  },
);

test(
  "the check qualifies a member the email standard alone held back; the last batch ends the round with the pending ending; a late page on an ended round is refused",
  { skip },
  async () => {
    const a = (await leadByPlace("ChIJfixture0201")).id;
    let r = ok(
      await commit(ids.run1, "w3", 0, 28, 29, {
        places: [place(206, "review", { reasons: ["email:unknown"] })],
        run_state: "succeeded",
        next: { kind: "lead_check", batch: 1, run_after_seconds: 0 },
        round: { state: "checking", ending_pending: "few_new_matches" },
      }),
    );
    assert.equal(r.round_state, "checking");
    assert.equal(ok(await db.from("lead_runs").select("state").eq("id", ids.run1).single()).state, "succeeded");
    const { count: checks } = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("kind", "lead_check")
      .eq("payload->>round_id", ids.round1);
    assert.equal(checks, 1, "the check job");
    const e = (await leadByPlace("ChIJfixture0206")).id;
    // A check settles against its own run: lead_check_commit takes the check
    // run's id, and p_usage_usd is that RUN'S TOTAL SO FAR, not this batch's
    // delta, so a check job tried again charges once.
    const month = leadMonth(TZ, new Date());
    const checkRun = ok(
      await db
        .from("lead_runs")
        .insert({
          tenant_id: A,
          round_id: ids.round1,
          purpose: "check",
          actor: "mailbox",
          build: "1",
          webhook_token_hash: `check-${Date.now()}`,
        })
        .select("id")
        .single(),
    );
    const budgetBefore = await counter("budget", month);
    const results = [
      { lead_id: a, email_state: "ok", checked_at: new Date().toISOString() },
      { lead_id: e, email_state: "invalid", checked_at: new Date().toISOString() },
    ];
    r = ok(
      await db.rpc("lead_check_commit", {
        p_round_id: ids.round1,
        p_run_id: checkRun.id,
        p_results: results,
        p_usage_usd: 0.001,
        p_last: false,
      }),
    );
    // Five were asked for and five counted on the first page: the round's
    // reservation is spent, so the member qualifies and nothing counts.
    assert.deepEqual([r.qualified, r.counted, r.ended], [1, 0, false]);
    let m = await member(ids.search1, a);
    assert.deepEqual(
      [m.class, m.counted, m.version],
      ["qualified", false, 4],
      "the email was its only reason; qualified now, and past the round's room it counts for nothing",
    );
    m = await member(ids.search1, e);
    assert.equal(m.class, "review", "a bounce stays in review, marked invalid on the lead");
    assert.equal((await leadByPlace("ChIJfixture0206")).email_state, "invalid");

    // Qualified and not counted is the state Keep is for, and the zero-room
    // check is the only thing that makes it: the owner takes the one the round
    // had no room for, and the month's allowance moves now.
    const allowanceWas = await counter("allowance", month);
    const kept = ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: a }));
    assert.deepEqual(
      [kept.version, kept.counted],
      [5, true],
      "keep takes a qualified member the round could not count",
    );
    const km = await member(ids.search1, a);
    assert.deepEqual([km.class, km.counted, km.counted_month], ["qualified", true, month]);
    assert.deepEqual(
      await counter("allowance", month),
      { used: allowanceWas.used + 1, reserved: allowanceWas.reserved },
      "and it counts now",
    );

    const budgetAfter = await counter("budget", month);
    assert.equal((budgetAfter.used - budgetBefore.used).toFixed(4), "0.0010", "the batch is charged");
    r = ok(
      await db.rpc("lead_check_commit", {
        p_round_id: ids.round1,
        p_run_id: checkRun.id,
        p_results: results,
        p_usage_usd: 0.001,
        p_last: false,
      }),
    );
    assert.deepEqual([r.qualified, r.counted], [0, 0], "nothing qualifies twice");
    assert.deepEqual(
      await counter("budget", month),
      budgetAfter,
      "and the same total moves the budget once, however often the job is tried",
    );
    assert.equal(
      Number(ok(await db.from("lead_rounds").select("cost_usd").eq("id", ids.round1).single()).cost_usd),
      0.031,
      "0.02 and 0.01 of discovery, 0.001 of checking",
    );

    // No run, no charge: a caller that names none settles nothing.
    assert.equal(
      ok(
        await db.rpc("lead_check_commit", {
          p_round_id: ids.round1,
          p_run_id: null,
          p_results: [],
          p_usage_usd: 0.9,
          p_last: false,
        }),
      ).ok,
      true,
    );
    assert.deepEqual(await counter("budget", month), budgetAfter, "a usage with no check run settles nothing");

    r = ok(
      await db.rpc("lead_check_commit", {
        p_round_id: ids.round1,
        p_run_id: checkRun.id,
        p_results: [],
        p_usage_usd: 0.001,
        p_last: true,
      }),
    );
    assert.equal(r.ended, true, "the last batch ends the round");
    const round = ok(await db.from("lead_rounds").select("state, ending, cost_usd").eq("id", ids.round1).single());
    assert.deepEqual([round.state, round.ending, Number(round.cost_usd)], ["ended", "few_new_matches", 0.031]);
    // What release A2 reads a round's spend from: the latest round's cost_usd,
    // on the view a member holds.
    const view = ok(
      await owner.client
        .from("lead_searches_view")
        .select("round_id, cost_usd, state, ending")
        .eq("id", ids.search1)
        .single(),
    );
    assert.deepEqual(
      [view.round_id, Number(view.cost_usd), view.state, view.ending],
      [ids.round1, 0.031, "ended", "few_new_matches"],
      "the view carries the latest round's cost_usd",
    );
    assert.deepEqual(ok(await commit(ids.run1, "w3", 0, 29, 30, { places: [] })), { ok: false, why: "ended" });
    const late = await db.from("lead_rounds").update({ state: "running" }).eq("id", ids.round1);
    assert.match(late.error?.message ?? "", /final once ended/, "an ended round is final, to the service role too");
  },
);

test(
  "the same answer on a round that still has room counts, and the month's allowance moves with it",
  { skip },
  async () => {
    const month = leadMonth(TZ, new Date());
    const made = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(3),
        p_via: "people",
        p_estimate_usd: 0.01,
      }),
    );
    assert.ok(made.search_id && made.round_id, JSON.stringify(made));
    ids.searchRoom = made.search_id;
    ids.roundRoom = made.round_id;
    const run = await runOf(made.round_id, "strength coach", "w5");
    ok(
      await commit(run.id, "w5", run.gen, 0, 1, {
        places: [place(301, "review", { reasons: ["email:unknown"] })],
        round: { state: "probing" },
      }),
    );
    const held = (await leadByPlace("ChIJfixture0301")).id;
    const before = await counter("allowance", month);
    const checkRun = ok(
      await db
        .from("lead_runs")
        .insert({
          tenant_id: A,
          round_id: made.round_id,
          purpose: "check",
          actor: "mailbox",
          build: "1",
          webhook_token_hash: `check-room-${Date.now()}`,
        })
        .select("id")
        .single(),
    );
    const r = ok(
      await db.rpc("lead_check_commit", {
        p_round_id: made.round_id,
        p_run_id: checkRun.id,
        p_results: [{ lead_id: held, email_state: "ok", checked_at: new Date().toISOString() }],
        p_usage_usd: 0.002,
        p_last: false,
      }),
    );
    assert.deepEqual(
      [r.qualified, r.counted, r.ended],
      [1, 1, false],
      "three asked for and none counted yet: the room is there",
    );
    const m = await member(made.search_id, held);
    assert.deepEqual([m.class, m.counted, m.counted_month, m.version], ["qualified", true, month, 2]);
    assert.deepEqual(
      await counter("allowance", month),
      { used: before.used + 1, reserved: before.reserved - 1 },
      "the month's allowance moves: reserved becomes used",
    );
    assert.equal(
      ok(await db.from("lead_rounds").select("allowance_used").eq("id", made.round_id).single()).allowance_used,
      1,
    );
    assert.equal(
      ok(await db.rpc("lead_round_end", { p_round_id: made.round_id, p_ending: "searched_everything" })),
      true,
    );
    assert.deepEqual(
      await counter("allowance", month),
      { used: before.used + 1, reserved: before.reserved - 3 },
      "and the two it never counted come back",
    );
  },
);

test(
  "a top-up reserves the count minus what counted; the question waits on the owner and keep, include and stop answer it; Stop moves the generation so a late worker cannot publish",
  { skip },
  async () => {
    let r = ok(
      await owner.client.rpc("lead_search_more", {
        p_search_id: ids.search1,
        p_purpose: "topup",
        p_plan: plan(5),
        p_estimate_usd: 0.05,
      }),
    );
    assert.equal(r.error, "nothing_to_add", JSON.stringify(r));
    assert.equal(r.counted, 7, "five on the first page, one put back, one kept after the check");
    r = ok(
      await owner.client.rpc("lead_search_more", {
        p_search_id: ids.search1,
        p_purpose: "topup",
        p_plan: plan(12, 2),
        p_estimate_usd: 0.05,
      }),
    );
    assert.deepEqual([r.seq, r.target], [2, 5], "the count minus what counted");
    ids.round3 = r.round_id;
    assert.equal(
      ok(await db.from("lead_searches").select("plan").eq("id", ids.search1).single()).plan.version,
      2,
      "the amended plan is the search's",
    );
    assert.equal(
      ok(
        await owner.client.rpc("lead_search_more", {
          p_search_id: ids.search1,
          p_purpose: "renew",
          p_plan: plan(12, 2),
          p_estimate_usd: 0.05,
        }),
      ).error,
      "live",
      "one live round",
    );

    const run = await runOf(ids.round3, "personal trainer", "w4");
    ok(await commit(run.id, "w4", run.gen, 0, 0, { places: [], round: { state: "probing" } }));
    r = ok(
      await commit(run.id, "w4", run.gen, 0, 0, {
        places: [],
        round: {
          state: "waiting_on_owner",
          question: { sentence: "Half of the first 25 are chain gyms. Is that what you meant?", criterionKey: "chain" },
        },
      }),
    );
    assert.equal(r.round_state, "waiting_on_owner");
    const wrong = await owner.client.rpc("lead_round_answer", {
      p_round_id: ids.round3,
      p_answer: "include",
      p_plan: plan(12, 2),
    });
    assert.match(wrong.error?.message ?? "", /the amended plan is version 3/, "include carries the next version");
    r = ok(
      await owner.client.rpc("lead_round_answer", {
        p_round_id: ids.round3,
        p_answer: "include",
        p_plan: { ...plan(12, 3), exclusions: [] },
      }),
    );
    assert.equal(r.state, "running");
    const round = ok(
      await db
        .from("lead_rounds")
        .select("plan_version, answered, target, waiting_since, plan")
        .eq("id", ids.round3)
        .single(),
    );
    assert.deepEqual(
      [round.plan_version, round.answered, round.target, round.waiting_since, round.plan.exclusions],
      [3, "include", 12, null, []],
    );
    const { count: resumes } = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("kind", "lead_round_start")
      .eq("payload->>round_id", ids.round3)
      .eq("payload->>resume", "true");
    assert.equal(resumes, 1, "the resume job");
    assert.equal(
      ok(await owner.client.rpc("lead_round_answer", { p_round_id: ids.round3, p_answer: "keep" })).error,
      "state",
      "not waiting any more",
    );

    r = ok(await operator.client.rpc("lead_round_stop", { p_search_id: ids.search1 }));
    assert.deepEqual(r, { rounds: 1, runs: 1 }, "an operator may stop");
    const stopped = ok(await db.from("lead_runs").select("lease_gen").eq("id", run.id).single());
    assert.equal(stopped.lease_gen, 1, "the generation moved");
    assert.equal(
      ok(await db.from("lead_rounds").select("ending_pending, state").eq("id", ids.round3).single()).ending_pending,
      "stopped",
    );
    const { count: stops } = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("kind", "lead_collect")
      .eq("payload->>run_id", run.id)
      .eq("payload->>seq", "stop");
    assert.equal(stops, 1);
    assert.deepEqual(
      ok(await commit(run.id, "w4", run.gen, 0, 0, { places: [] })),
      { ok: false, why: "lease" },
      "the old worker's generation is refused",
    );
    assert.equal(ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: "w4", p_seconds: 60 })), 1);
    r = ok(await commit(run.id, "w4", 1, 0, 0, { places: [], run_state: "aborted", round: { ending: "stopped" } }));
    assert.equal(r.round_state, "ended", "the abort ends the round stopped");
    assert.equal(ok(await db.from("lead_rounds").select("ending").eq("id", ids.round3).single()).ending, "stopped");
  },
);
