/**
 * An Ask card's write runs once (the scorecard, 29 September: "a broadcast or playbook card approved in two tabs runs
 * twice"). The card's commit names its proposal id as its idempotency key and says it is Ask's (x-via); the write door
 * (server/route.ts onceForCard) claims the key under the `card:` prefix on the first press, keeps the answer there, and
 * gives a second press, from any tab, that answer without running the write again. Run over a write route declared for
 * the test and a database in memory; the key ledger's own claims are proved in idempotency-claim.db.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { write, workspace } = await import(at("apps/dashboard/src/server/route.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";

/** A write that counts its runs, may wait, and may fail: a card's route. */
function route({ wait = 0, fail = false } = {}) {
  const runs = { n: 0 };
  const r = write({
    scope: workspace,
    role: "operator",
    rate: null,
    input: z.object({}),
    handle: async () => {
      runs.n += 1;
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      if (fail && runs.n === 1) throw new Error("the write failed");
      return { ok: true, run: runs.n };
    },
  });
  return { r, runs };
}
const world = () => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "a" }, created_at: "2026-01-01T00:00:00Z" },
    { user_id: USER, tenant_id: B, role: "operator", tenants: { slug: "b" }, created_at: "2026-02-01T00:00:00Z" },
  ],
  idempotency_keys: [],
});
const press = (r, tables, key, { via = "ask", tenant = A } = {}) =>
  r.run(
    new Request(`http://localhost/api/v1/x?workspace=${tenant}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { "idempotency-key": key } : {}),
        ...(via ? { "x-via": via } : {}),
      },
      body: "{}",
    }),
    { supabase: fakeDb(tables), userId: USER, email: "ada@example.com", params: {} },
  );

test("a second press of a card is given the first's answer and runs nothing; another card is another write", async () => {
  const { r, runs } = route();
  const tables = world();
  const first = await press(r, tables, "p-1");
  const second = await press(r, tables, "p-1");
  assert.deepEqual(first, { ok: true, run: 1 });
  assert.deepEqual(second, first, "the answer kept under the card's key");
  assert.equal(runs.n, 1, "REGRESSION: a card approved twice wrote twice");
  assert.deepEqual(
    tables.idempotency_keys.map((k) => k.key),
    ["card:p-1"],
    "kept apart from a route's own use of a key",
  );
  assert.deepEqual(await press(r, tables, "p-2"), { ok: true, run: 2 });
  // A workspace's card key is its own.
  assert.deepEqual(await press(r, tables, "p-1", { tenant: B }), { ok: true, run: 3 });
});

test("a press that arrives while the first is still running is refused in words, and once the first ends the card answers as kept", async () => {
  const { r, runs } = route({ wait: 30 });
  const tables = world();
  const [a, b] = await Promise.allSettled([press(r, tables, "p-1"), press(r, tables, "p-1")]);
  assert.equal(a.status, "fulfilled");
  assert.equal(b.status, "rejected");
  assert.equal(b.reason.code, "conflict");
  assert.match(b.reason.message, /This card is being approved already/);
  assert.equal(runs.n, 1);
  assert.deepEqual(await press(r, tables, "p-1"), { ok: true, run: 1 });
  assert.equal(runs.n, 1);
});

test("a write that fails lets the key go, so pressing again tries again", async () => {
  const { r, runs } = route({ fail: true });
  const tables = world();
  await assert.rejects(press(r, tables, "p-1"), /the write failed/);
  assert.deepEqual(tables.idempotency_keys, [], "no claim is left holding a card that did nothing");
  assert.deepEqual(await press(r, tables, "p-1"), { ok: true, run: 2 });
  assert.equal(runs.n, 2);
});

test("only a card's key is claimed: no x-via, no key, or a key that is too long to be a card's runs as it always has", async () => {
  const { r, runs } = route();
  const tables = world();
  await press(r, tables, "p-1", { via: null });
  await press(r, tables, "p-1", { via: null });
  await press(r, tables, null);
  await press(r, tables, null);
  await press(r, tables, "k".repeat(121));
  await press(r, tables, "k".repeat(121));
  assert.equal(runs.n, 6, "every one ran");
  assert.deepEqual(tables.idempotency_keys, []);
});
