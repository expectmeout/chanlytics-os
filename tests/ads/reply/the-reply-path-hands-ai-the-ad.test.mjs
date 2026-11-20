/**
 * The reply path hands AI the ad a person tapped (decision 0049, call 12; the Ads build plan's step 4, item 7).
 *
 * The inbound verb runs for real over the receptionist's world (../../inbound/_world.mjs): a WhatsApp message is
 * recorded and answered as production does it, with the real reader of the person (db readLeadContext) as its port over
 * a database in memory, the edge's own note about them (describeLead, which the edge's ports add), and a model that
 * remembers what it was asked. What is asserted is what the model is handed for the turn and what the customer is sent:
 * the ad on the first reply after a tap, nothing for a message no ad brought, and the holding line and a person, never
 * the ad's price, when the model repeats it. Every name, number and ad is made up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readLeadContext } from "@chanlytics/db/conversations";
import { fakeDb } from "../../_fake-db.mjs";
import { FROM, text, world } from "../../inbound/_world.mjs";
import { sure } from "../../inbound/phases/_fixtures.mjs";

const AD = "120200000000051";
const NOW = new Date().toISOString();
/** The rows as the world's ingest names them (ingested: m-in on conv1, by k1, in t1), the message from an ad or not. */
function rowsOf(referral) {
  const person = {
    id: "k1",
    tenant_id: "t1",
    phone_e164: `+${FROM}`,
    display_name: null,
    wa_profile_name: "Dana",
    email: null,
    last_seen_at: NOW,
    consent: "opted_in",
    dnc: false,
    notes: null,
    proposal_url: null,
    marketing_consent: "unknown",
  };
  const message = {
    id: "m-in",
    tenant_id: "t1",
    conversation_id: "conv1",
    body: "Hi, I saw your ad",
    sender: "customer",
    direction: "inbound",
    type: "text",
    status: "received",
    created_at: NOW,
    channel_ts: null,
    meta: { raw_type: "text", ...(referral ? { referral } : {}) },
  };
  const entry = {
    id: "e1",
    tenant_id: "t1",
    message_id: "m-in",
    platform: "meta",
    platform_ad_id: AD,
    kind: "chat",
    new_person: true,
    ad_id: null,
    external_ref: null,
    said: { headline: "Gel manicure $29 this week", body: "Was $45. This week only.", media_type: "image" },
    said_at: NOW,
    created_at: NOW,
  };
  return {
    contacts: [person],
    conversations: [{ id: "conv1", tenant_id: "t1", contact_id: "k1" }],
    messages: [message],
    deals: [],
    person_notes: [],
    ad_entries: referral ? [entry] : [],
  };
}

/** One message through the door and its turn: what the model was handed, and what the world saw go out. */
async function answered(referral, modelSays = "Hi Dana! Happy to help.") {
  const db = fakeDb(rowsOf(referral), {}, { ad_named: () => ({ platform: "meta", name: "Gel week" }) });
  const asks = [];
  const w = world({ env: { modelKey: "sk-test" } });
  await w.run(text("Hi, I saw your ad"), {
    db: () => db,
    leads: { read: readLeadContext, personReplyMode: async () => null },
    brain: async () => ({
      generateReply: async (ask) => {
        asks.push(ask);
        return { text: modelSays, escalate: false, meta: sure };
      },
    }),
  });
  assert.equal(asks.length, 1, "the model was asked once");
  return { ask: asks[0], seen: w.seen, db };
}

test("a first reply after a tap: the model is handed the ad in the note about the person, fenced, and the reply goes out", async () => {
  const { ask, seen } = await answered({ source_id: AD, source_type: "ad" });
  assert.match(ask.leadNote, /They wrote after tapping one of this business's ads\./);
  assert.ok(
    ask.leadNote.includes(
      "<ad>\nname: Gel week\nheadline: Gel manicure $29 this week\nwords: Was $45. This week only.\nmedia: image\n</ad>",
    ),
    ask.leadNote,
  );
  // The ad is in the note alone: the customer's own words are the turn, and the business's prompt holds none of it.
  assert.equal(ask.userText, "Hi, I saw your ad");
  assert.ok(!ask.systemPrompt.includes("Gel") && !ask.systemPrompt.includes("<ad>"));
  assert.deepEqual(
    seen.sent.map((m) => m.body),
    ["Hi Dana! Happy to help."],
  );
  assert.equal(seen.escalations.length, 0);
});

test("a conversation with no tap: the model is handed nothing of an ad, and no ad is read", async () => {
  for (const referral of [null, { source_id: AD, source_type: "post" }]) {
    const { ask, db } = await answered(referral);
    assert.ok(!/tapping|<ad>/.test(ask.leadNote), ask.leadNote);
    assert.match(ask.leadNote, /First time reaching out\./);
    assert.equal(db.seen.filter((q) => q.table === "ad_entries" || q.rpc === "ad_named").length, 0);
  }
});

test("the model repeats the ad's price: the customer is sent the holding line, never the price, and a person takes the thread", async () => {
  const { ask, seen } = await answered(
    { source_id: AD, source_type: "ad" },
    "Yes! A gel manicure is $29 this week, as the ad says.",
  );
  assert.ok(ask.leadNote.includes("headline: Gel manicure $29 this week"), "it was told what the person saw");
  assert.equal(seen.sent.length, 1);
  assert.ok(!/29/.test(seen.sent[0].body), `the ad's price reached nobody: ${seen.sent[0].body}`);
  assert.deepEqual(
    seen.escalations.map((e) => e.reason),
    ["policy_block"],
  );
});
