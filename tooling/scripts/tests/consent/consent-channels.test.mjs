/**
 * A yes covers the channels it was given for (One message, every channel, step 2; the campaigns-on-every-channel spec,
 * 4.1 and decision 6). Which channels each way of saying yes covers; a yes recorded before the channels were keeps the
 * WhatsApp reach it had; the one predicate asks on the channel a message goes out on; email is its own; and a person's
 * page says the channels in words. The database keeps the same table (consent-channels.db.test.mjs holds it to this).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  channelsOfYes,
  channelsWords,
  coveredChannels,
  mayMessageFor,
  whyNotReceive,
  yesCovers,
} from "@chanlytics/contracts";

test("which channels each way of saying yes covers", () => {
  // Their own message covers the channel it came on, for either answer.
  assert.deepEqual(channelsOfYes("conversational", "customer_message", "whatsapp"), ["whatsapp"]);
  assert.deepEqual(
    channelsOfYes("conversational", "customer_message", "sms"),
    ["sms"],
    "a START by text is not a WhatsApp yes",
  );
  assert.deepEqual(channelsOfYes("conversational", "customer_message", "email"), ["email"]);
  assert.deepEqual(channelsOfYes("marketing", "customer_message", "whatsapp"), ["whatsapp"]);
  // Changed: a YES OFFERS by text or email also covers WhatsApp (it was ["sms"]): offers go by WhatsApp alone, so a yes
  // that covered only the channel it came on never led to an offer, whatever the confirmation said.
  assert.deepEqual(
    channelsOfYes("marketing", "customer_message", "sms"),
    ["whatsapp", "sms"],
    "WhatsApp first, the house order; the door still refuses offers by text",
  );
  assert.deepEqual(channelsOfYes("marketing", "customer_message", "email"), ["whatsapp", "email"]);
  assert.deepEqual(
    channelsOfYes("conversational", "customer_message", "sms"),
    ["sms"],
    "only the offers yes reaches WhatsApp: a START by text is still the text's alone",
  );
  // The registered texting flow: the sign-up page or the signed form, and the spoken script.
  assert.deepEqual(channelsOfYes("conversational", "form", null), ["whatsapp", "sms"]);
  assert.deepEqual(channelsOfYes("conversational", "phone", null), ["whatsapp", "sms"]);
  // The form's offers ask is on WhatsApp alone; a yes to offers is never by voice or in person.
  assert.deepEqual(channelsOfYes("marketing", "form", null), ["whatsapp"]);
  assert.deepEqual(channelsOfYes("marketing", "phone", null), []);
  assert.deepEqual(channelsOfYes("marketing", "in_person", null), []);
  // A yes the team set, in person or otherwise, and any yes with no channel on record: WhatsApp, the reach it had.
  assert.deepEqual(channelsOfYes("conversational", "in_person", null), ["whatsapp"]);
  assert.deepEqual(channelsOfYes("conversational", "operator", null), ["whatsapp"]);
  assert.deepEqual(channelsOfYes("conversational", "customer_message", null), ["whatsapp"]);
  assert.deepEqual(
    channelsOfYes("conversational", "customer_message", "voice"),
    ["whatsapp"],
    "a call is no channel a yes covers",
  );
  assert.deepEqual(channelsOfYes("marketing", "customer_message", null), ["whatsapp"]);
});

test("a yes recorded before the channels were covers WhatsApp alone, the reach it had; a kept list is read as kept", () => {
  assert.equal(yesCovers(null, "whatsapp"), true);
  assert.equal(yesCovers(undefined, "whatsapp"), true, "a row read without the column");
  assert.equal(yesCovers(null, "sms"), false);
  assert.equal(yesCovers([], "whatsapp"), false, "kept, and none: a STOP emptied it");
  assert.equal(yesCovers(["sms"], "whatsapp"), false);
  assert.equal(yesCovers(["whatsapp", "sms"], "sms"), true);
  assert.deepEqual(coveredChannels(null), ["whatsapp"]);
  assert.deepEqual(coveredChannels(["sms", "whatsapp"]), ["whatsapp", "sms"], "in the order the page says them");
  assert.equal(channelsWords(["whatsapp"]), "on WhatsApp");
  assert.equal(channelsWords(["whatsapp", "sms"]), "on WhatsApp and by text");
  assert.equal(channelsWords(["whatsapp", "sms", "email"]), "on WhatsApp, by text and by email");
});

test("the one predicate asks on the channel the message goes out on", () => {
  const yes = { consent: "opted_in", dnc: false, marketing_consent: "opted_in" };
  // A yes kept as WhatsApp's: a WhatsApp reminder and offer go; a text that starts a conversation does not.
  const wa = { ...yes, consent_channels: ["whatsapp"], marketing_channels: ["whatsapp"] };
  assert.equal(mayMessageFor(wa, "conversational", { proactive: true, channel: "whatsapp" }).ok, true);
  assert.equal(mayMessageFor(wa, "marketing", { proactive: true, channel: "whatsapp" }).ok, true);
  assert.deepEqual(mayMessageFor(wa, "conversational", { proactive: true, channel: "sms" }), {
    ok: false,
    reason: "not_opted_in",
  });
  // A reply answers whoever wrote, on the channel they wrote on: no yes is asked of it.
  assert.equal(mayMessageFor(wa, "conversational", { proactive: false, channel: "sms" }).ok, true);
  // A START by text, kept as the text's: a text reminder goes, a WhatsApp one does not.
  const text = { ...yes, consent_channels: ["sms"], marketing_channels: [] };
  assert.equal(mayMessageFor(text, "conversational", { proactive: true, channel: "sms" }).ok, true);
  assert.equal(mayMessageFor(text, "conversational", { proactive: true, channel: "whatsapp" }).ok, false);
  assert.deepEqual(mayMessageFor(text, "marketing", { channel: "whatsapp" }), {
    ok: false,
    reason: "no_marketing_consent",
  });
  // A yes recorded before the channels were: as before, WhatsApp.
  assert.equal(mayMessageFor(yes, "conversational", { proactive: true, channel: "whatsapp" }).ok, true);
  assert.equal(mayMessageFor(yes, "marketing", { channel: "whatsapp" }).ok, true);
  assert.equal(mayMessageFor(yes, "conversational", { proactive: true, channel: "sms" }).ok, false);
  // A STOP stops every channel, whatever the channels kept.
  const stopped = { ...wa, consent: "opted_out" };
  assert.deepEqual(mayMessageFor(stopped, "conversational", { channel: "email" }), { ok: false, reason: "opted_out" });
});

test("email is its own: a message about a visit needs no yes, an offer needs the email yes, an unsubscribe ends it", () => {
  const none = { consent: "unknown", dnc: false, marketing_consent: "unknown" };
  assert.equal(mayMessageFor(none, "conversational", { proactive: true, channel: "email" }).ok, true);
  assert.deepEqual(mayMessageFor(none, "marketing", { channel: "email" }), {
    ok: false,
    reason: "no_marketing_consent",
  });
  assert.equal(mayMessageFor({ ...none, email_marketing: "opted_in" }, "marketing", { channel: "email" }).ok, true);
  assert.deepEqual(mayMessageFor({ ...none, email_marketing: "opted_out" }, "marketing", { channel: "email" }), {
    ok: false,
    reason: "unsubscribed",
  });
  assert.deepEqual(mayMessageFor({ ...none, dnc: true }, "conversational", { channel: "email" }), {
    ok: false,
    reason: "opted_out",
  });
});

test("whether a person can be reached on a channel: its own way to reach them, then the yes it covers", () => {
  const row = (over = {}) => ({
    phone: "+15550100",
    email: null,
    consent: { state: "opted_in", dnc: false, marketing: "opted_in", channels: ["sms"], marketingChannels: null },
    ...over,
  });
  assert.equal(whyNotReceive(row(), "conversational", "sms"), null);
  assert.equal(whyNotReceive(row(), "conversational", "whatsapp"), "no_yes", "their yes was by text");
  assert.equal(whyNotReceive(row(), "marketing", "whatsapp"), null, "the offers yes kept none: WhatsApp's");
  assert.equal(whyNotReceive(row({ phone: null }), "conversational", "sms"), "no_number");
  assert.equal(whyNotReceive(row(), "conversational", "email"), "no_address", "an email needs an address");
  assert.equal(whyNotReceive(row({ email: "dani@example.com" }), "conversational", "email"), null);
});
