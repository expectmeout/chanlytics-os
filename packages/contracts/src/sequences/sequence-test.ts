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
import { emailFoot } from "../templates/email-foot";
import { whyFrom } from "../reach-out/reach-out";
import {
  coldSignedOff,
  REACH_OUT_LANGUAGE,
  REACH_OUT_OPENING_MARK,
  REACH_OUT_VALUE_MARKS,
  reachOutCardEmailOf,
  type ColdEnding,
  type SlotLead,
  type SlotWorkspace,
} from "../reach-out/reach-out-rules";

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
  /** A one-off's message is tested from Messages: its step is its batch. */
  notCustomer: "Only a sequence's step can be tested here",
  noMessage: "This step sends no message",
  subject: (what: string) => `Test: ${what}`,
  stepName: (sequence: string, place: number) => `${sequence}, step ${place}`,
  head: (business: string) =>
    `A test of what ${business} sends, filled in for an example person, Dani. Nobody else got it.`,
  subjectLine: (subject: string) => `Subject: ${subject}`,
  button: (text: string) => `[${text}]`,
  foot: "You got this because you pressed Send me a test.",
  /** A lead's step: filled for one real lead, the opening as the line written for them when it goes. */
  leadHead: (business: string, lead: string) =>
    `A test of what ${business} sends ${lead}, filled in from their record. Nobody else got it.`,
  opening: (lead: string) => `[A line about ${lead}, written for them when it goes]`,
  holes: (lead: string, labels: string[]) =>
    `${lead} has nothing for ${labels.join(" and ")}, so this email would wait for you.`,
  notWritten: "Write this email first",
  noFootAddress: "Add your business's address in Settings › Details: every email carries it at the foot.",
  reply: (subject: string) => `Re: ${subject}`,
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

/**
 * A lead's step as its test mail (the canvas's Preview as a real lead, 18 Oct 2026: "To your own inbox, marked as a test"):
 * the step's words filled for one lead by the send's own fill (reachOutCardEmailOf), the opening said as the line written
 * for them when it goes, a value they lack left as written and said, and the cold foot every such email carries. A step
 * after the first answers the first in its thread, so its subject is the first's. Refused in words where it cannot be
 * shown: an email with no words yet, a foot with no address.
 */
export function leadStepTestMail(o: {
  sequence: string;
  place: number;
  business: string;
  address: string | null;
  words: { subject: string | null; body: string };
  /** The first email's subject, which a later step answers under. */
  thread: string | null;
  lead: SlotLead;
  workspace: SlotWorkspace;
  /** How it ends under the words, as the send ends it (0077, contracts coldEndingOf); none: the words as they are. */
  ending?: ColdEnding;
}): StepTestMail | { why: string } {
  const W = SEQUENCE_TEST_WORDS;
  if (!o.words.body.trim()) return { why: W.notWritten };
  const name = o.lead.business_name?.trim() || W.stepName(o.sequence, o.place);
  const plain = (t: string) =>
    t
      .split(REACH_OUT_VALUE_MARKS[0])
      .join("")
      .split(REACH_OUT_VALUE_MARKS[1])
      .join("")
      .split(REACH_OUT_OPENING_MARK)
      .join(W.opening(name));
  const email = reachOutCardEmailOf(o.words, o.lead, o.workspace);
  const thread =
    o.words.subject === null && o.thread
      ? reachOutCardEmailOf({ subject: o.thread, body: "" }, o.lead, o.workspace).subject
      : null;
  const subject =
    email.subject !== null ? plain(email.subject) : thread ? W.reply(plain(thread)) : W.stepName(o.sequence, o.place);
  let foot: string;
  try {
    foot = emailFoot(
      o.business,
      o.address,
      { kind: "cold", why: whyFrom(o.lead.source), unsubscribeUrl: null },
      REACH_OUT_LANGUAGE,
    );
  } catch {
    return { why: W.noFootAddress };
  }
  const holes = email.holes.length
    ? W.holes(
        name,
        email.holes.map((k) => `{{${k}}}`),
      )
    : null;
  return {
    subject: W.subject(subject).slice(0, SEQUENCE_TEST_LIMITS.subject),
    text: [
      W.leadHead(o.business, name),
      holes,
      W.subjectLine(subject),
      plain(coldSignedOff(email.body, o.ending?.signOff ?? null)),
      o.ending?.signature ?? null,
      foot,
      `—\n${W.foot}`,
    ]
      .filter((s): s is string => !!s)
      .join("\n\n\n")
      .slice(0, SEQUENCE_TEST_LIMITS.text),
  };
}
