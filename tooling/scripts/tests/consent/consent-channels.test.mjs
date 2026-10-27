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
  // A yes in their own DM (decision 0001, step 8) covers no wire a conversation is started on: Instagram lets a business
  // start none, and a DM is no yes for a wire it did not come on. It still lifts their stop.
  assert.deepEqual(channelsOfYes("conversational", "customer_message", "instagram"), []);
  assert.deepEqual(channelsOfYes("marketing", "customer_message", "instagram"), []);
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
  // What a message is about decides only email's rule (decision D1): a reminder here is about their visit (theirs), an offer
  // is the business's own (ours), and on WhatsApp and text neither changes what is asked.
  const wa = { ...yes, consent_channels: ["whatsapp"], marketing_channels: ["whatsapp"] };
  const theirs = { about: "theirs" };
  const ours = { about: "ours" };
  assert.equal(mayMessageFor(wa, "conversational", { proactive: true, channel: "whatsapp", ...theirs }).ok, true);
  assert.equal(mayMessageFor(wa, "marketing", { proactive: true, channel: "whatsapp", ...ours }).ok, true);
  assert.deepEqual(mayMessageFor(wa, "conversational", { proactive: true, channel: "sms", ...theirs }), {
    ok: false,
    reason: "not_opted_in",
  });
  assert.deepEqual(
    mayMessageFor(wa, "conversational", { proactive: true, channel: "sms", ...ours }),
    { ok: false, reason: "not_opted_in" },
    "the same by text whichever it is about: only email asks it",
  );
  // A reply answers whoever wrote, on the channel they wrote on: no yes is asked of it.
  assert.equal(mayMessageFor(wa, "conversational", { proactive: false, channel: "sms", ...theirs }).ok, true);
  // A START by text, kept as the text's: a text reminder goes, a WhatsApp one does not.
  const text = { ...yes, consent_channels: ["sms"], marketing_channels: [] };
  assert.equal(mayMessageFor(text, "conversational", { proactive: true, channel: "sms", ...theirs }).ok, true);
  assert.equal(mayMessageFor(text, "conversational", { proactive: true, channel: "whatsapp", ...theirs }).ok, false);
  assert.deepEqual(mayMessageFor(text, "marketing", { channel: "whatsapp", ...ours }), {
    ok: false,
    reason: "no_marketing_consent",
  });
  // A yes recorded before the channels were: as before, WhatsApp.
  assert.equal(mayMessageFor(yes, "conversational", { proactive: true, channel: "whatsapp", ...theirs }).ok, true);
  assert.equal(mayMessageFor(yes, "marketing", { channel: "whatsapp", ...ours }).ok, true);
  assert.equal(mayMessageFor(yes, "conversational", { proactive: true, channel: "sms", ...theirs }).ok, false);
  // A STOP stops every channel, whatever the channels kept.
  const stopped = { ...wa, consent: "opted_out" };
  assert.deepEqual(mayMessageFor(stopped, "conversational", { channel: "email", ...theirs }), {
    ok: false,
    reason: "opted_out",
  });
});

test("email is its own: a message about their visit needs no yes, the business's news and an offer need the email yes or a relationship, an unsubscribe ends both", () => {
  const none = { consent: "unknown", dnc: false, marketing_consent: "unknown" };
  // About their own visit or proposal (theirs): an address is all it asks, as decision 11 says (decision D1 keeps it).
  assert.equal(mayMessageFor(none, "conversational", { proactive: true, channel: "email", about: "theirs" }).ok, true);
  // The business's own news (ours) is no visit reminder, whatever its WhatsApp template's category: it asks what an offer asks.
  assert.deepEqual(mayMessageFor(none, "conversational", { proactive: true, channel: "email", about: "ours" }), {
    ok: false,
    reason: "not_opted_in",
  });
  assert.deepEqual(mayMessageFor(none, "marketing", { channel: "email", about: "ours" }), {
    ok: false,
    reason: "no_marketing_consent",
  });
  assert.equal(
    mayMessageFor({ ...none, email_marketing: "opted_in" }, "marketing", { channel: "email", about: "ours" }).ok,
    true,
  );
  assert.deepEqual(
    mayMessageFor({ ...none, email_marketing: "opted_out" }, "marketing", { channel: "email", about: "ours" }),
    {
      ok: false,
      reason: "unsubscribed",
    },
  );
  assert.deepEqual(
    mayMessageFor({ ...none, email_marketing: "opted_out" }, "conversational", {
      proactive: true,
      channel: "email",
      about: "ours",
    }),
    { ok: false, reason: "unsubscribed" },
    "an unsubscribe ends the news by email too",
  );
  assert.equal(
    mayMessageFor({ ...none, email_marketing: "opted_out" }, "conversational", {
      proactive: true,
      channel: "email",
      about: "theirs",
    }).ok,
    true,
    "and leaves their visit's messages alone",
  );
  assert.deepEqual(mayMessageFor({ ...none, dnc: true }, "conversational", { channel: "email", about: "theirs" }), {
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
  // The people here are reached about their visit (theirs); what the business sends of its own choosing (ours) differs by
  // email alone (decision D1), asked below.
  assert.equal(whyNotReceive(row(), "conversational", "sms", "theirs"), null);
  assert.equal(whyNotReceive(row(), "conversational", "whatsapp", "theirs"), "no_yes", "their yes was by text");
  assert.equal(whyNotReceive(row(), "marketing", "whatsapp", "ours"), null, "the offers yes kept none: WhatsApp's");
  assert.equal(whyNotReceive(row({ phone: null }), "conversational", "sms", "theirs"), "no_number");
  assert.equal(whyNotReceive(row(), "conversational", "email", "theirs"), "no_address", "an email needs an address");
  assert.equal(whyNotReceive(row({ email: "dani@example.com" }), "conversational", "email", "theirs"), null);
  // The business's news by email asks for a yes covering email (theirs was by text) or a relationship: not an address alone.
  const withAddress = (consent) => row({ email: "dani@example.com", consent: { ...row().consent, ...consent } });
  assert.equal(whyNotReceive(withAddress({}), "conversational", "email", "ours"), "no_yes", "their yes was by text");
  assert.equal(whyNotReceive(withAddress({ channels: ["sms", "email"] }), "conversational", "email", "ours"), null);
  assert.equal(whyNotReceive(withAddress({ relationship: true }), "conversational", "email", "ours"), null);
  // On the other channels the same question is not asked: their own way to reach them, then the yes it covers.
  assert.equal(whyNotReceive(row(), "conversational", "sms", "ours"), null);
  assert.equal(whyNotReceive(row(), "conversational", "whatsapp", "ours"), "no_yes");
});
