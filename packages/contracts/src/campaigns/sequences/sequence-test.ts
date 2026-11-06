/**
 * Send me a test (the parity review's W5; Ruben, 15 Oct 2026: email to your own address first): a step's message mailed to
 * the member who pressed it, at their own sign-in address, and to nobody else. A note to a member, never a send to a
 * customer: it leaves by the edge's member mail, not the send door. Pure: every word of it is here.
 *
 * One test for every step (3 Nov 2026: a customer step's test and a lead step's were laid out two ways, and neither as
 * the email went): one line saying whose message it is, then the message as it goes and nothing else. An email is laid
 * out by the one rule the wire writes every email's text with (contracts emailTextOf), from the parts its send builds: a
 * cold email's by coldEmailOf, the send's own; a customer's from the fill a send makes (templates renderOwnVersion,
 * through previewParts) and the foot it ends with (emailFoot, through previewOn). Where a step goes by more than one
 * channel, each is said under its label; where by one, the message alone.
 */
import { previewOn, previewParts, type PreviewVersions } from "../broadcasts/preview-by-channel";
import { renderTemplate } from "../broadcasts/broadcasts";
import { CONSENT_CHANNELS, type ConsentChannel } from "../../consent/consent-channels";
import { isOfferByEmail, purposeOfTemplate } from "../../consent/consent";
import { firstSubject } from "../../email/email-subject";
import { emailTextOf } from "../../email/email-text";
import { noVersionWords } from "../templates/message-versions";
import { templateParts } from "../templates/template-parts";
import { testParamsOf, type ParamSpec } from "../templates/templates";
import { messageAboutOfClass } from "./follow-up";
import { coldEmailOf } from "../../email/cold-email";
import { leadCalledByOf } from "../../leads/search/called-by";
import {
  REACH_OUT_OPENING_MARK,
  REACH_OUT_VALUE_MARKS,
  reachOutCardEmailOf,
  type ReachOutSignsWith,
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
  /** The one line over every test: whose message it is, then the message alone. */
  head: (place: number, who: string) => `Test of step ${place}, as ${who} gets it. Only you got this.`,
  exampleHead: (place: number, kind: "business" | "person", who: string) =>
    `Test of step ${place}, as an example ${kind}, ${who}, would get it. Only you got this.`,
  button: (text: string) => `[${text}]`,
  /** Where no opening is written for them yet and their listing says none. */
  opening: (lead: string) => `[A line about ${lead}, written for them when their email is planned]`,
  holes: (lead: string, labels: string[]) =>
    `${lead} has nothing for ${labels.join(" and ")}, so this email would wait for you.`,
  notWritten: "Write this email first",
  noFootAddress: "Add your business's address in Settings › Details: every email carries it at the foot.",
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

/**
 * Every test's mail: its subject marked as a test, one line over the message (and what holds it, where something does),
 * then the message on each channel as it goes, under its label where there is more than one.
 */
function testMailOf(o: {
  subject: string;
  head: string;
  note: string | null;
  parts: ReadonlyArray<{ label: string; text: string }>;
}): StepTestMail {
  const W = SEQUENCE_TEST_WORDS;
  const top = [o.head, o.note].filter((s): s is string => !!s).join("\n\n");
  const said = o.parts.map((p) => (o.parts.length > 1 ? `${p.label}\n\n${p.text}` : p.text));
  return {
    subject: W.subject(o.subject).slice(0, SEQUENCE_TEST_LIMITS.subject),
    text: [top, ...said].join("\n\n—\n\n").slice(0, SEQUENCE_TEST_LIMITS.text),
  };
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
 * A customer step's test mail, or the channel it cannot show and why (a version the message lacks, an offer by email with
 * no postal address for its foot): never another channel's words under one's name. It is filled for the example person
 * (templates testParamsOf: Dani, the workspace's own booking link, a link only a real person has in brackets), and an
 * email ends with the foot that person's send would carry. `policyClass` is the sequence's (its first step's), which
 * says what the message is about and so whether an email of it is an offer.
 */
export function stepTestMail(o: {
  sequence: string;
  place: number;
  business: string;
  address: string | null;
  bookingLink: string | null;
  channels: readonly string[];
  params: readonly ParamSpec[];
  policyClass: string;
  message: StepTestMessage;
}): StepTestMail | { missing: ConsentChannel; why: string } {
  const W = SEQUENCE_TEST_WORDS;
  const m = o.message;
  const { who, values, facts } = testParamsOf(o.params, { businessName: o.business, bookingLink: o.bookingLink });
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
    facts,
    ...(offer ? { offer: "customer" as const } : {}),
  });
  if (channels.includes("email") && email.missing) return { missing: "email", why: email.missing };
  const subject = drawn.parts.find((p) => p.subject)?.subject;
  return testMailOf({
    subject: subject ? firstSubject(subject) : W.stepName(o.sequence, o.place),
    head: W.exampleHead(o.place, "person", who),
    note: null,
    parts: drawn.parts.map((p) => ({
      label: p.label,
      text: p.channel === "email" ? emailTextOf({ body: p.body, footer: email.foot }) : p.body,
    })),
  });
}

/**
 * A lead's step as its test mail (the canvas's Preview as a real lead, 18 Oct 2026: "To your own inbox, marked as a test"):
 * the email as that lead gets it. Its words are filled for the lead by the send's own fill (reachOutCardEmailOf) with the
 * opening it goes with (contracts leadOpeningOf), a value they lack left as written and said over it; then laid out by the
 * send's own coldEmailOf, a step after the first under "Re:" the first's subject. Refused in words where it cannot be
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
  /** The lead is the made-up business a sequence nobody is in previews as (reachOutExampleLead). */
  example: boolean;
  /** The opening their email goes with (contracts leadOpeningOf); null: none written yet, said as the line to come. */
  opening: string | null;
  workspace: SlotWorkspace;
  /** How it ends (0077), as the send reads it: its name, or the signature of the mailbox it first leaves from. */
  signsWith: ReachOutSignsWith;
  signature: string | null;
}): StepTestMail | { why: string } {
  const W = SEQUENCE_TEST_WORDS;
  if (!o.words.body.trim()) return { why: W.notWritten };
  const name = leadCalledByOf(o.lead) || W.stepName(o.sequence, o.place);
  const plain = (t: string) =>
    t
      .split(REACH_OUT_VALUE_MARKS[0])
      .join("")
      .split(REACH_OUT_VALUE_MARKS[1])
      .join("")
      .split(REACH_OUT_OPENING_MARK)
      .join(o.opening?.trim() || W.opening(name));
  const filled = reachOutCardEmailOf(o.words, o.lead, o.workspace);
  const thread =
    o.words.subject === null && o.thread
      ? reachOutCardEmailOf({ subject: o.thread, body: "" }, o.lead, o.workspace).subject
      : null;
  let email: ReturnType<typeof coldEmailOf>;
  try {
    email = coldEmailOf({
      filled: { subject: filled.subject === null ? null : plain(filled.subject), body: plain(filled.body) },
      before: thread === null ? null : plain(thread),
      written: o.words.body,
      source: o.lead.source,
      business: o.business,
      address: o.address?.trim() ?? "",
      signsWith: o.signsWith,
      signedBy: o.workspace.yourName ?? null,
      signature: o.signature,
      unsubscribeUrl: null,
    });
  } catch {
    return { why: W.noFootAddress };
  }
  const holes = filled.holes.length
    ? W.holes(
        name,
        filled.holes.map((k) => `{{${k}}}`),
      )
    : null;
  return testMailOf({
    subject: email.subject || W.stepName(o.sequence, o.place),
    head: o.example ? W.exampleHead(o.place, "business", name) : W.head(o.place, name),
    note: holes,
    parts: [{ label: "", text: emailTextOf(email) }],
  });
}
