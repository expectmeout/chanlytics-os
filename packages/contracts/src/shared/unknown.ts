/**
 * Reading a value that came from outside, whose shape is not promised: a provider's JSON, a query string, a stored
 * jsonb. Each reader answers with the value when it is the kind asked for, and null (or zero) when it is not; none of
 * them guesses. Eight files spelled these out for themselves, word for word, and each is one function here.
 */

/** A finite number, or null. */
export const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** A whole number, none below zero: a count, as a page says one and the database counts one. */
export const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/** A finite number, or zero. */
export const finiteOrZero = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/** A string with words in it, trimmed; null for anything else, a blank string included. */
export const trimmedOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** A string with words in it, exactly as it came; null for anything else, a blank string included. */
export const nonBlankOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

/** A plain object (never an array), or an empty one, for a reader that goes on to read its fields. */
export const recordOrEmpty = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** A plain object (never an array), or null. */
export const recordOrNull = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/**
 * Words somebody else wrote (a provider's refusal in a query string, a link's fragment), on one line and at most 200
 * characters, for a log line or a page; null when there are none.
 */
export const lineOrNull = (text: string | null | undefined): string | null => {
  const t = (text ?? "").replace(/[\r\n]+/g, " ").trim();
  return t ? t.slice(0, 200) : null;
};
