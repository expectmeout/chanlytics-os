/**
 * The database's types as the code reads them: the generated `Database` (database.types.ts, written by `gen:db-types`),
 * with every text column a CHECK closes typed as its set (SCHEMA_SETS, generated from the same constraints). A row's
 * `kind` is then `"person" | "workspace"` where it is read, not a `string` to assert, and a write of a word the set does
 * not hold stops compiling (decision 0112). And a SQL function's arguments take null: Postgres hands any argument to a
 * function that is not STRICT as null, and the generator types each as never null, so a null was asserted away at each
 * call; and a function that answers a table's rows answers them typed as that table's are. Every other column, view and
 * function is the generated type, unchanged.
 */
import type { ContactId, SchemaSet, SchemaSetKey, TenantId } from "@chanlytics/contracts";
import type { Database as Generated, Json } from "./database.types";

export type { Json };

/** A column's type, its text taken by the set its CHECK allows; null, undefined and anything else as they were. */
type Closed<K extends string, V> = K extends SchemaSetKey
  ? V extends string
    ? SchemaSet<K>
    : V extends readonly string[]
      ? SchemaSet<K>[]
      : V
  : V;
/**
 * An id column's text as its id's type: a workspace's, a person's (contracts identity.ts), wherever a row names one
 * (`tenant_id`, `contact_id`) and as the row's own id in tenants and contacts, so one is never handed for the other.
 */
type IdOf<T, C, V> = C extends "tenant_id" | "preview_tenant_id"
  ? Brand<V, TenantId>
  : C extends "contact_id" | "merged_into_contact_id"
    ? Brand<V, ContactId>
    : C extends "id"
      ? T extends "tenants"
        ? Brand<V, TenantId>
        : T extends "contacts"
          ? Brand<V, ContactId>
          : V
      : V;
type Brand<V, B> = V extends string ? B : V;
type Narrowed<T extends string, R> = { [C in keyof R]: IdOf<T, C, Closed<`${T}.${C & string}`, R[C]>> };

/** A function's own rows, which are no table's: only the ids are read, which are the same ids wherever they stand. */
type IdsOf<R> = { [C in keyof R]: IdOf<never, C, R[C]> };
type IdsInRows<A> = [Json] extends [A]
  ? A
  : A extends readonly (infer Row)[]
    ? Row extends Record<string, unknown>
      ? IdsOf<Row>[]
      : A
    : A;

/** A function's arguments, each of which may be null; a function with none (`never`) as it is. */
type NullableArgs<A> = A extends Record<string, unknown> ? { [K in keyof A]: A[K] | null } : A;

type GeneratedFunctions = Generated["public"]["Functions"];
/** A function's answer: rows of a table (the generator's `SetofOptions.to`) typed as that table's are, else as generated. */
type ClosedReturns<Fn> = Fn extends { Returns: infer Answer; SetofOptions: { to: infer T extends string } }
  ? Answer extends readonly (infer Row)[]
    ? Narrowed<T, Row>[]
    : Narrowed<T, Answer>
  : Fn extends { Returns: infer Answer }
    ? IdsInRows<Answer>
    : never;

/** One function, each of its overloads apart (a function the generator lists twice is a union of them). */
type OpenFunction<Fn> = Fn extends unknown
  ? { [P in keyof Fn]: P extends "Args" ? NullableArgs<Fn[P]> : P extends "Returns" ? ClosedReturns<Fn> : Fn[P] }
  : never;
type OpenFunctions = { [F in keyof GeneratedFunctions]: OpenFunction<GeneratedFunctions[F]> };

type GeneratedTables = Generated["public"]["Tables"];
type ClosedTables = {
  [T in Extract<keyof GeneratedTables, string>]: {
    Row: Narrowed<T, GeneratedTables[T]["Row"]>;
    Insert: Narrowed<T, GeneratedTables[T]["Insert"]>;
    Update: Narrowed<T, GeneratedTables[T]["Update"]>;
    Relationships: GeneratedTables[T]["Relationships"];
  };
};

export type Database = {
  [S in keyof Generated]: S extends "public"
    ? {
        [P in keyof Generated["public"]]: P extends "Tables"
          ? ClosedTables
          : P extends "Functions"
            ? OpenFunctions
            : Generated["public"][P];
      }
    : Generated[S];
};
