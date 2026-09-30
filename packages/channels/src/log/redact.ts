/**
 * What a log line may say about a person or a credential: that they were there, never who they are, what they wrote or
 * what opens a door.
 *
 * The logger runs every field through here, so a door that logs `{ to }` or `{ body }` writes a tail and a length,
 * whatever its author remembered. Three layers, each by what the value is called or what it looks like, at any depth:
 *
 *   by key, a person's contact   phone, to, from, email, e164, and keys ending _phone, _email, _e164: an address keeps
 *                                its domain (…@example.com), a number its last four digits (…0142), the way `*_tail`
 *                                fields already read; a short word under one of them (`from: "sms"`) names a channel,
 *                                not a person, and stays, as does an id or a moment (a UUID, a date: `from` and `to`
 *                                also name workspaces and days)
 *   by key, a person's words     body, text, and keys ending _body, _text: their length only
 *   by key, a credential         token, secret, password, authorization, api_key, cookie, signature, private_key and
 *                                keys ending in one of them: the value is gone. A model's key (ANTHROPIC_API_KEY, the
 *                                second model's TYPESAFE_API_KEY) is one of these by its name
 *   by shape, in any string      what a person's contact or a credential looks like wherever a message quotes it (a
 *                                provider's error text, an exception's message, a URL with its key in the query): an
 *                                address keeps its domain, an international number its last four digits, a bearer
 *                                token, a model or provider key, a JWT, an access token and a `?key=` value are
 *                                replaced. Every other string is left as it is: ids, times and counts are not touched
 *
 * Before this the only guard was a test that read the message path's source for those words on a log line; the rest of
 * the edge and the dashboard's server could log an owner's address or a provider's answer, and did. It is one module
 * because a line is redacted where it is written: no caller can forget.
 */

/** Keys whose value may be a number or an address. */
const CONTACT = new Set(["phone", "to", "from", "email", "e164"]);
const CONTACT_SUFFIX = /_(phone|email|e164)$/;
/** Keys whose value is words a person wrote. */
const WORDS_KEYS = new Set(["body", "text"]);
const WORDS_SUFFIX = /_(body|text)$/;
/** Keys whose value opens a door: named for what it is, in any case, with or without a prefix. */
const SECRET_KEY =
  /(?:^|[_-])(?:token|secret|password|passwd|authorization|api[_-]?key|cookie|credentials?|private[_-]?key|signature)$/i;

/** How deep a field is followed before it is summarised: a log line is not a dump. */
const MAX_DEPTH = 6;
/** A number: seven digits or more, however written. */
const MANY_DIGITS = /\d(?:\D*\d){6,}/;
const EMAIL = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;
/** A plain number that can only be a phone number, not a count or a version. */
const NUMBER_FLOOR = 1_000_000;

/** What a credential looks like inside a string, each as the provider issues it (a made-up one is caught the same). */
const SECRET_SHAPES: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g, // Anthropic, and any model gateway that keys its account the same way
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/g, // Stripe
  /\bwhsec_[A-Za-z0-9]{8,}/g, // Stripe's webhook secret
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // a JWT: a session, a Supabase key
  /\bEAA[A-Za-z0-9]{20,}/g, // Meta's access tokens
  /\bre_[A-Za-z0-9_]{20,}/g, // Resend
  /\bya29\.[A-Za-z0-9_-]{20,}/g, // Google's access tokens
  /\bAIza[A-Za-z0-9_-]{30,}/g, // Google's API keys
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bsb_secret_[A-Za-z0-9_-]{10,}/g, // Supabase
];
/** A credential written `name=value`, in a URL's query or a line of text: the name stays, the value goes. */
const NAMED_SECRET =
  /(?<![\w-])((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|signature|key)=)[^&\s"';,]+/gi;
/** An address anywhere in a string. */
const EMAIL_IN_TEXT = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;
/** A string longer than this is cut before it is scrubbed: a log line is not a dump, and the scan is linear in it. */
const MAX_STRING = 10_000;
/** What an id or a moment looks like: left alone under a contact key (`from: holder.tenant_id`), whatever digits it holds. */
const ID_OR_MOMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)$/i;
/** An international number written with its plus (and however its digits are spaced), or the US grouping. */
const PLUS_NUMBER = /\+\d[\d ().-]{6,}\d/g;
const US_NUMBER = /(?<![\w-])\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?![\w-])/g;

const isContactKey = (k: string): boolean => CONTACT.has(k) || CONTACT_SUFFIX.test(k);
const isWordsKey = (k: string): boolean => WORDS_KEYS.has(k) || WORDS_SUFFIX.test(k);
const isSecretKey = (k: string): boolean => SECRET_KEY.test(k);

const tailOf = (digits: string): string => `…${digits.replace(/\D/g, "").slice(-4)}`;

/** A number's last four digits, or an address's domain; anything else under a contact key as it is. */
function contact(v: unknown): unknown {
  if (typeof v === "string") {
    const at = EMAIL.exec(v.trim());
    if (at) return `…@${at[1]}`;
    if (ID_OR_MOMENT.test(v.trim())) return v;
    if (MANY_DIGITS.test(v)) return tailOf(v);
    return v;
  }
  if (typeof v === "number" && Math.abs(v) >= NUMBER_FLOOR) return tailOf(String(Math.trunc(Math.abs(v))));
  if (typeof v === "bigint") return tailOf(v.toString());
  if (Array.isArray(v)) return v.map(contact);
  if (v !== null && typeof v === "object") return "[redacted]";
  return v;
}

/** Words as their length; anything but a string or nothing as a mark. */
function lengthOnly(v: unknown): unknown {
  if (typeof v === "string") return `[${v.length} chars]`;
  if (v === null || typeof v === "boolean" || typeof v === "number") return v;
  return "[redacted]";
}

/** A credential's value is gone: whatever its shape, unless it says only whether there is one (a boolean, null). */
function credential(v: unknown): unknown {
  return v === null || typeof v === "boolean" ? v : "[redacted]";
}

/** A string with what a person's contact or a credential looks like taken out of it. */
function scrubText(s: string): string {
  let out = s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}…[${s.length - MAX_STRING} more chars]` : s;
  for (const shape of SECRET_SHAPES)
    out = out.replace(shape, (m) => (m.startsWith("Bearer") ? "Bearer [redacted]" : "[redacted]"));
  out = out.replace(NAMED_SECRET, "$1[redacted]");
  out = out.replace(EMAIL_IN_TEXT, (_m, domain: string) => `…@${domain}`);
  out = out.replace(PLUS_NUMBER, tailOf).replace(US_NUMBER, tailOf);
  return out;
}

/** An error as a log field: its name and message, the edge's shape since the first logger, scrubbed as any text. */
export function errText(e: Error): string {
  return scrubText(`${e.name}: ${e.message}`);
}

/**
 * A value made safe to write under `key`, and small enough: nested fields by their own keys, a cycle or a field past
 * MAX_DEPTH said as `[…]`. `above` holds the objects on the way down, so the same object twice side by side is
 * written twice, and only a loop is cut.
 */
export function redact(key: string, value: unknown, depth = 0, above: Set<object> = new Set()): unknown {
  if (isWordsKey(key)) return lengthOnly(value);
  if (isContactKey(key)) return contact(value);
  if (isSecretKey(key)) return credential(value);
  if (value instanceof Error) return errText(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return scrubText(value);
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
