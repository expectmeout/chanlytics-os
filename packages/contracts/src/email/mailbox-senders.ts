/**
 * What a connected mailbox leaves where it is, and what a workspace says of a sender of its mail (00483; decision 0073,
 * R13 and R19). The two closed sets are the database's (mailbox_left.why, mailbox_senders.verdict).
 */
import type { SchemaSet } from "../shared/schema-sets";

/**
 * Why a connected mailbox left an email where it was:
 *
 *   automated, auto_reply, report, booking_notice, forwarding_confirmation
 *                what the email claimed to be (channels classifyReceived), anything but a person's
 *   gmail_tab    Gmail filed it under Promotions, Social or Forums (channels filedAsBulk)
 *   updates      Gmail filed it under Updates, it answers nothing, and the workspace does not know the sender: a notice
 *   said         the workspace said its sender is automated
 */
export type MailboxLeftWhy = SchemaSet<"mailbox_left.why">;

/** What a workspace said of a sender: its mail stays in the mailbox (automated), or comes in whatever it looks like. */
export type MailboxSenderVerdict = SchemaSet<"mailbox_senders.verdict">;

/**
 * What the workspace said of the sender of an address, from what it said of addresses and domains: the address first,
 * then its domain and each domain above it, so one said of example.com holds for news.example.com. A top-level domain
 * alone is never one. Null when it said nothing.
 */
export function senderVerdictOf(
  said: ReadonlyMap<string, MailboxSenderVerdict>,
  address: string,
): MailboxSenderVerdict | null {
  const a = address.trim().toLowerCase();
  const exact = said.get(a);
  if (exact) return exact;
  const labels = a.slice(a.lastIndexOf("@") + 1).split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const v = said.get(labels.slice(i).join("."));
    if (v) return v;
  }
  return null;
}
