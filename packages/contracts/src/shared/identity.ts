/**
 * What an id looks like: the uuid every table keys on, as Postgres writes one, in either case.
 *
 * The test was spelled out in each module that took an id from outside -- a route's parameter, a job's payload, a
 * signed token, a form's field -- so it is one pattern here (decision 0108). A module that looks for an id inside a
 * longer text (Ask's answers) is a different test and keeps its own.
 */
import { textOrEmpty } from "./unknown";

/** A whole string that is a uuid. No `g` flag, so one shared pattern keeps no state between two tests. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a workspace's address looks like, as /w/ says it. No `g` flag, for the same reason. */
export const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Whether a value is an id. Anything that is not a string is read as its text (`null` and `undefined` as nothing),
 * so a number or a missing field is simply not an id, never a throw.
 */
export function isUuid(value: unknown): boolean {
  return UUID.test(textOrEmpty(value));
}

/**
 * Whose id this is, in the type. A workspace's id (the tenant, as storage keys it) and a person's (a contact) are both
 * uuids, so nothing but the type tells one from the other, or either from a conversation's or a message's. A string
 * becomes one where it enters -- a row read from the database, a route's validated parameter -- through the checks
 * below, which are `isUuid` and nothing more; past that point the type carries the check and nothing checks again.
 */
declare const whoseId: unique symbol;
export type TenantId = string & { readonly [whoseId]: "tenant" };
export type ContactId = string & { readonly [whoseId]: "contact" };

/**
 * Whether a value is a workspace's id, as the check where one enters (a door's body, a job's payload, a route's
 * parameter): exactly the strings `isUuid` takes, and the value carries the type from there (decision 0112).
 */
export const isTenantId = (value: unknown): value is TenantId => typeof value === "string" && isUuid(value);

/** Whether a value is a person's id, the same way. */
export const isContactId = (value: unknown): value is ContactId => typeof value === "string" && isUuid(value);

/**
 * An id the database already holds as a workspace's or a person's, read out of a SQL function's JSON or a row named by hand:
 * taken as it is, with no check, as the overlay takes a column's (packages/db/src/types.ts). What still tells two ids apart
 * is the type, which is the point (decision 0112). Not for what comes from outside: that is `isTenantId` or `asTenantId`.
 */
export const heldTenantId = (value: string): TenantId => value as TenantId;
export const heldContactId = (value: string): ContactId => value as ContactId;

/** A tenant id: exactly the strings `isUuid` takes. Anything else throws, because a row that holds it is our fault. */
export function asTenantId(value: string): TenantId {
  if (!isUuid(value)) throw new TypeError("A tenant id is a uuid.");
  return value as TenantId;
}

/** A contact id: exactly the strings `isUuid` takes. Anything else throws, because a row that holds it is our fault. */
export function asContactId(value: string): ContactId {
  if (!isUuid(value)) throw new TypeError("A contact id is a uuid.");
  return value as ContactId;
}
