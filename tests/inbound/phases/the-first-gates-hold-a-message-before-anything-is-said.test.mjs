/**
 * The first gates (core inbound/gates.ts): a thread that cannot be read, consent and its record, and what kind of
 * message arrived, asked before any branch that can speak.
 *
 * The verb runs for real over the receptionist's world (../_world.mjs): its gates as themselves, everything outside
 * them (the database, the memory, the runtime, the sink, the alerts, the pager, the model) as fakes handed in through
 * its ports. What is asserted is what a customer, an owner and the platform would see. Split by phase out of
 * tests/whatsapp/inbound-executed.test.mjs (the inbound review of 3 Nov 2026, D4).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { optInConfirmation, STOP_ENDED_OFFERS_SOURCE } from "@chanlytics/contracts";
import { FROM, FROM_ITS_EVENT, ingested, text, world } from "../_world.mjs";
import { consentOnRecord } from "./_fixtures.mjs";

test("STOP records the opt-out, opens no hold, tells nobody itself, answers nothing, and keeps no second copy of the answer", async () => {
  // A STOP is news, not a wait (decision 0048): the answer is the consent its ingest wrote with its event, the owner is told
  // once on the bell from that event (SUBSCRIBERS.consent_notice), and nothing is asked of a person who can do nothing.
  const w = world();
  await w.run(text("STOP"));
  assert.equal(w.seen.sent.length, 0);
  assert.deepEqual(w.seen.escalations, [], "no hold: nothing in Needs you, Today's queue or the badge");
  assert.deepEqual(w.seen.alerts, [], "and no handoff mail or push: the consent event is what tells the owner");
  assert.equal(w.seen.processed, 1);
  // The answer lives in `contacts.consent` and nowhere else. It used to be
  // cached on the Blob thread as well, for the case where Postgres did not
  // answer -- which cost a read and a write in front of every brain call and
  // is a case that can no longer arise: a thread that cannot be read never
  // reaches the consent gate, it goes to a person.
  assert.equal("optedOut" in w.thread(), false, "no second copy to go stale");
  assert.deepEqual(
    w.thread().history.map((h) => h.content),
    ["STOP"],
    "the words are on record; nothing was said back",
  );
});

test("a memory that cannot be read hands the conversation to a person, and answers nothing", async () => {
  // THE BEHAVIOUR WITH NOWHERE TO FALL BACK TO. Postgres is the only memory,
  // so a read that did not answer leaves the receptionist not knowing whether
  // a human has taken this thread over, what was already said, or how many
  // replies have gone out today. Every gate below would be answering from an
  // invented empty history -- it would greet a customer mid-conversation and
  // talk over the person handling it. So it does not answer at all.
  //
  // The customer's message is already on record: the ingest runs first, and
  // that is what makes this safe rather than a loss.
  const w = world({ unreadable: true });
  await w.run(text("hi, is my 3pm still on?"));
  assert.equal(w.seen.sent.length, 0, "nothing is said from a history nobody could read");
  assert.deepEqual(
    w.seen.escalations.map((e) => e.reason),
    ["state_unavailable"],
  );
  assert.match(w.seen.escalations[0].details, /could not read this thread's history/);
  assert.deepEqual(w.seen.alerts, [], FROM_ITS_EVENT);
  assert.equal(w.seen.processed, 1, "marked handled, so a redelivery does not open it twice");
  assert.equal(w.seen.pauses.length, 0, "the receptionist did not speak, so it claims no pause");
});

test("YES OFFERS is not the way back in from a STOP: an opted-out person gets nothing, and START is", async () => {
  // One word opening both programs is what the carriers refuse (30913); the way
  // back in is START, as their own reply to a STOP says.
  const w = world({ ingest: async (_db, _tenant, n) => ({ ...ingested(n), consent: "opted_out", dnc: true }) });
  await w.run(text("YES OFFERS"));
  assert.equal(w.seen.sent.length, 0);
  await w.run(text("START", "wamid.2"));
  assert.equal(w.seen.sent.length, 1);
  assert.equal(w.seen.sent[0].body, optInConfirmation("Harbor Nails", "conversational"));
});

test("a START whose answer is taken up after the person said STOP is held by the STOP: nothing confirmed, nobody told they said yes", async () => {
  const kept = consentOnRecord();
  const w = world(kept);
  const start = text("START", "wamid.y1");
  await w.record(start);
  await w.run(text("STOP", "wamid.y2"));
  assert.deepEqual(w.seen.escalations, [], "a STOP opens no hold (decision 0048)");
  // The START's job, run late: its ingest is a redelivery, and the record holds the STOP that came after it.
  await w.run(start, {}, true);
  assert.deepEqual(w.seen.sent, [], "no confirmation of a yes the STOP since took back");
  assert.deepEqual(w.seen.escalations, [], "and nobody is told the customer said yes and was not confirmed");
  assert.deepEqual(w.seen.alerts, [], "the STOP's one notice is the consent event's, on the bell");
  assert.equal(kept.record.consent, "opted_out", "the STOP stands");
});

test("a START answered by its job, taken in again with the yes its door wrote on record, is confirmed as a new START is", async () => {
  const visit = optInConfirmation("Harbor Nails", "conversational");
  const later = world(consentOnRecord());
  const start = text("START", "wamid.y3");
  await later.record(start);
  await later.run(start, {}, true);
  assert.deepEqual(
    later.seen.sent.map((s) => [s.body, s.meta]),
    [[visit, { ack: true, confirmation: "conversational" }]],
  );
  assert.equal(later.seen.escalations.length, 0);
  // And a START taken in once, after a STOP, is the way back it always was.
  const back = world(consentOnRecord());
  await back.run(text("STOP", "wamid.y4"));
  await back.run(text("START", "wamid.y5"));
  assert.deepEqual(
    back.seen.sent.map((s) => s.body),
    [visit],
  );
});

test("a YES OFFERS answered after the person took back their yes to offers is held by that no: nothing confirmed, nobody told they said yes", async () => {
  // Its yes was written when the door kept it (00361); the person then said no more offers, and the answer's job, run
  // late, takes the message in again. The door would refuse the confirmation (no_marketing_consent), and a person used
  // to be told the customer said yes and was never confirmed, when the customer's last word was no.
  const offers = (marketingConsent) => ({
    leads: {
      read: async () => ({ name: null }),
      personReplyMode: async () => null,
      offersAnswer: async () => ({ marketingConsent, marketingConsentSource: null }),
    },
  });
  const yes = text("YES OFFERS", "wamid.o1");
  const takenBack = world(consentOnRecord());
  await takenBack.record(yes);
  await takenBack.run(yes, offers("opted_out"), true);
  assert.deepEqual(takenBack.seen.sent, [], "no confirmation of a yes the person since took back");
  assert.equal(takenBack.seen.escalations.length, 0, "and nobody is asked to send it by hand");
  // The same answer while the yes stands is confirmed in the program's words, as a new YES OFFERS is.
  const stands = world(consentOnRecord());
  await stands.record(yes);
  await stands.run(yes, offers("opted_in"), true);
  assert.deepEqual(
    stands.seen.sent.map((m) => m.body),
    [optInConfirmation("Harbor Nails", "marketing")],
  );
  // A YES OFFERS taken in once is confirmed whatever an earlier answer said: it is the person's newest word.
  const fresh = world(consentOnRecord());
  await fresh.run(text("YES OFFERS", "wamid.o2"), offers("opted_out"));
  assert.deepEqual(
    fresh.seen.sent.map((m) => m.body),
    [optInConfirmation("Harbor Nails", "marketing")],
  );
});

test("a START does not bring back a yes to offers a STOP ended: WhatsApp says how to get them again, a text says the filed words alone", async () => {
  // A STOP ends the yes to offers (00323), and a START is a yes to messages about their visit and nothing more. The
  // person is told once, after the filed words, on WhatsApp alone: the texting line's confirmation is the campaign's
  // filed opt-in message word for word, and offers are never offered there (30896).
  const filed = optInConfirmation("Harbor Nails", "conversational");
  const ended = { marketingConsent: "unknown", marketingConsentSource: STOP_ENDED_OFFERS_SOURCE };
  // The gate reads one row, by the id the ingest answered: never the whole account of the person the reply reads.
  const asked = [];
  const leads = (answer) => ({
    leads: {
      read: async () => {
        throw new Error("the START gate does not read the lead context");
      },
      personReplyMode: async () => null,
      offersAnswer: async (_db, tenant, contact) => {
        asked.push([tenant, contact]);
        return answer();
      },
    },
  });

  const w = world();
  await w.run(
    text("START"),
    leads(async () => ended),
  );
  assert.deepEqual(w.seen.sent, [
    {
      to: FROM,
      body: `${filed} Offers and news stay off. Reply YES OFFERS to get them here again.`,
      meta: { ack: true, confirmation: "conversational" },
      channel: "whatsapp",
    },
  ]);
  assert.equal(asked.length, 1, "one read");
  assert.equal(asked[0][1], "k1", "by the person the ingest named");

  // By text, the filed words and not one more.
  const sms = world({
    carrier: {
      channel: "sms",
      send: async () => ({ ok: true, wamid: "s1", status: 200 }),
      body: (t) => t,
      held: null,
    },
  });
  await sms.run(
    text("START"),
    leads(async () => ended),
  );
  assert.equal(sms.seen.sent.length, 1);
  assert.equal(sms.seen.sent[0].body, filed);
  assert.equal(asked.length, 1, "and a text does not even ask");

  // Nobody is asked a second time, and a no is not argued with: only a yes a stop ended is spoken of.
  for (const lead of [
    { marketingConsent: "unknown", marketingConsentSource: null },
    { marketingConsent: "unknown", marketingConsentSource: "operator" },
    { marketingConsent: "opted_out", marketingConsentSource: "customer_message" },
    // A no WhatsApp reported, and a yes that stands (one given again since the stop).
    { marketingConsent: "opted_out", marketingConsentSource: "whatsapp" },
    { marketingConsent: "opted_in", marketingConsentSource: "customer_message" },
    // Nobody by that id.
    null,
  ]) {
    const other = world();
    await other.run(
      text("START"),
      leads(async () => lead),
    );
    assert.equal(other.seen.sent[0].body, filed, JSON.stringify(lead));
  }

  // A row that cannot be read costs the sentence, never the confirmation.
  const unread = world();
  await unread.run(
    text("START"),
    leads(async () => {
      throw new Error("the database is away");
    }),
  );
  assert.equal(unread.seen.sent.length, 1);
  assert.equal(unread.seen.sent[0].body, filed);
  assert.equal(unread.seen.escalations.length, 0);
});

test("a redelivered pin drop escalates and emails once, not once per redelivery", async () => {
  // Meta redelivers undelivered webhooks with backoff for days. The dedupe gate
  // used to sit BELOW this branch, so on the memory path every redelivery
  // re-opened the handoff and sent the owner another email.
  const w = world();
  const pin = {
    from: FROM,
    id: "wamid.loc",
    type: "location",
    timestamp: String(Math.floor(Date.now() / 1000)),
    location: { latitude: 25.7, longitude: -80.2 },
  };
  await w.run(pin);
  await w.run(pin);
  assert.equal(w.seen.escalations.length, 1, "one escalation for one pin drop");
  assert.deepEqual(w.seen.alerts, [], `and its one notice: ${FROM_ITS_EVENT}`);
  assert.equal(w.seen.sent.length, 0, "a pin drop is readable: no apology");
});

test("a STOP, redelivered, opens no handoff at all: it is news told once from its consent event, never a wait", async () => {
  const w = world();
  await w.run(text("STOP"));
  await w.run(text("STOP"));
  assert.deepEqual(w.seen.escalations, []);
  assert.deepEqual(w.seen.alerts, []);
  assert.equal(w.seen.sent.length, 0, "and nothing is said back, however often it is delivered");
});

test("a thumbs-up or a system notice is kept and handled, and nothing is said, escalated, paused or downloaded", async () => {
  // Nothing was asked of us. A thumbs-up on the receptionist's reply used to be answered "sorry, I can't read that",
  // then the receptionist went silent on that customer for a day, an escalation opened and the owner was emailed. The
  // kinds are asked before the unreadable branch (gates.ts, then unreadable.ts), and either order failing shows here:
  // a thumbs-up carries its emoji as words, so it would be answered, and one without an emoji would be apologised for.
  const at = String(Math.floor(Date.now() / 1000));
  for (const m of [
    {
      from: FROM,
      id: "wamid.like",
      type: "reaction",
      timestamp: at,
      reaction: { message_id: "wamid.1", emoji: "\u{1F44D}" },
    },
    { from: FROM, id: "wamid.unlike", type: "reaction", timestamp: at, reaction: { message_id: "wamid.1" } },
    {
      from: FROM,
      id: "wamid.system",
      type: "system",
      timestamp: at,
      system: { body: "Dana changed their number", type: "customer_changed_number" },
    },
  ]) {
    const w = world();
    await w.run(m);
    assert.equal(w.seen.sent.length, 0, `${m.id}: nothing is said`);
    assert.equal(w.seen.escalations.length, 0, `${m.id}: nobody is asked`);
    assert.equal(w.seen.alerts.length, 0, `${m.id}: nobody is told`);
    assert.equal(w.seen.pauses.length, 0, `${m.id}: the receptionist is not muted`);
    assert.equal(w.seen.media, 0, `${m.id}: nothing is downloaded`);
    assert.equal(w.seen.processed, 1, `${m.id}: and it is handled`);
  }
});
