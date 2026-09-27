/**
 * One reply window, asked for in one place.
 *
 * A reply goes back where the customer last wrote: a text has no window, and
 * WhatsApp's is 24 hours from their last WhatsApp message. The reply route
 * enforced that and the composer displayed it, each with its own expression,
 * and the assistant's reply card had a third that forgot texts, so it told an
 * operator a texting thread was closed while the route would have sent. These
 * run the rule, and the card against a thread in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { emptyReadSet, replyWindow, WA_WINDOW_MS } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { buildProposal } = await import(
  pathToFileURL(path.join(here, "../../../../apps/dashboard/src/server/ask/tools/index.ts")).href
);

const NOW = new Date("2026-09-10T15:00:00Z");
const TENANT = "11111111-1111-1111-1111-111111111111";
const CONV = "33333333-3333-3333-3333-333333333333";
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

test("a text has no window; WhatsApp's closes 24 hours after the customer's last WhatsApp", () => {
  assert.deepEqual(replyWindow("sms", null, NOW), { open: true, closesAtIso: null }, "a texting thread is always open");
  assert.deepEqual(
    replyWindow("sms", hoursAgo(72), NOW),
    { open: true, closesAtIso: null },
    "even with an old WhatsApp behind it",
  );
  const fresh = replyWindow("whatsapp", hoursAgo(2), NOW);
  assert.equal(fresh.open, true);
  assert.equal(fresh.closesAtIso, new Date(NOW.getTime() - 2 * 3_600_000 + WA_WINDOW_MS).toISOString());
  assert.equal(replyWindow("whatsapp", hoursAgo(25), NOW).open, false);
  assert.deepEqual(
    replyWindow(undefined, null, NOW),
    { open: false, closesAtIso: null },
    "a thread nobody has written on is not open",
  );
});

/** What an act tool is handed: the caller's client, and one turn's read set. */
function toolContext(tables) {
  return {
    ctx: { supabase: fakeDb(tables), userId: "u1", email: "ada@example.com", params: {} },
    tenantId: TENANT,
    role: "operator",
    read: emptyReadSet(),
    now: NOW,
  };
}

const thread = (over = {}) => ({
  id: CONV,
  tenant_id: TENANT,
  state: "open",
  last_wa_inbound_at: null,
  contacts: {
    id: "c1",
    display_name: "Rosa",
    wa_profile_name: null,
    phone_e164: "+15555550100",
    consent: "opted_in",
    dnc: false,
  },
  ...over,
});
const inbound = (channel, h) => ({
  id: `m-${channel}-${h}`,
  conversation_id: CONV,
  tenant_id: TENANT,
  direction: "inbound",
  channel,
  channel_ts: hoursAgo(h),
});
// The voice is required by the tool's schema (PR 3.1, D2); the builder no longer defaults it.
const DRAFT = { conversation_id: CONV, text: "See you Tuesday at 3.", voice: "you" };

test("the assistant's reply card shows the window the reply route will enforce", async () => {
  // Rosa last wrote by text, three days after an old WhatsApp. The route will
  // send a text, so the card must not say the window is closed.
  const texted = await buildProposal(
    toolContext({
      conversations: [thread({ last_wa_inbound_at: hoursAgo(72) })],
      messages: [inbound("whatsapp", 72), inbound("sms", 1)],
    }),
    "propose_reply",
    { action: "draft", ...DRAFT },
  );
  assert.equal(texted.isError, false, texted.result);
  assert.equal(texted.proposal.payload.window_open, true, "a texting thread is open");

  const stale = await buildProposal(
    toolContext({ conversations: [thread({ last_wa_inbound_at: hoursAgo(30) })], messages: [inbound("whatsapp", 30)] }),
    "propose_reply",
    { action: "draft", ...DRAFT },
  );
  assert.equal(stale.isError, false, stale.result);
  assert.equal(stale.proposal.payload.window_open, false, "a WhatsApp thread past 24 hours is closed");
});
