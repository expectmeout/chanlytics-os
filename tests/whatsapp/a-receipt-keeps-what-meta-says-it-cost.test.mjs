/**
 * What Meta says a message cost to send (the Reports lenses spec, K8): its pricing is read as Meta documents it and
 * nothing else of it is kept, and the receipts of one delivery land as they always did with the cost kept beside the
 * status, in its own guard: a database that refuses the cost costs the receipt nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { waPricingOf } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";
import { logLineOf } from "../_log-lines.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const { recordReceipts } = await import(at("apps/edge/lib/whatsapp/receipts.ts"));

const T = "aaaaaaaa-0000-4000-8000-0000000000c1";
const PRICING = { billable: true, pricing_model: "PMP", category: "utility", type: "regular" };

test("Meta's pricing is kept as Meta says it, in the words it documents, and nothing else: no amount, no currency, no key of ours", () => {
  assert.deepEqual(waPricingOf(PRICING), PRICING);
  assert.deepEqual(
    waPricingOf({ billable: false, pricing_model: "PMP", category: "service", type: "free_customer_service" }),
    { billable: false, pricing_model: "PMP", category: "service", type: "free_customer_service" },
  );
  assert.deepEqual(waPricingOf({ billable: true, pricing_model: "CBP", category: "authentication-international" }), {
    billable: true,
    pricing_model: "CBP",
    category: "authentication-international",
  });
  assert.deepEqual(waPricingOf({ category: "marketing_lite" }), { category: "marketing_lite" });
  assert.deepEqual(
    waPricingOf({ billable: true, category: "utility", amount: 0.0136, currency: "USD", note: "x" }),
    { billable: true, category: "utility" },
    "Meta sends no amount; if one ever came it is not ours to keep",
  );
});

test("what is not a pricing is none, and a bad key costs only itself: no object, no known key, a sentence, a control character, a megabyte, a billable that is a word", () => {
  for (const bad of [
    undefined,
    null,
    "utility",
    7,
    [],
    [{ category: "utility" }],
    {},
    { amount: 1 },
    { category: "two words" },
    { category: "a;b" },
    { category: "x".repeat(41) },
    { category: "\u0000" },
    { category: "x".repeat(1_000_000) },
    { billable: "true" },
    { category: 5 },
  ])
    assert.equal(waPricingOf(bad), null, `${JSON.stringify(bad)?.slice(0, 40)}`);
  assert.deepEqual(waPricingOf({ billable: "true", category: "utility" }), { category: "utility" });
});

test("the category is the key the cost is priced by, so a pricing without a valid one is none: the cost door would refuse it, and the edge says so first", () => {
  for (const bad of [
    { billable: true },
    { billable: true, pricing_model: "PMP", type: "regular" },
    { billable: true, category: "two words", pricing_model: "PMP" },
  ])
    assert.equal(waPricingOf(bad), null, JSON.stringify(bad));
});

/** Three messages of one workspace, the door's database, and the cost door as the database models it. */
function world(over = {}) {
  const tables = {
    messages: ["queued", "sent", "sent"].map((status, i) => ({
      id: `m${i + 1}`,
      tenant_id: T,
      external_id: `wamid.${i + 1}`,
      status,
      direction: "outbound",
      meta: {},
    })),
  };
  const kept = [];
  const db = fakeDb(
    tables,
    {},
    {
      message_keep_cost: (a) => {
        if (over.refuse) throw new Error("function message_keep_cost does not exist");
        kept.push([a.p_tenant_id, a.p_external_id, a.p_pricing]);
        return true;
      },
    },
  );
  return { tables, db, kept };
}
const receipt = (id, status, over = {}) => ({ id, status, recipient_id: "15550139999", ...over });
async function logged(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...args) => lines.push(args);
  try {
    return { result: await fn(), lines };
  } finally {
    Object.assign(console, real);
  }
}
const events = (lines) =>
  lines
    .map(logLineOf)
    .filter(Boolean)
    .map((l) => l.event);

test("receipts land as they always did, a failure with what Meta said, and a receipt that carries a pricing has it kept beside its status", async () => {
  const w = world();
  const errors = [{ code: 131047, title: "Re-engagement message", message: "Re-engagement message" }];
  await recordReceipts(w.db, T, [
    receipt("wamid.1", "sent", { pricing: PRICING }),
    receipt("wamid.2", "delivered"),
    receipt("wamid.3", "failed", { errors }),
    receipt("wamid.1", "deleted"),
  ]);
  assert.deepEqual(
    w.tables.messages.map((m) => m.status),
    ["sent", "delivered", "failed"],
  );
  assert.deepEqual(w.tables.messages[2].error, { errors }, "a failure keeps what Meta said about it");
  assert.ok(!("error" in w.tables.messages[1]), "and a receipt without errors writes none");
  assert.deepEqual(w.kept, [[T, "wamid.1", PRICING]]);
});

test("the cost is asked after the status has landed, never before it, and only the words Meta documents travel", async () => {
  const w = world();
  await recordReceipts(w.db, T, [
    receipt("wamid.1", "sent", { pricing: { ...PRICING, amount: 0.0136, currency: "USD", note: "x" } }),
  ]);
  assert.deepEqual(
    w.db.seen.map((q) => q.rpc ?? `${q.table}.${q.op}`),
    ["messages.update", "message_keep_cost"],
  );
  assert.deepEqual(w.kept, [[T, "wamid.1", PRICING]]);
});

test("a receipt with no pricing, or a pricing that is nothing, keeps nothing", async () => {
  const w = world();
  await recordReceipts(w.db, T, [
    receipt("wamid.1", "delivered"),
    receipt("wamid.2", "read", { pricing: {} }),
    receipt("wamid.3", "sent", { pricing: "utility" }),
  ]);
  assert.deepEqual(w.kept, []);
  assert.deepEqual(
    w.tables.messages.map((m) => m.status),
    ["delivered", "read", "sent"],
  );
});

test("a pricing that is not one is said on the log and the cost door is not asked, because its answer cannot tell a pricing refused from one already kept; no pricing says nothing", async () => {
  const w = world();
  const { lines } = await logged(() =>
    recordReceipts(w.db, T, [
      receipt("wamid.1", "delivered"),
      receipt("wamid.2", "read", { pricing: { billable: true } }),
      receipt("wamid.3", "sent", { pricing: "utility" }),
    ]),
  );
  assert.deepEqual(w.kept, []);
  assert.deepEqual(
    w.db.seen.filter((q) => q.rpc),
    [],
    "the cost door was not called",
  );
  assert.deepEqual(
    events(lines).filter((e) => e !== "wa_status"),
    ["wa_pricing_dropped", "wa_pricing_dropped"],
  );
  const dropped = lines.map(logLineOf).filter((l) => l?.event === "wa_pricing_dropped");
  assert.deepEqual(dropped.map((l) => l.id).sort(), ["wamid.2", "wamid.3"], "each says whose pricing it was");
  assert.ok(!JSON.stringify(dropped).includes("utility"), "and keeps none of what was dropped");
});

test("a database that refuses the cost costs the receipt nothing: its status has landed, nothing is thrown, and one line per lost cost says so", async () => {
  const w = world({ refuse: true });
  const { lines } = await logged(() =>
    recordReceipts(w.db, T, [
      receipt("wamid.1", "sent", { pricing: PRICING }),
      receipt("wamid.2", "delivered", { pricing: PRICING }),
    ]),
  );
  assert.deepEqual(
    w.tables.messages.map((m) => m.status),
    ["sent", "delivered", "sent"],
  );
  assert.deepEqual(
    events(lines).filter((e) => e.startsWith("pg_")),
    ["pg_cost_failed", "pg_cost_failed"],
  );
});

test("with no database or no workspace nothing is written, and every receipt is still said on the log", async () => {
  const w = world();
  const all = [receipt("wamid.1", "sent", { pricing: PRICING }), receipt("wamid.9", "deleted")];
  const { lines } = await logged(async () => {
    await recordReceipts(null, T, all);
    await recordReceipts(w.db, null, all);
  });
  assert.deepEqual(events(lines), ["wa_status", "wa_status", "wa_status", "wa_status"]);
  assert.deepEqual([w.kept, w.tables.messages.map((m) => m.status)], [[], ["queued", "sent", "sent"]]);
});
