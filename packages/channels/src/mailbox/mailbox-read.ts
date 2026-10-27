/**
 * An email read from a connected mailbox, as the intake reads any email (decision 0056): Gmail's message (format=full)
 * and Graph's message, each made into the intake's ReceivedEmail, with the provider's thread beside it; and a delivery
 * report read for the email of ours it is about. Pure.
 *
 * Nothing here proves a sender: a mailbox hands over the headers its receiving side wrote and the ones any sender may
 * write, in one list, so the verdict is null (intake.ts senderAuthenticated reads no header, and fails closed). What is
 * read from a mailbox is a reply in a thread a reach-out started, or a report about one of its emails, never a yes.
 */
import { MIN_MS } from "@chanlytics/contracts";
import { addressOf, addressesOf, messageIdHeader } from "../email/header-values";
import type { ReceivedEmail } from "../email/intake";
import { unb64url } from "../google/google-oauth";
import type { ProviderReply } from "../provider-fetch";

/** A received email from a mailbox, with the provider's thread it sits in and every report part's words. */
export interface MailboxEmail extends ReceivedEmail {
  /** Gmail's threadId, Graph's conversationId: what a reach-out's email was stamped with when it left. */
  threadId: string | null;
  /** The delivery-status and original-headers parts of a report, as text; null for an email that carries none. */
  reportText: string | null;
  /** Gmail's labels on the message (its labelIds: INBOX, CATEGORY_PROMOTIONS, ...); none from Graph. */
  labels: string[];
}

/**
 * Gmail's tabs that hold nobody's words to the business, in Google's own description of each: Promotions ("deals,
 * offers, and other promotional emails"), Social ("messages from social networks and media-sharing sites") and Forums
 * ("messages from online groups, discussion boards, and mailing lists"). Amazon's newsletter carries none of the
 * automated headers and came in as a person (26 Oct 2026).
 *
 * Updates is not among them (filedUnderUpdates).
 */
const GMAIL_BULK_TABS: ReadonlySet<string> = new Set(["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"]);

/**
 * Whether Gmail filed a message under Updates. Google calls the tab "automated confirmations, notifications,
 * statements, and reminders that may not need immediate attention", but Gmail sorts each message by a model it does not
 * publish, and what a person sends through a tool (a signature request, a booking form, a help desk's reply, a
 * supplier's invoice) is filed there with the receipts. So the tab alone leaves nothing: a reader weighs it with who
 * sent it and whether it answers anything (edge mailbox-sorting.ts), and lists what it leaves, one press from coming in.
 */
export function filedUnderUpdates(e: Pick<MailboxEmail, "labels">): boolean {
  return e.labels.includes("CATEGORY_UPDATES");
}

/**
 * Whether Gmail filed a message under one of the tabs above. A mailbox's own sorting, read only from a mailbox (never
 * by the hosted intake, which has none), and never inside a thread a reach-out started: a reply there is a reply,
 * whatever Gmail calls it.
 */
export function filedAsBulk(e: Pick<MailboxEmail, "labels">): boolean {
  return e.labels.some((l) => GMAIL_BULK_TABS.has(l));
}

const dec = new TextDecoder();

/** Each try of a read of a mailbox, at either provider (a page of history or delta, a message, a profile). */
export const MAILBOX_READ_MS = 10_000;

/**
 * What a provider's refusal of one message's read means for a reader (gmailReadVerdict, graphReadVerdict), with its
 * status and the provider's own word for why, for the log and the error:
 *   refused  that one message, for good: a reader goes on without it
 *   paced    a pace or a quota of requests: no failure; a reader rests, then reads it again
 *   again    anything else (the grant, a timeout, the provider's bad minute): asked again later
 */
export interface ReadVerdict {
  verdict: "refused" | "paced" | "again";
  status: number;
  reason: string | null;
  /** How long the provider asked a reader to wait (Retry-After), in ms, when it said. */
  retryAfterMs: number | null;
}

/**
 * The verdict on a refused read, given the provider's reason and the words its limits use: a 429, or any answer in the
 * 400s whose reason names a limit (Gmail says one as a 403), is a pace; one in the 400s that is not the grant's (401),
 * the message gone (404) or a timeout (408) is that message refused; anything else is asked again.
 */
export function readVerdictOf(
  r: Pick<ProviderReply, "status" | "retryAfterMs">,
  reason: string | null,
  limit: RegExp,
): ReadVerdict {
  const said = { status: r.status, reason, retryAfterMs: r.retryAfterMs ?? null };
  const in400s = r.status >= 400 && r.status < 500;
  if (r.status === 429 || (in400s && limit.test(reason ?? ""))) return { verdict: "paced", ...said };
  if (in400s && r.status !== 401 && r.status !== 404 && r.status !== 408) return { verdict: "refused", ...said };
  return { verdict: "again", ...said };
}

/**
 * What a look in a mailbox for an email it may have sent found (gmailFindSent, graphFindSent): the email, with the id,
 * thread and Message-ID it went under; or nothing, with the draft it left behind when there is one (Graph's), which
 * proves it never left.
 */
export type FoundSent =
  { found: true; id: string; threadId: string | null; messageId: string | null } | { found: false; draftId?: string };

/** How far before an email's own row a look for it in Sent starts: the provider's clock and ours may differ. */
export const FIND_SENT_SLACK_MS = 2 * MIN_MS;
/** The most of what a mailbox sent that one look reads by its headers: a look is a few reads, never a page of them. */
export const FIND_SENT_LOOKS = 3;

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
  const m = json as {
    id?: unknown;
    threadId?: unknown;
    labelIds?: unknown;
    internalDate?: unknown;
    payload?: GmailPart;
  } | null;
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
    labels: Array.isArray(m.labelIds) ? m.labelIds.filter((l): l is string => typeof l === "string") : [],
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
    labels: [],
  };
}

/**
 * What a bounce says of whom (decision 0056, and RFC 3463 as Gmail and Microsoft 365 write it):
 *
 *   hard          the address is not one to write to (5.1.1, 5.1.10, 5.2.1, 5.4.1 "access denied"): it is suppressed.
 *   blocked       the receiving side refused the sender (5.7.x: spam, reputation, SPF, DKIM, DMARC, policy): the
 *                 mailbox's to answer for, never the address's.
 *   sender_limit  the sender's own provider refused it for its quota (Gmail 5.4.5, Exchange 5.2.0 / 5.1.90 / 5.7.705):
 *                 the mailbox rests, and the address is not judged.
 *   soft          anything temporary or the recipient's passing state (a full mailbox, 4.x.x, a code nobody names).
 */
export type BounceClass = "hard" | "blocked" | "sender_limit" | "soft";

/** What a delivery report says of an email of ours: which, to whom, and whether for good. */
export interface DeliveryReport {
  /** Our row's id, read off the Message-ID we sent it under (mailboxMessageId: <cl.<id>@host>); null when not quoted. */
  rowId: string | null;
  /** The original's Message-ID as the report quotes it, ours or not. */
  originalMessageId: string | null;
  recipient: string | null;
  /** RFC 3463's status ("5.1.1"); null when the report gives none. */
  status: string | null;
  /** Whose fault, and so what follows (BounceClass). */
  bounce: BounceClass;
  /** The address is not one to write to: `bounce` is hard. */
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

/* The words that settle a bounce before its code does: the code alone means different things at different providers. */
const SENDER_LIMIT_WORDS =
  /daily user sending limit|sending limit exceeded|relay (?:sending )?limit exceeded|submission ?quota|SubmissionQuotaExceeded|daily limit for message recipients|recipient rate limit|STOREDRV\.Submission/i;
const BLOCKED_WORDS =
  /spam|unsolicited|reputation|block ?list|blacklist|deny ?list|blocked|banned sender|policy|not authori[sz]ed|authenticat|\bSPF\b|\bDKIM\b|\bDMARC\b|relay(?:ing)? denied|unable to relay/i;
const HARD_WORDS =
  /does ?n[o']t exist|no such (?:user|mailbox|recipient)|user unknown|unknown (?:user|recipient)|recipient not found|address not found|invalid recipient|mailbox unavailable|account (?:is )?(?:disabled|inactive)|bad destination|not a valid|NonExistentDomain|domain (?:name )?(?:not found|does not exist)/i;
/** Gmail's 5.2.1 for an account receiving too fast to take more: passing, unlike its 5.2.1 for a disabled account. */
const RECEIVING_TOO_FAST = /receiving mail at a rate|\brate limit/i;
const MAILBOX_FULL_WORDS =
  /mailbox (?:is )?full|over ?quota|out of storage|QuotaExceededException|insufficient storage/i;

/** The enhanced codes whose class is settled by the code itself, by its provider's own table. */
const HARD_CODES = new Set(["5.1.1", "5.1.2", "5.1.3", "5.1.6", "5.1.10", "5.7.504", "5.7.505"]);
const SENDER_LIMIT_CODES = new Set([
  "5.1.8",
  "5.1.90",
  "5.4.5",
  "5.2.121",
  "5.7.232",
  "5.7.233",
  "5.7.236",
  "5.7.705",
  "5.7.708",
  "5.7.750",
]);

/**
 * Whose fault a bounce is, by the receiving server's own words first and its code second (BounceClass); a code nobody
 * names is soft. `said` is only what the server and the report's own text say, never the quoted original, whose
 * headers carry DKIM, SPF and policy words of their own.
 */
function bounceClassOf(status: string | null, said: string): BounceClass {
  if (!status || !status.startsWith("5")) return "soft";
  if (SENDER_LIMIT_CODES.has(status) || SENDER_LIMIT_WORDS.test(said)) return "sender_limit";
  if (HARD_CODES.has(status)) return "hard";
  if (status.startsWith("5.7.")) return "blocked";
  // A full mailbox (5.2.2, and the 5.2.0 Exchange writes for it) is the recipient's passing state, never a dead one.
  if (MAILBOX_FULL_WORDS.test(said)) return "soft";
  if (status === "5.4.1") return /relay access denied/i.test(said) ? "soft" : "hard";
  if (status === "5.2.1") return RECEIVING_TOO_FAST.test(said) ? "soft" : "hard";
  // A dead address said in words is the address's, whatever else the server adds.
  if (HARD_WORDS.test(said)) return "hard";
  if (BLOCKED_WORDS.test(said)) return "blocked";
  return "soft";
}

/** The most of a report that is read: a report is a page of words, and anything past this is not one. */
const REPORT_WORDS_MAX = 256_000;
/** Where a report's own words end and its copy of the original begins (Exchange's, a forwarded copy, raw headers). */
const ORIGINAL_BEGINS = /^(?:original message headers|-{2,} ?(?:original|forwarded) message|received: )/im;

/** Whom a report says the email failed for: its Final-Recipient, its Original-Recipient, or the header Gmail writes. */
function reportRecipientOf(field: (name: string) => string | null, headers: MailboxEmail["headers"]): string | null {
  const named = field("Final-Recipient") ?? field("Original-Recipient") ?? headers["x-failed-recipients"] ?? "";
  return (
    named
      .replace(/^rfc822;\s*/i, "")
      .trim()
      .toLowerCase() || null
  );
}

/**
 * A delivery report, read (RFC 3464, and Exchange's own words where it writes none): null for an email that is not
 * one. The original is found by the Message-ID the report quotes; ours are minted so that the row is in the id itself.
 * A status is read from the Status field, or from an SMTP reply in the server's words ("550 5.1.1"): never from any
 * dotted number, which a quoted header's address would be. Whose fault it is, is judged on the Diagnostic-Code and the
 * report's own text before its copy of the original.
 */
export function deliveryReportOf(
  e: Pick<MailboxEmail, "headers" | "from" | "subject" | "text" | "reportText">,
): DeliveryReport | null {
  const local = e.from?.address.split("@")[0] ?? "";
  const isReport =
    /multipart\/report/i.test(e.headers["content-type"] ?? "") || /^(mailer-daemon|postmaster)$/i.test(local);
  if (!isReport) return null;
  const words = [e.reportText ?? "", e.text ?? ""].join("\n").slice(0, REPORT_WORDS_MAX);
  const field = (name: string): string | null =>
    new RegExp(`^${name}:\\s*(.+)$`, "im").exec(words)?.[1]?.trim() ?? null;
  // Linear on any text: the local part takes no @, so a run of "a@a@…" cannot make it try every split.
  const quoted = /message-id:\s*(<[^<>\s@]+@[^<>\s]+>)/i.exec(words)?.[1] ?? null;
  const ours = /<cl\.[0-9a-f]{32}@[^<>\s]+>/i.exec(words)?.[0] ?? null;
  const original = messageIdHeader(ours ?? quoted);
  const recipient = reportRecipientOf(field, e.headers);
  const action = (field("Action") ?? "").toLowerCase();
  const diagnostic = (field("Diagnostic-Code") ?? "").replace(/^smtp;\s*/i, "").slice(0, 300) || null;
  const text = (e.text ?? "").slice(0, REPORT_WORDS_MAX);
  const own = text.split(ORIGINAL_BEGINS)[0] ?? "";
  const said = [diagnostic ?? "", own].join("\n");
  const status =
    field("Status")?.match(/[245]\.\d{1,3}\.\d{1,3}/)?.[0] ??
    /\b[45]\d\d[ -]#?([45]\.\d{1,3}\.\d{1,3})\b/.exec(said)?.[1] ??
    null;
  const delayed = action === "delayed" || (!!status && status.startsWith("4") && action !== "failed");
  // With no status, a report that gave up says only that it failed: whose fault is not said, so it is soft.
  const bounce = delayed ? "soft" : bounceClassOf(status, said);
  return {
    rowId: rowIdOfMessageId(original),
    originalMessageId: original,
    recipient,
    status,
    bounce,
    permanent: bounce === "hard",
    delayed,
    diagnostic,
  };
}
