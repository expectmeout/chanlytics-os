/**
 * Queued work decides again at the moment it runs (the plan "Prove it works", lane 7, item 6; guarantee 6: consent taken
 * back while the work is queued is seen at the moment of sending).
 *
 * A send is written to the ledger when it is decided, and leaves later: seconds for a reply, days for a step of a
 * sequence. What was true when it was queued is not asked again by the ledger; it is asked again by the door, when the
 * job runs. Each case here queues a real job, changes the world while it waits, runs the real tick over it, and reads
 * what left: nothing, with the row saying why.
 *
 *   - a business that wrote back while its next cold email was queued is not written to again;
 *   - a person who said stop while a reply to them waited is not sent it;
 *   - a person erased while a send to them waited is not sent it;
 *   - (a week's posts queued when everything is stopped: tests/google/a-post-goes-on-google-at-its-time.test.mjs, and
 *     tests/content/places for Instagram and a Page, where the post's own world is.)
 *
 * Each is also run with nothing changed, where the same job does leave: the change is what stops it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { OWNER, coldRequest, coldWorld, emailWire, outreachRpc, wireOf } from "../../messages/deliver/_deliver.mjs";
import { claimDue, ledgerWorld, throughDispatch } from "./_kill-at.mjs";

const T = "t1";
const past = () => new Date(Date.now() - 1000);

/** The ledger over a world's tables, the wire a job is handed, and what the wire was asked. */
function ledgerOver(tables, wire, rpcs = {}) {
  tables.jobs ??= [];
  const db = fakeDb(tables, {}, { ...rpcs, claim_due_jobs: (args) => claimDue(tables.jobs, args) });
  return Object.assign(ledgerWorld(db, { dispatch: throughDispatch(() => ({ wire: wire.wire })) }), { tables, wire });
}

/* ------------------------------------------------------------------------------ a cold email, and a reply -- */

/** A sequence's next cold email, written and queued for its lead, as the reach-out's sender queues it. */
async function aColdEmailQueued() {
  const tables = coldWorld();
  Object.assign(tables.messages[0], {
    meta: { to: OWNER, email: { request: coldRequest() }, reach_out: { lead_id: "l1" } },
    created_at: new Date(Date.now() - 60_000).toISOString(),
  });
  const world = ledgerOver(tables, emailWire(), outreachRpc(tables));
  await world.putAgain({
    tenantId: T,
    kind: "outbound_send",
    dueAt: past(),
    payload: { message_id: "m1", conversation_id: "c1", to_email: OWNER, purpose: "outreach", proactive: true },
  });
  return world;
}

test("a cold email queued for a business that has not written back goes", async () => {
  const world = await aColdEmailQueued();
  await world.run();
  assert.equal(world.wire.calls.length, 1);
  assert.equal(world.tables.messages[0].status, "sent");
});

test("a business that wrote back while its next cold email was queued is not written to: the email is withdrawn with why", async () => {
  const world = await aColdEmailQueued();
  // "No thanks", on the thread, after the email was queued and before its job ran.
  world.tables.messages.push({
    id: "in-1",
    tenant_id: T,
    conversation_id: "c1",
    direction: "inbound",
    sender: "customer",
    status: "received",
    channel: "email",
    body: "No thanks",
    meta: { email: { claim: "person" } },
    created_at: new Date().toISOString(),
  });
  const run = await world.run();
  assert.equal(world.wire.calls.length, 0, "nothing left for them");
  const email = world.tables.messages.find((m) => m.id === "m1");
  assert.equal(email.status, "canceled");
  assert.ok(
    world.tables.events.some((e) => e.kind === "message.send_blocked" && e.data.reason === "outreach_wrote_back"),
    "and the ledger of what happened says why",
  );
  assert.equal(run.steps.at(-1), "complete", "the job is done: there was nothing to send");
  assert.equal((await world.jobs())[0].state, "done");
});

/* ------------------------------------------------------------------------------------ a reply, and a stop -- */

/** A reply waiting for its person on WhatsApp, its job on the ledger. */
async function aReplyQueued() {
  const tables = {
    messages: [
      {
        id: "m1",
        tenant_id: T,
        conversation_id: "c1",
        status: "queued",
        body: "See you at 3",
        sender: "ai",
        channel: "whatsapp",
        direction: "outbound",
        created_at: new Date(Date.now() - 60_000).toISOString(),
      },
    ],
    conversations: [
      {
        id: "c1",
        tenant_id: T,
        paused_until: null,
        contacts: { consent: "opted_in", dnc: false, marketing_consent: null, erased_at: null },
        tenants: { status: "active" },
      },
    ],
    events: [],
    escalations: [],
  };
  const world = ledgerOver(tables, wireOf());
  await world.putAgain({
    tenantId: T,
    kind: "outbound_send",
    dueAt: past(),
    payload: { message_id: "m1", conversation_id: "c1", to_phone: "+13475550101" },
  });
  return world;
}
const blocked = (world) =>
  world.tables.events.filter((e) => e.kind === "message.send_blocked").map((e) => e.data.reason);

test("a reply queued for a person who still wants to hear goes", async () => {
  const world = await aReplyQueued();
  await world.run();
  assert.equal(world.wire.calls.length, 1);
  assert.equal(world.tables.messages[0].status, "sent");
});

test("a person who said stop while a reply to them waited is not sent it", async () => {
  const world = await aReplyQueued();
  world.tables.conversations[0].contacts.consent = "opted_out";
  await world.run();
  assert.equal(world.wire.calls.length, 0, "their stop is read at the wire, not where the reply was queued");
  assert.equal(world.tables.messages[0].status, "canceled");
  assert.equal(blocked(world).length, 1, `said once, with why: ${blocked(world)}`);
  assert.equal((await world.jobs())[0].state, "done");
});

test("a number put on the do-not-contact list while a reply waited is not sent it", async () => {
  const world = await aReplyQueued();
  world.tables.conversations[0].contacts.dnc = true;
  await world.run();
  assert.equal(world.wire.calls.length, 0);
  assert.equal(world.tables.messages[0].status, "canceled");
});

/* --------------------------------------------------------------------------------- a send, and an erasure -- */

test("a person erased while a send to them waited is not sent it, whatever the erasure had time to withdraw", async () => {
  // The erasure withdraws the jobs that name a person as it blocks them (erase_contact); a job a runner had claimed in
  // that instant is past withdrawing, and is the door's to refuse.
  const world = await aReplyQueued();
  world.tables.conversations[0].contacts.erased_at = new Date().toISOString();
  await world.run();
  assert.equal(world.wire.calls.length, 0, "nothing reaches a person who asked to be forgotten");
  assert.notEqual(world.tables.messages[0].status, "sent");
  assert.equal((await world.jobs())[0].state, "done");
});

test("a workspace paused while a reply waited does not send it", async () => {
  const world = await aReplyQueued();
  world.tables.conversations[0].tenants.status = "paused";
  await world.run();
  assert.equal(world.wire.calls.length, 0);
  assert.notEqual(world.tables.messages[0].status, "sent");
});
