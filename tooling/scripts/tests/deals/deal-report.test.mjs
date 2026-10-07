/**
 * Reports' Deals numbers (0004, 0008), executed over a database in memory: one cohort -- the proposals sent in the
 * period and what became of them, how long its yeses took, where its new clients came from and why its passes passed
 * -- and the stock beside it, the clients now with their monthly total and every proposal still open. Where a client
 * came from is read from the People rows the route hands in, never a second read. Drawn only where deals are on
 * (0008), the answer the route hands in. Null where the table cannot be read, so the section is not drawn and the
 * report stands. Every case asserts the whole object.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { dealReport } = await import(at("apps/dashboard/src/server/people/deals.ts"));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-09-23T16:00:00.000Z");
const DAY = 86_400_000;
const HOUR = 3_600_000;
const iso = (days) => new Date(NOW.getTime() - days * DAY).toISOString();
const ctxFor = (tables, faults = {}) => ({
  supabase: fakeDb(tables, faults),
  userId: "u1",
  email: "ada@example.com",
  params: {},
});

/** A deals row as the table holds it (00156, 00160). */
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
  proposal_url: null,
  valid_until: null,
  lost_reason: null,
  version: 1,
  created_at: iso(3),
  ...over,
});
/** The People row's two columns the report reads (people_list's id and came_from, 00138). */
const person = (id, came_from) => ({ id: `k-${id}`, came_from });

/** The report where there is nothing to draw: deals off, or none ever recorded. */
const NONE = {
  any: false,
  sent: 0,
  won: 0,
  lost: 0,
  waiting: 0,
  clients: 0,
  monthly_cents: 0,
  median_days_to_yes: null,
  open: { count: 0, amounts: [] },
  sources: [],
  reasons: [],
};

test("the period's cohort and what became of it, how long its yeses took, where its clients came from, why its passes passed, and the stock beside it", async () => {
  const deals = [
    // The cohort: proposed in the last 30 days.
    deal("d1", { amount_cents: 120_000, per: "once" }), // 3 days ago: still waiting, and open
    deal("d2", { stage: "won", proposed_at: iso(10), decided_at: iso(8), amount_cents: 250_000, per: "month" }),
    deal("d4", { stage: "won", proposed_at: iso(20), decided_at: iso(10.5), amount_cents: 120_000, per: "year" }),
    deal("d5", {
      stage: "ended",
      proposed_at: iso(25),
      decided_at: iso(12),
      ended_at: iso(2),
      amount_cents: 50_000,
      per: "month",
    }),
    deal("d6", { stage: "lost", proposed_at: iso(15), decided_at: iso(12), lost_reason: "price" }),
    deal("d7", { stage: "lost", proposed_at: iso(14), decided_at: iso(13), lost_reason: "timing" }),
    deal("d8", { stage: "lost", proposed_at: iso(5), decided_at: iso(4), lost_reason: "price" }),
    // Before the period: never the cohort's, though an open one is still open.
    deal("d9", { proposed_at: iso(60), amount_cents: 305_000, per: "once" }),
    deal("d10", { proposed_at: iso(45), amount_cents: 60_000, per: "month" }),
    deal("d11", { proposed_at: iso(50) }),
    deal("d12", { stage: "lost", proposed_at: iso(40), decided_at: iso(35), lost_reason: "elsewhere" }),
    deal("d13", { stage: "won", proposed_at: iso(90), decided_at: iso(80), amount_cents: 30_000, per: "month" }),
  ];
  const people = [
    person("d1", "sms"),
    person("d2", "lead"),
    person("d4", "lead"),
    person("d5", "whatsapp"),
    person("d13", "calendar"),
  ];
  assert.deepEqual(await dealReport(ctxFor({ deals }), T, 30, true, people, NOW), {
    any: true,
    sent: 7,
    won: 3,
    lost: 3,
    waiting: 1,
    // Running now, whenever they said yes: d2, d4 and the older d13; d5 has ended.
    clients: 3,
    monthly_cents: 250_000 + 10_000 + 30_000,
    // 2, 9 and 13 whole days: d4's nine and a half is nine.
    median_days_to_yes: 9,
    open: {
      count: 4,
      amounts: [
        { amount_cents: 120_000, per: "once", currency: "USD" },
        { amount_cents: 305_000, per: "once", currency: "USD" },
        { amount_cents: 60_000, per: "month", currency: "USD" },
      ],
    },
    sources: [
      { came_from: "lead", count: 2 },
      { came_from: "whatsapp", count: 1 },
    ],
    reasons: [
      { reason: "price", count: 2 },
      { reason: "timing", count: 1 },
    ],
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
  assert.deepEqual(await dealReport(ctxFor({ deals }), T, 7, true, [], NOW), {
    ...NONE,
    any: true,
    sent: 5,
    won: 4,
    lost: 1,
    clients: 3,
    monthly_cents: 10_000,
    median_days_to_yes: 1,
  });
});

test("whole days from a proposal to its yes: part of a day is none, a client entered after the fact is no wait, an even count rounds its middle, a yes with no day is not counted", async () => {
  const won = (id, proposed, decided) => deal(id, { stage: "won", proposed_at: proposed, decided_at: decided });
  const at = (days, hours = 0) => new Date(NOW.getTime() - days * DAY + hours * HOUR).toISOString();
  const part = [won("a", at(6), at(6, 23))]; // 23 hours: under a day
  assert.equal((await dealReport(ctxFor({ deals: part }), T, 30, true, [], NOW)).median_days_to_yes, 0);
  // A yes dated before its proposal went, or put on file with it, is a client entered after the fact: no wait, so
  // no median of none (the pace reads the same rule, contracts yesWaits).
  const before = [won("b", at(6), at(7))]; // recorded a day before the proposal went
  assert.equal((await dealReport(ctxFor({ deals: before }), T, 30, true, [], NOW)).median_days_to_yes, null);
  const together = [won("b2", at(6), at(6, 0.2))]; // twelve minutes after
  const r2 = await dealReport(ctxFor({ deals: together }), T, 30, true, [], NOW);
  assert.deepEqual([r2.won, r2.median_days_to_yes], [1, null], "still a client of the cohort; not a wait");
  const even = [won("c", at(10), at(9)), won("d", at(10), at(8))]; // 1 and 2: the middle is 1.5
  assert.equal((await dealReport(ctxFor({ deals: even }), T, 30, true, [], NOW)).median_days_to_yes, 2);
  const undated = [won("e", at(10), null), won("f", at(10), at(4))];
  const r = await dealReport(ctxFor({ deals: undated }), T, 30, true, [], NOW);
  assert.deepEqual([r.won, r.median_days_to_yes], [2, 6], "both are clients; the one with a day is the median");
  const none = [deal("g", { stage: "lost", proposed_at: at(3), decided_at: at(2) })];
  assert.equal((await dealReport(ctxFor({ deals: none }), T, 30, true, [], NOW)).median_days_to_yes, null);
});

test("a client whose person says nothing, has left People or holds a value this build does not know is a client from no source; a tie keeps People's order", async () => {
  const deals = ["q", "gone", "odd", "t", "m"].map((id) =>
    deal(id, { stage: "won", proposed_at: iso(4), decided_at: iso(2) }),
  );
  const people = [person("q", null), person("odd", "fax"), person("t", "email"), person("m", "sms")];
  const r = await dealReport(ctxFor({ deals }), T, 30, true, people, NOW);
  assert.equal(r.won, 5);
  assert.deepEqual(r.sources, [
    { came_from: "sms", count: 1 },
    { came_from: "email", count: 1 },
  ]);
});

test("a pass with no reason, or one this build does not know, is a pass and no reason; a tie keeps the reasons' own order", async () => {
  const deals = [null, "moved away", "other", "timing"].map((lost_reason, i) =>
    deal(`p${i}`, { stage: "lost", proposed_at: iso(4), decided_at: iso(2), lost_reason }),
  );
  const r = await dealReport(ctxFor({ deals }), T, 30, true, [], NOW);
  assert.equal(r.lost, 4);
  assert.deepEqual(r.reasons, [
    { reason: "timing", count: 1 },
    { reason: "other", count: 1 },
  ]);
});

test("nothing ever recorded reads as none, and another workspace's deals are not this one's", async () => {
  assert.deepEqual(await dealReport(ctxFor({ deals: [] }), T, 30, true, [], NOW), NONE);
  const theirs = [
    deal("x", { tenant_id: OTHER, stage: "won", decided_at: iso(1), amount_cents: 250_000, per: "month" }),
  ];
  assert.deepEqual(await dealReport(ctxFor({ deals: theirs }), T, 30, true, [person("x", "lead")], NOW), NONE);
});

test("where deals are off the section is not drawn, whatever deals the table holds, and the table is not read", async () => {
  const ctx = ctxFor({ deals: [deal("d1", { stage: "won", amount_cents: 250_000, per: "month" })] });
  assert.deepEqual(await dealReport(ctx, T, 30, false, [person("d1", "lead")], NOW), NONE);
  assert.equal(ctx.supabase.seen.filter((q) => q.table === "deals").length, 0, "nothing read for a section not drawn");
});

test("a table that cannot be read is no report, so the section is not drawn and the rest of Reports stands", async () => {
  const ctx = ctxFor({ deals: [deal("d1")] }, { "deals.select": { message: 'column "lost_reason" does not exist' } });
  assert.equal(await dealReport(ctx, T, 30, true, [], NOW), null);
});
