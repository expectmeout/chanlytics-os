/**
 * THE phone normalizer (Blueprint §3 conventions). One implementation, imported
 * by edge ingestion, backfill scripts, and the dashboard alike.
 *
 * Returns E.164 with leading "+", or null when the input can't be a phone number.
 * Bare 10-digit numbers are treated as US national (the pilot's market);
 * provider ids (e.g. Meta wa_id) are stored verbatim in contact_identities —
 * this normalizer is for the display/dial identity only.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/**
 * Why this is not a number anyone can be reached on — in the owner's words —
 * or null when it is one.
 *
 * "A phone number is needed to add a person" was said to every refusal alike,
 * including to an owner looking at the number on their own screen. A short
 * code is the case that matters: the product STORES them, because a carrier
 * or a two-factor message arriving on the line is written to contacts as
 * `+12345` by the inbound path, and it can never be a person — nothing can
 * be sent back to one from a ten-digit number.
 *
 * Seven digits is told apart from a short code on purpose: that is a local
 * number missing its area code, and calling it a short code would be a
 * confident wrong answer where an accurate one costs nothing.
 */
export function whyNotAPhone(raw: string | null | undefined): string | null {
  if (normalizePhone(raw)) return null;
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return "A phone number is needed to add a person.";
  if (digits.length >= 3 && digits.length <= 6) {
    return "That is a short code, not a phone number — nobody can be reached on one.";
  }
  if (digits.length === 7) return "That looks like a local number. Add the area code.";
  return "That is not a phone number anyone can be reached on.";
}

/** Human-readable phone for display: NANP gets +1 (XXX) XXX-XXXX; others get spaced groups. */
export function formatPhoneDisplay(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const digits = String(e164).replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length < 7) return `+${digits}`;
  return `+${digits.replace(/(\d{1,3})(?=(\d{3})+$)/g, "$1 ").trim()}`;
}
