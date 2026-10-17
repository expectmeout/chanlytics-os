import { clockDate } from "../shared/clock.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { personName } from "../people/person-name.js";
export function contactName(dto) {
  return personName(dto.contact);
}
export function isIdentifierName(name) {
  return /^[+\d(]/.test(name) || name.includes("@");
}
export function shortName(name) {
  return isIdentifierName(name) ? name : name.split(" ")[0] || name;
}
export function contactMeta(dto, channel = "WhatsApp") {
  const id = formatPhoneDisplay(dto.contact.phone_e164) ?? dto.contact.email ?? null;
  return contactName(dto) === id ? `${channel} \xB7 no name saved` : `${channel} \xB7 ${id ?? "no phone"}`;
}
export function initialsOf(name) {
  const digits = name.replace(/[^\d]/g, "");
  if (digits.length >= 7 && /^[+\d\s()-]+$/.test(name)) return digits.slice(-2);
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  const p = parts[0] || "?";
  return p.slice(0, 2).toUpperCase();
}
export function personFaceOf(name, initials) {
  const kind = !isIdentifierName(name) ? "named" : name.includes("@") ? "address" : "number";
  return {
    kind,
    initials: initials ?? initialsOf(name),
    glyph: kind === "number" ? "phone" : kind === "address" ? "mail" : null
  };
}
export function isEmailStopped(c) {
  return !!c.email_suppressed_at;
}
export function emailStoppedWords(c, tz, now) {
  if (!isEmailStopped(c)) return null;
  const at = Date.parse(c.email_suppressed_at);
  const on = Number.isNaN(at) ? "" : ` on ${clockDate(at, tz, now.getTime())}`;
  const why = c.email_suppressed_reason === "hard_bounce" ? `Their address bounced${on}.` : c.email_suppressed_reason === "complaint" ? `They marked a message as spam${on}.` : `The mail provider stopped sending to their address${on}.`;
  return `${why} Email can't reach them: correct the address on their page, or reach them another way.`;
}
