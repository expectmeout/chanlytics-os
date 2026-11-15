/**
 * A follow-up WhatsApp approved as an offer goes in the open chat (decision 0135): the pick.
 *
 * The ready-made booking follow-up was approved by WhatsApp as an offer (15 Nov 2026). A run then enrols by the yes to
 * offers on every channel (contracts enrolPurpose), and from a US number that leaves nothing: WhatsApp delivers no offer
 * there, no text carries one, and email waits on the workspace's offers. The person it is for wrote on WhatsApp within
 * the day, and a business may write freely in a chat for 24 hours after a person's last message. So a step of that kind
 * says so to the pick (`inChat`: its moment's own yes, and the moment the send is for), and a person whose chat is open
 * then is picked on WhatsApp under the moment's yes; everyone else is picked as they were. Run on the one pick (contracts
 * reachFor) over the workspace's channels as the edge reads them (channelsReady).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsReady, reachFor, whatsappOffersOpen } from "@chanlytics/contracts";

const HOUR = 3_600_000;
/** Monday 16 November 2026, 10:00 AM in New York: the moment a follow-up's batch is for. */
const AT = Date.parse("2026-11-16T15:00:00Z");
const ago = (hours) => new Date(AT - hours * HOUR).toISOString();
const US_NUMBER = "+13055550100";
const UK_NUMBER = "+442079460958";

/** A workspace that can send on all three, offers by email not yet open, as a new workspace's are. */
const ready = (number = US_NUMBER, over = {}) =>
  channelsReady({
    whatsapp: { canSend: true, refusal: null, number },
    textLine: { sms_state: "active", reg_mock: false },
    email: { mailbox: true, domain: true },
    ...over,
  });

/** Someone who said yes to messages and never to offers, with a number and an address. */
const person = (over = {}, consent = {}) => ({
  phone: "+13055550142",
  email: "dana@example.com",
  lastChannel: "whatsapp",
  consent: {
    state: "opted_in",
    dnc: false,
    label: "Opted in",
    sub: "",
    source: "customer_message",
    marketing: "unknown",
    marketingSource: null,
    marketingSub: "",
    ...consent,
  },
  ...over,
});

const TICKS = ["whatsapp", "sms", "email"];
/** The step's run as it is asked today: an offer by WhatsApp's word, about something of theirs. */
const how = (over = {}) => ({ channels: TICKS, ready: ready(), about: "theirs", ...over });
/** The same, saying its reply may go in an open chat under its moment's own yes. */
const inChat = (over = {}) => how({ inChat: { purpose: "conversational", atMs: AT }, ...over });

test("as it was: from a US number an offer under a follow-up reaches nobody who has not said yes to offers", () => {
  assert.equal(whatsappOffersOpen(US_NUMBER).ok, false, "WhatsApp delivers no offer to a US number");
  assert.deepEqual(reachFor(person({ waInboundAt: ago(5) }), "marketing", how()), {
    channel: null,
    held: "no_channel",
  });
});

test("a person whose WhatsApp chat is open is picked on WhatsApp, in the chat, under their yes to messages", () => {
  assert.deepEqual(
    reachFor(person({ waInboundAt: ago(5) }), "marketing", inChat()),
    { channel: "whatsapp", held: null, inChat: true },
    "REGRESSION (15 Nov 2026): the follow-up reached nobody, a day after they wrote",
  );
  // Whatever channel they wrote on last, and where offers can go anyway: the open chat is asked first.
  assert.deepEqual(reachFor(person({ waInboundAt: ago(5), lastChannel: "sms" }), "marketing", inChat()), {
    channel: "whatsapp",
    held: null,
    inChat: true,
  });
  const saidYesToOffers = person(
    { waInboundAt: ago(5) },
    { marketing: "opted_in", marketingSource: "customer_message" },
  );
  assert.deepEqual(reachFor(saidYesToOffers, "marketing", inChat({ ready: ready(UK_NUMBER) })), {
    channel: "whatsapp",
    held: null,
    inChat: true,
  });
});

test("a chat that is closed, or was never open, is no chat to reply in: they are picked as they were", () => {
  for (const waInboundAt of [ago(25), null, undefined])
    assert.deepEqual(
      reachFor(person({ waInboundAt }), "marketing", inChat()),
      { channel: null, held: "no_channel" },
      String(waInboundAt),
    );
  // The 24 hours are counted to the moment the send is for, not to now: open at ten, closed by the afternoon.
  const wrote = person({ waInboundAt: ago(20) });
  assert.equal(reachFor(wrote, "marketing", inChat()).channel, "whatsapp");
  assert.equal(
    reachFor(wrote, "marketing", inChat({ inChat: { purpose: "conversational", atMs: AT + 5 * HOUR } })).channel,
    null,
  );
  // Someone an offer does reach, with no chat open, goes as an offer goes: never marked as a reply in the chat.
  const saidYes = person({ waInboundAt: ago(25) }, { marketing: "opted_in", marketingSource: "customer_message" });
  assert.deepEqual(reachFor(saidYes, "marketing", inChat({ ready: ready(UK_NUMBER) })), {
    channel: "whatsapp",
    held: null,
  });
});

test("the open chat asks the person's own answers too: a stop, no yes to messages and no number hold them, and say so", () => {
  const open = { waInboundAt: ago(5) };
  assert.deepEqual(reachFor(person(open, { state: "opted_out" }), "marketing", inChat()), {
    channel: null,
    held: "stopped",
  });
  assert.deepEqual(reachFor(person(open, { dnc: true }), "marketing", inChat()), { channel: null, held: "stopped" });
  assert.deepEqual(reachFor(person(open, { state: "unknown" }), "marketing", inChat()), {
    channel: null,
    held: "no_yes",
  });
  assert.deepEqual(reachFor(person({ ...open, phone: null }), "marketing", inChat()), {
    channel: null,
    held: "no_number",
  });
});

test("only where the step goes by WhatsApp and the number can send: a step that does not tick it, or a number that cannot, replies in no chat", () => {
  const open = person({ waInboundAt: ago(5) });
  assert.deepEqual(reachFor(open, "marketing", inChat({ channels: ["sms", "email"] })), {
    channel: null,
    held: "no_channel",
  });
  const cannot = ready(US_NUMBER, {
    whatsapp: { canSend: false, refusal: "Your number is restricted.", number: US_NUMBER },
  });
  assert.deepEqual(reachFor(open, "marketing", inChat({ ready: cannot })), { channel: null, held: "no_channel" });
  // A step that says nothing of a chat is picked as it always was, whoever wrote.
  assert.deepEqual(reachFor(open, "marketing", how()), { channel: null, held: "no_channel" });
});
