/**
 * What a log line may say about a person: that they were there, never who they are or what they wrote.
 *
 * The logger runs every field through here, so a door that logs `{ to }` or `{ body }` writes a tail and a length,
 * whatever its author remembered. Redaction is by the field's key, at any depth:
 *
 *   a number or an address   phone, to, from, email, e164, and keys ending _phone, _email, _e164:
 *                            an address keeps its domain (…@example.com), a number its last four digits (…0142),
 *                            the way `*_tail` fields already read; a short word under one of them (`from: "sms"`)
 *                            names a channel, not a person, and stays
 *   a person's words         body, text, and keys ending _body, _text: their length only
 *
 * Before this the only guard was a test that read the message path's source for those words on a log line; the
 * rest of the edge and the dashboard's server could log an owner's address or a provider's answer, and did.
 */

/** Keys whose value may be a number or an address. */
const CONTACT = new Set(["phone", "to", "from", "email", "e164"]);
const CONTACT_SUFFIX = /_(phone|email|e164)$/;
/** Keys whose value is words a person wrote. */
const WORDS = new Set(["body", "text"]);
const WORDS_SUFFIX = /_(body|text)$/;

/** How deep a field is followed before it is summarised: a log line is not a dump. */
const MAX_DEPTH = 6;
/** A number: seven digits or more, however written. */
const MANY_DIGITS = /\d(?:\D*\d){6,}/;
const EMAIL = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;
/** A plain number that can only be a phone number, not a count or a version. */
const NUMBER_FLOOR = 1_000_000;

const isContactKey = (k: string): boolean => CONTACT.has(k) || CONTACT_SUFFIX.test(k);
const isWordsKey = (k: string): boolean => WORDS.has(k) || WORDS_SUFFIX.test(k);

/** A number's last four digits, or an address's domain; anything else under a contact key as it is. */
function contact(v: unknown): unknown {
  if (typeof v === "string") {
    const at = EMAIL.exec(v.trim());
    if (at) return `…@${at[1]}`;
    if (MANY_DIGITS.test(v)) return `…${v.replace(/\D/g, "").slice(-4)}`;
    return v;
  }
  if (typeof v === "number" && Math.abs(v) >= NUMBER_FLOOR) return `…${String(Math.trunc(Math.abs(v))).slice(-4)}`;
  if (typeof v === "bigint") return `…${v.toString().replace(/\D/g, "").slice(-4)}`;
  if (Array.isArray(v)) return v.map(contact);
  if (v !== null && typeof v === "object") return "[redacted]";
  return v;
}

/** Words as their length; anything but a string or nothing as a mark. */
function words(v: unknown): unknown {
  if (typeof v === "string") return `[${v.length} chars]`;
  if (v === null || typeof v === "boolean" || typeof v === "number") return v;
  return "[redacted]";
}

/** An error as a log field: its name and message, the edge's shape since the first logger. */
export function errText(e: Error): string {
  return `${e.name}: ${e.message}`;
}

/**
 * A value made safe to write under `key`, and small enough: nested fields by their own keys, a cycle or a field past
 * MAX_DEPTH said as `[…]`. `above` holds the objects on the way down, so the same object twice side by side is
 * written twice, and only a loop is cut.
 */
export function redact(key: string, value: unknown, depth = 0, above: Set<object> = new Set()): unknown {
  if (isWordsKey(key)) return words(value);
  if (isContactKey(key)) return contact(value);
  if (value instanceof Error) return errText(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value !== "object") return value;
  if (above.has(value) || depth >= MAX_DEPTH) return "[…]";
  above.add(value);
  let out: unknown;
  if (Array.isArray(value)) out = value.map((x) => redact("", x, depth + 1, above));
  else {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) fields[k] = redact(k, v, depth + 1, above);
    out = fields;
  }
  above.delete(value);
  return out;
}
