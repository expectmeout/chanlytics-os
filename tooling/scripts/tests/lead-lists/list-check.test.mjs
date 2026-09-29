/**
 * A list of your own is checked by the finder's own check (Reach out Part 7: J2, J10): the real core verbs (check,
 * collect) over the real edge adapter (apps/edge/lib/leads/lead-db.ts) on the lead world in memory, the provider
 * faked. A file's round, as lead_search_import (00242) leaves it, is checked with nothing added for it: the checker
 * is started with every address, the members' leads are read in parts (PostgREST's `.in()` fails past about 208
 * ids), and its answers make the ones that check out Qualified and counted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { check } from "../../../../packages/core/src/leads/runner/check.ts";
import { collect } from "../../../../packages/core/src/leads/runner/collect.ts";
import { leadDb } from "../../../../apps/edge/lib/leads/lead-db.ts";
import { leadWorld, TENANT } from "../_lead-world.mjs";

const OWNER = "job-1";
const N = 400;
const PLAN = {
  version: 1,
  card: "local_businesses",
  list: "import",
  name: "Expo gyms",
  asked: "gyms I met at the expo",
  terms: [],
  count: N,
  contact: "email",
  criteria: [],
  exclusions: [],
};

/** The world with one file's search, as 00242 leaves it: a round checking N addresses, each lead waiting in review. */
function listWorld() {
  const w = leadWorld();
  const at = w.clock.now().toISOString();
  const search = {
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    created_by: null,
    via: "import",
    card: "local_businesses",
    name: PLAN.name,
    asked: PLAN.asked,
    plan: PLAN,
    removed_at: null,
    created_at: at,
  };
  const round = {
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    search_id: search.id,
    seq: 1,
    purpose: "main",
    plan: PLAN,
    plan_version: 1,
    target: N,
    state: "checking",
    ending: null,
    ending_pending: null,
    question: null,
    answered: null,
    waiting_since: null,
    allowance_reserved: N,
    allowance_used: 0,
    cost_reserved_usd: 0.5,
    cost_usd: 0,
    judge_tokens: 0,
    judge_model: null,
    month: "2026-09",
    day: "2026-09-19",
    platform_day: "2026-09-19",
    started_at: at,
    ended_at: null,
    created_at: at,
    nearby: [],
  };
  w.T.lead_searches.push(search);
  w.T.lead_rounds.push(round);
  for (let i = 0; i < N; i++) {
    const lead = {
      id: crypto.randomUUID(),
      tenant_id: TENANT,
      place_id: null,
      business_name: `Gym ${i}`,
      email: `gym${i}@list.example`,
      email_state: "checking",
      stage: "ready",
      contact_id: null,
      contacted_at: null,
      last_outcome: null,
      phone_wrong: false,
      lat: null,
      lng: null,
      phone_e164: null,
      erased_at: null,
      blanked_at: null,
      found_at: at,
    };
    w.T.leads.push(lead);
    w.T.lead_search_members.push({
      id: crypto.randomUUID(),
      search_id: search.id,
      lead_id: lead.id,
      round_id: round.id,
      tenant_id: TENANT,
      judgment: { reasons: ["email:checking"] },
      class: "review",
      excluded_by: null,
      fit: null,
      reason: "",
      distance_m: null,
      counted: false,
      counted_month: null,
      kept_at: null,
      kept_by: null,
      blanked_at: null,
      version: 1,
      created_at: at,
    });
  }
  return { w, round, db: leadDb(w.db) };
}

test("a file's round is checked as a found one is: every address to the checker, the leads read in parts", async () => {
  const { w, round, db } = listWorld();
  const out = await check(w.ports(OWNER, { db }), round.id, 0, OWNER);
  assert.deepEqual([out.kind, out.emails, out.more], ["started", N, false]);
  const [run] = Object.values(w.apify.state.runs);
  assert.equal(run.input.emails.length, N, "one checker run, every address");
  const reads = w.db.seen.filter((q) => q.table === "leads" && q.filters.some(([op]) => op === "in"));
  const sizes = reads.map((q) => q.filters.find(([op]) => op === "in")[2].length);
  assert.ok(sizes.length >= 3 && sizes.every((n) => n <= 150), `in parts of 150 at most: ${sizes.join(", ")}`);
});

test("its answers make the ones that check out Qualified and counted, and end the round", async () => {
  const { w, round, db } = listWorld();
  w.checkerAnswers = { "gym0@list.example": "invalid", "gym1@list.example": "risky" };
  await check(w.ports(OWNER, { db }), round.id, 0, OWNER);
  w.finishRuns();
  const [runRow] = w.runs();
  const out = await collect(w.ports("c1", { db }), runRow.id, "p0", "c1");
  assert.deepEqual([out.kind, out.last], ["checked", true]);
  const members = w.members().filter((m) => m.round_id === round.id);
  const qualified = members.filter((m) => m.class === "qualified" && m.counted).length;
  assert.equal(qualified, N - 2, "every address that checked out");
  assert.equal(members.filter((m) => m.class === "review").length, 2, "the rest wait in Needs review");
  assert.equal(w.round().state, "ended");
});
