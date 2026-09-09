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
/**
 * Three to six digits: a short code. A sender, never a person.
 *
 * Nothing can be sent back to one from a ten-digit number, so a carrier notice
 * or a two-factor code arriving on a business's line is a message to read and
 * never a conversation to have. Seven digits is deliberately NOT one: that is
 * a local number missing its area code.
 */
export function shortCode(raw: string | null | undefined): boolean {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  return digits.length >= 3 && digits.length <= 6;
}

export function whyNotAPhone(raw: string | null | undefined): string | null {
  if (normalizePhone(raw)) return null;
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return "A phone number is needed to add a person.";
  if (shortCode(digits)) {
    return "That is a short code, not a phone number — nobody can be reached on one.";
  }
  if (digits.length === 7) return "That looks like a local number. Add the area code.";
  return "That is not a phone number anyone can be reached on.";
}


/**
 * The transfer number, checked the way a dialler would need it.
 *
 * Stricter than whyNotAPhone on purpose: a handoff is DIALLED by the phone
 * receptionist mid-call, so a bare ten-digit number is a guess about the
 * country and a transfer tool dialling a guess rings a stranger. The country
 * code is required, in writing.
 *
 * The second refusal is the one an owner would never think of: the
 * receptionist's OWN line. A caller who insists on a person would be
 * transferred to the number they are already on, which answers as the
 * receptionist again.
 *
 * Returns the owner's sentence, or null when the number is usable. Lives here
 * rather than in the form because the number is now edited where it is read.
 */
export function whyNotAHandoff(raw: string | null | undefined, ownLine?: string | null): string | null {
  const typed = String(raw ?? "").trim();
  if (!typed) return null; // Empty is a choice: take a message instead.
  const norm = "+" + typed.replace(/[^0-9]/g, "");
  if (!(/^\+/.test(typed) && /^\+[1-9][0-9]{6,14}$/.test(norm))) {
    return "The transfer number needs the country code, like +1 646 932 5775.";
  }
  if (ownLine && normalizePhone(norm) && normalizePhone(norm) === normalizePhone(ownLine)) {
    return "That is the receptionist's own line — it would ring itself. Use a line a person answers.";
  }
  return null;
}

/** What a typed handoff is STORED as: E.164, or nothing at all. */
export function handoffE164(raw: string | null | undefined): string | null {
  const typed = String(raw ?? "").trim();
  if (!typed) return null;
  return "+" + typed.replace(/[^0-9]/g, "");
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
