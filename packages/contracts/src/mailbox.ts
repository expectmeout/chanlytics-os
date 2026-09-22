/**
 * A workspace's email address: the rules for choosing one, in the owner's
 * words, and what the pages are told about it.
 *
 * The table is the authority (00126's CHECKs and unique indexes): these are
 * the same rules said before the insert, so an owner reads a sentence about
 * what they typed instead of a constraint's name. A rule here that the table
 * does not have would be a lie, and one the table has that is missing here is
 * a worse sentence, never a wrong row; mailbox.db.test.mjs runs both lists
 * against each other.
 */

/** Addresses a mail system or a person expects to mean something else; "r" is the reply route (r+<token>@). 00126's list. */
export const MAILBOX_RESERVED: ReadonlySet<string> = new Set([
  "r",
  "postmaster",
  "abuse",
  "mailer-daemon",
  "noreply",
  "no-reply",
  "admin",
  "administrator",
  "support",
  "security",
  "billing",
  "hello",
  "hi",
]);

export const MAILBOX_LOCAL_PART_MAX = 40;
export const MAILBOX_FROM_NAME_MAX = 80;

/** What an owner typed, as the table would store it: lower-case, no spaces around it. Nothing is guessed or stripped. */
export function normalizeLocalPart(typed: string): string {
  return typed.trim().toLowerCase();
}

/** Why this cannot be a workspace's address, in a sentence; null when it can (whether it is FREE is the table's to say). */
export function whyNotALocalPart(typed: string): string | null {
  const s = normalizeLocalPart(typed);
  if (!s) return "Write the part before the @, like your business's name.";
  if (s.length > MAILBOX_LOCAL_PART_MAX) return `Keep it to ${MAILBOX_LOCAL_PART_MAX} characters or fewer.`;
  if (!/^[a-z0-9-]+$/.test(s)) return "Use letters, numbers and hyphens only: no spaces, dots or other marks.";
  if (s.startsWith("-") || s.endsWith("-")) return "Start and end with a letter or a number.";
  if (MAILBOX_RESERVED.has(s)) return `“${s}” is kept for the mail system. Choose something that names your business.`;
  return null;
}

/** Why this cannot be the name customers see beside the address; null when it can. */
export function whyNotAFromName(typed: string): string | null {
  const s = typed.trim();
  if (!s) return "Write the name customers should see, usually your business's.";
  if (s.length > MAILBOX_FROM_NAME_MAX) return `Keep it to ${MAILBOX_FROM_NAME_MAX} characters or fewer.`;
  return null;
}

/**
 * An address to offer, from the business's name: its letters and numbers,
 * words joined by hyphens, cut to length. Null when nothing usable is left or
 * what is left is reserved; the owner then types their own.
 */
export function suggestLocalPart(businessName: string | null | undefined): string | null {
  const s = (businessName ?? "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAILBOX_LOCAL_PART_MAX)
    .replace(/-+$/g, "");
  return s && whyNotALocalPart(s) === null ? s : null;
}

/** A workspace's mailbox, as the pages are told about it. The reply route's token is not among them: no page needs it. */
export interface MailboxDto {
  id: string;
  /** bestmovers@mail.chanlytics.com: what customers write to and replies leave as. */
  address: string;
  from_name: string;
  last_received_at: string | null;
  /**
   * What went wrong with this mailbox last, in a sentence written for the
   * owner — never a provider's error text or a job's reason, which belong
   * where a person at Chanlytics reads them. Null when nothing is wrong: the
   * next email taken in clears it (db stampMailboxReceived), so a mailbox
   * whose mail is flowing never carries an old one.
   */
  last_error: string | null;
}

/** Email, as Setup and Connections are told: whether this deployment has it at all, on which domain, and the workspace's mailbox when it has one. */
export interface EmailSetupDto {
  ready: boolean;
  domain: string | null;
  mailbox: MailboxDto | null;
}

/** What Setup and Connections both say while the receptionist does not answer email: one sentence, so the two pages cannot drift apart. */
export const EMAIL_NOT_ANSWERED_SENTENCE =
  "The receptionist does not answer email yet: every email waits for you in the Inbox.";
/** The one thing the product cannot see, said where the owner sets email up (the plan's §9). */
export const EMAIL_ELSEWHERE_SENTENCE = "Replies you send from another mail app do not show here.";
