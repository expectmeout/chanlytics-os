/**
 * The lead engine on the stack: a search renamed, removed or undone, an answer that changed the plan re-judging the
 * first places, retention at 90 and 180 days, and A2's two starts and Stop during the checks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leadMonth, hashLegacyLeadSuppression } from "@chanlytics/contracts";
import { at } from "../../../_cron-doors-world.mjs";
import { leadsClockTurn, sha256 } from "../../../_lead-world.mjs";
import { probeItems } from "../../../_lead-fixtures.mjs";
import { startRound } from "../../../../packages/core/src/leads/runner/start.ts";
import { collect } from "../../../../packages/core/src/leads/runner/collect/collect.ts";
import { check } from "../../../../packages/core/src/leads/runner/check.ts";
import { OUT_OF_AREA_REASON } from "../../../../packages/core/src/leads/runner/rules.ts";
import { runIdFor } from "../../../../packages/core/src/leads/ids.ts";
import {
  A,
  B,
  TZ,
  a2World,
  commit,
  counter,
  db,
  ids,
  leadByPlace,
  member,
  ok,
  owner,
  place,
  plan,
  platformDays,
  runOf,
  skip,
  unseen,
} from "./_engine.mjs";

// An answer that changed the plan (Include, or Change what I asked) re-judges the places the probe already judged, under
// the new plan (lead_round_rejudge, 00165). Without it the question's "Include large studio chains" left all nine of
// them out: the main phase skips a place the workspace already holds, so they could never come back.
test(
  "an answer that changed the plan re-judges the first places: the one it lets in comes back whole and counted, one it now leaves out gives its lead back and keeps nothing, the owner's own decision stands, and a second pass changes nothing",
  { skip },
  async () => {
    const phonePlan = (version, over = {}) => ({ ...plan(4, version), contact: "phone", ...over });
    const made = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: phonePlan(1),
        p_via: "ask",
        p_estimate_usd: 0.01,
      }),
    );
    const roundId = made.round_id;
    const run = await runOf(roundId, "rejudge term", "w9");
    // The probe: a chain left out (keeping nothing, as the runner commits a left-out place), one counted, one to review.
    const chain = place(951, "excluded");
    Object.assign(chain.place, { email: null, email_state: "none", about: null });
    ok(
      await commit(run.id, "w9", run.gen, 0, 4, {
        places: [chain, place(952, "qualified"), place(953, "review"), place(954, "qualified")],
        usage_usd: 0,
        items_seen: 4,
        round: { state: "probing" },
      }),
    );
    ok(
      await commit(run.id, "w9", run.gen, 4, 4, {
        places: [],
        round: {
          state: "waiting_on_owner",
          question: { sentence: "Some of the first 3 are chain gyms. Is that what you meant?", criterionKey: "chain" },
        },
      }),
    );
    const [l1, l2, l3] = await Promise.all(["0951", "0952", "0953"].map((n) => leadByPlace(`ChIJfixture${n}`)));
    // The owner keeps the one under review while the question waits: their decision, which no re-judge undoes.
    ok(await owner.client.rpc("lead_member_keep", { p_search_id: made.search_id, p_lead_id: l3.id }));
    // And marks another's number wrong: a lead they have worked, which no re-judge takes back either.
    const l4 = await leadByPlace("ChIJfixture0954");
    ok(await db.from("leads").update({ phone_wrong: true }).eq("id", l4.id));
    const month = ok(await db.from("lead_rounds").select("month").eq("id", roundId).single()).month;
    const before = await counter("allowance", month);
    const r = ok(
      await owner.client.rpc("lead_round_answer", {
        p_round_id: roundId,
        p_answer: "include",
        p_plan: phonePlan(2, { exclusions: [] }),
      }),
    );
    assert.equal(r.state, "running");

    const judged = (cls, over = {}) => ({
      class: cls,
      excluded_by: cls === "excluded" ? "website" : null,
      fit: cls === "excluded" ? null : "strong",
      reason: cls === "excluded" ? "No website of its own" : "Independent studio with its own site",
      judgment: {
        op_id: "op-rejudge-1",
        term: "rejudge term",
        answer: { criteria: [] },
        model: "m",
        reasons: [],
        plan_version: 2,
      },
      ...over,
    });
    const back = place(951, "qualified");
    Object.assign(back.place, {
      email: "hello@fixture951.example",
      email_state: "checking",
      about: "An independent studio.",
    });
    const pages = [
      { place: back.place, member: judged("qualified") },
      { place: place(952, "excluded").place, member: judged("excluded") },
      { place: place(953, "excluded").place, member: judged("excluded") },
      { place: place(954, "excluded").place, member: judged("excluded") },
    ];
    const judgment = {
      op_id: "op-rejudge-1",
      batch: 0,
      request_hash: "r".repeat(64),
      answer: {},
      model: "m",
      tokens: 30,
    };
    const rejudge = (version, places = pages) =>
      db.rpc("lead_round_rejudge", {
        p_round_id: roundId,
        p_plan_version: version,
        p_places: places,
        p_judgment: judgment,
      });

    assert.deepEqual(ok(await rejudge(1)), { ok: false, why: "version" }, "only under the plan the round runs on now");
    const tokens = ok(await db.from("lead_rounds").select("judge_tokens").eq("id", roundId).single()).judge_tokens;
    assert.deepEqual(ok(await rejudge(2)), { ok: true, changed: 2, counted: 1, uncounted: 1 });

    const m1 = await member(made.search_id, l1.id);
    const m2 = await member(made.search_id, l2.id);
    const m3 = await member(made.search_id, l3.id);
    assert.deepEqual(
      [m1.class, m1.counted, m1.excluded_by, m1.judgment.plan_version, m1.version],
      ["qualified", true, null, 2, 2],
      "the chain it lets in is a lead now, counted from the round's reservation",
    );
    const lead1 = await leadByPlace("ChIJfixture0951");
    assert.deepEqual(
      [lead1.email, lead1.email_state, lead1.about],
      ["hello@fixture951.example", "checking", "An independent studio."],
      "and whole: what a left-out place never kept is filled, its email waiting on the round's checks",
    );
    assert.deepEqual(
      [m2.class, m2.counted, m2.excluded_by, m2.version],
      ["excluded", false, "website", 2],
      "one the new plan leaves out gives its lead back",
    );
    const lead2 = await leadByPlace("ChIJfixture0952");
    assert.deepEqual(
      [lead2.email, lead2.email_state, lead2.about, lead2.image_url],
      [null, "none", null, null],
      "and keeps nothing a left-out place never keeps (PRD 0.4)",
    );
    assert.deepEqual([m3.class, m3.kept_at !== null], ["qualified", true], "the owner's Keep stands");
    const m4 = await member(made.search_id, l4.id);
    assert.deepEqual([m4.class, m4.counted, m4.version], ["qualified", true, 1], "and so does a lead they worked");
    assert.deepEqual(m1.judgment.shares, [], "the shares the collect marked are kept under the new judgment");

    const round = ok(await db.from("lead_rounds").select("allowance_used, judge_tokens").eq("id", roundId).single());
    assert.equal(round.allowance_used, 2, "one in, one out: the round's reservation is used as before");
    assert.equal(round.judge_tokens, tokens + 30, "the judge's answer is kept once, with its tokens");
    assert.deepEqual(await counter("allowance", month), before, "and the month's counter says the same");
    assert.deepEqual(
      ok(await rejudge(2)),
      { ok: true, changed: 0, counted: 0, uncounted: 0 },
      "a second pass changes nothing",
    );
    assert.equal(
      ok(await db.from("lead_rounds").select("judge_tokens").eq("id", roundId).single()).judge_tokens,
      tokens + 30,
      "nor pays for the same answer twice",
    );
    const ev = ok(
      await db
        .from("events")
        .select("data")
        .eq("tenant_id", A)
        .eq("kind", "lead.round")
        .eq("subject_id", roundId)
        .order("created_at", { ascending: false })
        .limit(3),
    );
    assert.ok(
      ev.some((e) => e.data.rejudged === 2 && e.data.plan_version === 2),
      "the round's history says how many the new plan changed",
    );
    const denied = await owner.client.rpc("lead_round_rejudge", {
      p_round_id: roundId,
      p_plan_version: 2,
      p_places: pages,
      p_judgment: judgment,
    });
    assert.ok(denied.error, "the runner's door, not a member's");
    assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: roundId, p_ending: "stopped" })), true);
    assert.deepEqual(ok(await rejudge(2)), { ok: false, why: "state" }, "an ended round is final");
  },
);

test("the owner's other two answers: Keep carries the round on as it is, Stop ends it stopped", { skip }, async () => {
  /** A fresh search whose round is waiting on the owner after the probe. */
  const waiting = async (worker) => {
    const made = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(2),
        p_via: "ask",
        p_estimate_usd: 0.01,
      }),
    );
    assert.ok(made.round_id, JSON.stringify(made));
    const run = await runOf(made.round_id, "chain gyms", worker);
    ok(await commit(run.id, worker, run.gen, 0, 0, { places: [], round: { state: "probing" } }));
    ok(
      await commit(run.id, worker, run.gen, 0, 0, {
        places: [],
        round: {
          state: "waiting_on_owner",
          question: { sentence: "Half of the first 25 are chain gyms. Is that what you meant?", criterionKey: "chain" },
        },
      }),
    );
    return made.round_id;
  };

  const carried = await waiting("w6");
  let r = ok(await owner.client.rpc("lead_round_answer", { p_round_id: carried, p_answer: "keep" }));
  assert.deepEqual([r.round_id, r.state], [carried, "running"], "Keep carries the round on");
  let round = ok(
    await db
      .from("lead_rounds")
      .select("state, answered, question, waiting_since, plan_version, target, plan")
      .eq("id", carried)
      .single(),
  );
  assert.deepEqual(
    [round.state, round.answered, round.waiting_since, round.plan_version, round.target, round.plan.exclusions.length],
    ["running", "keep", null, 1, 2, 1],
    "the plan it ran is the plan it runs on: no amendment, no version",
  );
  const { count: resumes } = await db
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("kind", "lead_round_start")
    .eq("payload->>round_id", carried)
    .eq("payload->>resume", "true");
  assert.equal(resumes, 1, "a resume job for the same round");
  assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: carried, p_ending: "stopped" })), true);

  const halted = await waiting("w7");
  r = ok(await owner.client.rpc("lead_round_answer", { p_round_id: halted, p_answer: "stop" }));
  assert.deepEqual([r.round_id, r.state], [halted, "ended"], "Stop ends it");
  round = ok(await db.from("lead_rounds").select("state, answered, ending, ended_at").eq("id", halted).single());
  assert.deepEqual(
    [round.state, round.answered, round.ending, round.ended_at !== null],
    ["ended", "stop", "stopped", true],
    "ended stopped, and answered so",
  );
  const ev = ok(
    await db
      .from("events")
      .select("data")
      .eq("tenant_id", A)
      .eq("kind", "lead.round")
      .eq("subject_id", halted)
      .order("created_at", { ascending: false })
      .limit(1),
  );
  assert.deepEqual([ev[0].data.state, ev[0].data.ending], ["ended", "stopped"]);
});

test(
  "the other three caps refuse in their own sentence: the month's searching budget, the workspace's day and the platform's",
  { skip },
  async () => {
    const month = leadMonth(TZ, new Date());
    const day = ok(await db.rpc("lead_day", { p_tenant_id: A }));
    const platformDay = new Date().toISOString().slice(0, 10);
    const { count: searchesWere } = await db
      .from("lead_searches")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", A);

    /**
     * One counter put a step from its edge, the door asked for a step more,
     * and the row put back exactly as it was. The rows are this suite's running
     * arithmetic, and the platform's day row is shared with every other suite,
     * so nothing here reads an absolute value and nothing is left moved.
     */
    const atTheEdge = async (where, used, usd) => {
      const was = ok(await where(db.from("lead_counters").select("id, used, reserved")).single());
      ok(await db.from("lead_counters").update({ used, reserved: 0 }).eq("id", was.id));
      const r = ok(
        await owner.client.rpc("lead_search_create", {
          p_tenant_id: A,
          p_plan: plan(1),
          p_via: "ask",
          p_estimate_usd: usd,
        }),
      );
      ok(await db.from("lead_counters").update({ used: was.used, reserved: was.reserved }).eq("id", was.id));
      return r;
    };

    let r = await atTheEdge((q) => q.eq("tenant_id", A).eq("kind", "budget").eq("period", month), 39.9, 0.2);
    assert.equal(r.error, "budget_used", JSON.stringify(r));
    assert.equal(Number(r.left_usd), 0.1, "what is left of the month's $40 (00627)");
    assert.match(
      r.sentence,
      /^This month's searching is nearly used up\. Try a smaller search, or a phone standard; it renews on [A-Z][a-z]{2} 1\.$/,
    );

    r = await atTheEdge((q) => q.eq("tenant_id", A).eq("kind", "day").eq("period", day), 24.95, 0.1);
    assert.deepEqual(
      [r.error, r.sentence],
      ["day_cap", "Today's searching is used up. Try again tomorrow."],
      "the workspace's own day",
    );

    r = await atTheEdge((q) => q.is("tenant_id", null).eq("kind", "day").eq("period", platformDay), 149.9, 0.2);
    assert.deepEqual(
      [r.error, r.sentence],
      ["day_cap", "Searching is busy today. Try again tomorrow."],
      "and the platform's, which says so differently",
    );

    const { count: searchesNow } = await db
      .from("lead_searches")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", A);
    assert.equal(
      searchesNow,
      searchesWere,
      "a refusal writes no search, no round and no job: only the counter rows it had to take",
    );
  },
);

test(
  "the clock asks the edge exactly when the database holds lead work, and records a look when it holds none",
  { skip },
  async () => {
    // This suite's own rounds and runs go first -- where the cleanup would have
    // taken them anyway -- so that when this file runs alone the look is the
    // branch that runs. What is left may still be another suite's work, so both
    // turns are judged against the counts the predicate itself reads.
    for (const id of [A, B]) {
      for (const r of ok(await db.from("lead_rounds").select("platform_day").eq("tenant_id", id)))
        platformDays.add(r.platform_day);
      ok(await db.from("lead_runs").delete().eq("tenant_id", id));
      ok(await db.from("lead_rounds").delete().eq("tenant_id", id));
    }
    assert.deepEqual(
      ok(await db.from("lead_rounds").select("id").eq("tenant_id", A)),
      [],
      "none of this suite's rounds is left",
    );
    await leadsClockTurn(db, ok, "nothing of this suite's left");

    // A round queued with no run at all: its start job died before it wrote
    // one, and nothing but the sweep can end it and give its reservation back.
    // This is the case a clock that asked only for a round waiting or checking
    // would walk past, and the reason the predicate reads lead_rounds_live.
    const made = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(1),
        p_via: "people",
        p_estimate_usd: 0.01,
      }),
    );
    assert.ok(made.round_id, JSON.stringify(made));
    assert.equal(ok(await db.from("lead_rounds").select("state").eq("id", made.round_id).single()).state, "queued");
    assert.deepEqual(
      ok(await db.from("lead_runs").select("id").eq("round_id", made.round_id)),
      [],
      "and nothing has run for it",
    );
    const turn = await leadsClockTurn(db, ok, "a round of this suite's own, queued, with no run");
    assert.ok(turn.open >= 1, "this suite's own round is open");
    assert.equal(turn.asked, true, "a round that has not ended is work, whether or not anything has run for it");
  },
);

test(
  "the clock asks too for a lead just found with a site and no mark: its round is over by the time the second try reaches it",
  { skip },
  async () => {
    const lead = ok(
      await db
        .from("leads")
        .insert({
          tenant_id: A,
          place_id: `ChIJfixtureClock${Date.now()}`,
          business_name: "Fixture Clock Studio",
          website_host: "clock-studio.example",
          stage: "ready",
        })
        .select("id")
        .single(),
    );
    const turn = await leadsClockTurn(db, ok, "a lead of this suite's own, just found, with a site and no mark");
    assert.ok(turn.unmarked >= 1, "this suite's own lead is waiting");
    assert.equal(turn.asked, true, "a mark the sweep owes is work, with no round open");
    ok(await db.from("leads").delete().eq("id", lead.id));
  },
);

/* =========================================================================
 * Release A2 (gate G3, the runtime cases): the runner's verbs over the real
 * database adapter (apps/edge/lib/leads/lead-db.ts) on this Postgres, with the
 * provider and the judge faked. Appended to A1's file; it shares its world
 * (db, A, owner, plan) and its skip. Every case below is one of the
 * interface's G3 items that only the runtime can show: two starts of one
 * round reach the provider once; a late webhook schedules the final collect
 * once; Stop during the checks ends the round 'stopped' only after the last
 * check commits; a place erased between the read and the commit is never
 * inserted; an out-of-area place is Needs review by rule with its distance;
 * a stale generation loses its commit.
 * ========================================================================= */

test(
  "A2: two starts of one round make one set of run rows and reach the provider once; the loser sees the rows already taken",
  { skip },
  async () => {
    const made = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(20),
        p_via: "people",
        p_estimate_usd: 1,
      }),
    );
    const w = a2World(126);
    // At the same time, not one after the other: run them in turn and the second
    // reads the rows already started and never reaches lead_run_claim at all.
    // Together, the claim itself is what decides, one row at a time.
    const [first, second] = await Promise.all([
      startRound(w.ports("job-a"), made.round_id, "job-a"),
      startRound(w.ports("job-b"), made.round_id, "job-b"),
    ]);
    const kinds = [...first.runs, ...second.runs].map((r) => r.kind);
    assert.equal(kinds.filter((k) => k === "started").length, 2, `one start per term across both jobs: ${kinds}`);
    assert.ok(
      kinds.every((k) => ["started", "already", "someone_elses"].includes(k)),
      `whoever loses a row is refused by the claim, never by a throw: ${kinds}`,
    );
    assert.equal(
      w.apify.calls.filter((c) => c.op === "startRun").length,
      2,
      "one provider run per term, whoever wins the claim",
    );
    const runs = ok(
      await db
        .from("lead_runs")
        .select("id, state, claimed_by, apify_run_id, webhook_token_hash")
        .eq("round_id", made.round_id)
        .order("term"),
    );
    assert.equal(runs.length, 2);
    assert.ok(runs.every((r) => r.state === "running" && ["job-a", "job-b"].includes(r.claimed_by) && r.apify_run_id));
    assert.deepEqual(
      runs.map((r) => r.id),
      [
        await runIdFor(made.round_id, "probe", "personal trainer"),
        await runIdFor(made.round_id, "probe", "strength coach"),
      ],
      "each row's id is derived from the round, the phase and the term",
    );
    assert.equal(
      runs[0].webhook_token_hash,
      sha256(await w.wires.webhookToken(runs[0].id)),
      "and the token the door will be shown is the row's, hashed",
    );
    ids.a2 = { round: made.round_id, search: made.search_id, runs: runs.map((r) => r.id), world: w };
  },
);

test(
  "A2: a late webhook schedules the final collect once: three deliveries, one job; a wrong token writes nothing",
  { skip },
  async () => {
    const { runs, world: w } = ids.a2;
    const runRow = ok(await db.from("lead_runs").select("id, apify_run_id").eq("id", runs[0]).single());
    const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
    const door = await import(at("apps/edge/api/apify-webhook.ts"));
    setPg(db);
    try {
      const body = JSON.stringify({
        eventType: "ACTOR.RUN.SUCCEEDED",
        eventData: { actorRunId: runRow.apify_run_id },
        resource: { id: runRow.apify_run_id, status: "SUCCEEDED" },
      });
      const deliver = async (token) =>
        (
          await door.POST(
            new Request(`https://edge.example/api/apify-webhook?run=${runRow.id}&token=${token}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body,
            }),
            { waitUntil: () => {} },
          )
        ).status;
      const token = await w.wires.webhookToken(runRow.id);
      const finals = async () =>
        ok(
          await db
            .from("jobs")
            .select("payload")
            .eq("tenant_id", A)
            .eq("kind", "lead_collect")
            .in("state", ["scheduled", "fired"]),
        ).filter((j) => j.payload.run_id === runRow.id && j.payload.seq === "final").length;
      assert.equal(await deliver(await w.wires.webhookToken(ids.a2.runs[1])), 401, "another row's token");
      // Counted here, before any good delivery: after one, the once-per-key index would hide a job the 401 had written.
      assert.equal(await finals(), 0, "a wrong token writes nothing");
      assert.deepEqual([await deliver(token), await deliver(token), await deliver(token)], [200, 200, 200]);
      assert.equal(await finals(), 1);
    } finally {
      setPg(null);
    }
  },
);

test(
  "A2: a collect commits one batch of the probe through the real adapter; a stale generation loses its commit",
  { skip },
  async () => {
    const { runs, world: w, round } = ids.a2;
    w.finishRuns();
    const out = await collect(w.ports("collect-1"), runs[0], "p0", "collect-1");
    assert.equal(out.kind, "committed", JSON.stringify(out));
    const members = ok(await db.from("lead_search_members").select("class, judgment").eq("round_id", round));
    assert.ok(members.length >= 12, `one member per place of the page: ${members.length}`);
    assert.ok(
      members.every((m) => Array.isArray(m.judgment.reasons)),
      "the reason tokens ride the judgment, for lead_check_commit to read",
    );
    ok(await owner.client.rpc("lead_round_stop", { p_search_id: ids.a2.search }));
    // Stop left an ending pending on the round. The poll the door never
    // cancelled arrives now: it commits nothing and decides nothing, or it would
    // write over the ending the owner asked for and start the next phase.
    const stale = await collect(w.ports("collect-2"), runs[1], "p0", "collect-2");
    assert.equal(stale.kind, "round_closing", "a poll that lands after Stop is refused, not committed");
    const gen = ok(await db.rpc("lead_run_lease", { p_run_id: runs[1], p_owner: "collect-3", p_seconds: 60 }));
    // The row's own offset, so only the generation is wrong: 00140 checks the
    // lease before the offset, and a made-up offset would answer "lease" here
    // whatever the generation was.
    const at = ok(await db.from("lead_runs").select("read_offset").eq("id", runs[1]).single()).read_offset;
    const page = { judgment: null, places: [], usage_usd: 0, items_seen: 0, run_state: null, next: null, round: null };
    assert.deepEqual(await w.db.collectCommit(runs[1], "collect-3", gen - 1, at, at, page), {
      ok: false,
      why: "lease",
    });
  },
);

test("A2: Stop during the checks: the round ends 'stopped' only after the last check commits", { skip }, async () => {
  const made = ok(
    await owner.client.rpc("lead_search_create", {
      p_tenant_id: A,
      p_plan: {
        ...plan(20),
        criteria: [{ key: "website", text: "With a website", standard: "likely", required: false }],
        exclusions: [],
      },
      p_via: "people",
      p_estimate_usd: 1,
    }),
  );
  const w = a2World(140);
  // The probe, then the main phase one term's turn at a time (decision 0133), until the round is at its checks.
  let round = { state: "queued" };
  for (let turn = 0; turn < 8 && round.state !== "checking"; turn++) {
    await startRound(w.ports(`s${turn}`), made.round_id, `s${turn}`, turn > 0);
    w.finishRuns();
    for (const r of ok(await db.from("lead_runs").select("id").eq("round_id", made.round_id).eq("state", "running")))
      await collect(w.ports(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
    round = ok(await db.from("lead_rounds").select("state, ending_pending").eq("id", made.round_id).single());
  }
  assert.equal(round.state, "checking", JSON.stringify(round));
  await check(w.ports("k1"), made.round_id, 0, "k1");
  ok(await owner.client.rpc("lead_round_stop", { p_search_id: made.search_id }));
  round = ok(await db.from("lead_rounds").select("state, ending, ending_pending").eq("id", made.round_id).single());
  assert.deepEqual(
    [round.state, round.ending, round.ending_pending],
    ["checking", null, "stopped"],
    "still checking the emails",
  );
  w.finishRuns();
  const checkRun = ok(
    await db.from("lead_runs").select("id").eq("round_id", made.round_id).eq("purpose", "check").single(),
  );
  const done = await collect(w.ports("kc"), checkRun.id, "final", "kc");
  assert.deepEqual([done.kind, done.last], ["checked", true]);
  round = ok(await db.from("lead_rounds").select("state, ending").eq("id", made.round_id).single());
  assert.deepEqual(round, { state: "ended", ending: "stopped" });
});

test(
  "A2: erasure mid-run: a place suppressed between the read and the commit is never inserted; an out-of-area place is Needs review by rule, with its distance",
  { skip },
  async () => {
    const zipPlan = {
      ...plan(20),
      area: {
        kind: "zip",
        label: "near 78704",
        state: "TX",
        center: null,
        radius_m: 8000,
        zip: "78704",
        query: "78704, TX, USA",
      },
    };
    const made = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: zipPlan,
        p_via: "people",
        p_estimate_usd: 1,
      }),
    );
    const w = a2World(180);
    await startRound(w.ports("s1"), made.round_id, "s1");
    const runs = ok(await db.from("lead_runs").select("id, dataset_id").eq("round_id", made.round_id).order("term"));
    const src = probeItems();
    const erased = unseen(src[0], 160);
    const far = { ...unseen(src[1], 161), location: { lat: 32.7767, lng: -96.797 }, city: "Dallas" };
    const near = unseen(src[2], 162);
    w.apify.state.datasets[runs[0].dataset_id] = [erased, far, near];
    // The erasure lands after the runner has read the items and before it commits: the judge's port is where the two meet.
    const judge = w.judge.judge.bind(w.judge);
    w.judge.judge = async (p, places) => {
      ok(
        await db.from("lead_suppressions").insert({
          tenant_id: A,
          kind: "place",
          hash: await hashLegacyLeadSuppression(A, erased.placeId),
          what: "erased",
        }),
      );
      return judge(p, places);
    };
    w.finishRuns();
    const out = await collect(w.ports("c1"), runs[0].id, "p0", "c1");
    assert.equal(out.kind, "committed", JSON.stringify(out));
    const leads = ok(
      await db
        .from("leads")
        .select("place_id, city")
        .eq("tenant_id", A)
        .in("place_id", [erased.placeId, far.placeId, near.placeId]),
    );
    assert.deepEqual(
      leads.map((l) => [l.place_id, l.city]).sort(),
      [
        [far.placeId, "Dallas"],
        [near.placeId, "Austin"],
      ].sort(),
      "the erased place was never inserted",
    );
    const members = ok(
      await db
        .from("lead_search_members")
        .select("lead_id, class, reason, distance_m, judgment")
        .eq("round_id", made.round_id),
    );
    const farLead = await leadByPlace(far.placeId);
    const held = members.find((m) => m.lead_id === farLead.id);
    assert.ok(held, JSON.stringify(members));
    assert.deepEqual(
      [held.class, held.reason, held.judgment.reasons, held.distance_m > 250_000],
      ["review", OUT_OF_AREA_REASON, ["out_of_area"], true],
    );
  },
);
