/**
 * A Stripe event's claim, on a real Postgres (00194), under the edge's own
 * writers: the ledger row moves claimed → applied, and every move is a
 * compare-and-swap on the state it expects -- a forbidden or stale UPDATE
 * does not raise, so each one counts its rows. A claim inside its lease is
 * held (the door answers 503, never a 2xx); one whose lease has run out is
 * taken over, once, and the delivery that lost it cannot complete it; a
 * completed claim is a duplicate for ever; a delivery gives back only the
 * claim it holds; the state is a
 * closed set; and a row written the way the edge before 00194 wrote it reads
 * as applied.
 *
 * Runs against the database `supabase start` builds on this machine, never
 * production; skipped without one.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { keepEvent, completeEvent, forgetEvent, BILLING_EVENT_LEASE_MS } = await import(
  at("apps/edge/lib/billing/billing.ts")
);

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes the billing ledger"
      : false;

let db;
let tenantId;
const ids = [];
const evt = (tag) => {
  const id = `evt_claim_${tag}_${Date.now()}`;
  ids.push(id);
  return id;
};
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const ahead = (s) => new Date(Date.now() + s * 1000).toISOString();
async function rowOf(id) {
  const { data, error } = await db
    .from("billing_events")
    .select("state, lease_until, tenant_id, type")
    .eq("id", id)
    .maybeSingle();
  assert.equal(error, null, error?.message);
  return data;
}
async function age(id, leaseUntil) {
  const { error } = await db.from("billing_events").update({ lease_until: leaseUntil }).eq("id", id);
  assert.equal(error, null, error?.message);
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `claim-${Date.now()}`, name: "Claim" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  // The ledger outlives the workspace on purpose (ON DELETE SET NULL), so the rows go by name.
  if (ids.length) await db.from("billing_events").delete().in("id", ids);
  await db.from("tenants").delete().eq("id", tenantId);
});

test("a claim is taken once, held for its lease, completed once, and then a duplicate for ever", { skip }, async () => {
  const id = evt("once");
  const first = await keepEvent(db, id, "invoice.paid", tenantId);
  assert.equal(first.claim, "taken", "the first delivery takes the claim");
  const lease = first.lease;
  const left = Date.parse(lease) - Date.now();
  assert.ok(left > BILLING_EVENT_LEASE_MS - 10_000 && left <= BILLING_EVENT_LEASE_MS, `a lease of ${left} ms`);
  const held = await rowOf(id);
  assert.equal(held.state, "claimed");
  assert.equal(Date.parse(held.lease_until), Date.parse(lease), "the row holds the lease the delivery was handed");
  assert.equal(held.tenant_id, tenantId);
  assert.equal(held.type, "invoice.paid");

  assert.deepEqual(
    await keepEvent(db, id, "invoice.paid", tenantId),
    { claim: "held" },
    "inside the lease: held, and told to come back",
  );
  assert.equal((await rowOf(id)).lease_until, held.lease_until, "and the lease is not touched");

  assert.equal(await completeEvent(db, id, lease, tenantId), true, "the delivery that holds it completes it");
  assert.equal((await rowOf(id)).state, "applied");
  assert.equal(
    await completeEvent(db, id, lease, tenantId),
    false,
    "completed once: the second compare-and-swap matches nothing",
  );
  assert.deepEqual(await keepEvent(db, id, "invoice.paid", tenantId), { claim: "applied" }, "applied: a duplicate");

  await age(id, ago(3600));
  assert.deepEqual(
    await keepEvent(db, id, "invoice.paid", tenantId),
    { claim: "applied" },
    "for ever, whatever the lease says",
  );
  assert.equal((await rowOf(id)).state, "applied");
});

test(
  "a claim whose lease has run out is taken over once, and the delivery that lost it cannot complete it",
  { skip },
  async () => {
    const id = evt("orphan");
    const first = await keepEvent(db, id, "customer.subscription.paused", tenantId);
    assert.equal(first.claim, "taken");
    const lost = first.lease;
    // The delivery died after its claim; its lease runs out.
    await age(id, ago(1));

    const again = await keepEvent(db, id, "customer.subscription.paused", tenantId);
    assert.equal(again.claim, "taken", "the retry takes the claim over");
    const taken = again.lease;
    assert.notEqual(taken, lost, "under a lease of its own");
    const row = await rowOf(id);
    assert.equal(row.state, "claimed");
    assert.equal(Date.parse(row.lease_until), Date.parse(taken));
    assert.deepEqual(
      await keepEvent(db, id, "customer.subscription.paused", tenantId),
      { claim: "held" },
      "and holds it",
    );

    assert.equal(await completeEvent(db, id, lost, tenantId), false, "the dead delivery's lease completes nothing");
    assert.equal((await rowOf(id)).state, "claimed", "the retry's claim stands");
    assert.equal(await completeEvent(db, id, taken, tenantId), true);
    assert.equal((await rowOf(id)).state, "applied");
  },
);

test("a delivery gives back only the claim it holds", { skip }, async () => {
  const id = evt("back");
  const mine = await keepEvent(db, id, "invoice.payment_failed", tenantId);
  assert.equal(mine.claim, "taken");
  await forgetEvent(db, id, ahead(30));
  assert.ok(await rowOf(id), "a lease that is not this delivery's gives nothing back");
  await forgetEvent(db, id, mine.lease);
  assert.equal(await rowOf(id), null, "its own claim is gone, so the retry starts clean");
});

test("the state is a closed set, and a row written without one reads as applied", { skip }, async () => {
  const bad = await db
    .from("billing_events")
    .insert({ id: evt("held"), type: "invoice.paid", tenant_id: tenantId, state: "held" });
  assert.equal(bad.error?.code, "23514", "a state the CHECK does not name is refused");

  // The edge before 00194 wrote the id, the type and the workspace, and kept
  // the row only once it had acted on it: such a row is applied, and no lease.
  const id = evt("before");
  const { error } = await db.from("billing_events").insert({ id, type: "invoice.paid", tenant_id: tenantId });
  assert.equal(error, null, error?.message);
  const row = await rowOf(id);
  assert.equal(row.state, "applied");
  assert.equal(row.lease_until, null);
  assert.deepEqual(
    await keepEvent(db, id, "invoice.paid", tenantId),
    { claim: "applied" },
    "and it is a duplicate to the edge after it",
  );
});
