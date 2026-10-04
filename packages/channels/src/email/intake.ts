/**
 * What arrives by email, read: which of the platform's addresses a delivery names, the received event, the fetched
 * email, the ids a header lists, and what a message claims to be. Whether a delivery is Resend's at all is
 * webhook-signature.ts; the header values it reads are header-values.ts.
 */
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
 * name, and a plus tag on a published address is not a second mailbox. On the
 * cold reply domain (Reach out D17), when there is one, a reply route routes
 * and nothing else: no workspace publishes an address there.
 */
export function platformRecipient(
  address: string,
  domain: string,
  coldReplyDomains: string | readonly string[] | null = null,
): PlatformRecipient | null {
  const a = address.trim().toLowerCase();
  const at = a.lastIndexOf("@");
  if (at < 1) return null;
  const host = a.slice(at + 1);
  const local = a.slice(0, at);
  const token = /^r\+([a-z2-7]{24})$/.exec(local)?.[1];
  const cold = (typeof coldReplyDomains === "string" ? [coldReplyDomains] : (coldReplyDomains ?? [])).map((d) =>
    d.toLowerCase(),
  );
  if (host !== domain.toLowerCase() && cold.includes(host)) return token ? { kind: "reply", token } : null;
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

/** One result of an Authentication-Results header (RFC 8601): `method=result` and its `ptype.property=value` pairs. */
interface AuthResult {
  method: string;
  result: string;
  props: Map<string, string>;
}

/**
 * The results an Authentication-Results header carries, lower-cased: its authserv-id is skipped, quoted strings and
 * comments are dropped (they are where a sender's own words reach a receiver's header, and they decide nothing), and each
 * `;`-separated clause is read as `method=result` and the first value of each property it names.
 */
function authResultsOf(header: string): AuthResult[] {
  let said = header.toLowerCase().replace(/"[^"]*"/g, '""');
  // Comments nest in RFC 5322: drop the innermost until none is left.
  for (let before = ""; before !== said;) {
    before = said;
    said = said.replace(/\([^()]*\)/g, " ");
  }
  return said
    .split(";")
    .slice(1)
    .flatMap((clause) => {
      const [head, ...rest] = clause.trim().split(/\s+/);
      const m = /^([a-z0-9-]+)(?:\/\d+)?=([a-z]+)$/.exec(head ?? "");
      if (!m) return [];
      const props = new Map<string, string>();
      for (const pair of rest) {
        const eq = pair.indexOf("=");
        if (eq > 0 && !props.has(pair.slice(0, eq))) props.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
      return [{ method: m[1] ?? "", result: m[2] ?? "", props }];
    });
}

/** The domain of an identity a header names: `example.com`, `@example.com` or `user@example.com`. */
const domainOf = (identity: string | undefined): string | null => {
  const d = identity?.slice(identity.lastIndexOf("@") + 1).trim();
  return d || null;
};

/**
 * Whether the receiving side PROVES the sender is who the From line says, from the Authentication-Results header it
 * writes (RFC 8601), as the fetched email carries it: an aligned DMARC pass for the From domain (`dmarc=pass` with
 * `header.from` that domain), or a DKIM pass signed by it (`dkim=pass` with `header.d` that domain, or, where the verifier
 * says only the signing identity, `header.i` on it). Anything else is no proof: no header, an SPF result alone (SPF
 * speaks for the envelope, not the From), a pass for another domain, a failure, a DMARC failure beside a DKIM pass.
 * FAILS CLOSED, which is the point: a yes to offers widens what may be sent, and a From line is one anyone can write, so
 * a header this cannot read as a proof is not one. A no (STOP, UNSUBSCRIBE) never asks it, since a no only narrows.
 *
 * Only the header's first value is read (a repeated header keeps its first, headersOf): the receiving side writes its own
 * at the top, above anything the sender sent with the mail. Which party wrote it is not checked here: the header is
 * evidence only so far as the provider's own mail server is the one that did (RFC 8601, on the trust boundary), which is what the
 * provider's receiving of mail is believed to be, and what must be seen on a real received email before it is relied on.
 */
export function senderAuthenticated(e: Pick<ReceivedEmail, "headers" | "from">): boolean {
  const from = domainOf(e.from?.address.toLowerCase());
  if (!from) return false;
  const results = authResultsOf(e.headers["authentication-results"] ?? "");
  const dmarc = results.filter((r) => r.method === "dmarc");
  if (dmarc.some((r) => r.result === "fail")) return false;
  const alignedDmarc = dmarc.some((r) => r.result === "pass" && domainOf(r.props.get("header.from")) === from);
  const signedByFrom = results.some(
    (r) =>
      r.method === "dkim" &&
      r.result === "pass" &&
      (r.props.has("header.d") ? r.props.get("header.d") === from : domainOf(r.props.get("header.i")) === from),
  );
  return alignedDmarc || signedByFrom;
}

export function classifyReceived(e: Pick<ReceivedEmail, "headers" | "from">): EmailClaim {
  const h = e.headers;
  const local = e.from?.address.split("@")[0] ?? "";
  if (/multipart\/report/i.test(h["content-type"] ?? "") || /^(mailer-daemon|postmaster)$/.test(local)) return "report";
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
