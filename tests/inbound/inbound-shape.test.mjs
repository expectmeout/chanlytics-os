/**
 * One inbound message, whatever brought it (decision 0001): a WhatsApp message and a text each become the one shape,
 * InboundMessage (packages/channels/src/inbound.ts), by their own adapter, and the doors hand nothing else to the
 * receptionist.
 *
 * The WhatsApp adapter is the normaliser renamed and widened: what normalizeInbound reads, with the wire it came on and
 * the person's identity in place of `waId` and `phoneDigits`. The text's adapter reads Twilio's fields straight. What it
 * makes of each text below is what the road it replaced made of it (Twilio's fields as a WhatsApp message, the
 * normaliser, the carrier's verdict and the carriers' words), read off that road before it was deleted (step 3): a word
 * read differently here is a person answered who asked to stop.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as channels from "@chanlytics/channels";

const { inboundFromSms, inboundFromWhatsapp, normalizeInbound, smsInboundFrom } = channels;

const FROM = "16465550123";
const value = { metadata: { phone_number_id: "p1" }, contacts: [{ wa_id: FROM, profile: { name: "Dana" } }] };
const wa = (over = {}) => ({
  from: FROM,
  id: "wamid.1",
  type: "text",
  timestamp: "1788793200",
  text: { body: "Are you open Saturday?" },
  ...over,
});
const FORM = {
  MessageSid: "SM0001",
  AccountSid: "AC1",
  From: `+${FROM}`,
  To: "+13055550100",
  Body: "Are you open Saturday?",
  NumMedia: "0",
  MessagingServiceSid: "MG1",
};
const NOW = Date.parse("2026-09-07T15:00:00.400Z");

/** What the one shape holds of a normalised message: the correspondence this step promises, written out once. */
const oneShapeOf = (n, channel) => ({
  channel,
  externalId: n.messageId,
  identity: { externalId: n.waId, phoneE164: n.phoneDigits ? `+${n.phoneDigits}` : null, email: null },
  profileName: n.profileName,
  type: n.type,
  kind: n.kind,
  rawType: n.rawType,
  body: n.body,
  channelTsIso: n.channelTsIso,
  media: n.media,
  consent: { optOut: n.optOut, optIn: n.optIn, optInMarketing: n.optInMarketing },
  referral: n.referral,
});

test("a WhatsApp message becomes the one shape: its wire, its person, and its words as the normaliser reads them", () => {
  assert.deepEqual(inboundFromWhatsapp(wa(), value), {
    channel: "whatsapp",
    externalId: "wamid.1",
    identity: { externalId: FROM, phoneE164: `+${FROM}`, email: null },
    profileName: "Dana",
    type: "text",
    kind: "text",
    rawType: "text",
    body: "Are you open Saturday?",
    channelTsIso: "2026-09-07T15:00:00.000Z",
    media: null,
    consent: { optOut: false, optIn: false, optInMarketing: false },
    referral: null,
  });
  const messages = [
    wa(),
    wa({ timestamp: undefined }),
    wa({ text: { body: "STOP" } }),
    wa({ text: { body: "YES OFFERS" } }),
    wa({ type: "button", text: undefined, button: { text: "Detener", payload: "stop" } }),
    wa({
      type: "interactive",
      text: undefined,
      interactive: { type: "list_reply", list_reply: { id: "start", title: "Start" } },
    }),
    wa({ type: "reaction", text: undefined, reaction: { message_id: "wamid.0", emoji: "👍" } }),
    wa({ type: "location", text: undefined, location: { latitude: 1.5, longitude: 2.5, name: "The salon" } }),
    wa({ type: "image", text: undefined, image: { id: "media-1", mime_type: "image/jpeg", caption: "this one" } }),
    wa({ type: "sticker", text: undefined, sticker: { id: "media-2", mime_type: "image/webp" } }),
    wa({ type: "order", text: undefined }),
    wa({ referral: { source_id: "120200000000001", source_type: "ad", headline: "Spring refills" } }),
  ];
  for (const m of messages) {
    assert.deepEqual(inboundFromWhatsapp(m, value), oneShapeOf(normalizeInbound(m, value), "whatsapp"), m.type);
  }
  // A batch from two senders: the person is the message's own sender, never another's contact.
  const batch = { contacts: [{ wa_id: "15550009999", profile: { name: "Someone Else" } }, { wa_id: "15550008888" }] };
  assert.deepEqual(inboundFromWhatsapp(wa(), batch).identity, { externalId: FROM, phoneE164: `+${FROM}`, email: null });
  assert.equal(inboundFromWhatsapp(wa(), batch).profileName, null);
});

/** What a text says, and how it says it: the fields that differ from text to text below. */
const said = (body, kind = "text", type = "text", rawType = "text") => ({ body, kind, type, rawType });
const NO = { optOut: false, optIn: false, optInMarketing: false };

test("a text becomes the one shape with no WhatsApp message on the way: each text as the road it replaced made it", () => {
  assert.deepEqual(inboundFromSms(smsInboundFrom(FORM), NOW), {
    channel: "sms",
    externalId: "SM0001",
    identity: { externalId: FROM, phoneE164: `+${FROM}`, email: null },
    profileName: null,
    type: "text",
    kind: "text",
    rawType: "text",
    body: "Are you open Saturday?",
    channelTsIso: "2026-09-07T15:00:00.000Z",
    media: null,
    consent: NO,
    referral: null,
  });
  const texts = [
    ["words", {}, said("Are you open Saturday?"), NO],
    ["words with spaces around them", { Body: "  Are you open Saturday?  " }, said("Are you open Saturday?"), NO],
    ["words and a picture", { Body: "this one", NumMedia: "1" }, said("this one [with a picture]"), NO],
    ["words and two pictures", { Body: "these", NumMedia: "2" }, said("these [with 2 pictures]"), NO],
    ["a picture alone", { Body: "", NumMedia: "1" }, said(null, "unsupported", "media", "image"), NO],
    ["nothing at all", { Body: "" }, said(null, "unsupported", "media", "unsupported"), NO],
    ["STOP, with the carrier's verdict", { Body: "STOP", OptOutType: "STOP" }, said("STOP"), { ...NO, optOut: true }],
    [
      "a sentence the carrier took for a STOP",
      { Body: "please stop", OptOutType: "STOP" },
      said("please stop"),
      { ...NO, optOut: true },
    ],
    ["the same sentence with no verdict", { Body: "please stop" }, said("please stop"), NO],
    ["a request to stop, as a sentence", { Body: "stop texting me" }, said("stop texting me"), { ...NO, optOut: true }],
    ["the carriers' word", { Body: "cancel" }, said("cancel"), { ...NO, optOut: true }],
    ["the word inside a question", { Body: "can you cancel my 4pm?" }, said("can you cancel my 4pm?"), NO],
    ["stop as an ordinary word", { Body: "Stop by the salon at 4" }, said("Stop by the salon at 4"), NO],
    [
      "START, with the carrier's verdict",
      { Body: "START", OptOutType: "START" },
      said("START"),
      { ...NO, optIn: true },
    ],
    ["start, in their own words", { Body: "start" }, said("start"), { ...NO, optIn: true }],
    ["YES OFFERS", { Body: "YES OFFERS" }, said("YES OFFERS"), { ...NO, optInMarketing: true }],
    ["HELP is no answer either way", { Body: "hello", OptOutType: "HELP" }, said("hello"), NO],
    ["a number written with spaces and brackets", { From: "+1 (646) 555-0123" }, said("Are you open Saturday?"), NO],
  ];
  for (const [name, fields, words, consent] of texts) {
    const n = inboundFromSms(smsInboundFrom({ ...FORM, ...fields }), NOW);
    const { body, kind, type, rawType } = n;
    assert.deepEqual({ body, kind, type, rawType }, words, name);
    assert.deepEqual(n.consent, consent, `${name}: what they said about being written to`);
    assert.deepEqual(n.identity, { externalId: FROM, phoneE164: `+${FROM}`, email: null }, `${name}: one person`);
    assert.deepEqual(
      [n.media, n.referral, n.profileName],
      [null, null, null],
      `${name}: nothing a text does not carry`,
    );
  }
  // The time it came is the second it came in.
  assert.equal(inboundFromSms(smsInboundFrom(FORM), NOW).channelTsIso, "2026-09-07T15:00:00.000Z");
});

test("the WhatsApp-shaped road is gone: no text becomes a WhatsApp message, and no carrier adds a consent of its own", () => {
  assert.equal(channels.smsAsWaMessage, undefined);
  assert.equal(channels.withCarrierConsent, undefined);
});

test("the same words on the two wires are one message, but for the wire, the person and each wire's own word for stop", () => {
  const onWhatsapp = inboundFromWhatsapp(wa(), value);
  const onText = inboundFromSms(smsInboundFrom(FORM), NOW);
  const words = ({ type, kind, rawType, body, channelTsIso, media, consent, referral }) => ({
    type,
    kind,
    rawType,
    body,
    channelTsIso,
    media,
    consent,
    referral,
  });
  assert.deepEqual(words(onText), words(onWhatsapp));
  assert.deepEqual([onWhatsapp.channel, onText.channel], ["whatsapp", "sms"]);
  assert.deepEqual(onText.identity, onWhatsapp.identity, "one person is one thread across both wires");
  assert.equal(onText.profileName, null, "a text carries no name");
  // Neither carries WhatsApp's own words for a person: the identity says who they are on every wire.
  for (const m of [onWhatsapp, onText]) {
    assert.equal("waId" in m, false);
    assert.equal("phoneDigits" in m, false);
    assert.equal("messageId" in m, false);
  }
  // "Cancel" is the carriers' word for stop on a texting line, and an ordinary word on WhatsApp.
  assert.equal(inboundFromSms(smsInboundFrom({ ...FORM, Body: "cancel" }), NOW).consent.optOut, true);
  assert.equal(inboundFromWhatsapp(wa({ text: { body: "cancel" } }), value).consent.optOut, false);
  // The carrier's own STOP stands whatever the words were.
  assert.equal(inboundFromSms(smsInboundFrom({ ...FORM, Body: "ok", OptOutType: "STOP" }), NOW).consent.optOut, true);
});
