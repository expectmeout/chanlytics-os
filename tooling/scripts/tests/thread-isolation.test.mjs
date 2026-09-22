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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const EDGE = path.join(here, "../../../apps/edge");
const { pgThread } = await import(pathToFileURL(path.join(EDGE, "lib/whatsapp/persist.ts")).href);

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
  const a = await pgThread(world(), TENANT_A, ing(CONV_A, later));
  const b = await pgThread(world(), TENANT_B, ing(CONV_B));

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
  const crossed = await pgThread(world(), TENANT_B, ing(CONV_A));
  assert.deepEqual(crossed.history, [], "a conversation was read outside its workspace");
  assert.deepEqual(crossed.replies, []);
  assert.equal(crossed.repliedBefore, false);
});

test("the inbound-call endpoint refuses to read without a resolved tenant", () => {
  // This endpoint SPEAKS stored conversation back to a caller. Reading the
  // wrong tenant is not a data-quality problem, it is a disclosure.
  //
  // The read moved from the Blob mirror to readLeadContext (Postgres) so both
  // agents share one memory; the ORDER is what this test is really about and
  // it is unchanged. Locating the read explicitly rather than comparing an
  // indexOf that returns -1: if the call is ever renamed away again, this
  // must fail loudly rather than pass because it found nothing.
  const src = fs.readFileSync(path.join(EDGE, "lib/voice/call-start.ts"), "utf8");
  assert.ok(
    src.includes(`resolveChannelDetailed(db, "voice", o.agentId)`),
    "it must resolve the tenant from the agent",
  );
  assert.ok(src.includes("if (!routed)"), "it must have an explicit no-tenant branch");
  const guard = src.indexOf("if (!routed)");
  const read = src.indexOf("readLeadContext(");
  assert.ok(read !== -1, "the caller-context read must still exist and be findable");
  assert.ok(guard !== -1 && guard < read, "the no-tenant guard must come BEFORE the read");
  // And it must read the tenant it resolved, never a bare phone lookup.
  assert.ok(src.includes("readLeadContext(db, routed.tenantId"), "the read must be scoped to the resolved tenant");
});
