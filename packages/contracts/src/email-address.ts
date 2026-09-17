/**
 * THE email-address normalizer, beside phone.ts. One implementation, imported
 * by the person's page, the door that stores an address, and (when the email
 * channel receives) the intake that finds a person by the address they wrote
 * from.
 *
 * Returns the address trimmed and lower-cased, or null when the input cannot
 * be one. Lower-casing the local part is this product's policy, not a claim
 * about SMTP: every host a salon or a moving company's customers use ignores
 * case, and two rows for `Ana@x.com` and `ana@x.com` would be two people who
 * are one. Dots and plus tags are KEPT: `a.b+c@x.com` and `ab@x.com` are
 * different addresses, and the product never guesses that they are not.
 *
 * It takes a bare address. A display-name form (`Ana <ana@x.com>`) is a
 * header, and a header is parsed by the intake before this is called; here it
 * is refused, so a pasted header never becomes an address with a name in it.
 */

const MAX_ADDRESS = 254;
const MAX_LOCAL = 64;
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const LOCAL = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
const SHAPE = new RegExp(`^(${LOCAL})@(${LABEL}(?:\\.${LABEL})+)$`);

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s || s.length > MAX_ADDRESS) return null;
  const m = SHAPE.exec(s);
  if (!m || m[1].length > MAX_LOCAL) return null;
  return s;
}

/**
 * Which kind of not-an-address it was given, in the product's words; null for
 * an address. The door refuses the same things (00125), and says less.
 */
export function whyNotAnEmail(raw: string | null | undefined): string | null {
  if (normalizeEmail(raw)) return null;
  const s = String(raw ?? "").trim();
  if (!s) return "An email address is needed.";
  if (/[<>]/.test(s) || /\s/.test(s)) return "Only the address itself, like name@example.com, with no name or spaces around it.";
  const at = s.split("@").length - 1;
  if (at === 0) return "That is missing the @.";
  if (at > 1) return "An address has one @.";
  if (!/@[^@]*\./.test(s)) return "That needs a full domain after the @, like name@example.com.";
  return "That is not an email address anyone can be reached at.";
}
