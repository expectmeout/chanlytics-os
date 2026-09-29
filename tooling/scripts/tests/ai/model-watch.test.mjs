/**
 * The failure-rate alarm (change 9): the health sweep asks the ledger which workspaces' model calls or receptionist turns
 * failed five times in the last hour, pages the platform once a window for each (never a customer, never
 * a message), and keeps the ledger to its 400 days. Over a database in memory and a pager that sends nowhere; the SQL
 * itself (ai_failures_hour, ai_usage_purge) is proved on a real Postgres in ai-usage.db.test.mjs.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { at, withEnv } from "../_cron-doors-world.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const { watchModels } = await import(at("apps/edge/lib/ops/model-watch.ts"));
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
after(() => setPg(null));

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const CUSTOMER = "Rosa Example, +15550100142, asked about a refund";

/** A pager that keeps what it was asked to send. */
function pager() {
  const sent = [];
  let clock = Date.parse("2026-09-29T15:00:00Z");
  return {
    sent,
    send: async (from, to, subject, body) => (sent.push({ from, to, subject, body }), true),
    now: () => clock,
    tick: (ms) => (clock += ms),
  };
}
const world = (failures, purged = 0, faults = {}) => {
  // What the ledger's rollup returns is the counts alone: a customer's words are in no row of it.
  const tables = { operator_pages: [] };
  const rpcs = {
    ai_failures_hour: () => failures,
    ai_usage_purge: () => purged,
  };
  return { tables, db: fakeDb(tables, faults, rpcs) };
};
const ADDRESSED = { LEAD_TO: "ops@example.com", LEAD_FROM: "alerts@example.com" };

test("a workspace over the line is paged once, in words that name the workspace and the counts and no customer", async () => {
  // A row that carried a customer's words (it never does) would still not put them in the page: only the counts are read.
  const w = world([{ tenant_id: A, failed_calls: 4, brain_errors: 3, last_text: CUSTOMER }], 12);
  const p = pager();
  const out = await withEnv(ADDRESSED, () => watchModels(w.db, { send: p.send, now: p.now }));
  assert.deepEqual(out, { paged: 1, purged: 12 });
  assert.equal(p.sent.length, 1);
  // A failed turn is both a call with no answer and a holding reply, so the larger count is what the page says.
  assert.match(
    p.sent[0].subject,
    /^\[Chanlytics\] The receptionist's model failed 4 times in an hour in one workspace$/,
  );
  assert.ok(
    p.sent[0].body.includes(`Workspace ${A}: 4 model calls got no answer or no usable one, and 3 receptionist turns`),
  );
  assert.ok(!p.sent[0].body.includes(CUSTOMER) && !/\+\d{10}/.test(p.sent[0].body), "no customer in a page");
  // The ledger was asked with the line, and the purge with its keep.
  assert.deepEqual(
    w.db.seen.filter((q) => q.rpc).map((q) => [q.rpc, q.args]),
    [
      ["ai_failures_hour", { p_min: 5 }],
      ["ai_usage_purge", { p_keep: "400 days" }],
    ],
  );
});

test("the same storm is not paged again inside the pager's window, and another workspace's is its own page", async () => {
  const w = world([
    { tenant_id: A, failed_calls: 6, brain_errors: 0 },
    { tenant_id: B, failed_calls: 5, brain_errors: 1 },
  ]);
  const p = pager();
  const tick = () => withEnv(ADDRESSED, () => watchModels(w.db, { send: p.send, now: p.now }));
  await tick();
  assert.equal(p.sent.length, 2, "one page each");
  p.tick(30 * 60_000);
  await tick();
  assert.equal(p.sent.length, 2, "the next tick, half an hour on, says nothing more");
  p.tick(6 * 3_600_000);
  await tick();
  assert.equal(p.sent.length, 4, "past the window it says so again");
});

test("nothing over the line pages nobody, and a ledger that cannot be read or purged is logged and never stops the sweep", async () => {
  const quiet = world([], 0);
  const p = pager();
  assert.deepEqual(await withEnv(ADDRESSED, () => watchModels(quiet.db, { send: p.send, now: p.now })), {
    paged: 0,
    purged: 0,
  });
  assert.equal(p.sent.length, 0);

  const broken = world([], 0);
  const failing = fakeDb(
    broken.tables,
    {},
    {
      ai_failures_hour: () => {
        throw new Error("the ledger is down");
      },
      ai_usage_purge: () => {
        throw new Error("the purge is down");
      },
    },
  );
  const lines = [];
  const real = console.error;
  console.error = (...a) => lines.push(a.join(" "));
  try {
    assert.deepEqual(await withEnv(ADDRESSED, () => watchModels(failing, { send: p.send, now: p.now })), {
      paged: 0,
      purged: 0,
    });
  } finally {
    console.error = real;
  }
  assert.ok(
    lines.some((l) => l.includes("model_failures_unreadable")) &&
      lines.some((l) => l.includes("ai_usage_purge_failed")),
  );
});

test("a page that cannot be sent is logged and the next workspace is still paged; only pages that went out are counted", async () => {
  const w = world([
    { tenant_id: A, failed_calls: 9, brain_errors: 0 },
    { tenant_id: B, failed_calls: 6, brain_errors: 0 },
  ]);
  const p = pager();
  let n = 0;
  const flaky = async (...args) => {
    n += 1;
    if (n === 1) throw new Error("the pager is down");
    return p.send(...args);
  };
  const lines = [];
  const real = console.error;
  console.error = (...a) => lines.push(a.join(" "));
  try {
    const out = await withEnv(ADDRESSED, () => watchModels(w.db, { send: flaky, now: p.now }));
    assert.equal(out.paged, 1, "one went out; the one whose send threw is not counted");
  } finally {
    console.error = real;
  }
  assert.equal(p.sent.length, 1);
  assert.ok(p.sent[0].body.includes(B), "the second workspace was still paged");
  assert.ok(lines.some((l) => l.includes("operator_page_send_threw")));
  // A page held back in its window is not a page sent.
  const again = await withEnv(ADDRESSED, () => watchModels(w.db, { send: p.send, now: p.now }));
  assert.equal(
    again.paged,
    1,
    "the workspace whose page never went out is paged now; the one paged before is held back",
  );
});
