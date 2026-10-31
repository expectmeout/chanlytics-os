/**
 * What an email's headers say of who sent it, beside what it claims (email/intake.ts classifyReceived): whether a
 * mailing service sent it, whether its replies go to someone other than its sender, and a Gmail message read by its
 * headers alone (format=metadata), which is how a connected mailbox's six months judge most of what they read before
 * reading any of it whole (decision 0080). Pure.
 */
import { addressesOf } from "../email/header-values";
import { noReplyAddress, type ReceivedEmail } from "../email/intake";
import { gmailEmailOf, type MailboxEmail } from "./mailbox-read";

/**
 * The hosts mailing services send from, as their Message-ID or Return-Path names them (a subdomain of one is one): what a
 * program's notice, a newsletter and a campaign go out through, and what a person writing from their own mailbox never
 * does. A hosting platform's notices came through Amazon SES and named no automated header (30 Oct 2026).
 */
const SERVICE_HOSTS: readonly string[] = [
  "amazonses.com",
  "sendgrid.net",
  "mailgun.org",
  "mailgun.net",
  "mcsv.net",
  "mcdlv.net",
  "rsgsv.net",
  "mandrillapp.com",
  "sparkpostmail.com",
  "mtasv.net",
  "hubspotemail.net",
  "klaviyomail.com",
  "customeriomail.com",
  "exacttarget.com",
  "constantcontact.com",
  "ccsend.com",
  "sendinblue.com",
  "brevo.com",
  "mktomail.com",
  "intercom-mail.com",
  "mailjet.com",
  "mlsend.com",
  "createsend.com",
  "cmail19.com",
  "cmail20.com",
  "acems1.com",
  "emsend.com",
  "elasticemail.com",
  "smtp2go.com",
];

/**
 * The headers only a mailing service writes: its own tracking id (SES, SendGrid, Mailgun, Mailchimp, Mandrill,
 * Postmark, Salesforce, Mailjet), the feedback loop's id bulk senders give Gmail, and the certified senders' complaint
 * address. A person's mail client writes none of them.
 */
const SERVICE_HEADERS: readonly string[] = [
  "x-ses-outgoing",
  "x-sg-eid",
  "x-sg-id",
  "x-mailgun-sid",
  "x-mailgun-tag",
  "x-mc-user",
  "x-mandrill-user",
  "x-pm-message-id",
  "x-sfmc-stack",
  "x-mailjet-campaign",
  "feedback-id",
  "x-csa-complaints",
];

/** The host an id or a path names after its @, lower-cased; "" for none. */
const hostNamedBy = (v: string | null | undefined): string =>
  (/@([^>\s@]+)>?\s*$/.exec(v ?? "")?.[1] ?? "").toLowerCase();

const atService = (host: string): boolean => !!host && SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

/** Whether a mailing service sent the email: by a header only one writes, or by the host its Message-ID or Return-Path names. */
export function sentByAService(e: Pick<ReceivedEmail, "headers" | "messageId">): boolean {
  const h = e.headers;
  if (SERVICE_HEADERS.some((n) => n in h)) return true;
  return atService(hostNamedBy(e.messageId ?? h["message-id"])) || atService(hostNamedBy(h["return-path"]));
}

/**
 * The one address an email's replies go to when it is someone other than its sender: a Reply-To naming one address, at
 * another domain than the From's, that is no no-reply. A website's form passes on a person's message this way; a
 * program's notice from a stranger with nobody behind it has none. Null otherwise.
 */
export function replyToElsewhere(e: Pick<ReceivedEmail, "headers" | "from">): string | null {
  const to = addressesOf((e.headers["reply-to"] ?? "").split(","));
  const [only] = to;
  if (to.length !== 1 || !only || noReplyAddress(only)) return null;
  const domain = (a: string) => a.slice(a.lastIndexOf("@") + 1).toLowerCase();
  return e.from && domain(only) !== domain(e.from.address) ? only : null;
}

/** HTML's entities as a Gmail snippet writes them. */
const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** A snippet's words: its entities read, by name or by number. */
function snippetWords(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .trim();
}

/**
 * A Gmail message read by its headers alone (users.messages.get, format=metadata): its headers and labels as a full
 * read gives them, and Gmail's snippet (the first words, a line or two) in place of its words. Null for an answer that
 * is not one.
 */
export function gmailHeadOf(json: unknown): MailboxEmail | null {
  const e = gmailEmailOf(json);
  if (!e) return null;
  const snippet = (json as { snippet?: unknown }).snippet;
  return { ...e, text: typeof snippet === "string" && snippet.trim() ? snippetWords(snippet) : null, html: null };
}
