/**
 * Reading a value that came from outside, whose shape is not promised: a provider's JSON, a query string, a stored
 * jsonb. Each reader answers with the value when it is the kind asked for, and null (or zero) when it is not; none of
 * them guesses. Eight files spelled these out for themselves, word for word, and each is one function here.
 *
 * isOneOf and entryOf are the two checks a closed set or a table of words is read through (decision 0112): each says
 * what `(LIST as readonly string[]).includes(value)` and `(WORDS as Record<string, string>)[key]` said, and the checker
 * keeps the type it proves instead of taking a wider one on trust.
 */

/** Whether a value is one of a closed set's members; where it is, its type is the set's. */
export const isOneOf = <T extends readonly unknown[]>(set: T, value: unknown): value is T[number] =>
  set.includes(value);

/** Whether a key read from outside is one a record keeps as its own: never a name every object has (`constructor`). */
const isKeyOf = <R extends object>(record: R, key: unknown): key is keyof R =>
  (typeof key === "string" || typeof key === "number") && Object.hasOwn(record, key);

/** What a record keeps under a key read from outside, or undefined where it keeps nothing under it. */
export const entryOf = <R extends object>(record: R, key: unknown): R[keyof R] | undefined =>
  isKeyOf(record, key) ? record[key] : undefined;

/** A string, a number or a yes-or-no as its text; "" for anything else, where String() would say "[object Object]". */
export const textOrEmpty = (value: unknown): string =>
  typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : "";

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

/**
 * Whether a value is a list. A value typed as a list of something keeps that type where this holds, as a stored list
 * read back may not be one: Array.isArray would say yes and make each of its items `any`.
 */
export const isList = (value: unknown): value is readonly unknown[] => Array.isArray(value);

/** A list, or an empty one: its items unread, each for the reader to check. */
export const listOrEmpty = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * What a value holds at a path, a key of a record or an index of a list at each step, or undefined where a step finds
 * neither: `valueAt(answer, "messages", 0, "id")`. A provider's answer is read this way, each leaf then checked, so no
 * shape is told to the checker on the way down.
 */
export const valueAt = (value: unknown, ...path: readonly (string | number)[]): unknown =>
  path.reduce<unknown>(
    (at, step) => (typeof step === "number" ? listOrEmpty(at)[step] : recordOrEmpty(at)[step]),
    value,
  );

/** A plain object (never an array), as a type guard: what a provider's JSON is read from, field by field. */
export const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
