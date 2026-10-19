import { previewOn, previewParts } from "../broadcasts/preview-by-channel.js";
import { renderTemplate } from "../broadcasts/broadcasts.js";
import { CONSENT_CHANNELS } from "../consent/consent-channels.js";
import { isOfferByEmail, purposeOfTemplate } from "../consent/consent.js";
import { noVersionWords } from "../templates/message-versions.js";
import { templateParts } from "../templates/template-parts.js";
import { exampleParams } from "../templates/templates.js";
import { messageAboutOfClass } from "./follow-up.js";
import { emailFoot } from "../templates/email-foot.js";
import { whyFrom } from "../reach-out/reach-out.js";
import {
  REACH_OUT_LANGUAGE,
  REACH_OUT_OPENING_MARK,
  REACH_OUT_VALUE_MARKS,
  reachOutCardEmailOf
} from "../reach-out/reach-out-rules.js";
export const SEQUENCE_TEST_WORDS = {
  press: "Send me a test",
  sending: "Sending\u2026",
  tip: "Emails this step's message to you alone, filled in for an example person",
  sent: (to) => `Test sent to ${to}`,
  /** A preview or a laptop mails nobody. */
  notLive: "Tests go out from the live app only",
  noAddress: "Your account has no email address to send a test to",
  notSent: "The test didn't go. Try again in a minute",
  /** A one-off's message is tested from Messages: its step is its batch. */
  notCustomer: "Only a sequence's step can be tested here",
  noMessage: "This step sends no message",
  subject: (what) => `Test: ${what}`,
  stepName: (sequence, place) => `${sequence}, step ${place}`,
  head: (business) => `A test of what ${business} sends, filled in for an example person, Dani. Nobody else got it.`,
  subjectLine: (subject) => `Subject: ${subject}`,
  button: (text) => `[${text}]`,
  foot: "You got this because you pressed Send me a test.",
  /** A lead's step: filled for one real lead, the opening as the line written for them when it goes. */
  leadHead: (business, lead) => `A test of what ${business} sends ${lead}, filled in from their record. Nobody else got it.`,
  opening: (lead) => `[A line about ${lead}, written for them when it goes]`,
  holes: (lead, labels) => `${lead} has nothing for ${labels.join(" and ")}, so this email would wait for you.`,
  notWritten: "Write this email first",
  noFootAddress: "Add your business's address in Settings \u203A Details: every email carries it at the foot.",
  reply: (subject) => `Re: ${subject}`
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
export function leadStepTestMail(o) {
  const W = SEQUENCE_TEST_WORDS;
  if (!o.words.body.trim()) return { why: W.notWritten };
  const name = o.lead.business_name?.trim() || W.stepName(o.sequence, o.place);
  const plain = (t) => t.split(REACH_OUT_VALUE_MARKS[0]).join("").split(REACH_OUT_VALUE_MARKS[1]).join("").split(REACH_OUT_OPENING_MARK).join(W.opening(name));
  const email = reachOutCardEmailOf(o.words, o.lead, o.workspace);
  const thread = o.words.subject === null && o.thread ? reachOutCardEmailOf({ subject: o.thread, body: "" }, o.lead, o.workspace).subject : null;
  const subject = email.subject !== null ? plain(email.subject) : thread ? W.reply(plain(thread)) : W.stepName(o.sequence, o.place);
  let foot;
  try {
    foot = emailFoot(
      o.business,
      o.address,
      { kind: "cold", why: whyFrom(o.lead.source), unsubscribeUrl: null },
      REACH_OUT_LANGUAGE
    );
  } catch {
    return { why: W.noFootAddress };
  }
  const holes = email.holes.length ? W.holes(
    name,
    email.holes.map((k) => `{{${k}}}`)
  ) : null;
  return {
    subject: W.subject(subject).slice(0, SEQUENCE_TEST_LIMITS.subject),
    text: [W.leadHead(o.business, name), holes, W.subjectLine(subject), plain(email.body), foot, `\u2014
${W.foot}`].filter((s) => !!s).join("\n\n\n").slice(0, SEQUENCE_TEST_LIMITS.text)
  };
}
