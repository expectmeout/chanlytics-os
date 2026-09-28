/**
 * Who a thread is with, as the pages name them: the display name, the line under it, the initials on the
 * avatar, and whether a name is only an identifier. The thread and call view models beside it read it here.
 */
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
