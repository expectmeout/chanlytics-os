/**
 * GET usage (change 11): an owner reads their workspace's month of metered use from the kept ledger: every model call
 * with its tokens and list-price dollars, each call's seconds, each WhatsApp conversation, and the totals. Run over a
 * database in memory that answers the rollup (ai_usage_month, 00273) as Postgres does; the SQL is proved on a real
 * Postgres in ai-usage.db.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const route = await import(at("apps/dashboard/app/api/v1/usage/route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
setRateStore(memoryStore());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const req = (q = "") => new Request(`http://localhost/api/v1/usage${q}`);
const line = (over) => ({
  meter: "model",
  purpose: "receptionist",
  model: "claude-opus-5",
  uses: 10,
  quantity: 15_000,
  input_tokens: 10_000,
  output_tokens: 2_000,
  cache_read_tokens: 2_500,
  cache_write_tokens: 500,
  usd: 0.15,
  ...over,
});
const ctxFor = (role, rows, seen = []) => ({
  supabase: fakeDb(
    {
      memberships: [
        { user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
      ],
    },
    {},
    {
      ai_usage_month: (args) => {
        seen.push(args);
        return rows;
      },
    },
  ),
  userId: USER,
  email: "ada@example.com",
  params: {},
});

test("an owner reads the month: each line by meter, purpose and model, and the totals an invoice would take", async () => {
  const seen = [];
  const rows = [
    line({}),
    line({ purpose: "ask", model: "claude-opus-5-5", uses: 4, quantity: 8_000, usd: 0.09 }),
    line({ purpose: "reply_read", model: "claude-haiku-4-5-20251001", uses: 6, quantity: 600, usd: null }),
    line({ meter: "voice_seconds", purpose: null, model: null, uses: 2, quantity: 305, usd: null }),
    line({ meter: "wa_conversation", purpose: null, model: null, uses: 3, quantity: 3, usd: null }),
  ];
  const r = await route.GET.run(req(`?month=2026-09&workspace=${A}`), ctxFor("owner", rows, seen));
  assert.deepEqual(
    seen,
    [{ p_tenant_id: A, p_month: "2026-09-01" }],
    "the workspace's own month, asked of the ledger's rollup",
  );
  assert.equal(r.month, "2026-09");
  assert.equal(r.lines.length, 5);
  assert.equal(r.model_usd, 0.24, "the priced calls' dollars, summed; a call with no price adds none");
  assert.deepEqual([r.model_calls, r.model_tokens], [20, 23_600], "the calls and every kind of token");
  assert.equal(r.voice_seconds, 305);
  assert.equal(r.wa_conversations, 3);
});

test("with no month it is this month, a bad month is refused, and a month with nothing in it says zero and not nothing", async () => {
  const seen = [];
  const empty = await route.GET.run(req(`?workspace=${A}`), ctxFor("owner", [], seen));
  assert.equal(seen[0].p_month, `${new Date().toISOString().slice(0, 7)}-01`);
  assert.deepEqual(
    [empty.model_usd, empty.model_calls, empty.model_tokens, empty.voice_seconds, empty.wa_conversations, empty.lines],
    [null, 0, 0, 0, 0, []],
    "no dollar is invented for a month with no priced call",
  );
  await assert.rejects(route.GET.run(req(`?month=2026-13&workspace=${A}`), ctxFor("owner", [])));
  await assert.rejects(route.GET.run(req(`?month=September&workspace=${A}`), ctxFor("owner", [])));
});

test("it is the owner's alone: what a workspace costs is not an operator's or a viewer's to read", async () => {
  for (const role of ["operator", "viewer"]) {
    await assert.rejects(
      route.GET.run(req(`?month=2026-09&workspace=${A}`), ctxFor(role, [line({})])),
      (e) => e.status === 403,
      role,
    );
  }
});
