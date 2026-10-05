/**
 * An invoice keeps what it moved (00300, K8): the Stripe door keeps what an invoice event moved, on the event's own
 * ledger row, once; writes nothing it cannot validate; keeps a real zero (a trial's first invoice moved nothing, and
 * that is what it moved); and the ledger's own floor refuses a bad value written any other way. The door is the service
 * role's alone.
 *
 * Runs against the local stack only: this suite writes the Stripe ledger, and deletes the rows it wrote.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes the Stripe ledger"
      : false;

const stamp = Date.now().toString(36);
let db;
const ids = [];
const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
/** One delivery's ledger row, as the claim leaves it. */
async function event(n, type = "invoice.paid") {
  const id = `evt_k8_${stamp}_${n}`;
  ids.push(id);
  ok(await db.from("billing_events").insert({ id, type }), `event ${n}`);
  return id;
}
const keep = (id, cents, currency) =>
  db.rpc("billing_event_keep_amount", { p_id: id, p_amount_cents: cents, p_currency: currency });
const row = async (id) =>
  ok(await db.from("billing_events").select("amount_cents, currency, state").eq("id", id).single(), "row");

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});
after(async () => {
  if (skip) return;
  for (const id of ids) await db.from("billing_events").delete().eq("id", id);
});

test("an invoice's amount and currency are kept on its event once; the first answer stands", { skip }, async () => {
  const id = await event(1);
  assert.deepEqual(
    await row(id),
    { amount_cents: null, currency: null, state: "applied" },
    "a row from before reads absent",
  );
  assert.equal(ok(await keep(id, 4900, "usd")), true);
  assert.deepEqual(await row(id), { amount_cents: 4900, currency: "usd", state: "applied" });
  assert.equal(ok(await keep(id, 7000, "eur")), false, "a second answer is not kept");
  assert.equal(ok(await keep(id, 4900, "usd")), false);
  assert.deepEqual(await row(id), { amount_cents: 4900, currency: "usd", state: "applied" });
});

test("a real zero is kept: a trial's first invoice moved nothing, and that is what it moved", { skip }, async () => {
  const id = await event(2);
  assert.equal(ok(await keep(id, 0, "usd")), true);
  assert.deepEqual(await row(id), { amount_cents: 0, currency: "usd", state: "applied" });
});

test(
  "what cannot be validated is not written: no amount, a negative, no currency, capitals, two letters, four, a symbol, an id that is no event's",
  { skip },
  async () => {
    const id = await event(3, "invoice.payment_failed");
    for (const [cents, currency] of [
      [null, "usd"],
      [-1, "usd"],
      [100, null],
      [100, "USD"],
      [100, "us"],
      [100, "usdx"],
      [100, "12$"],
    ])
      assert.equal(ok(await keep(id, cents, currency), `${cents} ${currency}`), false, `${cents} ${currency}`);
    assert.equal(ok(await keep(`evt_k8_${stamp}_nobody`, 100, "usd")), false);
    assert.deepEqual(await row(id), { amount_cents: null, currency: null, state: "applied" });
    assert.ok(
      (await keep(id, 2147483648, "usd")).error,
      "an amount an integer cannot hold is the database's refusal, which the edge logs",
    );
    assert.deepEqual(await row(id), { amount_cents: null, currency: null, state: "applied" });
  },
);

test("the ledger's own floor refuses a bad value written any other way", { skip }, async () => {
  const id = await event(4);
  assert.equal((await db.from("billing_events").update({ amount_cents: -1 }).eq("id", id)).error?.code, "23514");
  assert.equal((await db.from("billing_events").update({ currency: "USD" }).eq("id", id)).error?.code, "23514");
});

test("the door is the service role's alone", { skip: skip || (!ANON && "no SUPABASE_ANON_KEY in env") }, async () => {
  const id = await event(5);
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  assert.ok(
    (await anon.rpc("billing_event_keep_amount", { p_id: id, p_amount_cents: 100, p_currency: "usd" })).error,
    "refused",
  );
  assert.deepEqual(await row(id), { amount_cents: null, currency: null, state: "applied" });
});
