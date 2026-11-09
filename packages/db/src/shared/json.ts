/**
 * A value handed to a JSON column or a SQL function's `jsonb` argument (decision 0112). The generated `Json` is a union
 * with an index signature, which an interface never meets (TypeScript gives an interface no implicit one), so a DTO
 * written for a JSON column was asserted `as Json`, and the checker stopped looking: a `Date`, a function or a `bigint`
 * in it compiled, and JSON.stringify then wrote what it writes of those. `asJson` takes the value as it is and checks,
 * field by field, that each is what JSON carries; a missing field (`undefined`) is left out, as the wire leaves it out.
 */
import type { Json } from "../types";

/** What JSON carries, field by field: a value that is not (a Date, a function, a bigint, a symbol) is `never`. */
export type Jsonable<T> = T extends string | number | boolean | null
  ? T
  : T extends undefined
    ? undefined
    : T extends bigint | symbol | Date | ((...args: never[]) => unknown)
      ? never
      : T extends readonly unknown[]
        ? { [I in keyof T]: Jsonable<T[I]> }
        : T extends object
          ? { [K in keyof T]: Jsonable<T[K]> }
          : never;

/**
 * The value, as the column takes it, once each field is what JSON carries. The checker cannot see that an interface is
 * one of `Json`'s members, so this says it here, once, for every value `Jsonable` holds.
 */
export const asJson = <T>(value: T & Jsonable<T>): Json => value as Json;

/**
 * A copy of any value as JSON keeps it: what JSON.stringify writes, read back (a Date as its string, a function and an
 * undefined field left out). For a value whose type says nothing (a provider's body, a model's answer) on its way to a
 * column; one whose type is known goes through `asJson`, which checks it instead of copying it.
 */
export const jsonCopyOf = (value: unknown): Json =>
  value === undefined ? null : (JSON.parse(JSON.stringify(value)) as Json);
