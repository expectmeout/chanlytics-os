/**
 * Send me a test (the parity review's W5; Ruben, 15 Oct 2026: email to your own address first): a customer step's message
 * mailed to the member who pressed it, at their own sign-in address, and to nobody else. It is filled for the example
 * person every preview fills for (templates exampleParams: Dani), and says each channel the step goes by as the person
 * reached on it reads it: WhatsApp's template words, a text's with the STOP line, an email's subject and words with the
 * foot the sender adds (broadcasts previewParts and previewOn, the fill a send makes). A note to a member, never a send to
 * a customer: it leaves by the edge's member mail, not the send door. Pure: every word of it is here.
 */
import { previewOn, previewParts, type PreviewVersions } from "../broadcasts/preview-by-channel";
import { renderTemplate } from "../broadcasts/broadcasts";
import { CONSENT_CHANNELS, type ConsentChannel } from "../consent/consent-channels";
import { isOfferByEmail, purposeOfTemplate } from "../consent/consent";
import { noVersionWords } from "../templates/message-versions";
import { templateParts } from "../templates/template-parts";
import { exampleParams, type ParamSpec } from "../templates/templates";
import { messageAboutOfClass } from "./follow-up";

/** What the press and its mail say. */
export const SEQUENCE_TEST_WORDS = {
  press: "Send me a test",
  sending: "Sending…",
  tip: "Emails this step's message to you alone, filled in for an example person",
  sent: (to: string) => `Test sent to ${to}`,
  /** A preview or a laptop mails nobody. */
  notLive: "Tests go out from the live app only",
  noAddress: "Your account has no email address to send a test to",
  notSent: "The test didn't go. Try again in a minute",
  /** Only a customer's step sends a message a test can show: a sequence to leads writes each email for its lead. */
  notCustomer: "Only a customer's step can be tested: each lead's email is written for them",
  noMessage: "This step sends no message",
  subject: (what: string) => `Test: ${what}`,
  stepName: (sequence: string, place: number) => `${sequence}, step ${place}`,
  head: (business: string) =>
    `A test of what ${business} sends, filled in for an example person, Dani. Nobody else got it.`,
  subjectLine: (subject: string) => `Subject: ${subject}`,
  button: (text: string) => `[${text}]`,
  foot: "You got this because you pressed Send me a test.",
} as const;

/** How long a test's subject and words may run: a mail far past any message's own length is not one. */
export const SEQUENCE_TEST_LIMITS = { subject: 200, text: 20_000 } as const;

/** A step's message as its test reads it: the WhatsApp version's row, and the email and text versions' words. */
export interface StepTestMessage {
  /** The WhatsApp version: its words (`body_preview`) and Meta's components (a heading, a footer, buttons). */
  whatsapp: { body: string | null; components?: unknown } | null;
  versions: PreviewVersions;
  language: string;
  /** The message's WhatsApp category: what makes an email of it an offer (consent isOfferByEmail). */
  category: string | null;
}

/** The mail a test is: its subject and its words. */
export interface StepTestMail {
  subject: string;
  text: string;
}

/** WhatsApp's words as the person reads them: the heading, the words, the line under them and the buttons, filled. */
function whatsappWords(row: NonNullable<StepTestMessage["whatsapp"]>, values: readonly string[]): string {
  const parts = templateParts(row.components);
  const buttons = parts.buttons.map((b) => SEQUENCE_TEST_WORDS.button(b.text)).join(" ");
  return [
    parts.header ? renderTemplate(parts.header, values) : null,
    renderTemplate(row.body, values),
    parts.footer,
    buttons,
  ]
    .filter((s): s is string => !!s)
    .join("\n\n");
}

/** The channels a test shows: the step's own, else every one the message holds a version on. */
function testChannelsOf(step: readonly string[], m: StepTestMessage): ConsentChannel[] {
  const named = CONSENT_CHANNELS.filter((c) => step.includes(c));
  if (named.length > 0) return named;
  return CONSENT_CHANNELS.filter((c) => (c === "whatsapp" ? m.whatsapp !== null : !!m.versions[c]));
}

/**
 * A step's test mail, or the channel it cannot show and why (a version the message lacks, an offer by email with no postal
 * address for its foot): never another channel's words under one's name. `policyClass` is the sequence's (its first
 * step's), which says what the message is about and so whether an email of it is an offer.
 */
export function stepTestMail(o: {
  sequence: string;
  place: number;
  business: string;
  address: string | null;
  channels: readonly string[];
  params: readonly ParamSpec[];
  policyClass: string;
  message: StepTestMessage;
}): StepTestMail | { missing: ConsentChannel; why: string } {
  const W = SEQUENCE_TEST_WORDS;
  const m = o.message;
  const values = exampleParams(o.params, o.business);
  const channels = testChannelsOf(o.channels, m);
  if (channels.includes("whatsapp") && !m.whatsapp) return { missing: "whatsapp", why: noVersionWords("whatsapp") };
  const drawn = previewParts(channels, {
    whatsapp: m.whatsapp ? whatsappWords(m.whatsapp, values) : "",
    versions: m.versions,
    values,
    language: m.language,
  });
  if ("missing" in drawn) return drawn;
  const about = messageAboutOfClass(o.policyClass);
  const offer = isOfferByEmail({ channel: "email", purpose: purposeOfTemplate(m.category), proactive: true, about });
  const email = previewOn("email", {
    versions: m.versions,
    language: m.language,
    business: o.business,
    address: o.address,
    ...(offer ? { offer: "customer" as const } : {}),
  });
  if (channels.includes("email") && email.missing) return { missing: "email", why: email.missing };
  const blocks = drawn.parts.map((p) =>
    [p.label, p.subject ? W.subjectLine(p.subject) : null, p.body, p.channel === "email" ? email.foot : null]
      .filter((s): s is string => !!s)
      .join("\n\n"),
  );
  const subject = drawn.parts.find((p) => p.subject)?.subject ?? W.stepName(o.sequence, o.place);
  return {
    subject: W.subject(subject).slice(0, SEQUENCE_TEST_LIMITS.subject),
    text: [W.head(o.business), ...blocks, `—\n${W.foot}`].join("\n\n\n").slice(0, SEQUENCE_TEST_LIMITS.text),
  };
}
