/**
 * Two businesses can have the same customer. Their conversation must not be
 * the same memory.
 *
 * The receptionist's memory used to be a Vercel Blob object keyed
 * `threads/<phone digits>.json` — a customer's phone number with no tenant in
 * it — and that one object carried the conversation history, the pause, the
 * dedupe list and the daily reply cap. Sharing it means one business's
 * receptionist can quote another's conversation, inherit its pause, and spend
 * its reply budget. The inbound-call endpoint read the same key with no tenant
 * resolution at all, so it could have spoken one business's WhatsApp thread
 * into another's phone call. The store is gone and the key with it: the memory
 * is Postgres rows, and the isolation is that every read names the workspace.
 *
 * So these run the real read against a database double and check the
 * separation holds — and, for the call endpoint, that the tenant is resolved
 * BEFORE anything is read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const EDGE = path.join(here, "../../apps/edge");
const { readPgThread } = await import(pathToFileURL(path.join(EDGE, "lib/inbound/persist.ts")).href);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
// The same person, written to twice: one conversation per workspace, which is
// what `conversations` enforces and what makes the two memories two.
const CONV_A = "aaaaaaaa-0000-0000-0000-000000000001";
const CONV_B = "bbbbbbbb-0000-0000-0000-000000000001";

const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const msg = (over) => ({
  direction: "outbound",
  sender: "ai",
  status: "sent",
  type: "text",
  channel: "whatsapp",
  channel_ts: null,
  meta: {},
  ...over,
});
const ing = (conversationId, pausedUntil = null) => ({
  message_id: "m",
  conversation_id: conversationId,
  contact_id: "k",
  is_new: true,
  paused_until: pausedUntil,
});

/** Both businesses' rows in one table, as they really sit. */
const world = () =>
  fakeDb({
    messages: [
      msg({
        id: "a1",
        tenant_id: TENANT_A,
        conversation_id: CONV_A,
        created_at: at(10),
        body: "salon A: your appointment is at 3",
      }),
      msg({ id: "a2", tenant_id: TENANT_A, conversation_id: CONV_A, created_at: at(9), body: "salon A: see you then" }),
      msg({
        id: "b1",
        tenant_id: TENANT_B,
        conversation_id: CONV_B,
        created_at: at(8),
        body: "salon B: yes, we do gel",
      }),
    ],
  });

test("the same customer at two businesses is two separate memories", async () => {
  const later = new Date(Date.now() + 3600_000).toISOString();
  const a = await readPgThread(world(), TENANT_A, ing(CONV_A, later));
  const b = await readPgThread(world(), TENANT_B, ing(CONV_B));

  assert.equal(a.history.length, 2);
  assert.equal(b.history.length, 1, "business B could read business A's conversation");
  assert.ok(b.history.every((h) => !h.content.includes("salon A")));
  assert.equal(b.pausedUntil, 0, "business B inherited business A's pause");
  assert.equal(a.replies.length, 2);
  assert.equal(b.replies.length, 1, "business B inherited business A's reply budget");
});

test("a workspace cannot read another's conversation even by naming it", async () => {
  // The conversation id alone is not the key: the tenant is read too, so a
  // mis-routed id comes back empty rather than as somebody else's thread.
  const crossed = await readPgThread(world(), TENANT_B, ing(CONV_A));
  assert.deepEqual(crossed.history, [], "a conversation was read outside its workspace");
  assert.deepEqual(crossed.replies, []);
  assert.equal(crossed.textedBefore, false);
});

/* --------------------------- the call's start, run --------------------------- */

const CALLER = "+16465550123";
const BRAIN = {
  business_name: "Salon A",
  booking_link: "https://book.example/salon-a",
  system_prompt: "Answer as the front desk of Salon A: brief and warm.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
};
/** The same caller known to both businesses by another name, and one voice agent: Salon A's. */
const callWorld = () =>
  fakeDb(
    {
      tenant_channels: [
        {
          id: "ch-voice-a",
          tenant_id: TENANT_A,
          kind: "voice",
          external_id: "agent_isolation_a",
          number_e164: "+13055550111",
          credentials_ref: null,
          config: {},
          status: "active",
        },
      ],
      tenant_config: [{ tenant_id: TENANT_A, config: { brain: BRAIN } }],
      policies: [],
      tenants: [{ id: TENANT_A, name: "Salon A", timezone: "America/New_York", status: "active" }],
      google_listings: [],
      contacts: [
        { id: "k-a", tenant_id: TENANT_A, phone_e164: CALLER, display_name: "Ana Ruiz", last_seen_at: at(60) },
        { id: "k-b", tenant_id: TENANT_B, phone_e164: CALLER, display_name: "Bea Lopez", last_seen_at: at(30) },
      ],
      conversations: [],
      messages: [],
    },
    {},
    { runtime_stamp: () => "stamp-isolation" },
  );
/** The database, and every table the code asked it for, in order. */
const watched = (db) => {
  const asked = [];
  const spied = new Proxy(db, {
    get: (t, k) => (k === "from" ? (table) => (asked.push(table), t.from(table)) : t[k]),
  });
  return { db: spied, asked };
};

test("the inbound-call endpoint reads nothing of anyone's conversation without a resolved tenant, and the tenant it resolved alone", async () => {
  // This endpoint SPEAKS stored conversation back to a caller. Reading the wrong tenant is not a data-quality problem,
  // it is a disclosure. The read moved from the Blob mirror to readLeadContext (Postgres) so both agents share one
  // memory; what is held is the order: the tenant from the agent, then the caller's memory, in that tenant alone.
  // Pinned as call-start.ts's text until 26 Nov 2026; run since.
  const { planCallStartWithin } = await import(pathToFileURL(path.join(EDGE, "lib/voice/call-start.ts")).href);
  const now = new Date();

  const nobody = watched(callWorld());
  const unrouted = await planCallStartWithin({ agentId: "agent_isolation_nobody", from: CALLER, db: nobody.db, now });
  assert.deepEqual([unrouted.facts, unrouted.tenantId], ["unrouted", null], "an agent no workspace holds is nobody's");
  assert.deepEqual(nobody.asked, ["tenant_channels"], "the routing alone: no contact, thread or message is read");

  const salon = watched(callWorld());
  const routed = await planCallStartWithin({ agentId: "agent_isolation_a", from: CALLER, db: salon.db, now });
  assert.equal(routed.tenantId, TENANT_A, "the tenant the agent resolved to");
  assert.ok(salon.asked.indexOf("tenant_channels") < salon.asked.indexOf("contacts"), "resolved before the memory");
  const said = JSON.stringify(routed.variables);
  assert.ok(said.includes("Ana"), `Salon A's caller is the one Salon A knows: ${said}`);
  assert.ok(!said.includes("Bea"), "and never the name another business knows the same number by");
});
