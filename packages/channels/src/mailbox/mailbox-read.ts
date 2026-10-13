/**
 * An email read from a connected mailbox, as the intake reads any email (decision 0056): Gmail's message (format=full)
 * and Graph's message, each made into the intake's ReceivedEmail, with the provider's thread beside it; and a delivery
 * report read for the email of ours it is about. Pure.
 *
 * Nothing here proves a sender: a mailbox hands over the headers its receiving side wrote and the ones any sender may
 * write, in one list, so the verdict is null (intake.ts senderAuthenticated reads no header, and fails closed). What is
 * read from a mailbox is a reply in a thread a reach-out started, or a report about one of its emails, never a yes.
 */
import { addressOf, addressesOf, messageIdHeader } from "../email/header-values";
import type { ReceivedEmail } from "../email/intake";
import { unb64url } from "../google/google-oauth";

/** A received email from a mailbox, with the provider's thread it sits in and every report part's words. */
export interface MailboxEmail extends ReceivedEmail {
  /** Gmail's threadId, Graph's conversationId: what a reach-out's email was stamped with when it left. */
  threadId: string | null;
  /** The delivery-status and original-headers parts of a report, as text; null for an email that carries none. */
  reportText: string | null;
}

const dec = new TextDecoder();

/** Each try of a read of a mailbox, at either provider (a page of history or delta, a message, a profile). */
export const MAILBOX_READ_MS = 10_000;

/** A part's bytes as text in its charset; UTF-8 when it names none or one the runtime does not know. */
function decodedText(bytes: Uint8Array, charset: string | null): string {
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return dec.decode(bytes);
  }
}

type GmailHeader = { name?: unknown; value?: unknown };
interface GmailPart {
  mimeType?: unknown;
  headers?: GmailHeader[];
  body?: { data?: unknown; size?: unknown; attachmentId?: unknown };
  parts?: GmailPart[];
  filename?: unknown;
}

function headersOfList(list: GmailHeader[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of list ?? [])
    if (typeof h?.name === "string" && typeof h.value === "string") {
      const k = h.name.toLowerCase();
      if (!(k in out)) out[k] = h.value;
    }
  return out;
}

const charsetOf = (part: GmailPart): string | null => {
  const ct = headersOfList(part.headers)["content-type"] ?? "";
  return /charset="?([^";\s]+)"?/i.exec(ct)?.[1] ?? null;
};

/** Every leaf of a part tree, in order. */
function leaves(p: GmailPart): GmailPart[] {
  return Array.isArray(p.parts) && p.parts.length ? p.parts.flatMap(leaves) : [p];
}

const bodyText = (p: GmailPart): string | null =>
  typeof p.body?.data === "string" && p.body.data ? decodedText(unb64url(p.body.data), charsetOf(p)) : null;

/** Gmail's message, read in full (users.messages.get, format=full); null for an answer that is not one. */
export function gmailEmailOf(json: unknown): MailboxEmail | null {
  const m = json as { id?: unknown; threadId?: unknown; internalDate?: unknown; payload?: GmailPart } | null;
  if (!m || typeof m.id !== "string" || !m.payload) return null;
  const top = m.payload;
  const headers = headersOfList(top.headers);
  const parts = leaves(top);
  const mime = (p: GmailPart) => (typeof p.mimeType === "string" ? p.mimeType.toLowerCase() : "");
  const text =
    parts
      .filter((p) => mime(p) === "text/plain" && !p.filename)
      .map(bodyText)
      .find((t) => !!t) ?? null;
  const html =
    parts
      .filter((p) => mime(p) === "text/html")
      .map(bodyText)
      .find((t) => !!t) ?? null;
  const report = /multipart\/report/i.test(headers["content-type"] ?? "")
    ? parts
        .filter((p) =>
          /^(message\/delivery-status|message\/rfc822|text\/rfc822-headers|message\/rfc822-headers)$/.test(mime(p)),
        )
        .map(bodyText)
        .filter((t): t is string => !!t)
        .join("\n")
    : null;
  const at = Number(m.internalDate);
  return {
    id: m.id,
    threadId: typeof m.threadId === "string" ? m.threadId : null,
    from: addressOf(headers.from),
    to: addressesOf((headers.to ?? "").split(",")),
    cc: addressesOf((headers.cc ?? "").split(",")),
    subject: headers.subject ?? null,
    text,
    html,
    headers,
    authentication: null,
    messageId: messageIdHeader(headers["message-id"]),
    createdAt: Number.isFinite(at) && at > 0 ? new Date(at).toISOString() : null,
    attachments: parts
      .filter((p) => typeof p.filename === "string" && p.filename)
      .map((p) => ({
        filename: p.filename as string,
        contentType: mime(p) || null,
        size: typeof p.body?.size === "number" ? p.body.size : null,
      })),
    reportText: report || null,
  };
}

type GraphAddress = { emailAddress?: { address?: unknown; name?: unknown } };

const graphAddress = (a: GraphAddress | undefined): { address: string; name: string | null } | null => {
  const address = a?.emailAddress?.address;
  if (typeof address !== "string") return null;
  const name = typeof a?.emailAddress?.name === "string" ? a.emailAddress.name : null;
  return addressOf(name ? `${name} <${address}>` : address);
};

/**
 * Graph's message (users/{id}/messages/{id}, with its internetMessageHeaders and its body as text); null for an answer
 * that is not one. Graph hands a report's words as its body; its original's headers, Exchange quotes in them.
 */
export function graphEmailOf(json: unknown): MailboxEmail | null {
  const m = json as {
    id?: unknown;
    conversationId?: unknown;
    internetMessageId?: unknown;
    subject?: unknown;
    from?: GraphAddress;
    toRecipients?: GraphAddress[];
    ccRecipients?: GraphAddress[];
    receivedDateTime?: unknown;
    body?: { contentType?: unknown; content?: unknown };
    internetMessageHeaders?: GmailHeader[];
    hasAttachments?: unknown;
  } | null;
  if (!m || typeof m.id !== "string") return null;
  const headers = headersOfList(m.internetMessageHeaders);
  const content = typeof m.body?.content === "string" ? m.body.content : null;
  const isHtml = typeof m.body?.contentType === "string" && m.body.contentType.toLowerCase() === "html";
  const from = graphAddress(m.from);
  const looksReport =
    /multipart\/report/i.test(headers["content-type"] ?? "") ||
    /^(mailer-daemon|postmaster|microsoftexchange[0-9a-f]*)@/i.test(from?.address ?? "");
  return {
    id: m.id,
    threadId: typeof m.conversationId === "string" ? m.conversationId : null,
    from,
    to: (m.toRecipients ?? [])
      .map(graphAddress)
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => a.address),
    cc: (m.ccRecipients ?? [])
      .map(graphAddress)
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => a.address),
    subject: typeof m.subject === "string" ? m.subject : null,
    text: isHtml ? null : content,
    html: isHtml ? content : null,
    headers,
    authentication: null,
    messageId: messageIdHeader(typeof m.internetMessageId === "string" ? m.internetMessageId : headers["message-id"]),
    createdAt: typeof m.receivedDateTime === "string" ? m.receivedDateTime : null,
    attachments: [],
    reportText: looksReport ? content : null,
  };
}

/** What a delivery report says of an email of ours: which, to whom, and whether for good. */
export interface DeliveryReport {
  /** Our row's id, read off the Message-ID we sent it under (mailboxMessageId: <cl.<id>@host>); null when not quoted. */
  rowId: string | null;
  /** The original's Message-ID as the report quotes it, ours or not. */
  originalMessageId: string | null;
  recipient: string | null;
  /** RFC 3463's status ("5.1.1"); null when the report gives none. */
  status: string | null;
  /** A permanent failure (5.x.x, or Action: failed with no status): the address is not one to write to. */
  permanent: boolean;
  /** Only a delay (Action: delayed, or a 4.x.x not yet given up on): nothing failed yet, and nothing is applied. */
  delayed: boolean;
  /** The receiving server's own words, cut to a line, for the log. */
  diagnostic: string | null;
}

/** Our row id in a Message-ID we minted (mailbox-mime.ts mailboxMessageId), as a uuid. */
export function rowIdOfMessageId(id: string | null | undefined): string | null {
  const h = /<?cl\.([0-9a-f]{32})@/i.exec(id ?? "")?.[1]?.toLowerCase();
  if (!h) return null;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * A delivery report, read (RFC 3464, and Exchange's own words where it writes none): null for an email that is not
 * one. The original is found by the Message-ID the report quotes; ours are minted so that the row is in the id itself.
 */
export function deliveryReportOf(
  e: Pick<MailboxEmail, "headers" | "from" | "subject" | "text" | "reportText">,
): DeliveryReport | null {
  const local = e.from?.address.split("@")[0] ?? "";
  const isReport =
    /multipart\/report/i.test(e.headers["content-type"] ?? "") || /^(mailer-daemon|postmaster)$/i.test(local);
  if (!isReport) return null;
  const words = [e.reportText ?? "", e.text ?? ""].join("\n");
  const field = (name: string): string | null =>
    new RegExp(`^${name}:\\s*(.+)$`, "im").exec(words)?.[1]?.trim() ?? null;
  const quoted = /message-id:\s*(<[^<>\s]+@[^<>\s]+>)/i.exec(words)?.[1] ?? null;
  const ours = /<cl\.[0-9a-f]{32}@[^<>\s]+>/i.exec(words)?.[0] ?? null;
  const original = messageIdHeader(ours ?? quoted);
  const recipient =
    (field("Final-Recipient") ?? field("Original-Recipient") ?? e.headers["x-failed-recipients"] ?? "")
      .replace(/^rfc822;\s*/i, "")
      .trim()
      .toLowerCase() || null;
  const status =
    field("Status")?.match(/[245]\.\d{1,3}\.\d{1,3}/)?.[0] ?? words.match(/\b[45]\.\d{1,3}\.\d{1,3}\b/)?.[0] ?? null;
  const action = (field("Action") ?? "").toLowerCase();
  const permanent = status ? status.startsWith("5") : action === "failed";
  const delayed = action === "delayed" || (!!status && status.startsWith("4") && action !== "failed");
  const diagnostic = (field("Diagnostic-Code") ?? "").replace(/^smtp;\s*/i, "").slice(0, 300) || null;
  return {
    rowId: rowIdOfMessageId(original),
    originalMessageId: original,
    recipient,
    status,
    permanent,
    delayed,
    diagnostic,
  };
}
