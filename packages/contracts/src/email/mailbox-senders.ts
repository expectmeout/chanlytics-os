/**
 * What a connected mailbox leaves where it is, and what a workspace says of a sender of its mail (00483; decision 0073,
 * R13 and R19). The two closed sets are the database's (mailbox_left.why, mailbox_senders.verdict).
 */
import type { SchemaSet } from "../shared/schema-sets";
import { isFreeMail } from "./free-mail";

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

/** One sender the mailbox left mail from, as the owner's list says it (00483 mailbox_left). */
export interface MailboxLeftDto {
  address: string;
  name: string | null;
  why: MailboxLeftWhy;
  count: number;
  first_at: string;
  last_at: string;
}

/** What the workspace said of a sender: an address, or a domain. */
export interface MailboxSaidDto {
  sender: string;
  verdict: MailboxSenderVerdict;
  set_at: string;
}

/** The list under the mailbox: who was left, newest first, a person said of since left out; and what was said. */
export interface MailboxSendersDto {
  left: MailboxLeftDto[];
  said: MailboxSaidDto[];
}

/** Why a sender's mail was left, as the owner reads it. */
export const MAILBOX_LEFT_WHY_WORDS: Readonly<Record<MailboxLeftWhy, string>> = {
  automated: "Marked as automated",
  auto_reply: "An automatic reply",
  report: "A delivery report",
  booking_notice: "A booking tool's notice",
  forwarding_confirmation: "Gmail's forwarding check",
  gmail_tab: "Gmail: Promotions, Social or Forums",
  updates: "Gmail: Updates, from someone new",
  said: "You said it's not a person",
};

/** The list's words, and "Not a person" on a person's page. */
export const MAILBOX_SENDERS_WORDS = {
  title: "Left in your mailbox",
  /** Beside the title: the senders left in the last day, as a mailbox's row counts who wrote. */
  today: (n: number) => (n === 0 ? "none today" : `${n} sender${n === 1 ? "" : "s"} today`),
  lead: "Mail that isn't from a person stays in your mailbox, out of Chanlytics. If anyone here is a person, bring them in.",
  empty: "Nothing has been left yet.",
  emails: (n: number) => `${n} email${n === 1 ? "" : "s"}`,
  bringIn: "It's a person",
  broughtIn: (who: string) => `${who} is a person: their mail comes in from now on, and their last six months with it.`,
  saidTitle: "Said not to be people",
  undo: "Undo",
  undone: (sender: string) => `${sender}: its mail is sorted as it comes again.`,
  more: (n: number) => `and ${n} more`,
  /** Delete person's sheet, for someone with an email address: they are a sender of automated mail. */
  notAPerson: "Not a person: their mail stays in your mailbox from now on",
  wholeDomain: (domain: string) => `Everything from ${domain}, too`,
  done: (who: string) => `${who}: not a person. Deleted, and their mail stays in your mailbox.`,
  show: "Show who",
  failed: "Could not change this.",
} as const;

/** The domain an address is at, lower-cased. */
const domainOf = (address: string): string =>
  address
    .slice(address.lastIndexOf("@") + 1)
    .trim()
    .toLowerCase();

/**
 * The domain a workspace may say is automated as a whole beside an address, or null: never a free-mail provider's
 * (gmail.com is millions of people) and never one of the business's own mailboxes' (its own staff write from it).
 */
export function senderDomainOffered(address: string, ownHosts: readonly string[]): string | null {
  const domain = domainOf(address);
  if (!domain.includes(".") || isFreeMail(domain)) return null;
  return ownHosts.some((h) => h.trim().toLowerCase() === domain) ? null : domain;
}

/** Why a workspace may not say this of a sender, or null when it may (senderDomainOffered's rule for a whole domain). */
export function senderSortRefusal(
  sender: string,
  verdict: MailboxSenderVerdict | null,
  ownHosts: readonly string[],
): string | null {
  const s = sender.trim().toLowerCase();
  if (verdict !== "automated" || s.includes("@")) return null;
  return senderDomainOffered(`x@${s}`, ownHosts) ? null : `${s} is many people's: mark one address instead.`;
}
