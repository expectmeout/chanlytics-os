/**
 * "Stop", and an erasure, at every way out.
 *
 * Everything a customer receives leaves through one door (core deliver/deliver.ts; repo/hygiene.test.mjs holds that no
 * send goes round it), and the door asks one rule (contracts mayMessageFor). So what reaches a person who said stop is
 * decided here, once, for every way a message sets out: a sequence's message, a broadcast's news, a visit reminder, an
 * offer, AI's own reply (answering now, or held and queued), the booking link texted during a call, and a reply a member
 * types by hand. Each is run through the door as its caller fills it, on each phone channel, for a person who said stop,
 * a person marked do not contact, a person being erased and a person erased: nothing reaches the wire, and the door says
 * why, which is how a member who typed the reply is told. The same sends to a person who said yes all go, so no refusal
 * here comes from the harness.
 *
 * Email keeps its own answer (decisions 2, 11 and 12 of the campaigns spec; consent/email-offers.test.mjs holds the rule
 * cell by cell): Unsubscribe ends offers, the business's own news, a first email and a cold email. A reply, and a
 * message about a visit they booked, still go: that is decided, and said here so the table is whole.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mayMessageFor } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { deliver } = await import(pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href);

const WORKSPACE = "t1";
const NOW = Date.parse("2026-11-13T15:00:00.000Z");

/** Every way a message sets out, as its caller hands it to the door (core messages/send.ts, messages/broadcast/batch.ts, inbound/ingest.ts, the edge's voice/call-link-send.ts). */
const WAYS = {
  "a sequence's message": { sender: "human", proactive: true, purpose: "conversational", about: "ours" },
  "a broadcast's news": { sender: "human", proactive: true, purpose: "conversational", about: "ours" },
  "a visit reminder": { sender: "human", proactive: true, purpose: "conversational", about: "theirs" },
  "an offer": { sender: "human", proactive: true, purpose: "marketing", about: "ours" },
  "AI's own reply, answering now": { sender: "ai", proactive: false, purpose: "conversational", about: "theirs" },
  "AI's own reply, held and queued": {
    sender: "ai",
    proactive: false,
    purpose: "conversational",
    about: "theirs",
    messageId: "m1",
  },
  "the booking link texted during a call": {
    sender: "ai",
    proactive: false,
    purpose: "conversational",
    about: "theirs",
    only: "sms",
  },
  "a reply typed by hand": { sender: "human", proactive: false, purpose: "conversational", about: "theirs" },
};

/** A text carries no offer whoever it is to (deliver/text.ts), so an offer sets out on WhatsApp alone here. */
const sets = (way, channel) => (WAYS[way].only ?? channel) === channel && !(way === "an offer" && channel === "sms");

const SAID_YES = {
  consent: "opted_in",
  dnc: false,
  marketing_consent: "opted_in",
  consent_channels: ["whatsapp", "sms"],
  marketing_channels: ["whatsapp", "sms"],
  erased_at: null,
  erasing_since: null,
};

/** Who is not to be written to, and the door's word for why. */
const STOPS = {
  "said stop": [{ consent: "opted_out" }, "opted_out"],
  "marked do not contact": [{ dnc: true }, "opted_out"],
  "being erased, from the moment an owner asked": [{ erasing_since: "2026-11-13T14:59:00.000Z" }, "erased"],
  erased: [{ erased_at: "2026-11-13T14:00:00.000Z", consent: "unknown", dnc: true }, "erased"],
};

const worldOf = (contact, way) => ({
  conversations: [
    {
      id: "c1",
      tenant_id: WORKSPACE,
      paused_until: null,
      contacts: { ...SAID_YES, ...contact },
      tenants: { status: "active", sending_stopped_at: null },
    },
  ],
  messages: WAYS[way].messageId
    ? [
        {
          id: "m1",
          tenant_id: WORKSPACE,
          conversation_id: "c1",
          status: "queued",
          body: "See you at 3",
          sender: "ai",
          direction: "outbound",
          created_at: "2026-11-13T14:59:00.000Z",
        },
      ]
    : [],
  events: [],
  // The workspace's texting line, approved by the carriers: without one a text is refused for the line, before anyone
  // is asked about.
  lines: [
    {
      id: "l1",
      tenant_id: WORKSPACE,
      e164: "+13475550100",
      messaging_service_sid: "MG00000000000000000000000000000001",
      voice_state: "active",
      sms_state: "active",
      reg_mock: false,
      created_at: "2026-11-01T00:00:00.000Z",
    },
  ],
});

/** One send through the door, with wires that count what they were handed. */
async function knock(contact, way, channel) {
  let handed = 0;
  const count = async () => ((handed += 1), { ok: true, wamid: "wamid.1", sid: "SM1", status: 200 });
  const { only: _only, ...send } = WAYS[way];
  const out = await deliver(
    { db: fakeDb(worldOf(contact, way)), wire: { whatsapp: count, sms: count }, now: () => NOW },
    {
      tenantId: WORKSPACE,
      conversationId: "c1",
      contactId: "k1",
      to: "+13475550101",
      channel,
      trigger: null,
      body: "See you at 3",
      ...send,
    },
  );
  return { out, handed };
}

for (const channel of ["whatsapp", "sms"]) {
  test(`on ${channel}, every way out reaches a person who said yes: the sends below are refused for who they are to, never by the harness`, async () => {
    for (const way of Object.keys(WAYS).filter((w) => sets(w, channel))) {
      const { out, handed } = await knock({}, way, channel);
      assert.deepEqual([out.outcome, handed], ["sent", 1], `${way}: ${JSON.stringify(out)}`);
    }
  });

  for (const [who, [contact, why]] of Object.entries(STOPS)) {
    test(`on ${channel}, no way out reaches a person ${who}: nothing is handed to the wire, and the door says "${why}"`, async () => {
      for (const way of Object.keys(WAYS).filter((w) => sets(w, channel))) {
        const { out, handed } = await knock(contact, way, channel);
        assert.equal(handed, 0, `${way}: nothing reaches the wire`);
        assert.deepEqual([out.outcome, out.reason], ["refused", why], `${way}: ${JSON.stringify(out)}`);
      }
    });
  }
}

test("a text never carries an offer, whoever it is to: the one way out that does not set out on that channel at all", async () => {
  const { out, handed } = await knock({}, "an offer", "sms");
  assert.equal(handed, 0);
  assert.deepEqual([out.outcome, out.reason], ["refused", "sms_carries_no_promotions"]);
});

test("by email, Unsubscribe ends offers, the business's news, a first email and a cold email; a reply and a message about their own visit still go (decision 11)", () => {
  const unsubscribed = { consent: "opted_in", dnc: false, email_marketing: "opted_out", has_relationship: true };
  const ask = (way, extra = {}) => {
    const { purpose, proactive, about } = { ...WAYS[way], ...extra };
    return mayMessageFor(unsubscribed, purpose, { proactive, channel: "email", about, ...extra.opts });
  };
  const no = { ok: false, reason: "unsubscribed" };
  const yes = { ok: true, reason: null };
  assert.deepEqual(ask("an offer"), no);
  assert.deepEqual(ask("a broadcast's news"), no);
  assert.deepEqual(ask("a sequence's message"), no, "a sequence's message of the business's own choosing");
  assert.deepEqual(ask("a reply typed by hand", { proactive: true, opts: { begins: true } }), no, "a first email");
  assert.deepEqual(ask("an offer", { purpose: "outreach" }), no, "a cold email");
  assert.deepEqual(
    ask("a visit reminder"),
    yes,
    "about a visit they booked: no yes is asked, and Unsubscribe is of offers",
  );
  assert.deepEqual(ask("a reply typed by hand"), yes, "an answer to someone who wrote");
  assert.deepEqual(ask("AI's own reply, answering now"), yes);
});

test("by email, a person who said stop everywhere, or is do not contact, is not written to by any way out", () => {
  for (const contact of [{ consent: "opted_out" }, { dnc: true }])
    for (const [way, { purpose, proactive, about }] of Object.entries(WAYS))
      assert.deepEqual(
        mayMessageFor({ ...SAID_YES, email_marketing: "opted_in", ...contact }, purpose, {
          proactive,
          channel: "email",
          about,
        }),
        { ok: false, reason: "opted_out" },
        way,
      );
});
