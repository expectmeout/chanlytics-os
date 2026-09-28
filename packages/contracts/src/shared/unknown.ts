/**
 * Reading a value that came from outside, whose shape is not promised: a provider's JSON, a query string, a stored
 * jsonb. Each reader answers with the value when it is the kind asked for, and null (or zero) when it is not; none of
 * them guesses. Five files spelled these out for themselves, word for word, and each is one function here.
 */

/** A finite number, or null. */
export const finiteOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A finite number, or zero. */
export const finiteOrZero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** A string with words in it, trimmed; null for anything else, a blank string included. */
export const trimmedOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** A string with words in it, exactly as it came; null for anything else, a blank string included. */
export const nonBlankOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** A plain object (never an array), or null. */
export const recordOrNull = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * Words somebody else wrote (a provider's refusal in a query string, a link's fragment), on one line and at most 200
 * characters, for a log line or a page; null when there are none.
 */
export const lineOrNull = (s: string | null | undefined): string | null => {
  const t = (s ?? "").replace(/[\r\n]+/g, " ").trim();
  return t ? t.slice(0, 200) : null;
};
