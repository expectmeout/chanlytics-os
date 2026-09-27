/**
 * What an id looks like: the uuid every table keys on, as Postgres writes one, in either case.
 *
 * The test was spelled out in each module that took an id from outside -- a route's parameter, a job's payload, a
 * signed token, a form's field -- and they all agreed, so it is one pattern here. A module that looks for an id
 * inside a longer text (Ask's answers) or takes a looser shape is a different test and keeps its own.
 */

/** A whole string that is a uuid. No `g` flag, so one shared pattern keeps no state between two tests. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value is an id. Anything that is not a string is read as its text (`null` and `undefined` as nothing),
 * so a number or a missing field is simply not an id, never a throw.
 */
export function isUuid(value: unknown): boolean {
  return UUID.test(String(value ?? ""));
}
