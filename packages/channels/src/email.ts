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
 */

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

export interface EmailRequestInput {
  identity: EmailIdentity;
  /** The person's stored address (normalizeEmail's spelling). */
  to: string;
  parent: EmailParent;
  /** The words, as the receptionist or a person wrote them. */
  body: string;
  /** Composed from the business's profile by the caller; null sends none. */
  signature: string | null;
  /** Who wrote the words: decides Auto-Submitted. */
  actor: "ai" | "human";
  /** The queued row this request belongs to: the idempotency key, and the tag every receipt names it by. */
  messageId: string;
  tenantId: string;
}

/** bestmovers@mail.chanlytics.com: the address a workspace publishes and sends from. */
export function hostedAddress(localPart: string, domain: string): string {
  return `${localPart}@${domain}`;
}

/** r+<token>@mail.chanlytics.com: where a reply comes back. It routes to a workspace; it authenticates nobody. */
export function replyRouteAddress(replyToken: string, domain: string): string {
  return `r+${replyToken}@${domain}`;
}

/** A workspace's hosted identity, from its mailbox row and the deployment's mail domain. */
export function hostedIdentity(mailbox: { local_part: string; reply_token: string; from_name: string }, domain: string): EmailIdentity {
  return { fromName: mailbox.from_name, fromAddress: hostedAddress(mailbox.local_part, domain), replyTo: replyRouteAddress(mailbox.reply_token, domain) };
}

/** A header value is one line: a newline in one is how a second header is smuggled in. */
const oneLine = (s: string): string => s.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();

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

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * The HTML twin of plain words: paragraphs and line breaks, escaped, nothing
 * else. It exists because mail clients render plain text worse than they
 * should, not to carry design; no markup from the words survives into it.
 */
export function emailHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/** A Message-ID as a header carries it, angle brackets and all; null for anything that is not one. */
export function messageIdHeader(id: string | null | undefined): string | null {
  const s = oneLine(id ?? "");
  const bare = s.replace(/^<|>$/g, "");
  return /^[^\s<>@]+@[^\s<>@]+$/.test(bare) ? `<${bare}>` : null;
}

/** The chain a reply carries: the parent's chain, then the parent. Bounded, oldest dropped first, the root kept. */
export function referencesFor(parent: Pick<EmailParent, "rfcMessageId" | "references">): string[] {
  const ids = [...parent.references, parent.rfcMessageId].map(messageIdHeader).filter((x): x is string => x !== null);
  const unique = [...new Set(ids)];
  const MAX = 20;
  return unique.length <= MAX ? unique : [unique[0], ...unique.slice(unique.length - (MAX - 1))];
}

/**
 * The request one reply leaves as.
 *
 * - From and Reply-To are the workspace's identity; To is the person's stored
 *   address. Neither is read from the parent's headers or from the words.
 * - In-Reply-To and References thread it under the parent in the customer's
 *   client. No Message-ID is minted here: the provider assigns one and reports
 *   it on the sent event, which is where the ledger learns it.
 * - A receptionist's reply says so in the header a mail system reads
 *   (Auto-Submitted: auto-replied, RFC 3834), so an auto-responder on the
 *   other side does not answer it and start a loop. A person's own reply
 *   carries no such mark.
 * - The tags name the row and the workspace, so a receipt finds its message
 *   without a lookup by the provider's id, even one that arrives before the
 *   send's own write.
 */
export function buildEmailRequest(i: EmailRequestInput): EmailRequest {
  const text = [i.body.trim(), i.signature?.trim()].filter(Boolean).join("\n\n");
  const inReplyTo = messageIdHeader(i.parent.rfcMessageId);
  const references = referencesFor(i.parent);
  const headers: Record<string, string> = {
    ...(inReplyTo ? { "In-Reply-To": inReplyTo } : {}),
    ...(references.length ? { References: references.join(" ") } : {}),
    ...(i.actor === "ai" ? { "Auto-Submitted": "auto-replied" } : {}),
  };
  return {
    from: mailboxHeader(i.identity.fromName, i.identity.fromAddress),
    to: [i.to],
    reply_to: [i.identity.replyTo],
    subject: replySubject(i.parent.subject),
    text,
    html: emailHtml(text),
    headers,
    tags: [{ name: "cl_message", value: i.messageId }, { name: "cl_tenant", value: i.tenantId }],
    idempotency_key: i.messageId,
  };
}

/** Is this stored value a request the wire may send? The row's meta is JSON; the wire trusts its shape, not its type. */
export function isEmailRequest(v: unknown): v is EmailRequest {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  const strings = (x: unknown): x is string[] => Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === "string" && s.length > 0);
  return typeof r.from === "string" && strings(r.to) && strings(r.reply_to)
    && typeof r.subject === "string" && typeof r.text === "string" && typeof r.html === "string"
    && !!r.headers && typeof r.headers === "object" && Array.isArray(r.tags)
    && typeof r.idempotency_key === "string" && r.idempotency_key.length > 0;
}
