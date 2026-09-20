/**
 * Ask's two lead tools and the card they become.
 *
 * The assistant may read what was searched and propose one more search. It
 * never searches: `propose_lead_search` shapes what the model asked for,
 * hands it to the planner in contracts and answers with a card, and the
 * planner's refusals are words for the model to say rather than a card with
 * a problem in it. What the card does when the owner approves it — the route
 * it reaches, the mark it carries, the receipt and the undo — is run here
 * through the committer on a client bound to a fake fetch, the way
 * `ask-commit.test.mjs` runs every other card.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LEAD_ENDING_WORDS, planSentence } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { newToolContext, runTool } = await import(at("apps/dashboard/src/server/ask/tools.ts"));
const { buildProposal } = await import(at("apps/dashboard/src/server/ask/proposals.ts"));
const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
const { commitProposal, undoProposal } = await import(at("apps/dashboard/src/legacy-bridge/ask/commit.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEARCH = "55555555-5555-4555-8555-555555555551";
const SEARCH2 = "55555555-5555-4555-8555-555555555552";
const ROUND = "66666666-6666-4666-8666-666666666661";
const NOW = new Date("2026-09-19T15:00:00Z");

/** What the model hands `propose_lead_search`: the owner's ask, in the tool's own fields. */
const MODEL_INPUT = {
  looking_for: "local_businesses",
  country: "US",
  count: 200,
  who: "personal trainers",
  who_one: "personal trainer",
  category_key: "personal_trainer",
  terms: ["personal trainers", "personal training studio"],
  city: "Austin",
  region: "TX",
  contact: "email",
  criteria: [{ text: "With a website", standard: "likely", required: true }],
  leave_out: [{ words: "Chain gyms" }],
  asked: "find me 200 personal trainers in Austin with a website",
};

/** A plan as the planner answers one; the card carries it and the commit posts it. */
const PLAN = {
  version: 1,
  card: "local_businesses",
  name: "personal trainers",
  asked: "find me 200 personal trainers in Austin with a website",
  terms: ["personal trainers", "personal training studio"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: null, radius_m: 25_000, query: "Austin, TX, USA" },
  count: 200,
  contact: "email",
  criteria: [{ key: "c1", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "x1", text: "Chain gyms", origin: "claude" }],
};

const viewRow = (over = {}) => ({
  id: SEARCH,
  tenant_id: A,
  created_by: "u1",
  card: "local_businesses",
  name: "Personal trainers in Austin",
  asked: "find me 200 personal trainers in Austin with a website",
  via: "ask",
  plan: PLAN,
  removed_at: null,
  created_at: "2026-09-18T15:00:00Z",
  round_id: ROUND,
  seq: 1,
  purpose: "main",
  state: "ended",
  ending: "target_reached",
  question: null,
  answered: null,
  target: 200,
  plan_version: 1,
  cost_usd: 1.24,
  qualified: 160,
  review: 20,
  excluded: 40,
  counted: 160,
  judge_tokens: 9000,
  ...over,
});

/**
 * The workspace as the tools read it: two searches, one ended and one still
 * running, and the month's two counters the plan card's facts are read from
 * (`planFacts`, server/leads.ts).
 */
const world = () => ({
  lead_searches_view: [
    viewRow(),
    viewRow({ id: SEARCH2, name: "Independent pharmacies near 78704", created_at: "2026-09-19T09:00:00Z", state: "running", ending: null, counted: 12, qualified: 12, review: 3 }),
  ],
  tenants: [{ id: A, name: "Zilker Strength", timezone: "America/Chicago", slug: "harbor" }],
  lead_counters: [
    { tenant_id: A, kind: "allowance", period: "2026-09", used: 172, reserved: 0 },
    { tenant_id: A, kind: "budget", period: "2026-09", used: 4, reserved: 0 },
  ],
});

/** The rail's counts and the platform's prior: the two doors `planFacts` asks. */
const DOORS = {
  lead_list_counts: () => ({ all: 172, ready: 140, nurture: 20, converted: 8, said_no: 3, not_a_fit: 1 }),
  lead_niche_prior: () => ({ places: 1200, matched: 700, with_email: 406 }),
};

const toolContext = ({ role = "owner", tables = world(), rpcs = DOORS } = {}) =>
  newToolContext({ supabase: fakeDb(tables, {}, rpcs), userId: "u1", email: "ada@example.com", params: {} }, A, role, "America/Chicago", NOW);

const envelope = (data) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });

/** A tab whose fetch answers the routes a lead card reaches, and keeps what left it. */
function fakeClient(answers) {
  const calls = [];
  const client = createApi({
    fetch: async (url, init) => {
      const key = `${init.method} ${String(url).replace(/\?.*$/, "")}`;
      calls.push({ key, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
      if (!(key in answers)) throw new Error(`the card reached a route this test does not answer: ${key}`);
      return envelope(answers[key]);
    },
    workspace: () => A,
    onSignedOut: () => {},
    onChooseWorkspace: () => {},
    refresh: async () => {},
    now: () => 1_000,
  });
  return { client, calls };
}
const win = { location: { hash: "" }, dispatchEvent: () => true, setTimeout: (fn) => { fn(); return 1; } };

test("propose_lead_search makes a plan card for an owner; the model's plan is completed and checked, never trusted", async () => {
  const t = toolContext({ role: "owner", tables: world() });
  const out = await buildProposal(t, "propose_lead_search", MODEL_INPUT);
  assert.equal(out.isError, false);
  assert.deepEqual([out.proposal.kind, out.proposal.needs, out.proposal.title], ["lead_search", "owner", "Find 200 personal trainers"]);
  assert.equal(out.proposal.summary, "Find 200 personal trainers in Austin, TX with a website, then find their email and check it. Leaving out: chain gyms.");
  assert.equal(out.proposal.payload.plan.version, 1);
  assert.match(JSON.parse(out.result).note, /Nothing has happened yet/);
  // The plan is the schema's own, not the model's words passed through.
  assert.equal(out.proposal.summary, planSentence(out.proposal.payload.plan));
  assert.equal(out.proposal.payload.plan.card, "local_businesses");
  assert.equal(out.proposal.undo, "Stop the search");
});

test("the card carries the facts under the sentence: what a search would skip, what is left this month, and what past searches for this kind measured", async () => {
  const t = toolContext({ role: "owner", tables: world() });
  const out = await buildProposal(t, "propose_lead_search", MODEL_INPUT);
  assert.deepEqual(out.proposal.payload.facts, {
    dupes: 172,
    leadsLeft: 328,
    bound: "month",
    prior: { places: 1200, matched: 700, with_email: 406 },
    priorOf: "personal_trainer",
    cannotSee: [],
    renewsOn: "Oct 1",
    nearby: [],
  });
  // The turn's own moment, never the server's: the month and the day it renews
  // are the business's (lead_month).
  const nextYear = newToolContext({ supabase: fakeDb(world(), {}, DOORS), userId: "u1", email: "ada@example.com", params: {} }, A, "owner", "America/Chicago", new Date("2026-12-20T15:00:00Z"));
  const december = await buildProposal(nextYear, "propose_lead_search", MODEL_INPUT);
  assert.equal(december.proposal.payload.facts.renewsOn, "Jan 1, 2027");
  assert.equal(december.proposal.payload.facts.leadsLeft, 500, "a month with no counter of its own has the whole allowance");
  // A kind nobody has searched carries no prior, and the card says so itself.
  const fresh = newToolContext({ supabase: fakeDb(world(), {}, { ...DOORS, lead_niche_prior: () => null }), userId: "u1", email: "ada@example.com", params: {} }, A, "owner", "America/Chicago", NOW);
  const unknown = await buildProposal(fresh, "propose_lead_search", MODEL_INPUT);
  assert.deepEqual([unknown.proposal.payload.facts.prior, unknown.proposal.payload.facts.priorOf], [null, null]);
});

test("the planner's refusals are words for the model to say, and no card", async () => {
  const t = toolContext({ role: "owner", tables: world() });
  const out = await buildProposal(t, "propose_lead_search", { ...MODEL_INPUT, country: "CA", region: "ON" });
  assert.deepEqual([out.proposal, out.isError], [null, true]);
  assert.match(JSON.parse(out.result).error, /I can only find businesses in the US for now/);
  const op = await buildProposal(toolContext({ role: "operator", tables: world() }), "propose_lead_search", MODEL_INPUT);
  assert.match(JSON.parse(op.result).error, /only an owner can start a lead search/);
  const people = await buildProposal(t, "propose_lead_search", { ...MODEL_INPUT, looking_for: "people" });
  assert.match(JSON.parse(people.result).error, /I find businesses, not people at home/);
  assert.equal(people.proposal, null);
  const sellers = await buildProposal(t, "propose_lead_search", { ...MODEL_INPUT, looking_for: "online_sellers" });
  assert.match(JSON.parse(sellers.result).error, /I can find local businesses for now/);
});

test("list_lead_searches says what was asked, in the owner's words, and how each ended", async () => {
  const s = JSON.parse((await runTool(toolContext({ role: "viewer", tables: world() }), { name: "list_lead_searches", input: {} })).result);
  assert.deepEqual(Object.keys(s.searches[0]).sort(), ["asked", "asked_on", "counted", "ending", "id", "name", "qualified", "review", "state"]);
  assert.ok(s.searches.every((x) => Object.values(x).every((v) => typeof v !== "string" || v.length <= 120)));
  // Newest first, the ending in words, and a round still going has none.
  assert.deepEqual(s.searches.map((x) => x.id), [SEARCH2, SEARCH]);
  assert.equal(s.searches[1].ending, LEAD_ENDING_WORDS.target_reached);
  assert.equal(s.searches[0].ending, null);
  assert.equal(s.searches[0].state, "running");
});

test("the card commits to POST lead-searches marked as Ask's, and its undo stops the search", async () => {
  const { client, calls } = fakeClient({ "POST /api/v1/lead-searches": { search_id: SEARCH, round_id: ROUND }, [`POST /api/v1/lead-searches/${SEARCH}/stop`]: { ok: true } });
  const done = await commitProposal(win, { id: "p1", kind: "lead_search", needs: "owner", title: "Find 200 personal trainers", summary: "…", payload: { plan: PLAN }, undo: "Stop the search" }, client);
  assert.deepEqual([done.ok, done.receipt, done.undo], [true, "Finding 200 personal trainers. It carries on if you leave; Leads shows it.", { search_id: SEARCH }]);
  assert.equal(calls[0].headers["x-via"], "ask");
  assert.deepEqual(calls[0].body, PLAN, "the plan the owner approved is what is posted");
  const undone = await undoProposal(win, { kind: "lead_search" }, { state: "done", receipt: done.receipt, atMs: Date.now(), undo: done.undo }, client);
  assert.deepEqual([undone.ok, undone.receipt], [true, "Stopping. Whatever it found is kept, and the emails already found are still checked."]);
});
