/**
 * One inbound message, whatever brought it (decision 0001, step 2): a WhatsApp message and a text each become the one
 * shape, InboundMessage (packages/channels/src/inbound.ts), by their own adapter.
 *
 * The WhatsApp adapter is the normaliser renamed and widened: what normalizeInbound reads, with the wire it came on and
 * the person's identity in place of `waId` and `phoneDigits`. The text's adapter reads Twilio's fields straight, with no
 * WhatsApp message on the way, and it must make exactly what today's road makes of the same text (smsAsWaMessage, the
 * normaliser, the carrier's verdict and the carriers' words): the doors move onto it in step 3, and a word read
 * differently there is a person answered who asked to stop.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inboundFromSms,
  inboundFromWhatsapp,
  normalizeInbound,
  smsInboundFrom,
  smsAsWaMessage,
  withCarrierConsent,
  carrierConsent,
  smsKeywordConsent,
  mergeConsent,
} from "@chanlytics/channels";

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

/** Today's road for a text: Twilio's fields as a WhatsApp message, normalised, with the carrier's verdict and the carriers' words. */
const todaysText = (s, nowMs) =>
  withCarrierConsent(
    normalizeInbound(smsAsWaMessage(s, nowMs), {}),
    mergeConsent(carrierConsent(s), smsKeywordConsent(s.body)),
  );

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

test("a text becomes the one shape with no WhatsApp message on the way: field for field what today's road makes of it", () => {
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
    consent: { optOut: false, optIn: false, optInMarketing: false },
    referral: null,
  });
  const forms = [
    FORM,
    { ...FORM, Body: "  Are you open Saturday?  " },
    { ...FORM, Body: "this one", NumMedia: "1", MediaContentType0: "image/jpeg" },
    { ...FORM, Body: "these", NumMedia: "2", MediaContentType0: "image/jpeg", MediaContentType1: "image/png" },
    { ...FORM, Body: "", NumMedia: "1", MediaContentType0: "image/jpeg" },
    { ...FORM, Body: "", NumMedia: "0" },
    { ...FORM, Body: "STOP", OptOutType: "STOP" },
    { ...FORM, Body: "please stop", OptOutType: "STOP" },
    { ...FORM, Body: "please stop" },
    { ...FORM, Body: "stop texting me" },
    { ...FORM, Body: "cancel" },
    { ...FORM, Body: "can you cancel my 4pm?" },
    { ...FORM, Body: "Stop by the salon at 4" },
    { ...FORM, Body: "START", OptOutType: "START" },
    { ...FORM, Body: "start" },
    { ...FORM, Body: "YES OFFERS" },
    { ...FORM, Body: "hello", OptOutType: "HELP" },
    { ...FORM, From: "+1 (646) 555-0123" },
  ];
  for (const form of forms) {
    const s = smsInboundFrom(form);
    assert.deepEqual(inboundFromSms(s, NOW), oneShapeOf(todaysText(s, NOW), "sms"), JSON.stringify(form));
  }
  // The time it came is the second it came in, as today's road keeps it.
  assert.equal(inboundFromSms(smsInboundFrom(FORM), NOW).channelTsIso, "2026-09-07T15:00:00.000Z");
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
