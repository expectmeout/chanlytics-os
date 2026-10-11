/**
 * The campaign a workspace files with the carriers, pinned word for word. Every string here goes to a regulator
 * through Twilio, and most of it cannot be corrected once filed, so a change to any of it is a decision, never a
 * side effect of a refactor: these tests fail on one character. The description and the samples are in the shape the
 * carriers APPROVED on 5 Oct 2026 (the Chanlytics campaign, revised in Twilio's console after its ninth refusal): the
 * registered name doing business as the trade name, to customers and prospects who opted in, what the business does,
 * and five samples that each end with how to stop. The why of each sentence is in
 * apps/edge/lib/lines/a2p-campaign-facts.ts and consent/marketing-consent.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignFactsFor } from "../../../../apps/edge/lib/lines/a2p-campaign-facts.ts";

const FILING = {
  businessName: "Harbor Street Studio",
  legalName: "Harbor Street Studio LLC",
  about: "A studio in Springfield: classes and private sessions, booked ahead",
  optInUrl: "https://app.example.com/yes/harbor-street",
  privacyUrl: "https://app.example.com/privacy",
  termsUrl: "https://app.example.com/terms",
  hostedUrl: "https://app.example.com/b/harbor-street",
  lineNumber: "+1 (555) 010-0142",
};

test("a business with every fact files these words, part by part", () => {
  assert.deepEqual(campaignFactsFor(FILING), {
    description:
      "Messages are sent by Harbor Street Studio LLC, doing business as Harbor Street Studio, to its own customers and prospects who opted in. A studio in Springfield: classes and private sessions, booked ahead. The texts are replies to what a customer asked, and confirmations and reminders about that customer's own appointments. No marketing or promotional content is sent. Messages are sent by Harbor Street Studio staff and by the Chanlytics application, on Harbor Street Studio's own behalf.",
    messageFlow:
      'Harbor Street Studio collects opt-in directly from the customer, for one program: replies to what they write, and confirmations and reminders about their own appointments. No promotional messages are sent under this campaign. (1) KEYWORD START on the sign-up page (https://app.example.com/yes/harbor-street), public: under "Messages about your appointment" it states that they will receive appointment reminders and confirmations from Harbor Street Studio and a reply when they write, that message frequency varies, that message and data rates may apply, and to reply HELP for help and STOP to stop; at its foot, that consent is not a condition of purchase; privacy policy and terms are linked on the page. It shows the number; the customer opts in by texting START to it from their own phone and receives the auto-reply "Harbor Street Studio: you\'ll get texts about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel." (2) PAPER FORM (https://app.example.com/yes/harbor-street/form), public: the same statement above an unticked box, signed and dated at the business; staff record it on the profile as "Sign-up form" with the date and keep the sheet. (3) IN PERSON OR ON THE PHONE: staff ask "Would you like Harbor Street Studio to text you about your appointments and reply when you write? Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to stop." and record a yes on the profile as "In person" or "On the phone" with the date and who heard it; a spoken yes is never used for promotions. A first text from a customer is answered in that conversation only and is not an opt-in; appointment messages go only to customers opted in by (1), (2) or (3). STOP at any time ends all messages. Privacy policy: https://app.example.com/b/harbor-street. Terms: https://app.example.com/b/harbor-street/terms.',
    samples: [
      "Hi, thanks for writing to Harbor Street Studio. How can we help today? Reply STOP to opt out.",
      "Reminder from Harbor Street Studio: your appointment is on [Date] at [Time]. Reply STOP to opt out.",
      "Harbor Street Studio: your appointment is confirmed for [Date] at [Time]. Reply here to change it, HELP for help, STOP to opt out.",
      "Harbor Street Studio: who we are and what we do: https://app.example.com/b/harbor-street. Reply STOP to opt out, HELP for help.",
      "Harbor Street Studio: we tried to reach you about your appointment. Call us back on +1 (555) 010-0142 or reply here. Reply STOP to opt out.",
    ],
    optInMessage:
      "Harbor Street Studio: you'll get texts about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.",
    optInKeywords: ["START", "UNSTOP", "RESUME"],
    privacyPolicyUrl: "https://app.example.com/b/harbor-street",
    termsUrl: "https://app.example.com/b/harbor-street/terms",
  });
});

test("a business with only its name files the platform's pages, the opt-in page as the link, and no number", () => {
  const bare = campaignFactsFor({
    businessName: FILING.businessName,
    optInUrl: FILING.optInUrl,
    privacyUrl: FILING.privacyUrl,
    termsUrl: FILING.termsUrl,
  });
  assert.deepEqual(bare, {
    description:
      "Messages are sent by Harbor Street Studio to its own customers and prospects who opted in. The texts are replies to what a customer asked, and confirmations and reminders about that customer's own appointments. No marketing or promotional content is sent. Messages are sent by Harbor Street Studio staff and by the Chanlytics application, on Harbor Street Studio's own behalf.",
    messageFlow:
      'Harbor Street Studio collects opt-in directly from the customer, for one program: replies to what they write, and confirmations and reminders about their own appointments. No promotional messages are sent under this campaign. (1) KEYWORD START on the sign-up page (https://app.example.com/yes/harbor-street), public: under "Messages about your appointment" it states that they will receive appointment reminders and confirmations from Harbor Street Studio and a reply when they write, that message frequency varies, that message and data rates may apply, and to reply HELP for help and STOP to stop; at its foot, that consent is not a condition of purchase; privacy policy and terms are linked on the page. It shows the number; the customer opts in by texting START to it from their own phone and receives the auto-reply "Harbor Street Studio: you\'ll get texts about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel." (2) PAPER FORM (https://app.example.com/yes/harbor-street/form), public: the same statement above an unticked box, signed and dated at the business; staff record it on the profile as "Sign-up form" with the date and keep the sheet. (3) IN PERSON OR ON THE PHONE: staff ask "Would you like Harbor Street Studio to text you about your appointments and reply when you write? Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to stop." and record a yes on the profile as "In person" or "On the phone" with the date and who heard it; a spoken yes is never used for promotions. A first text from a customer is answered in that conversation only and is not an opt-in; appointment messages go only to customers opted in by (1), (2) or (3). STOP at any time ends all messages. Privacy policy: https://app.example.com/privacy. Terms: https://app.example.com/terms.',
    samples: [
      "Hi, thanks for writing to Harbor Street Studio. How can we help today? Reply STOP to opt out.",
      "Reminder from Harbor Street Studio: your appointment is on [Date] at [Time]. Reply STOP to opt out.",
      "Harbor Street Studio: your appointment is confirmed for [Date] at [Time]. Reply here to change it, HELP for help, STOP to opt out.",
      "Harbor Street Studio: who we are and what we do: https://app.example.com/yes/harbor-street. Reply STOP to opt out, HELP for help.",
      "Harbor Street Studio: we tried to reach you about your appointment. Reply here and we will pick it up. Reply STOP to opt out.",
    ],
    optInMessage:
      "Harbor Street Studio: you'll get texts about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.",
    optInKeywords: ["START", "UNSTOP", "RESUME"],
    privacyPolicyUrl: "https://app.example.com/privacy",
    termsUrl: "https://app.example.com/terms",
  });
});

test("the flow quotes the auto-reply up to 2048 characters exactly, and refers to it past that", () => {
  // The privacy URL is said once in the flow when no page is hosted, so it moves the length one character at a time.
  const at = (n) =>
    campaignFactsFor({ ...FILING, hostedUrl: null, privacyUrl: `https://app.example.com/${"p".repeat(n)}` });
  const room = 2048 - at(0).messageFlow.length;
  assert.ok(room > 0, "the plain filing fits with the quote");
  const fits = at(room);
  assert.equal(fits.messageFlow.length, 2048);
  assert.ok(
    fits.messageFlow.includes(`receives the auto-reply "${fits.optInMessage}"`),
    "2048 is inside Twilio's bound",
  );
  const over = at(room + 1);
  assert.ok(!over.messageFlow.includes('receives the auto-reply "'), "2049 is not");
  assert.ok(over.messageFlow.includes("receives the filed opt-in message as the auto-reply"));
  assert.ok(over.messageFlow.length < 2048);
});

test("the registered name is said as doing business as the trade name once, however either is padded or cased", () => {
  const same = campaignFactsFor({
    ...FILING,
    businessName: "  Harbor Street Studio  ",
    legalName: " HARBOR STREET STUDIO ",
  });
  assert.ok(!same.description.includes("doing business as"), "one business said twice is not two names");
  assert.ok(same.description.startsWith("Messages are sent by Harbor Street Studio to its own customers"));
  const other = campaignFactsFor({ ...FILING, legalName: "  Harbor Holdings LLC  " });
  assert.ok(
    other.description.startsWith(
      "Messages are sent by Harbor Holdings LLC, doing business as Harbor Street Studio, to its own customers",
    ),
  );
});

test("the filing in the shape the carriers approved: who sends to whom first, what the business does next, every sample ends with how to stop, and a name ending in s takes its apostrophe alone", () => {
  const f = campaignFactsFor({ ...FILING, businessName: "Glow Nails", legalName: "Glow Nails LLC" });
  assert.match(
    f.description,
    /^Messages are sent by Glow Nails LLC, doing business as Glow Nails, to its own customers and prospects who opted in\. A studio/,
  );
  assert.match(f.description, /No marketing or promotional content is sent\./);
  assert.ok(f.description.endsWith("on Glow Nails' own behalf."), "Glow Nails', not Glow Nails's");
  assert.equal(f.samples.length, 5, "Twilio's most: every kind of message the line sends, shown");
  for (const sample of f.samples) assert.match(sample, /STOP to opt out/, `how to stop, in every sample: ${sample}`);
  assert.ok(
    f.samples.every((x) => x.includes("Glow Nails")),
    "every sample names the brand",
  );
  // An about written without its full stop is given one, and one written with it is not given a second.
  assert.match(campaignFactsFor({ ...FILING, about: "We cut hair" }).description, /opted in\. We cut hair\. The texts/);
  assert.match(campaignFactsFor({ ...FILING, about: "We cut hair!" }).description, /opted in\. We cut hair! The texts/);
});
