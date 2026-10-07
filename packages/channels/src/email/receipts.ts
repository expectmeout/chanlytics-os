/**
 * What became of an email we sent: the provider's signed receipt, read (emailReceiptFrom), and what it changes for the
 * row and the address (emailReceiptEffect). The request whose tags a receipt names is request.ts.
 */
import { UUID } from "@chanlytics/contracts";
import { addressesOf, messageIdHeader } from "./header-values";

/* ---------------------------------------------------------------- receipts
 *
 * What became of an email we sent, as the provider's signed events say it.
 * Every one of them carries the provider's id, the Message-ID it minted and the
 * tags the request left with, so a receipt names its row by itself, in any
 * order, without a lookup by provider id (buildEmailRequest).
 */

export type EmailReceiptType =
  "sent" | "delivered" | "delivery_delayed" | "bounced" | "complained" | "failed" | "suppressed";
const RECEIPT_TYPES: ReadonlySet<string> = new Set<EmailReceiptType>([
  "sent",
  "delivered",
  "delivery_delayed",
  "bounced",
  "complained",
  "failed",
  "suppressed",
]);

export interface EmailReceipt {
  type: EmailReceiptType;
  /** The provider's id for the email. */
  providerId: string;
  /** The Message-ID it left with, as a header carries it. */
  rfcMessageId: string | null;
  /** Who it was addressed to, lower-cased. */
  to: string[];
  /** The row and the workspace the request was tagged with; null on an email that was not a workspace's (a platform notification). */
  messageId: string | null;
  tenantId: string | null;
  /** The provider's own account of a bounce, a failure or a suppression. Kept on the row as the provider's words, never shown as ours. */
  detail: { kind: string | null; subKind: string | null; message: string | null };
}

/** Tags as the webhook carries them (a map) or as the request sent them (a list of pairs): one reader for both. */
function tagOf(tags: unknown, name: string): string | null {
  const v = Array.isArray(tags)
    ? (tags.find((t) => (t as { name?: unknown } | null)?.name === name) as { value?: unknown } | undefined)?.value
    : tags && typeof tags === "object"
      ? (tags as Record<string, unknown>)[name]
      : undefined;
  return typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null;
}

/** A receipt, or null for any other event or shape. */
export function emailReceiptFrom(payload: unknown): EmailReceipt | null {
  const p = payload as { type?: unknown; data?: Record<string, unknown> } | null;
  if (!p || typeof p.type !== "string" || !p.type.startsWith("email.") || !p.data || typeof p.data !== "object")
    return null;
  const type = p.type.slice("email.".length);
  if (!RECEIPT_TYPES.has(type)) return null;
  const d = p.data;
  if (typeof d.email_id !== "string" || !d.email_id) return null;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const said = (d.bounce ?? d.failed ?? d.suppressed ?? {}) as Record<string, unknown>;
  return {
    type: type as EmailReceiptType,
    providerId: d.email_id,
    rfcMessageId: messageIdHeader(str(d.message_id)),
    to: addressesOf(d.to),
    messageId: tagOf(d.tags, "cl_message"),
    tenantId: tagOf(d.tags, "cl_tenant"),
    detail: { kind: str(said.type) ?? str(said.reason), subKind: str(said.subType), message: str(said.message) },
  };
}

/** Why an address stopped being sent to (00126's CHECK). */
export type EmailSuppressionReason = "hard_bounce" | "complaint" | "provider";

export interface EmailReceiptEffect {
  /** Where the row moves, when it moves. Forward only and terminal kept: messages_guard's rule, not this function's. */
  status: "delivered" | "failed" | null;
  /** What the row keeps about a failure. */
  error: { provider: EmailReceiptType; kind: string | null; sub_kind: string | null; message: string | null } | null;
  /** The address stops being sent to. About the ADDRESS, so it is kept apart from the row's own fate. */
  suppress: EmailSuppressionReason | null;
}

/**
 * What one receipt changes.
 *
 * A bounce fails the row, and stops the address only when the provider calls it
 * permanent: a full mailbox is not a dead one. A complaint arrives after
 * delivery, so the row stays delivered and the address stops. A send the
 * provider suppressed never left, so it failed, and the address is on the
 * provider's list whatever ours says. `sent` and `delivery_delayed` move
 * nothing: the first is the send's own word to say (deliver.ts), the second is
 * interim.
 */
export function emailReceiptEffect(r: EmailReceipt): EmailReceiptEffect {
  const error = { provider: r.type, kind: r.detail.kind, sub_kind: r.detail.subKind, message: r.detail.message };
  switch (r.type) {
    case "delivered":
      return { status: "delivered", error: null, suppress: null };
    case "bounced":
      return { status: "failed", error, suppress: /^permanent$/i.test(r.detail.kind ?? "") ? "hard_bounce" : null };
    case "failed":
      return { status: "failed", error, suppress: null };
    case "suppressed":
      return { status: "failed", error, suppress: "provider" };
    case "complained":
      return { status: null, error: null, suppress: "complaint" };
    default:
      return { status: null, error: null, suppress: null };
  }
}
