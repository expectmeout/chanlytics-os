/**
 * Email, the part with no network in it: a workspace's addresses, the subject
 * a reply carries, and the REQUEST an email leaves as.
 *
 * The request is built once and frozen. It is written to the queued message's
 * row before the first attempt (meta.email.request) and the wire sends those
 * bytes: a retry repeats them exactly, under the same idempotency key, so a
 * send the provider accepted before a worker died cannot leave twice, and an
 * owner's edit is a new message with a new approval rather than a mutation of
 * one that may already be in somebody's inbox. Everything in it is derived by
 * the server from stored rows. The model writes `text` and nothing else: it is
 * never read for a subject, a recipient or a header.
 *
 * docs/plans/2026-09-17-email-channel.md, §7.
 *
 * This module holds the request: what an email answers and leaves as, its
 * subject, its HTML twin, its thread and a campaign's headers
 * (buildEmailRequest), and the check a stored one passes (isEmailRequest). A
 * workspace's addresses are identity.ts; the header values both read are
 * header-values.ts; what arrives is intake.ts and webhook-signature.ts; what
 * became of a send is receipts.ts; the provider's other answers are
 * provider-answers.ts.
 */
import { escapeHtml, posesAsReply } from "@chanlytics/contracts";
import { messageIdHeader, oneLine } from "./header-values";

/** What an email is a reply to, read off the stored parent row. */
export interface EmailParent {
  /** The Chanlytics message being answered. */
  messageId: string;
  /** Its own Message-ID header, when it had one. */
  rfcMessageId: string | null;
  /** The chain it carried, oldest first. */
  references: string[];
  subject: string | null;
}

/** Who a workspace's email leaves as. */
export interface EmailIdentity {
  fromName: string;
  fromAddress: string;
  replyTo: string;
}

/** The frozen request: the body of Resend's POST /emails, and the key it is sent under. */
export interface EmailRequest {
  from: string;
  to: string[];
  reply_to: string[];
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
  tags: Array<{ name: string; value: string }>;
  idempotency_key: string;
}

/** What a campaign carries that a reply does not: how a person stops it, and the lines its foot owes. */
export interface EmailCampaign {
  /** One click, no sign-in (RFC 8058): an https address that takes a POST. */
  unsubscribeUrl: string;
  /**
   * The same by mail, for a client that only knows mailto: a bare address, and only one the mailbox's intake reads
   * (an address nothing receives is an unsubscribe into nothing). Optional: RFC 8058's one click needs the https
   * address alone.
   */
  unsubscribeMailto?: string;
  /** Why they are hearing from us, the business's name and postal address, the way to say no. Composed by the caller; never empty. */
  footer: string;
  /**
   * The same foot in HTML (contracts campaignFooterHtml), the link reading "Unsubscribe" as the canvas draws it. When
   * given it ends the HTML twin in place of the text foot, and it must carry the unsubscribe link itself.
   */
  footerHtml?: string;
}

export interface EmailRequestInput {
  identity: EmailIdentity;
  /** The person's stored address (normalizeEmail's spelling). */
  to: string;
  /** The email this answers. Null for a first email, which then names its own subject. */
  parent: EmailParent | null;
  /** A first email's subject. Read only when there is no parent: a reply's is always its parent's, once, with Re:. */
  subject?: string;
  /** The words, as the receptionist or a person wrote them. */
  body: string;
  /** Composed from the business's profile by the caller; null sends none. */
  signature: string | null;
  /** Who wrote the words: with the parent and the campaign, decides Auto-Submitted. */
  actor: "ai" | "human";
  /**
   * Mail a program sends on its own schedule (a reach-out, an offer): marked as such, with its unsubscribe and its
   * footer. Its parent, when it has one, is our own earlier email in the same campaign (a nudge), never the person's:
   * an answer to them is a reply, and goes without this.
   */
  campaign?: EmailCampaign;
  /** The queued row this request belongs to: the idempotency key, and the tag every receipt names it by. */
  messageId: string;
  tenantId: string;
}

/** `"Name" <address>`, the name quoted so a comma or a bracket in it cannot end it early. */
export function mailboxHeader(name: string, address: string): string {
  const clean = oneLine(name).replace(/["\\]/g, "");
  return clean ? `"${clean}" <${address}>` : address;
}

const REPLY_PREFIX = /^\s*(?:re|aw|sv|rv|antw)\s*:\s*/i;
const SUBJECT_MAX = 200;

/** "Re: <their subject>", once, however many prefixes the chain has stacked. A parent without one still gets a subject a person can find. */
export function replySubject(parentSubject: string | null | undefined): string {
  let s = oneLine(parentSubject ?? "");
  while (REPLY_PREFIX.test(s)) s = s.replace(REPLY_PREFIX, "");
  return `Re: ${s || "your message"}`.slice(0, SUBJECT_MAX);
}

/** A web address in the words, read AFTER escaping, so `"` and `<` are already entities and cannot end it early. */
const LINK_IN_TEXT = /https?:\/\/[^\s<>]+/g;

/**
 * An address in the words becomes a link; the punctuation that closed the
 * sentence around it stays outside. Only http and https, and only from
 * escaped text: `&` inside an address is already `&amp;`, which a browser
 * reads back as `&`, and nothing else in the words can reach the markup.
 */
const linkify = (escaped: string): string =>
  escaped.replace(LINK_IN_TEXT, (m) => {
    const trail = /[.,;:!?)]+$/.exec(m)?.[0] ?? "";
    const href = m.slice(0, m.length - trail.length);
    return `<a href="${href}">${href}</a>${trail}`;
  });

/**
 * The HTML twin of plain words: paragraphs and line breaks, escaped, nothing
 * else -- except that a web address in the words is a link, so a proposal or
 * a booking link opens where the client does not link plain text itself. It
 * exists because mail clients render plain text worse than they should, not
 * to carry design; no markup from the words survives into it.
 */
export function emailHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${linkify(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/** The chain a reply carries: the parent's chain, then the parent. Bounded, oldest dropped first, the root kept. */
export function referencesFor(parent: Pick<EmailParent, "rfcMessageId" | "references">): string[] {
  const ids = [...parent.references, parent.rfcMessageId].map(messageIdHeader).filter((x): x is string => x !== null);
  const unique = [...new Set(ids)];
  const MAX = 20;
  return unique.length <= MAX ? unique : [...unique.slice(0, 1), ...unique.slice(unique.length - (MAX - 1))];
}

/**
 * A campaign's ways to stop it, as the headers carry them: URL-safe characters only (RFC 2369) and no comma, so the
 * list cannot gain a second entry, and a mail address with no query, so a mailto cannot gain a second recipient.
 */
const UNSUBSCRIBE_URL = /^https:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+;=%]+$/;
const BARE_ADDRESS = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
function unsubscribeHeaders(c: EmailCampaign): Record<string, string> {
  const url = c.unsubscribeUrl.trim();
  if (!UNSUBSCRIBE_URL.test(url)) throw new Error("buildEmailRequest: a campaign's unsubscribe is one https address");
  const mail = c.unsubscribeMailto?.trim().replace(/^mailto:/i, "");
  if (mail !== undefined && !BARE_ADDRESS.test(mail))
    throw new Error("buildEmailRequest: a campaign's unsubscribe by mail is one address");
  return {
    "List-Unsubscribe": mail ? `<${url}>, <mailto:${mail}>` : `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/**
 * The request one email leaves as: a reply, or a first email.
 *
 * - From and Reply-To are the workspace's identity; To is the person's stored
 *   address. Neither is read from the parent's headers or from the words.
 * - A reply threads under its parent (In-Reply-To, References) and carries the
 *   parent's subject once, with Re:. A first email has no parent and names its
 *   own subject; one without a subject is a mistake in the code, not an email.
 *   No Message-ID is minted here: the provider assigns one and reports it on
 *   the sent event, which is where the ledger learns it.
 * - The header a mail system reads says what the email is (RFC 3834): a
 *   receptionist's reply is auto-replied; mail a program sends on its own -- a
 *   campaign, or a first email the receptionist wrote -- is auto-generated, so
 *   an auto-responder on the other side does not answer it and start a loop.
 *   A person's own words carry no such mark.
 * - A campaign carries the way to stop it: List-Unsubscribe with an https
 *   address and a mail address, and List-Unsubscribe-Post for one click
 *   (RFC 8058), which the large mailbox providers require of bulk mail; and
 *   its footer, after the signature. Both addresses are checked here, because
 *   a header value that is not one line is a second header.
 * - The tags name the row and the workspace, so a receipt finds its message
 *   without a lookup by the provider's id, even one that arrives before the
 *   send's own write.
 */
export function buildEmailRequest(i: EmailRequestInput): EmailRequest {
  const subject = i.parent ? replySubject(i.parent.subject) : oneLine(i.subject ?? "").slice(0, SUBJECT_MAX);
  if (!subject) throw new Error("buildEmailRequest: a first email names its subject");
  // A first email a program sends never poses as a reply or a forward (contracts posesAsReply: the sheet asks it too).
  if (!i.parent && (i.campaign || i.actor === "ai") && posesAsReply(subject))
    throw new Error("buildEmailRequest: a first email a program sends does not pose as a reply");
  if (i.campaign && !i.campaign.footer.trim()) throw new Error("buildEmailRequest: a campaign's footer is never empty");
  const unsubscribe = i.campaign ? unsubscribeHeaders(i.campaign) : {};
  const text = [i.body.trim(), i.signature?.trim(), i.campaign?.footer.trim()].filter(Boolean).join("\n\n");
  const footerHtml = i.campaign?.footerHtml?.trim() || null;
  if (footerHtml && !footerHtml.includes(`href="${escapeHtml(i.campaign!.unsubscribeUrl.trim())}"`))
    throw new Error("buildEmailRequest: a campaign's HTML footer carries its unsubscribe link");
  const html = footerHtml
    ? `${emailHtml([i.body.trim(), i.signature?.trim()].filter(Boolean).join("\n\n"))}\n${footerHtml}`
    : emailHtml(text);
  const inReplyTo = i.parent ? messageIdHeader(i.parent.rfcMessageId) : null;
  const references = i.parent ? referencesFor(i.parent) : [];
  const autoSubmitted =
    i.campaign || (i.actor === "ai" && !i.parent) ? "auto-generated" : i.actor === "ai" ? "auto-replied" : null;
  const headers: Record<string, string> = {
    ...(inReplyTo ? { "In-Reply-To": inReplyTo } : {}),
    ...(references.length ? { References: references.join(" ") } : {}),
    ...(autoSubmitted ? { "Auto-Submitted": autoSubmitted } : {}),
    ...unsubscribe,
  };
  return {
    from: mailboxHeader(i.identity.fromName, i.identity.fromAddress),
    to: [i.to],
    reply_to: [i.identity.replyTo],
    subject,
    text,
    html,
    headers,
    tags: [
      { name: "cl_message", value: i.messageId },
      { name: "cl_tenant", value: i.tenantId },
    ],
    idempotency_key: i.messageId,
  };
}

/** Is this stored value a request the wire may send? The row's meta is JSON; the wire trusts its shape, not its type. */
export function isEmailRequest(v: unknown): v is EmailRequest {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  const strings = (x: unknown): x is string[] =>
    Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === "string" && s.length > 0);
  return (
    typeof r.from === "string" &&
    strings(r.to) &&
    strings(r.reply_to) &&
    typeof r.subject === "string" &&
    typeof r.text === "string" &&
    typeof r.html === "string" &&
    !!r.headers &&
    typeof r.headers === "object" &&
    Array.isArray(r.tags) &&
    typeof r.idempotency_key === "string" &&
    r.idempotency_key.length > 0
  );
}
