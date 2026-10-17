export function normalizePhone(raw) {
  if (raw == null) return null;
  const typed = String(raw).trim();
  const digits = typed.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (!typed.startsWith("+") && digits.length === 10) return `+1${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}
export function samePhone(a, b) {
  const x = normalizePhone(a);
  const y = normalizePhone(b);
  return !!x && !!y && x === y;
}
export function shortCode(raw) {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  return digits.length >= 3 && digits.length <= 6;
}
export function phoneDialable(raw) {
  const e164 = normalizePhone(raw);
  if (!e164) return false;
  if (!e164.startsWith("+1")) return true;
  const d = e164.slice(2);
  if (d.length !== 10) return false;
  const [area, exchange] = [d.slice(0, 3), d.slice(3, 6)];
  const n11 = (x) => x[1] === "1" && x[2] === "1";
  return /^[2-9]/.test(area) && /^[2-9]/.test(exchange) && !n11(area) && !n11(exchange);
}
export function whyNotAPhone(raw) {
  if (normalizePhone(raw)) return null;
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return "A phone number is needed to add a person.";
  if (shortCode(digits)) {
    return "That is a short code, not a phone number \u2014 nobody can be reached on one.";
  }
  if (digits.length === 7) return "That looks like a local number. Add the area code.";
  return "That is not a phone number anyone can be reached on.";
}
export function whyNotAHandoff(raw, ownLine, keptLine) {
  const typed = String(raw ?? "").trim();
  if (!typed) return null;
  const norm = "+" + typed.replace(/[^0-9]/g, "");
  if (!(/^\+/.test(typed) && /^\+[1-9][0-9]{6,14}$/.test(norm))) {
    return "The transfer number needs the country code, like +1 212 555 0143.";
  }
  if (samePhone(norm, ownLine)) {
    return "That is the receptionist's own line \u2014 it would ring itself. Use a line a person answers.";
  }
  if (samePhone(norm, keptLine)) return HANDOFF_FORWARDS_BACK;
  return null;
}
export const HANDOFF_FORWARDS_BACK = "That number sends the calls nobody picks up to your receptionist, so a caller put through to it would come straight back. Use a mobile or another line a person answers.";
export const FORWARD_IS_HANDOFF = "Your receptionist puts callers through to this number. Change the transfer number in Settings \u203A Details first \u2014 once this number forwards to the receptionist, a caller put through to it would come straight back.";
export function whyNotForward(number, handoff) {
  return samePhone(number, handoff) ? FORWARD_IS_HANDOFF : null;
}
export function handoffE164(raw) {
  const typed = String(raw ?? "").trim();
  if (!typed) return null;
  return "+" + typed.replace(/[^0-9]/g, "");
}
export function phoneTail(raw) {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits ? digits.slice(-4) : null;
}
export function formatPhoneDisplay(e164) {
  if (!e164) return null;
  const digits = String(e164).replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length < 7) return `+${digits}`;
  return `+${digits.replace(/(\d{1,3})(?=(\d{3})+$)/g, "$1 ").trim()}`;
}
