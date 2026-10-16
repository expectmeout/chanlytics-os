/**
 * Send me a test's mail (contracts stepTestMail, the parity review's W5): a customer step's message as the member who
 * pressed it reads it, filled for the example person every preview fills for, each channel the step goes by in its own
 * words through the one fill a send makes, an email with the foot the sender adds, a text with its STOP line. A channel
 * the message lacks, or an offer by email with no postal address for its foot, is refused in words: never another
 * channel's words under its name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OFFERS_BY_EMAIL_WORDS,
  SEQUENCE_TEST_LIMITS,
  noVersionWords,
  smsStopLine,
  stepTestMail,
} from "@chanlytics/contracts";

const WHATSAPP = {
  body: "Hi {{1}}, see you {{2}} at {{3}}.",
  components: [
    { type: "HEADER", format: "TEXT", text: "Your visit, {{1}}" },
    { type: "BODY", text: "Hi {{1}}, see you {{2}} at {{3}}." },
    { type: "FOOTER", text: "Harbor Dental" },
    { type: "BUTTONS", buttons: [{ type: "URL", text: "Book now", url: "https://example.com/book" }] },
  ],
};
const VERSIONS = {
  email: { subject: "A note, {{1}}", body: "Hi {{1}}, we'll see you {{2}} at {{3}}." },
  sms: { subject: null, body: "Hi {{1}}, see you {{2}}." },
};
const PARAMS = [{ kind: "first_name" }, { kind: "visit_when" }, { kind: "business_name" }];
const step = (over = {}) => ({
  sequence: "Reminders",
  place: 2,
  business: "Harbor Dental",
  address: null,
  channels: ["whatsapp", "email", "sms"],
  params: PARAMS,
  policyClass: "booking",
  message: { whatsapp: WHATSAPP, versions: VERSIONS, language: "en_US", category: "utility" },
  ...over,
});

test("a step by WhatsApp, email and text: each in its own words, filled for Dani, the email's subject its subject", () => {
  const mail = stepTestMail(step());
  assert.ok(!("missing" in mail), JSON.stringify(mail));
  assert.equal(mail.subject, "Test: A note, Dani");
  const t = mail.text;
  assert.ok(t.startsWith("A test of what Harbor Dental sends, filled in for an example person, Dani."), t);
  // WhatsApp's heading, words, the line under them and its button, in that order.
  const wa = t.indexOf("On WhatsApp");
  assert.ok(wa > 0, t);
  for (const [i, said] of [
    "Your visit, Dani",
    "Hi Dani, see you tomorrow at 2:00 PM at Harbor Dental.",
    "Harbor Dental",
    "[Book now]",
  ].entries())
    assert.ok(t.indexOf(said, wa) > wa, `${i}: ${said}`);
  assert.ok(t.includes("Subject: A note, Dani"), t);
  assert.ok(t.includes("Hi Dani, we'll see you tomorrow at 2:00 PM at Harbor Dental."), t);
  assert.ok(t.includes(`Hi Dani, see you tomorrow at 2:00 PM.`) && t.includes(smsStopLine("en_US")), t);
  // In the page's channel order: WhatsApp, text, email.
  assert.ok(t.indexOf("On WhatsApp") < t.indexOf("By text") && t.indexOf("By text") < t.indexOf("By email"), t);
  assert.ok(t.trimEnd().endsWith("You got this because you pressed Send me a test."), t);
});

test("an email about the person's own visit carries a visit's foot; the business's news carries an offer's, and owes its address", () => {
  const visit = stepTestMail(step({ channels: ["email"] }));
  assert.ok(!("missing" in visit));
  assert.ok(!visit.text.includes("(their own unsubscribe link)"), visit.text);
  // A win-back is the business's news: an offer by email, whose foot names the address and where the way out goes.
  const news = { policyClass: "reengage", channels: ["email"] };
  assert.deepEqual(stepTestMail(step(news)), { missing: "email", why: OFFERS_BY_EMAIL_WORDS.noAddress });
  const offer = stepTestMail(step({ ...news, address: "1 Dock St, Harbor, ME 04000" }));
  assert.ok(!("missing" in offer));
  assert.ok(offer.text.includes("1 Dock St, Harbor, ME 04000"), offer.text);
  assert.ok(offer.text.includes("(their own unsubscribe link)"), offer.text);
});

test("a channel the step goes by and the message lacks is refused in its words, never drawn in another's", () => {
  const noWhatsApp = step({ message: { ...step().message, whatsapp: null } });
  assert.deepEqual(stepTestMail(noWhatsApp), { missing: "whatsapp", why: noVersionWords("whatsapp") });
  const noText = step({ message: { ...step().message, versions: { email: VERSIONS.email } } });
  assert.deepEqual(stepTestMail(noText), { missing: "sms", why: noVersionWords("sms") });
});

test("a step that names no channel shows every version its message holds; a subject past its bound is cut", () => {
  const mail = stepTestMail(step({ channels: [], message: { ...step().message, versions: { sms: VERSIONS.sms } } }));
  assert.ok(!("missing" in mail));
  assert.ok(mail.text.includes("On WhatsApp") && mail.text.includes("By text") && !mail.text.includes("By email"));
  // No email, no subject of its own: the step is named instead.
  assert.equal(mail.subject, "Test: Reminders, step 2");
  const long = stepTestMail(step({ channels: ["whatsapp"], sequence: "x".repeat(400) }));
  assert.equal(long.subject.length, SEQUENCE_TEST_LIMITS.subject);
});
