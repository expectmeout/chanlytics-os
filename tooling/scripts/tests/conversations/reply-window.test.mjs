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
import { emptyReadSet, lastWroteOn, replyWindow, threadChannelOf, WA_WINDOW_MS } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { buildProposal } = await import(
  pathToFileURL(path.join(here, "../../../../apps/dashboard/src/server/ask/tools/index.ts")).href
);

// The person page's reading of the same rule: a helper of the people module, read from its source.
const { replyChannelOfThreads } = await import(
  pathToFileURL(path.join(here, "../../../../packages/contracts/src/people/person-helpers.ts")).href
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
  // Rosa's own words, as the row holds them (the reply's channel is where SHE last wrote: contracts lastWroteOn).
  sender: "customer",
  type: "text",
  meta: {},
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

test("where a person last wrote is the wire of their own newest words: not a call's note, not their mailbox answering for them, not what we sent them", async () => {
  // The same question asked of a thread's messages in hand (contracts lastWroteOn, which a row's channel reads) and of
  // the database (the reply route's channel, read here through the card it draws): one rule, two readers.
  const said = (channel, over = {}) => ({
    direction: "inbound",
    sender: "customer",
    type: "text",
    channel,
    meta: {},
    ...over,
  });
  const note = said("voice", { sender: "system", type: "call_summary" });
  const away = said("email", { meta: { email: { claim: "auto_reply" } } });
  const list = said("email", { meta: { email: { claim: "automated" } } });
  const campaign = {
    direction: "outbound",
    sender: "human",
    type: "text",
    channel: "email",
    meta: { source: "broadcast" },
  };

  assert.equal(lastWroteOn([said("sms"), note]), "sms", "a call after their text: they last WROTE by text");
  assert.equal(
    lastWroteOn([said("whatsapp"), away, list]),
    "whatsapp",
    "a program writing from their address is not them",
  );
  assert.equal(lastWroteOn([said("whatsapp"), said("email", { meta: { email: { claim: "person" } } })]), "email");
  assert.equal(lastWroteOn([note, campaign]), null, "they have written nothing");
  // A thread's row names where they last wrote; a playbook's email after it does not turn the row into Email.
  assert.equal(threadChannelOf([said("whatsapp"), campaign]), "whatsapp");
  // A thread they never wrote on is on the wire our own words went by, and a thread of calls alone is the phone's.
  assert.equal(threadChannelOf([campaign]), "email");
  assert.equal(threadChannelOf([note]), "phone");

  // The reply route's reading, over the database: Rosa texted an hour ago, then phoned, and her mailbox answered a
  // campaign. The reply goes by text, which has no window, where "the newest inbound row" read the call's note as
  // WhatsApp (closed, three days on) and the out-of-office as email.
  const row = (id, h, over) => ({ ...inbound(over.channel, h), id, ...over });
  const card = await buildProposal(
    toolContext({
      conversations: [thread({ last_wa_inbound_at: hoursAgo(72) })],
      messages: [
        row("m-wa", 72, { channel: "whatsapp" }),
        row("m-sms", 3, { channel: "sms" }),
        row("m-call", 2, { channel: "voice", sender: "system", type: "call_summary" }),
        row("m-ooo", 1, { channel: "email", meta: { email: { claim: "auto_reply" } } }),
      ],
    }),
    "propose_reply",
    { action: "draft", ...DRAFT },
  );
  assert.equal(card.isError, false, card.result);
  assert.equal(card.proposal.payload.window_open, true, "the reply goes by text, where she last wrote");

  // And the case only the rule can pass: she last wrote on WhatsApp three days ago, and since then a call's note and
  // her mailbox's out-of-office came in. The reply goes by WhatsApp, whose window has closed. "The newest inbound row"
  // sent it by email, which has no window, and said the thread was open.
  const closed = await buildProposal(
    toolContext({
      conversations: [thread({ last_wa_inbound_at: hoursAgo(72) })],
      messages: [
        row("m-wa", 72, { channel: "whatsapp" }),
        row("m-call", 2, { channel: "voice", sender: "system", type: "call_summary" }),
        row("m-ooo", 1, { channel: "email", meta: { email: { claim: "auto_reply" } } }),
      ],
    }),
    "propose_reply",
    { action: "draft", ...DRAFT },
  );
  assert.equal(closed.isError, false, closed.result);
  assert.equal(closed.proposal.payload.window_open, false, "the reply goes by WhatsApp, and its window is closed");

  // A person who has written nothing themselves is answered where the last thing from their side came from: a program
  // at their address is still their address. The row, the person's page and the route say the same wire.
  assert.equal(lastWroteOn([away]), null, "they wrote nothing");
  assert.equal(threadChannelOf([campaign, away]), "email", "the thread is on the wire their side answered by");
  const threads = (messages) => [{ messages: messages.map((m, i) => ({ created_at: hoursAgo(10 - i), ...m })) }];
  assert.equal(replyChannelOfThreads(threads([campaign, away])), "email");
  assert.equal(
    replyChannelOfThreads(threads([said("whatsapp"), away, note])),
    "whatsapp",
    "their own words come first",
  );
  assert.equal(replyChannelOfThreads(threads([note, campaign])), null, "nothing from their side in writing");
  const mailOnly = await buildProposal(
    toolContext({
      conversations: [thread({ last_wa_inbound_at: null })],
      messages: [row("m-ooo", 1, { channel: "email", meta: { email: { claim: "auto_reply" } } })],
    }),
    "propose_reply",
    { action: "draft", ...DRAFT },
  );
  assert.equal(mailOnly.isError, false, mailOnly.result);
  assert.equal(mailOnly.proposal.payload.window_open, true, "the reply goes by email, which has no window");
});
