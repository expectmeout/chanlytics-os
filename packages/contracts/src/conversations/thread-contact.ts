/**
 * Who a thread is with, as the pages name them: the display name, the line under it, the initials on the
 * avatar, and whether a name is only an identifier; and whether mail to their address has stopped. The thread and
 * call view models beside it read it here.
 */
import { clockDate } from "../shared/clock";
import { formatPhoneDisplay } from "../shared/phone";
import { personName } from "../people/person-name";
import type { ConversationDto } from "./thread-dto";

/** The display name for a contact, without building a whole thread viewmodel
 *  to read one field (Today was doing exactly that per open escalation). */
export function contactName(dto: ConversationDto): string {
  return personName(dto.contact);
}

/**
 * A name that is an identifier, a number or an address, has no first name to
 * shorten to: "+1" as a speaker label is nobody, and neither is "ana@".
 */
export function isIdentifierName(name: string): boolean {
  return /^[+\d(]/.test(name) || name.includes("@");
}

/** A name shortened for a line that says it again: the first name, or an identifier whole. The call row, Live's bar and Conversations' row read it. */
export function shortName(name: string): string {
  return isIdentifierName(name) ? name : name.split(" ")[0] || name;
}

/** The "WhatsApp · +1 …" subtitle line, same source as the thread viewmodel; "Phone · …" for a caller with no thread. */
export function contactMeta(
  dto: ConversationDto,
  channel: "WhatsApp" | "Phone" | "Text" | "Email" = "WhatsApp",
): string {
  // The identifier under the name: the number, else the address. When it IS
  // the name, the line says so instead of repeating it.
  const id = formatPhoneDisplay(dto.contact.phone_e164) ?? dto.contact.email ?? null;
  return contactName(dto) === id ? `${channel} · no name saved` : `${channel} · ${id ?? "no phone"}`;
}

export function initialsOf(name: string): string {
  const digits = name.replace(/[^\d]/g, "");
  // phone-like display: last two digits distinguish contacts (never a "+1" avatar)
  if (digits.length >= 7 && /^[+\d\s()-]+$/.test(name)) return digits.slice(-2);
  const parts = name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim()
    .split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  const p = parts[0] || "?";
  return p.slice(0, 2).toUpperCase();
}

/**
 * A person's face, decided once (D1-face-number, D1-face-email): what it stands for, by THE test of a name that is only an
 * identifier (isIdentifierName), so no page holds its own copy of it -- a person with a name (`named`, drawn as their
 * initials) or one known only by what reaches them, a number or an address (drawn as one glyph, the same on every page) --
 * the initials a named person wears (the view model's own where it has them, else initialsOf), and the glyph (an Icon's
 * name) that stands for a number or an address. The People table, the phone's card, the Pipeline's board, peek and
 * picker, the Inbox, Conversations, Live, Today and the person's own page draw this through the kit's Face; before, a
 * number was a phone glyph on two pages and two digits on seven, and an address a mail glyph on one view and a phone
 * glyph on the next.
 */
export function personFaceOf(
  name: string,
  initials?: string,
): { kind: "named" | "number" | "address"; initials: string; glyph: "phone" | "mail" | null } {
  const kind = !isIdentifierName(name) ? "named" : name.includes("@") ? "address" : "number";
  return {
    kind,
    initials: initials ?? initialsOf(name),
    glyph: kind === "number" ? "phone" : kind === "address" ? "mail" : null,
  };
}

/** The two columns that say mail to a person's address has stopped (`contacts.email_suppressed_at` and `email_suppressed_reason`, 00126), as a contact row or the thread's contact carries them. */
export interface EmailStopBearing {
  email_suppressed_at?: string | null;
  email_suppressed_reason?: string | null;
}

/**
 * Whether mail to this person's address has stopped: a permanent bounce, a complaint, or the provider's own suppression,
 * written when a receipt arrives. THE predicate: the reply route asks it before it queues an email (core
 * conversations/reply.ts), the send door asks it at the wire (core deliver.ts), and the thread's reply box asks it before
 * it offers an email to write (emailStoppedWords). The route refused after the owner had written the reply.
 */
export function isEmailStopped(c: Pick<EmailStopBearing, "email_suppressed_at">): boolean {
  return !!c.email_suppressed_at;
}

/**
 * What the reply box says where the reply would go by email and the address has stopped: why, and what is left. Null
 * while mail can reach them. `tz` is the workspace's, which says the day ("Sep 3"). The reason is the column's closed
 * set: a bounce, a complaint, or the provider's own word, which is also what any reason this does not know reads as.
 */
export function emailStoppedWords(c: EmailStopBearing, tz: string, now: Date): string | null {
  if (!isEmailStopped(c)) return null;
  const at = Date.parse(c.email_suppressed_at as string);
  const on = Number.isNaN(at) ? "" : ` on ${clockDate(at, tz, now.getTime())}`;
  const why =
    c.email_suppressed_reason === "hard_bounce"
      ? `Their address bounced${on}.`
      : c.email_suppressed_reason === "complaint"
        ? `They marked a message as spam${on}.`
        : `The mail provider stopped sending to their address${on}.`;
  return `${why} Email can't reach them: correct the address on their page, or reach them another way.`;
}
