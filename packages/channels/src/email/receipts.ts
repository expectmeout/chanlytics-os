/**
 * What became of an email we sent: the provider's signed receipt, read (emailReceiptFrom), and what it changes for the
 * row and the address (emailReceiptEffect). The request whose tags a receipt names is request.ts.
 */
import { UUID, recordOrNull, isOneOf, recordOrEmpty, valueAt } from "@chanlytics/contracts";
import { addressesOf, messageIdHeader } from "./header-values";
import type { TenantId } from "@chanlytics/contracts";

/* ---------------------------------------------------------------- receipts
 *
 * What became of an email we sent, as the provider's signed events say it.
 * Every one of them carries the provider's id, the Message-ID it minted and the
 * tags the request left with, so a receipt names its row by itself, in any
 * order, without a lookup by provider id (buildEmailRequest).
 */

export type EmailReceiptType =
  "sent" | "delivered" | "delivery_delayed" | "bounced" | "complained" | "failed" | "suppressed";
const RECEIPT_TYPES = [
  "sent",
  "delivered",
  "delivery_delayed",
  "bounced",
  "complained",
  "failed",
  "suppressed",
] as const satisfies readonly EmailReceiptType[];

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
  tenantId: TenantId | null;
  /** The provider's own account of a bounce, a failure or a suppression. Kept on the row as the provider's words, never shown as ours. */
  detail: { kind: string | null; subKind: string | null; message: string | null };
}

/** Tags as the webhook carries them (a map) or as the request sent them (a list of pairs): one reader for both. */
function tagOf(tags: unknown, name: string): string | null {
  const v = Array.isArray(tags)
    ? valueAt(
        tags.find((t) => valueAt(t, "name") === name),
        "value",
      )
    : valueAt(tags, name);
  return typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null;
}

/** A receipt, or null for any other event or shape. */
export function emailReceiptFrom(payload: unknown): EmailReceipt | null {
  const item = recordOrNull(payload);
  const data = recordOrNull(item?.data);
  if (!item || typeof item.type !== "string" || !item.type.startsWith("email.") || !data) return null;
  const type = item.type.slice("email.".length);
  if (!isOneOf(RECEIPT_TYPES, type)) return null;
  if (typeof data.email_id !== "string" || !data.email_id) return null;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const sentence = recordOrEmpty(data.bounce ?? data.failed ?? data.suppressed);
  return {
    type,
    providerId: data.email_id,
    rfcMessageId: messageIdHeader(str(data.message_id)),
    to: addressesOf(data.to),
    messageId: tagOf(data.tags, "cl_message"),
    tenantId: tagOf(data.tags, "cl_tenant"),
    detail: {
      kind: str(sentence.type) ?? str(sentence.reason),
      subKind: str(sentence.subType),
      message: str(sentence.message),
    },
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
export function emailReceiptEffect(emailReceipt: EmailReceipt): EmailReceiptEffect {
  const error = {
    provider: emailReceipt.type,
    kind: emailReceipt.detail.kind,
    sub_kind: emailReceipt.detail.subKind,
    message: emailReceipt.detail.message,
  };
  switch (emailReceipt.type) {
    case "delivered":
      return { status: "delivered", error: null, suppress: null };
    case "bounced":
      return {
        status: "failed",
        error,
        suppress: /^permanent$/i.test(emailReceipt.detail.kind ?? "") ? "hard_bounce" : null,
      };
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
