/**
 * The lead finder's world in memory: 00140's rows and the rules of its
 * service RPCs, modelled over _fake-db.mjs so the runner, the pipeline's
 * binding, the webhook door, the sweep and a whole search run against them
 * with no database and no network. What is modelled, as 00140 writes it: the
 * claim, the lease with its owner and generation, the one commit per page
 * with its compare-and-set on the offset, the judgment kept by operation id,
 * the counting up to the reservation, the pending ending and the raised
 * target, a suppressed place never inserted, the check's settlement (a member
 * held by the email standard alone qualifies on ok), Stop's generation bump
 * and pending ending, the once-only lead_collect job. Anything else the code
 * under test asks of an RPC throws by name, as _fake-db.mjs does.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import crypto from "node:crypto";
import { leadSuppressionHash } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";
import { PLAN, probeItems, mainItems, checkerItem, fakeApify, fakeJudge } from "./_lead-fixtures.mjs";

export const TENANT = "11111111-1111-4111-8111-111111111111";
export const OWNER_USER = "22222222-2222-4222-8222-222222222222";
const uuid = () => crypto.randomUUID();
const FINAL = new Set(["succeeded", "failed", "aborted", "timed_out"]);
const live = (j) => j.state == null || j.state === "scheduled" || j.state === "fired";

/** The token the edge derives for a run row (lead-wires.ts), under a test secret. */
export const webhookToken = async (runRowId) =>
  crypto.createHmac("sha256", "a-test-secret-for-lead-webhooks").update(`lead-webhook:${runRowId}`).digest("base64url");
export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function leadWorld({
  plan = PLAN,
  searchesOn = true,
  month = "2026-09",
  startMs = Date.parse("2026-09-19T12:00:00.000Z"),
} = {}) {
  const clock = {
    ms: startMs,
    now: () => new Date(clock.ms),
    advance: (ms) => {
      clock.ms += ms;
    },
  };
  const nowIso = () => new Date(clock.ms).toISOString();
  const T = {
    tenants: [{ id: TENANT, slug: "lead-world", name: "Lead World", timezone: "America/Chicago", status: "active" }],
    lead_platform: [
      { id: uuid(), searches_on: false, tenants_on: searchesOn ? [TENANT] : [], note: null, prices_checked_at: null },
    ],
    lead_searches: [],
    lead_rounds: [],
    lead_runs: [],
    leads: [],
    lead_places: [],
    lead_search_members: [],
    lead_judgments: [],
    lead_suppressions: [],
    lead_counters: [],
    contacts: [],
    jobs: [],
  };
  /** What the commit refuses by value (00140 hashes; the rows in lead_suppressions carry the real hash for the adapter's read). */
  const suppressedValues = new Set();
  const w = { T, clock, pages: {} };

  /** scheduleJobOnce's rule, with 00140's index on lead_collect's run and seq modelled. */
  w.scheduleOnce = async (kind, dueAt, payload) => {
    if (
      kind === "lead_collect" &&
      T.jobs.some(
        (j) =>
          j.kind === "lead_collect" && live(j) && j.payload.run_id === payload.run_id && j.payload.seq === payload.seq,
      )
    )
      return "already_scheduled";
    T.jobs.push({
      id: uuid(),
      tenant_id: TENANT,
      kind,
      state: "scheduled",
      due_at: new Date(dueAt).toISOString(),
      payload,
      attempts: 0,
      created_at: nowIso(),
    });
    return "scheduled";
  };
  /** A suppression as 00140 writes one: the keyed digest on the row, the value kept for the commit's check. */
  w.suppress = async (kind, value, what = "erased") => {
    T.lead_suppressions.push({
      id: uuid(),
      tenant_id: TENANT,
      kind,
      hash: await leadSuppressionHash(TENANT, value),
      what,
      created_at: nowIso(),
    });
    suppressedValues.add(`${kind}:${value}`);
  };
  const end = (round, ending) => {
    if (round.state === "ended") return false;
    Object.assign(round, { state: "ended", ending, ended_at: nowIso(), waiting_since: null });
    round.allowance_reserved = round.allowance_used;
    round.cost_reserved_usd = round.cost_usd;
    return true;
  };
  const roundOf = (id) => T.lead_rounds.find((r) => r.id === id);
  const runOf = (id) => T.lead_runs.find((r) => r.id === id);
  const membersOf = (round) => T.lead_search_members.filter((m) => m.round_id === round.id);
  const targetOf = (round) => round.target;

  const rpcs = {
    get_cron_sweep_key: () => "sweep-key-for-this-file",
    lead_searches_on: ({ p_tenant_id }) =>
      T.lead_platform[0].searches_on || T.lead_platform[0].tenants_on.includes(p_tenant_id),
    lead_search_create: ({ p_tenant_id, p_plan, p_via, p_estimate_usd }) => {
      if (!rpcs.lead_searches_on({ p_tenant_id }))
        return {
          error: "paused",
          sentence: "Lead searches are paused for now. Your leads are all here, and nothing is being counted.",
        };
      const used =
        T.lead_search_members.filter((m) => m.tenant_id === p_tenant_id && m.counted).length +
        T.lead_rounds
          .filter((r) => r.tenant_id === p_tenant_id && r.state !== "ended")
          .reduce((a, r) => a + r.allowance_reserved - r.allowance_used, 0);
      if (used + p_plan.count > 500)
        return {
          error: "month_leads_used",
          left: Math.max(0, 500 - used),
          sentence: `This month covers ${Math.max(0, 500 - used)} more leads.`,
        };
      const search = {
        id: uuid(),
        tenant_id: p_tenant_id,
        created_by: OWNER_USER,
        via: p_via,
        card: p_plan.card,
        name: p_plan.name,
        asked: p_plan.asked,
        plan: p_plan,
        removed_at: null,
        created_at: nowIso(),
      };
      const round = {
        id: uuid(),
        tenant_id: p_tenant_id,
        search_id: search.id,
        seq: 1,
        purpose: "probe",
        plan: p_plan,
        plan_version: p_plan.version,
        target: Math.min(25, p_plan.count),
        state: "queued",
        ending: null,
        ending_pending: null,
        question: null,
        answered: null,
        waiting_since: null,
        allowance_reserved: p_plan.count,
        allowance_used: 0,
        cost_reserved_usd: p_estimate_usd,
        cost_usd: 0,
        judge_tokens: 0,
        judge_model: null,
        month,
        day: "2026-09-19",
        platform_day: "2026-09-19",
        started_at: null,
        ended_at: null,
        created_at: nowIso(),
        nearby: [],
      };
      T.lead_searches.push(search);
      T.lead_rounds.push(round);
      w.scheduleOnce("lead_round_start", clock.ms, { round_id: round.id });
      return { search_id: search.id, round_id: round.id };
    },
    lead_round_answer: ({ p_round_id, p_answer, p_plan }) => {
      const round = roundOf(p_round_id);
      if (!round) throw new Error("Round not found.");
      if (round.state !== "waiting_on_owner") return { error: "state", state: round.state };
      if (p_answer === "stop") {
        round.answered = "stop";
        end(round, "stopped");
        return { round_id: p_round_id, state: "ended" };
      }
      if (p_answer === "include" && p_plan) {
        round.plan = p_plan;
        round.plan_version = p_plan.version;
        T.lead_searches.find((s) => s.id === round.search_id).plan = p_plan;
      }
      Object.assign(round, {
        state: "running",
        answered: p_answer,
        waiting_since: null,
        target: Math.max(round.target, (p_plan ?? round.plan).count),
      });
      w.scheduleOnce("lead_round_start", clock.ms, { round_id: round.id, resume: true });
      return { round_id: p_round_id, state: "running" };
    },
    lead_round_stop: ({ p_search_id }) => {
      let rounds = 0;
      let runs = 0;
      for (const round of T.lead_rounds.filter((r) => r.search_id === p_search_id && r.state !== "ended")) {
        rounds += 1;
        let liveRuns = 0;
        for (const run of T.lead_runs.filter(
          (r) =>
            r.round_id === round.id &&
            r.purpose === "discover" &&
            ["claimed", "starting", "running", "unknown"].includes(r.state),
        )) {
          run.lease_gen += 1;
          if (run.state === "running") {
            w.scheduleOnce("lead_collect", clock.ms, { run_id: run.id, seq: "stop" });
            liveRuns += 1;
          }
          runs += 1;
        }
        round.ending_pending = "stopped";
        if (liveRuns === 0 && round.state !== "checking") end(round, "stopped");
      }
      return { rounds, runs };
    },
    lead_run_claim: ({ p_run_id, p_owner }) => {
      const run = runOf(p_run_id);
      if (!run || run.claimed_by != null || run.state !== "claimed") return false;
      Object.assign(run, { claimed_by: p_owner, claimed_at: nowIso(), state: "starting" });
      return true;
    },
    lead_run_record_start: ({ p_run_id, p_owner, p_apify_run_id, p_dataset_id, p_cap_usd }) => {
      const run = runOf(p_run_id);
      if (!run || run.claimed_by !== p_owner || run.state !== "starting") return false;
      Object.assign(run, {
        apify_run_id: p_apify_run_id,
        dataset_id: p_dataset_id,
        cap_usd: p_cap_usd,
        state: "running",
      });
      return true;
    },
    lead_run_mark_unknown: ({ p_run_id, p_owner }) => {
      const run = runOf(p_run_id);
      if (!run || run.claimed_by !== p_owner || run.state !== "starting") return false;
      run.state = "unknown";
      return true;
    },
    lead_run_reconcile: ({ p_run_id, p_apify_run_id, p_dataset_id, p_state }) => {
      const run = runOf(p_run_id);
      if (!run || run.state !== "unknown") return false;
      Object.assign(run, {
        apify_run_id: p_apify_run_id ?? null,
        dataset_id: p_dataset_id ?? null,
        state: p_state,
        finished_at: FINAL.has(p_state) ? nowIso() : null,
      });
      return true;
    },
    lead_run_lease: ({ p_run_id, p_owner, p_seconds }) => {
      const run = runOf(p_run_id);
      if (!run) return null;
      const free = !run.lease_until || Date.parse(run.lease_until) < clock.ms || run.lease_owner === p_owner;
      if (!free) return null;
      Object.assign(run, { lease_owner: p_owner, lease_until: new Date(clock.ms + p_seconds * 1000).toISOString() });
      return run.lease_gen;
    },
    lead_run_release: ({ p_run_id, p_owner, p_gen }) => {
      const run = runOf(p_run_id);
      if (!run || run.lease_owner !== p_owner || run.lease_gen !== p_gen) return false;
      Object.assign(run, { lease_owner: null, lease_until: null });
      return true;
    },
    lead_collect_commit: ({ p_run_id, p_owner, p_gen, p_from_offset, p_to_offset, p_page }) => {
      const run = runOf(p_run_id);
      if (!run) return { ok: false, why: "run" };
      if (run.lease_owner !== p_owner || run.lease_gen !== p_gen) return { ok: false, why: "lease" };
      if (run.read_offset !== p_from_offset) return { ok: false, why: "offset" };
      const round = roundOf(run.round_id);
      if (round.state === "ended" && run.purpose !== "check") return { ok: false, why: "ended" }; // a check run may commit after the round ended (00145)
      const search = T.lead_searches.find((s) => s.id === round.search_id);
      const page = p_page;
      let room = Math.max(0, round.allowance_reserved - round.allowance_used);
      let counted = 0;
      let qualified = 0;
      let review = 0;
      let excluded = 0;
      const judgments = Array.isArray(page.judgment) ? page.judgment : page.judgment ? [page.judgment] : [];
      for (const j of judgments) {
        if (T.lead_judgments.some((x) => x.op_id === j.op_id)) continue;
        T.lead_judgments.push({
          id: uuid(),
          tenant_id: run.tenant_id,
          round_id: round.id,
          batch: j.batch ?? 0,
          op_id: j.op_id,
          request_hash: j.request_hash,
          answer: j.answer,
          model: j.model,
          tokens: j.tokens ?? 0,
          created_at: nowIso(),
        });
        round.judge_tokens += j.tokens ?? 0;
        round.judge_model = j.model ?? round.judge_model;
      }
      for (const x of page.places) {
        if (!x.place.place_id) continue;
        if (
          suppressedValues.has(`place:${x.place.place_id}`) ||
          (x.place.phone_e164 && suppressedValues.has(`phone:${x.place.phone_e164}`)) ||
          (x.place.email && suppressedValues.has(`email:${x.place.email}`))
        )
          continue;
        let lead = null;
        if (x.duplicate_of_place_id) {
          lead =
            T.leads.find(
              (l) =>
                l.tenant_id === run.tenant_id &&
                !l.blanked_at &&
                !l.erased_at &&
                (l.place_id === x.duplicate_of_place_id ||
                  T.lead_places.some((p) => p.lead_id === l.id && p.place_id === x.duplicate_of_place_id)),
            ) ?? null;
          if (lead && !T.lead_places.some((p) => p.place_id === x.place.place_id))
            T.lead_places.push({
              id: uuid(),
              lead_id: lead.id,
              tenant_id: run.tenant_id,
              place_id: x.place.place_id,
              title: x.place.business_name,
              street: x.place.street,
              found_at: nowIso(),
            });
        }
        if (!lead) {
          lead = T.leads.find((l) => l.tenant_id === run.tenant_id && l.place_id === x.place.place_id) ?? null;
          if (!lead) {
            lead = {
              id: uuid(),
              tenant_id: run.tenant_id,
              ...x.place,
              phone_wrong: false,
              email_checked_at: null,
              stage: "ready",
              closed_reason: null,
              last_outcome: null,
              last_note: null,
              contacted_at: null,
              exported_at: null,
              contact_id: null,
              converted_at: null,
              found_at: nowIso(),
              erased_at: null,
              blanked_at: null,
            };
            T.leads.push(lead);
          }
        }
        if (T.lead_search_members.some((m) => m.search_id === search.id && m.lead_id === lead.id)) continue;
        const cls = x.member.class ?? "review";
        const member = {
          id: uuid(),
          search_id: search.id,
          lead_id: lead.id,
          round_id: round.id,
          tenant_id: run.tenant_id,
          judgment: { ...(x.member.judgment ?? {}), shares: x.shares ?? [] },
          class: cls,
          excluded_by: x.member.excluded_by ?? null,
          fit: x.member.fit ?? null,
          reason: (x.member.reason ?? "").slice(0, 120),
          distance_m: x.member.distance_m ?? null,
          counted: false,
          counted_month: null,
          kept_at: null,
          kept_by: null,
          blanked_at: null,
          version: 1,
          created_at: nowIso(),
        };
        T.lead_search_members.push(member);
        if (cls === "qualified") {
          qualified += 1;
          if (room > 0) {
            member.counted = true;
            member.counted_month = month;
            room -= 1;
            counted += 1;
          }
        } else if (cls === "review") review += 1;
        else excluded += 1;
      }
      round.allowance_used += counted;
      const usage = Number(page.usage_usd);
      if (Number.isFinite(usage) && usage > run.usage_usd) {
        if (round.state !== "ended")
          round.cost_usd = Math.round((round.cost_usd + usage - run.usage_usd) * 10_000) / 10_000; // an ended round is final (00145)
        run.usage_usd = usage;
      }
      run.read_offset = p_to_offset;
      run.items_seen = page.items_seen ?? run.items_seen;
      if (page.run_state) {
        run.state = page.run_state;
        if (FINAL.has(page.run_state)) run.finished_at = run.finished_at ?? nowIso();
      }
      if (page.next && typeof page.next === "object") {
        if (page.next.kind === "lead_check")
          w.scheduleOnce("lead_check", clock.ms + (page.next.run_after_seconds ?? 0) * 1000, {
            round_id: round.id,
            batch: page.next.batch ?? 1,
          });
        else
          w.scheduleOnce("lead_collect", clock.ms + (page.next.run_after_seconds ?? 0) * 1000, {
            run_id: run.id,
            seq: page.next.seq ?? `p${p_to_offset}`,
          });
      }
      const r = page.round ?? {};
      if (r.target != null) round.target = Math.max(round.target, r.target);
      if (r.ending_pending != null) round.ending_pending = r.ending_pending;
      if (Array.isArray(r.nearby)) round.nearby = r.nearby;
      if (r.question && typeof r.question === "object") {
        round.question = r.question;
        round.waiting_since = nowIso();
      }
      if (r.ending != null) end(round, r.ending);
      else if (r.state != null && r.state !== round.state) {
        round.state = r.state;
        round.started_at = round.started_at ?? nowIso();
      }
      return { ok: true, counted, qualified, review, excluded, round_state: round.state };
    },
    lead_check_commit: ({ p_round_id, p_run_id, p_results, p_usage_usd, p_last }) => {
      const round = roundOf(p_round_id);
      if (!round) return { ok: false, why: "round" };
      let room = round.state === "ended" ? 0 : Math.max(0, round.allowance_reserved - round.allowance_used);
      let newly = 0;
      let later = 0;
      let counted = 0;
      for (const r of p_results ?? []) {
        const lead = T.leads.find((l) => l.id === r.lead_id && l.tenant_id === round.tenant_id);
        if (lead && ["ok", "catch_all", "unknown", "invalid"].includes(r.email_state))
          Object.assign(lead, { email_state: r.email_state, email_checked_at: r.checked_at ?? nowIso() });
      }
      for (const m of membersOf(round)) {
        const lead = T.leads.find((l) => l.id === m.lead_id);
        const reasons = Array.isArray(m.judgment?.reasons) ? m.judgment.reasons : null;
        if (
          m.class !== "review" ||
          m.blanked_at ||
          lead?.email_state !== "ok" ||
          !reasons ||
          !reasons.length ||
          reasons.some((x) => !String(x).startsWith("email:"))
        )
          continue;
        // Past the room the member is Qualified and uncounted, and no counter moves.
        // After the round ended (Check again, 00145) the member counts through the month, as Keep does; here the month is derived from counted members.
        const counts = round.state === "ended" || room > 0;
        if (counts && round.state === "ended") later += 1;
        else if (counts) {
          room -= 1;
          counted += 1;
        }
        Object.assign(m, {
          class: "qualified",
          counted: counts,
          counted_month: counts ? month : m.counted_month,
          version: m.version + 1,
          judgment: { ...m.judgment, reasons: [] },
        });
        newly += 1;
      }
      round.allowance_used += counted;
      // The CHECK RUN's total so far, not this batch's delta: only what is new settles, so a job tried again charges once.
      const checkRun = p_run_id ? runOf(p_run_id) : null;
      const total = Number(p_usage_usd ?? 0);
      if (checkRun && checkRun.round_id === p_round_id && total > checkRun.usage_usd) {
        if (round.state !== "ended")
          round.cost_usd = Math.round((round.cost_usd + total - checkRun.usage_usd) * 10_000) / 10_000; // an ended round is final (00145)
        checkRun.usage_usd = total;
      }
      let ended = false;
      if (p_last)
        ended = end(
          round,
          round.ending_pending ?? (round.allowance_used >= targetOf(round) ? "target_reached" : "searched_everything"),
        );
      return { ok: true, qualified: newly, counted: counted + later, ended };
    },
    lead_round_end: ({ p_round_id, p_ending }) => {
      const round = roundOf(p_round_id);
      return !!round && end(round, p_ending);
    },
  };
  w.rpcs = rpcs;
  w.db = fakeDb(T, {}, rpcs);
  // 00140's index on lead_collect's (run_id, seq): a second insert is 23505, as the door meets it; a row inserted without a state has Postgres's default.
  const realFrom = w.db.from;
  w.db.from = (table) => {
    const b = realFrom(table);
    if (table !== "jobs") return b;
    const realInsert = b.insert;
    b.insert = (values) => {
      const rows = Array.isArray(values) ? values : [values];
      const dup = rows.find(
        (v) =>
          v.kind === "lead_collect" &&
          T.jobs.some(
            (j) =>
              j.kind === "lead_collect" &&
              live(j) &&
              j.payload?.run_id === v.payload?.run_id &&
              j.payload?.seq === v.payload?.seq,
          ),
      );
      if (dup)
        return {
          then: (resolve) =>
            resolve({
              data: null,
              error: {
                code: "23505",
                message: 'duplicate key value violates unique constraint "jobs_lead_collect_once"',
              },
            }),
        };
      return realInsert(rows.map((v) => ({ state: "scheduled", attempts: 0, ...v })));
    };
    return b;
  };

  /* -------------------------------------------------------- the provider */
  const apify = fakeApify();
  w.apify = apify;
  /** What each run's dataset holds: the probe's items by term, then the main run's, then the checker's answers. */
  const realStart = apify.startRun;
  let discoverStarts = 0;
  apify.startRun = async (actor, input, opts) => {
    const out = await realStart(actor, input, opts);
    const ds = apify.state.datasets;
    if (actor.includes("email-verifier"))
      ds[out.datasetId] = (input.emails ?? []).map((e) =>
        checkerItem(e, w.checkerAnswers?.[e] ?? "valid", w.checkerAnswers?.[e] === "risky"),
      );
    else {
      discoverStarts += 1;
      const term = input.searchStringsArray[0];
      const probe = probeItems();
      const main = mainItems();
      ds[out.datasetId] =
        discoverStarts <= plan.terms.length
          ? term === plan.terms[0]
            ? probe.slice(0, 13)
            : probe.slice(13)
          : term === plan.terms[0]
            ? main.slice(0, 20)
            : main.slice(20);
    }
    return out;
  };
  /** The provider, moved by the test: every running run ends. */
  w.finishRuns = (status = "SUCCEEDED") => {
    for (const r of Object.values(apify.state.runs)) if (r.status === "RUNNING") apify.finish(r.id, status, 0.05);
  };
  w.judge = fakeJudge();
  /** The wires the edge would bind (lead-wires.ts), over the fakes. */
  // The home pages this world serves, by origin (D6): what markPlaces reads a lead's own mark from.
  w.wires = {
    apify,
    judge: w.judge,
    webhookBase: "https://edge.example",
    webhookToken,
    fetchText: async (url) => w.pages[url] ?? null,
  };
  w.ports = (owner, over = {}) => ({
    db: over.db,
    apify,
    judge: w.judge,
    now: clock.now,
    webhookBase: "https://edge.example",
    webhookToken,
    fetchText: async (url) => w.pages[url] ?? null,
    schedule: (kind, payload, secs) => w.scheduleOnce(kind, clock.ms + secs * 1000, payload).then(() => undefined),
    deadline: clock.ms + 45_000,
    owner,
    ...over,
  });

  /* ------------------------------------------------------------ the rows */
  w.search = () => T.lead_searches[0];
  w.round = () => T.lead_rounds[0];
  w.runs = () => T.lead_runs;
  w.members = () => T.lead_search_members;
  w.jobsOf = (kind) => T.jobs.filter((j) => j.kind === kind);
  return w;
}

/** The JobContext the tick would build for one job, over the world: the fake database and the world's wires. */
export function ctxFor(w, leads) {
  return () => ({
    db: w.db,
    wire: {},
    alert: async () => {},
    schedule: async () => {},
    deadline: Date.now() + 45_000,
    ...(leads ? { leads } : {}),
  });
}

/**
 * Run every due job through the real dispatch, in due order, moving the
 * clock to each; the provider's running runs end after the first poll of
 * each, as a real run would within a minute. Stops when nothing is due, or
 * after `max` jobs (a loop guard that fails the test with the job list).
 */
export async function drain(w, dispatchJob, ctxOf, { max = 300, finishAfterPolls = 1 } = {}) {
  const polls = new Map();
  let ran = 0;
  for (;;) {
    const due = w.T.jobs
      .filter((j) => j.state === "scheduled")
      .sort((a, b) => (a.due_at < b.due_at ? -1 : a.due_at > b.due_at ? 1 : 0))[0];
    if (!due) return ran;
    if (++ran > max)
      throw new Error(
        `drain: more than ${max} jobs; the last: ${JSON.stringify(w.T.jobs.slice(-5).map((j) => [j.kind, j.payload, j.state]))}`,
      );
    if (Date.parse(due.due_at) > w.clock.ms) w.clock.ms = Date.parse(due.due_at);
    due.state = "fired";
    due.attempts += 1;
    const job = { id: due.id, tenant_id: due.tenant_id, kind: due.kind, payload: due.payload };
    try {
      await dispatchJob(ctxOf(job), job);
      due.state = "done";
    } catch (e) {
      due.state = "failed";
      due.last_error = e instanceof Error ? e.message : String(e);
    }
    // A collect that found its run still running polls again; the provider ends the run after `finishAfterPolls` polls.
    if (due.kind === "lead_collect") {
      const run = w.T.lead_runs.find((r) => r.id === due.payload.run_id);
      const remote = run?.apify_run_id ? w.apify.state.runs[run.apify_run_id] : null;
      if (remote && remote.status === "RUNNING") {
        const n = (polls.get(remote.id) ?? 0) + 1;
        polls.set(remote.id, n);
        if (n >= finishAfterPolls) w.apify.finish(remote.id, "SUCCEEDED", 0.05);
      }
    }
  }
}
