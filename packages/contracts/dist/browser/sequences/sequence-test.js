import { previewOn, previewParts } from "../broadcasts/preview-by-channel.js";
import { renderTemplate } from "../broadcasts/broadcasts.js";
import { CONSENT_CHANNELS } from "../consent/consent-channels.js";
import { isOfferByEmail, purposeOfTemplate } from "../consent/consent.js";
import { noVersionWords } from "../templates/message-versions.js";
import { templateParts } from "../templates/template-parts.js";
import { exampleParams } from "../templates/templates.js";
import { messageAboutOfClass } from "./follow-up.js";
export const SEQUENCE_TEST_WORDS = {
  press: "Send me a test",
  sending: "Sending\u2026",
  tip: "Emails this step's message to you alone, filled in for an example person",
  sent: (to) => `Test sent to ${to}`,
  /** A preview or a laptop mails nobody. */
  notLive: "Tests go out from the live app only",
  noAddress: "Your account has no email address to send a test to",
  notSent: "The test didn't go. Try again in a minute",
  /** Only a customer's step sends a message a test can show: a sequence to leads writes each email for its lead. */
  notCustomer: "Only a customer's step can be tested: each lead's email is written for them",
  noMessage: "This step sends no message",
  subject: (what) => `Test: ${what}`,
  stepName: (sequence, place) => `${sequence}, step ${place}`,
  head: (business) => `A test of what ${business} sends, filled in for an example person, Dani. Nobody else got it.`,
  subjectLine: (subject) => `Subject: ${subject}`,
  button: (text) => `[${text}]`,
  foot: "You got this because you pressed Send me a test."
};
export const SEQUENCE_TEST_LIMITS = { subject: 200, text: 2e4 };
function whatsappWords(row, values) {
  const parts = templateParts(row.components);
  const buttons = parts.buttons.map((b) => SEQUENCE_TEST_WORDS.button(b.text)).join(" ");
  return [
    parts.header ? renderTemplate(parts.header, values) : null,
    renderTemplate(row.body, values),
    parts.footer,
    buttons
  ].filter((s) => !!s).join("\n\n");
}
function testChannelsOf(step, m) {
  const named = CONSENT_CHANNELS.filter((c) => step.includes(c));
  if (named.length > 0) return named;
  return CONSENT_CHANNELS.filter((c) => c === "whatsapp" ? m.whatsapp !== null : !!m.versions[c]);
}
export function stepTestMail(o) {
  const W = SEQUENCE_TEST_WORDS;
  const m = o.message;
  const values = exampleParams(o.params, o.business);
  const channels = testChannelsOf(o.channels, m);
  if (channels.includes("whatsapp") && !m.whatsapp) return { missing: "whatsapp", why: noVersionWords("whatsapp") };
  const drawn = previewParts(channels, {
    whatsapp: m.whatsapp ? whatsappWords(m.whatsapp, values) : "",
    versions: m.versions,
    values,
    language: m.language
  });
  if ("missing" in drawn) return drawn;
  const about = messageAboutOfClass(o.policyClass);
  const offer = isOfferByEmail({ channel: "email", purpose: purposeOfTemplate(m.category), proactive: true, about });
  const email = previewOn("email", {
    versions: m.versions,
    language: m.language,
    business: o.business,
    address: o.address,
    ...offer ? { offer: "customer" } : {}
  });
  if (channels.includes("email") && email.missing) return { missing: "email", why: email.missing };
  const blocks = drawn.parts.map(
    (p) => [p.label, p.subject ? W.subjectLine(p.subject) : null, p.body, p.channel === "email" ? email.foot : null].filter((s) => !!s).join("\n\n")
  );
  const subject = drawn.parts.find((p) => p.subject)?.subject ?? W.stepName(o.sequence, o.place);
  return {
    subject: W.subject(subject).slice(0, SEQUENCE_TEST_LIMITS.subject),
    text: [W.head(o.business), ...blocks, `\u2014
${W.foot}`].join("\n\n\n").slice(0, SEQUENCE_TEST_LIMITS.text)
  };
}
