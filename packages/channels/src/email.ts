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

/* ------------------------------------------------------------------ intake
 *
 * What arrives, read without a network: whether a webhook is Resend's, which
 * of the platform's addresses a delivery names, what an event and a fetched
 * email carry, and what a message CLAIMS to be. A claim decides nothing by
 * itself: the verb that takes an email in (core email-ingest.ts) does less for
 * a claim it cannot stand behind, never more.
 */

/** Into a buffer of its own: what importKey is typed to take, and nothing shared with another view. */
const bytesOfBase64 = (s: string): ArrayBuffer => {
  const raw = atob(s);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out.buffer;
};
const base64OfBytes = (b: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(b)));

/** Constant-time, so a wrong signature says nothing about how wrong it was. */
function sameBytes(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface SvixHeaders { id: string | null; timestamp: string | null; signature: string | null }

/** How far a webhook's clock may be from ours: a captured delivery is not replayable for longer. */
export const WEBHOOK_TOLERANCE_S = 300;

/** The signature Svix computes for one delivery, base64; null when the secret is not one. Exported because a test signs with it, as twilioSignature is. */
export async function resendWebhookSignature(secret: string, id: string, timestamp: string, rawBody: string): Promise<string | null> {
  let keyBytes: ArrayBuffer;
  try { keyBytes = bytesOfBase64(secret.startsWith("whsec_") ? secret.slice(6) : secret); } catch { return null; }
  const key = await globalThis.crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64OfBytes(await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)));
}

/**
 * Is this delivery Resend's? Resend signs with Svix: HMAC-SHA256 over
 * `<svix-id>.<svix-timestamp>.<raw body>`, keyed with the bytes behind the
 * endpoint's `whsec_` secret, sent as one or more space-separated `v1,<base64>`
 * entries (more than one while a secret is being rotated). The RAW body, as it
 * arrived: a re-serialised one signs differently. Web Crypto, like the Meta,
 * Twilio and Retell verifiers beside it, so it runs on the edge as it is.
 *
 * It proves who sent the EVENT. It says nothing about who sent the email the
 * event is about.
 */
export async function verifyResendWebhook(secret: string | undefined, h: SvixHeaders, rawBody: string, nowMs: number): Promise<boolean> {
  if (!secret || !h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > WEBHOOK_TOLERANCE_S) return false;
  const expected = await resendWebhookSignature(secret, h.id, h.timestamp, rawBody);
  if (!expected) return false;
  return h.signature.split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    return version === "v1" && !!sig && sameBytes(sig, expected);
  });
}

/** Which of the platform's addresses a delivery names: a workspace's published one, or a reply route. */
export type PlatformRecipient = { kind: "mailbox"; localPart: string } | { kind: "reply"; token: string };

/**
 * An address on the platform's mail domain, read for what it routes to; null
 * for any other address. Exact: the domain must be the deployment's, the local
 * part one the table could hold (00126). Nothing is inferred from a display
 * name, and a plus tag on a published address is not a second mailbox.
 */
export function platformRecipient(address: string, domain: string): PlatformRecipient | null {
  const a = address.trim().toLowerCase();
  const at = a.lastIndexOf("@");
  if (at < 1 || a.slice(at + 1) !== domain.toLowerCase()) return null;
  const local = a.slice(0, at);
  const reply = /^r\+([a-z2-7]{24})$/.exec(local);
  if (reply) return { kind: "reply", token: reply[1] };
  return /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(local) && local !== "r" ? { kind: "mailbox", localPart: local } : null;
}

/** `Ana Reyes <ana@x.com>` or `ana@x.com`: the address and the phrase, apart. The phrase is the sender's own and proves nothing. */
export function addressOf(header: string | null | undefined): { address: string; name: string | null } | null {
  const s = oneLine(header ?? "");
  if (!s) return null;
  const angle = /^(.*)<([^<>\s]+)>\s*$/.exec(s);
  const address = (angle ? angle[2] : s).trim().toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) return null;
  const name = angle ? angle[1].trim().replace(/^"(.*)"$/, "$1").trim() : "";
  return { address, name: name || null };
}

/** One received email as the webhook announces it: a pointer, and who it was delivered to. */
export interface EmailReceivedEvent {
  type: "email.received";
  receivedId: string;
  /** Every address the delivery names, lower-cased: to, cc and bcc, because a forward or a blind copy lands in any of them. */
  recipients: string[];
}

const stringsOf = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).filter((x): x is string => typeof x === "string" && x.length > 0);

const addressesOf = (v: unknown): string[] => stringsOf(v).map((r) => addressOf(r)?.address).filter((a): a is string => !!a);

/** The received event, or null for any other event or shape. Lenient about a list that arrives as one string. */
export function emailReceivedEventFrom(payload: unknown): EmailReceivedEvent | null {
  const p = payload as { type?: unknown; data?: Record<string, unknown> } | null;
  if (!p || p.type !== "email.received" || !p.data || typeof p.data !== "object") return null;
  const id = p.data.email_id ?? p.data.id;
  if (typeof id !== "string" || !id) return null;
  const recipients = [...addressesOf(p.data.to), ...addressesOf(p.data.cc), ...addressesOf(p.data.bcc)];
  return { type: "email.received", receivedId: id, recipients: [...new Set(recipients)] };
}

/** One received email as the provider hands it over when asked for it by id. */
export interface ReceivedEmail {
  id: string;
  from: { address: string; name: string | null } | null;
  to: string[];
  cc: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  /** Lower-cased names; a header that repeats keeps its first value. */
  headers: Record<string, string>;
  messageId: string | null;
  createdAt: string | null;
  attachments: Array<{ filename: string | null; contentType: string | null; size: number | null }>;
}

function headersOf(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: unknown, val: unknown) => { if (typeof k === "string" && typeof val === "string" && !(k.toLowerCase() in out)) out[k.toLowerCase()] = val; };
  if (Array.isArray(v)) for (const h of v) put((h as { name?: unknown })?.name, (h as { value?: unknown })?.value);
  else if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) put(k, Array.isArray(val) ? val[0] : val);
  return out;
}

/** The fetched email, or null when the answer is not one. Headers as a map or as a list of pairs, whichever the provider sends. */
export function receivedEmailFrom(body: unknown): ReceivedEmail | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== "object" || typeof b.id !== "string") return null;
  const headers = headersOf(b.headers);
  const str = (v: unknown): string | null => (typeof v === "string" && v.length ? v : null);
  return {
    id: b.id,
    from: addressOf(str(b.from) ?? headers.from),
    to: addressesOf(b.to),
    cc: addressesOf(b.cc),
    subject: str(b.subject) ?? str(headers.subject),
    text: str(b.text),
    html: str(b.html),
    headers,
    messageId: messageIdHeader(str(b.message_id) ?? headers["message-id"]),
    createdAt: str(b.created_at),
    attachments: (Array.isArray(b.attachments) ? b.attachments : []).map((a) => {
      const x = (a ?? {}) as Record<string, unknown>;
      return { filename: str(x.filename), contentType: str(x.content_type), size: typeof x.size === "number" ? x.size : null };
    }),
  };
}

/** The ids a header lists, as headers carry them. */
export function messageIdsIn(header: string | null | undefined): string[] {
  return (header ?? "").split(/\s+/).map(messageIdHeader).filter((x): x is string => x !== null);
}

/**
 * What a received email CLAIMS to be, from headers anyone can write. The order
 * is the rule: a delivery report and an automatic reply are tested before the
 * generic automated mark, because both carry it, and each is handled apart.
 *
 *   report     a bounce or a delivery status notification, by email. Recorded
 *              for a person; what stops sends to an address is the provider's
 *              signed receipt, never this.
 *   auto_reply an out-of-office or a responder answering something of ours
 *              (RFC 3834 auto-replied, and the markers older systems use).
 *              Never answered: two responders answering each other is a loop.
 *   automated  mail a program produced or a list sent. Kept, and kept from the
 *              receptionist. (A lead notification is automated mail too; the
 *              day one is parsed, its source is tested before this.)
 *   person     none of the above.
 */
export type EmailClaim = "report" | "auto_reply" | "automated" | "person";

export function classifyReceived(e: Pick<ReceivedEmail, "headers" | "from">): EmailClaim {
  const h = e.headers;
  const local = e.from?.address.split("@")[0] ?? "";
  if (/multipart\/report/i.test(h["content-type"] ?? "") || /^(mailer-daemon|postmaster)$/.test(local)) return "report";
  const auto = (h["auto-submitted"] ?? "").trim().toLowerCase();
  if (auto.startsWith("auto-replied") || "x-autoreply" in h || "x-autorespond" in h || /^auto[_-]?reply$/i.test((h.precedence ?? "").trim())) return "auto_reply";
  if ((auto && auto !== "no") || /^(bulk|list|junk)$/i.test((h.precedence ?? "").trim()) || "list-id" in h || "list-unsubscribe" in h) return "automated";
  return "person";
}
