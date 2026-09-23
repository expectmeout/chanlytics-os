/**
 * Reports' Deals numbers (0004), executed over a database in memory: one
 * cohort -- the proposals sent in the period and what became of them -- and
 * the stock, clients now with their monthly total. Null where the table
 * cannot be read, so the section is not drawn and the report stands.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { dealReport } = await import(at("apps/dashboard/src/server/deals.ts"));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-09-23T16:00:00.000Z");
const DAY = 86_400_000;
const iso = (days) => new Date(NOW.getTime() - days * DAY).toISOString();
const ctxFor = (tables) => ({ supabase: fakeDb(tables), userId: "u1", email: "ada@example.com", params: {} });

const deal = (id, over = {}) => ({
  id,
  tenant_id: T,
  contact_id: `k-${id}`,
  service: "Ad management",
  stage: "proposed",
  proposed_at: iso(3),
  decided_at: null,
  ended_at: null,
  amount_cents: null,
  per: null,
  currency: "USD",
  note: null,
  source: "person",
  version: 1,
  created_at: iso(3),
  ...over,
});

test("the period's cohort by when the proposal went, and the stock of clients now with their monthly total", async () => {
  const deals = [
    deal("d1"), // proposed 3 days ago: sent, still waiting
    deal("d2", { stage: "won", proposed_at: iso(10), decided_at: iso(8), amount_cents: 250_000, per: "month" }),
    deal("d3", { stage: "lost", proposed_at: iso(40), decided_at: iso(35) }), // before the period: not in the cohort
  ];
  assert.deepEqual(await dealReport(ctxFor({ deals }), T, 30, NOW), {
    any: true,
    sent: 2,
    won: 1,
    lost: 0,
    waiting: 1,
    clients: 1,
    monthly_cents: 250_000,
  });
});

test("a year is twelve months, once is not a month, an ended engagement was won in its cohort and is not a client now", async () => {
  const deals = [
    deal("y", { stage: "won", proposed_at: iso(5), decided_at: iso(4), amount_cents: 120_000, per: "year" }),
    deal("o", { stage: "won", proposed_at: iso(5), decided_at: iso(4), amount_cents: 99_900, per: "once" }),
    deal("n", { stage: "won", proposed_at: iso(5), decided_at: iso(4), amount_cents: null, per: null }),
    deal("e", {
      stage: "ended",
      proposed_at: iso(6),
      decided_at: iso(5),
      ended_at: iso(1),
      amount_cents: 50_000,
      per: "month",
    }),
    deal("l", { stage: "lost", proposed_at: iso(2), decided_at: iso(1) }),
  ];
  assert.deepEqual(await dealReport(ctxFor({ deals }), T, 7, NOW), {
    any: true,
    sent: 5,
    won: 4,
    lost: 1,
    waiting: 0,
    clients: 3,
    monthly_cents: 10_000,
  });
});

test("nothing ever recorded reads as none, and another workspace's deals are not this one's", async () => {
  assert.deepEqual(await dealReport(ctxFor({ deals: [] }), T, 30, NOW), {
    any: false,
    sent: 0,
    won: 0,
    lost: 0,
    waiting: 0,
    clients: 0,
    monthly_cents: 0,
  });
  const theirs = await dealReport(ctxFor({ deals: [deal("x", { tenant_id: OTHER, stage: "won" })] }), T, 30, NOW);
  assert.equal(theirs.any, false);
});
