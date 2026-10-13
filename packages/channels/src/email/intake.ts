/**
 * What arrives by email, read: which of the platform's addresses a delivery names, the received event, the fetched
 * email, the ids a header lists, and what a message claims to be. Whether a delivery is Resend's at all is
 * webhook-signature.ts; the header values it reads are header-values.ts.
 */
import { bookingNoticeOf, forwardingConfirmationOf, type EmailClaim } from "@chanlytics/contracts";
import { addressOf, addressesOf, messageIdHeader } from "./header-values";

/* ------------------------------------------------------------------ intake
 *
 * What arrives, read without a network: whether a webhook is Resend's, which
 * of the platform's addresses a delivery names, what an event and a fetched
 * email carry, and what a message CLAIMS to be. A claim decides nothing by
 * itself: the verb that takes an email in (core email-ingest.ts) does less for
 * a claim it cannot stand behind, never more.
 */

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
  if (at < 1) return null;
  const host = a.slice(at + 1);
  const local = a.slice(0, at);
  const token = /^r\+([a-z2-7]{24})$/.exec(local)?.[1];
  if (host !== domain.toLowerCase()) return null;
  if (token) return { kind: "reply", token };
  return /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(local) && local !== "r"
    ? { kind: "mailbox", localPart: local }
    : null;
}

/** One received email as the webhook announces it: a pointer, and who it was delivered to. */
export interface EmailReceivedEvent {
  type: "email.received";
  receivedId: string;
  /**
   * The addresses this delivery was made to, lower-cased. `received_for` is the
   * envelope: who the provider accepted the email FOR, which is what a forward
   * and a blind copy arrive under, and which the sender's own To and Cc lines
   * cannot rewrite. When an event carries it, nothing else routes. An event
   * without it is read by its To, Cc and Bcc, which can only name more of the
   * platform's own addresses than the envelope did, never somebody else's.
   */
  recipients: string[];
}

/** The received event, or null for any other event or shape. Lenient about a list that arrives as one string. */
export function emailReceivedEventFrom(payload: unknown): EmailReceivedEvent | null {
  const p = payload as { type?: unknown; data?: Record<string, unknown> } | null;
  if (!p || p.type !== "email.received" || !p.data || typeof p.data !== "object") return null;
  const id = p.data.email_id ?? p.data.id;
  if (typeof id !== "string" || !id) return null;
  const envelope = addressesOf(p.data.received_for);
  const recipients = envelope.length
    ? envelope
    : [...addressesOf(p.data.to), ...addressesOf(p.data.cc), ...addressesOf(p.data.bcc)];
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
  /**
   * What the provider's receiving side concluded about the sender as the email arrived (Resend's `authentication`): SPF,
   * DKIM and DMARC, each in the provider's own word (`pass`, `fail`, `gray`, `processing_failed`, `unknown`). The server
   * that took the email in computes it; it is a field of the provider's answer, never a line of the message, so nothing
   * a sender writes reaches it. Null when the provider handed none over (it gives none for an email from before it kept
   * one), or handed over something that is not one: no proof, either way (`senderAuthenticated`).
   */
  authentication: { spf: string; dkim: string; dmarc: string } | null;
  messageId: string | null;
  createdAt: string | null;
  attachments: Array<{ filename: string | null; contentType: string | null; size: number | null }>;
}

function headersOf(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: unknown, val: unknown) => {
    if (typeof k === "string" && typeof val === "string" && !(k.toLowerCase() in out)) out[k.toLowerCase()] = val;
  };
  if (Array.isArray(v)) for (const h of v) put((h as { name?: unknown })?.name, (h as { value?: unknown })?.value);
  else if (v && typeof v === "object")
    for (const [k, val] of Object.entries(v)) put(k, Array.isArray(val) ? val[0] : val);
  return out;
}

/**
 * The provider's verdict on a sender, or null for anything that is not one. Each check is the word the provider gave,
 * exactly as it gave it; a check it left out, or gave as anything but a word, reads as "", which passes nothing.
 */
function senderChecksOf(v: unknown): ReceivedEmail["authentication"] {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const said = v as Record<string, unknown>;
  const word = (x: unknown): string => (typeof x === "string" ? x : "");
  return { spf: word(said.spf), dkim: word(said.dkim), dmarc: word(said.dmarc) };
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
    authentication: senderChecksOf(b.authentication),
    messageId: messageIdHeader(str(b.message_id) ?? headers["message-id"]),
    createdAt: str(b.created_at),
    attachments: (Array.isArray(b.attachments) ? b.attachments : []).map((a) => {
      const x = (a ?? {}) as Record<string, unknown>;
      return {
        filename: str(x.filename),
        contentType: str(x.content_type),
        size: typeof x.size === "number" ? x.size : null,
      };
    }),
  };
}

/** The ids a header lists, as headers carry them. */
export function messageIdsIn(header: string | null | undefined): string[] {
  return (header ?? "")
    .split(/\s+/)
    .map(messageIdHeader)
    .filter((x): x is string => x !== null);
}

/**
 * What a received email CLAIMS to be, from headers anyone can write: one of contracts' EMAIL_CLAIMS, the one list of
 * them, which also says whether each is a person's words. The order classifyReceived tests them in is the rule: a
 * delivery report and an automatic reply are tested before the generic automated mark, because both carry it, and
 * each is handled apart.
 *
 *   report                   a bounce or a delivery status notification, by email. Recorded
 *                            for a person; what stops sends to an address is the provider's
 *                            signed receipt, never this.
 *   booking_notice           a booking tool writing about one of the business's appointments.
 *   forwarding_confirmation  Gmail asking whether it may forward an account's mail here.
 *   auto_reply               an out-of-office or a responder answering something of ours
 *                            (RFC 3834 auto-replied, and the markers older systems use).
 *                            Never answered: two responders answering each other is a loop.
 *   automated                mail a program produced or a list sent. Kept, and kept from the
 *                            receptionist. (A lead notification is automated mail too; the
 *                            day one is parsed, its source is tested before this.)
 *   person                   none of the above.
 */
export type { EmailClaim };

/**
 * One mailbox, plainly: an address, and a phrase beside it that could not be a second one. A From line may list several
 * mailboxes (RFC 5322) and `addressOf` reads the last, while which of them a verdict was reached about is the
 * provider's to choose: a line that names more than one is nobody's proof. A phrase with an angle bracket in it, or an
 * @ that is not the address itself written again as its own name, is read as naming another.
 */
function oneMailbox(m: { address: string; name: string | null } | null): m is { address: string; name: string | null } {
  if (!m?.address.includes("@")) return false;
  const name = (m.name ?? "").replace(/^'(.*)'$/, "$1").toLowerCase();
  return !/[<>]/.test(name) && (!name.includes("@") || name === m.address);
}

/**
 * What DMARC may say beside a DKIM pass that stands by itself: that there was no policy to pass (`gray`), or that it
 * was not worked out. A list of what is known, so a word the provider adds one day is not read as a yes.
 */
const DMARC_SAID_NOTHING: ReadonlySet<string> = new Set(["gray", "unknown", "processing_failed"]);

/**
 * Whether the receiving side PROVES the sender is who the From line says, from the provider's own verdict on the email
 * (`authentication`, above): DMARC passed, which is by definition an SPF or a DKIM pass aligned with the From domain; or
 * DKIM passed and DMARC said nothing against it. The provider documents a DKIM pass as a signature by the From domain
 * (one by another domain it calls `gray`), and it is how a sender whose domain publishes no policy is proved. Anything
 * else is no proof: no verdict, an SPF pass alone (SPF speaks for the envelope, not the From), a DKIM pass beside a
 * DMARC failure or beside a word this does not know, and a From that is not one mailbox, plainly (`oneMailbox`): the
 * one the provider names, and the message's own From line where the provider lists it, which must name the same.
 * FAILS CLOSED, which is the point: a yes to offers widens what may be sent, and a From line is one anyone can write.
 * A no (STOP, UNSUBSCRIBE) never asks it, since a no only narrows.
 *
 * No header is read for the verdict. An `Authentication-Results` header is words: a sender can write one into its own
 * mail, under any name and anywhere among the headers, so reading it meant knowing which one the receiver wrote, by a
 * name each deployment had to be told by hand (EMAIL_AUTHSERV_ID). Production was never told, and so proved no sender at
 * all. The verdict is not in the message, and needs nothing set.
 */
export function senderAuthenticated(e: Pick<ReceivedEmail, "from" | "headers" | "authentication">): boolean {
  const said = e.authentication;
  const own = e.headers.from === undefined ? e.from : addressOf(e.headers.from);
  if (!said || !oneMailbox(e.from) || !oneMailbox(own) || own.address !== e.from.address) return false;
  return said.dmarc === "pass" || (said.dkim === "pass" && DMARC_SAID_NOTHING.has(said.dmarc));
}

export function classifyReceived(e: Pick<ReceivedEmail, "headers" | "from" | "subject" | "text">): EmailClaim {
  const h = e.headers;
  const local = e.from?.address.split("@")[0] ?? "";
  if (/multipart\/report/i.test(h["content-type"] ?? "") || /^(mailer-daemon|postmaster)$/.test(local)) return "report";
  // A booking tool writing about one of the business's appointments (contracts bookingNoticeOf): its own sender, or a
  // person's forward whose quoted head names it. Before the automated marks, which a tool's notice carries too.
  if (bookingNoticeOf({ from: e.from, subject: e.subject, text: e.text })) return "booking_notice";
  // Gmail asking whether it may forward an account's mail here (contracts forwardingConfirmationOf): kept on the
  // mailbox for Settings, never as a thread; the same automated marks as a tool's notice.
  if (forwardingConfirmationOf({ from: e.from, subject: e.subject, text: e.text })) return "forwarding_confirmation";
  const auto = (h["auto-submitted"] ?? "").trim().toLowerCase();
  if (
    auto.startsWith("auto-replied") ||
    "x-autoreply" in h ||
    "x-autorespond" in h ||
    /^auto[_-]?reply$/i.test((h.precedence ?? "").trim())
  )
    return "auto_reply";
  if (
    (auto && auto !== "no") ||
    /^(bulk|list|junk)$/i.test((h.precedence ?? "").trim()) ||
    "list-id" in h ||
    "list-unsubscribe" in h
  )
    return "automated";
  return "person";
}
