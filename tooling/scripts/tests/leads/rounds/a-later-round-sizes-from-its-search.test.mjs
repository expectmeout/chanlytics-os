/**
 * A top-up or a renewal is sized from what its search found (PRD §0.5: "later rounds use the running yield by term and
 * area"). It started from an even yield whatever the search had seen (core start.ts), so a search whose places
 * qualified at a tenth asked the provider for a fifth of what it needed and ended "few new matches"; and the main
 * phase's places the search already held are counted on the run (lead_runs.already_yours, 00506), so what a round pays
 * twice for is measured.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startRound, UNMEASURED_YIELD } from "../../../../../packages/core/src/leads/runner/start.ts";
import { collect } from "../../../../../packages/core/src/leads/runner/collect.ts";
import { leadDb } from "../../../../../apps/edge/lib/leads/lead-db.ts";
import { leadWorld, TENANT } from "../../_lead-world.mjs";
import { PLAN } from "../../_lead-fixtures.mjs";

const OWNER = "job-1";

/** A search whose first round ended having judged `judged` places, `usable` of them reachable and not left out. */
function searched({ judged, usable }) {
  const w = leadWorld();
  w.rpcs.lead_search_create({ p_tenant_id: TENANT, p_plan: PLAN, p_via: "people", p_estimate_usd: 2 });
  const first = w.round();
  Object.assign(first, { state: "ended", ending: "few_new_matches" });
  for (let i = 0; i < judged; i++) {
    const id = randomUUID();
    w.T.leads.push({
      id,
      tenant_id: TENANT,
      phone_e164: i < usable ? `+1512555${String(1000 + i)}` : null,
      email: null,
    });
    w.T.lead_search_members.push({
      search_id: first.search_id,
      lead_id: id,
      round_id: first.id,
      tenant_id: TENANT,
      class: i < usable ? "qualified" : "excluded",
      counted: i < usable,
      judgment: { term: PLAN.terms[0], answer: { criteria: [] } },
    });
  }
  // Find new ones: a second round of the same search, its target the whole count.
  const top = {
    ...first,
    id: randomUUID(),
    seq: 2,
    purpose: "topup",
    state: "queued",
    ending: null,
    target: 20,
    allowance_reserved: 20,
    allowance_used: 0,
    cost_reserved_usd: 2,
    cost_usd: 0,
  };
  w.T.lead_rounds.push(top);
  const db = leadDb(w.db);
  return { w, top, p: (owner = OWNER, o = {}) => w.ports(owner, { db, ...o }) };
}

const askedFor = (w) =>
  w.apify.calls.filter((c) => c.op === "startRun").reduce((s, c) => s + c.input.maxCrawledPlacesPerSearch, 0);

test("a top-up of a search whose places qualified at a tenth asks for what that yield needs, up to four times the count", async () => {
  const { w, top, p } = searched({ judged: 20, usable: 2 });
  await startRound(p(), top.id, OWNER);
  assert.equal(
    askedFor(w),
    100,
    "20 wanted at a tenth is 200, held to four times the 20: it asked for 40 at an even yield. And the 20 the first term read, which the provider answers first",
  );
});

test("a top-up of a search that judged nothing yet sizes from an even yield", async () => {
  assert.equal(UNMEASURED_YIELD, 0.5);
  const { w, top, p } = searched({ judged: 0, usable: 0 });
  await startRound(p(), top.id, OWNER);
  assert.equal(askedFor(w), 40);
});

test("the places a run read that the workspace already held are counted on the run", async () => {
  const { w, top, p } = searched({ judged: 0, usable: 0 });
  await startRound(p(), top.id, OWNER);
  w.finishRuns();
  const run = w.runs().find((r) => r.round_id === top.id);
  const items = w.apify.state.datasets[run.dataset_id];
  // Two of the run's places are already the workspace's leads.
  for (const it of items.slice(0, 2))
    w.T.leads.push({ id: randomUUID(), tenant_id: TENANT, place_id: it.placeId, erased_at: null });
  await collect(p("c1"), run.id, "p0", "c1");
  assert.equal(w.runs().find((r) => r.id === run.id).already_yours, 2);
});
