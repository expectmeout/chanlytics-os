/**
 * The campaign a workspace files with the carriers, pinned word for word. Every string here goes to a regulator
 * through Twilio, and most of it cannot be corrected once filed, so a change to any of it is a decision, never a
 * side effect of a refactor: these tests fail on one character. The why of each sentence is in
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
      "About Harbor Street Studio (Harbor Street Studio LLC): A studio in Springfield: classes and private sessions, booked ahead. Messages are sent by Harbor Street Studio (Harbor Street Studio LLC) to its own customers: people who wrote to Harbor Street Studio first, or who said yes on its sign-up page (https://app.example.com/yes/harbor-street) or its signed sign-up form. Messages are replies to what a customer asked, and confirmations and reminders about that customer's own appointments. No marketing or promotional content is sent from this number. Messages are composed by Harbor Street Studio's staff and by its receptionist software and sent through the Chanlytics OS application, on Harbor Street Studio's own behalf.",
    messageFlow:
      'Harbor Street Studio collects opt-in directly from the customer, for one program: replies to what they write, and confirmations and reminders about their own appointments. No promotional messages are sent under this campaign. (1) KEYWORD START on the sign-up page (https://app.example.com/yes/harbor-street), public: under "Messages about your visit" it states that they will receive appointment reminders and confirmations from Harbor Street Studio and a reply when they write, that message frequency varies, that message and data rates may apply, and to reply HELP for help and STOP to stop; privacy policy and terms are linked on the page. It shows the number; the customer opts in by texting START to it from their own phone and receives the auto-reply "Harbor Street Studio: you\'ll get texts about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel." (2) PAPER FORM (https://app.example.com/yes/harbor-street/form), public: the same statement above an unticked box, signed and dated at the business; staff record it on the profile as "Sign-up form" with the date and keep the sheet. (3) IN PERSON OR ON THE PHONE: staff ask "Would you like Harbor Street Studio to text you about your appointments and reply when you write? Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to stop." and record a yes on the profile as "In person" or "On the phone" with the date and who heard it; a spoken yes is never used for promotions. A first text from a customer is answered in that conversation only and is not an opt-in; appointment messages go only to customers opted in by (1), (2) or (3). STOP at any time ends all messages. Privacy policy: https://app.example.com/b/harbor-street. Terms: https://app.example.com/b/harbor-street/terms.',
    samples: [
      "Hi, thanks for writing Harbor Street Studio. How can we help today?",
      "Reminder from Harbor Street Studio: you have an appointment on [date] at [time]. Reply STOP to opt out.",
      "Harbor Street Studio: our address, hours and services are at https://app.example.com/b/harbor-street. Reply STOP to opt out, HELP for help.",
      "Harbor Street Studio: we tried to reach you. Call us back on +1 (555) 010-0142 or reply here. Reply STOP to opt out.",
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
      "Messages are sent by Harbor Street Studio to its own customers: people who wrote to Harbor Street Studio first, or who said yes on its sign-up page (https://app.example.com/yes/harbor-street) or its signed sign-up form. Messages are replies to what a customer asked, and confirmations and reminders about that customer's own appointments. No marketing or promotional content is sent from this number. Messages are composed by Harbor Street Studio's staff and by its receptionist software and sent through the Chanlytics OS application, on Harbor Street Studio's own behalf.",
    messageFlow:
      'Harbor Street Studio collects opt-in directly from the customer, for one program: replies to what they write, and confirmations and reminders about their own appointments. No promotional messages are sent under this campaign. (1) KEYWORD START on the sign-up page (https://app.example.com/yes/harbor-street), public: under "Messages about your visit" it states that they will receive appointment reminders and confirmations from Harbor Street Studio and a reply when they write, that message frequency varies, that message and data rates may apply, and to reply HELP for help and STOP to stop; privacy policy and terms are linked on the page. It shows the number; the customer opts in by texting START to it from their own phone and receives the auto-reply "Harbor Street Studio: you\'ll get texts about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel." (2) PAPER FORM (https://app.example.com/yes/harbor-street/form), public: the same statement above an unticked box, signed and dated at the business; staff record it on the profile as "Sign-up form" with the date and keep the sheet. (3) IN PERSON OR ON THE PHONE: staff ask "Would you like Harbor Street Studio to text you about your appointments and reply when you write? Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to stop." and record a yes on the profile as "In person" or "On the phone" with the date and who heard it; a spoken yes is never used for promotions. A first text from a customer is answered in that conversation only and is not an opt-in; appointment messages go only to customers opted in by (1), (2) or (3). STOP at any time ends all messages. Privacy policy: https://app.example.com/privacy. Terms: https://app.example.com/terms.',
    samples: [
      "Hi, thanks for writing Harbor Street Studio. How can we help today?",
      "Reminder from Harbor Street Studio: you have an appointment on [date] at [time]. Reply STOP to opt out.",
      "Harbor Street Studio: our address, hours and services are at https://app.example.com/yes/harbor-street. Reply STOP to opt out, HELP for help.",
      "Harbor Street Studio: we tried to reach you. Reply here and we will pick it up. Reply STOP to opt out.",
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

test("the registered name is said beside the trade name once, however either is padded or cased", () => {
  const same = campaignFactsFor({
    ...FILING,
    businessName: "  Harbor Street Studio  ",
    legalName: " HARBOR STREET STUDIO ",
  });
  assert.ok(!same.description.includes("(HARBOR"), "one business said twice is not two names");
  const other = campaignFactsFor({ ...FILING, legalName: "  Harbor Holdings LLC  " });
  assert.ok(other.description.includes("sent by Harbor Street Studio (Harbor Holdings LLC) to its own customers"));
});
