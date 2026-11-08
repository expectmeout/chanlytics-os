/**
 * The database's types as the code reads them: the generated `Database` (database.types.ts, written by `gen:db-types`),
 * with every text column a CHECK closes typed as its set (SCHEMA_SETS, generated from the same constraints). A row's
 * `kind` is then `"person" | "workspace"` where it is read, not a `string` to assert, and a write of a word the set does
 * not hold stops compiling (decision 0112). And a SQL function's arguments take null: Postgres hands any argument to a
 * function that is not STRICT as null, and the generator types each as never null, so a null was asserted away at each
 * call; and a function that answers a table's rows answers them typed as that table's are. Every other column, view and
 * function is the generated type, unchanged.
 */
import type { SchemaSet, SchemaSetKey } from "@chanlytics/contracts";
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
type Narrowed<T extends string, R> = { [C in keyof R]: Closed<`${T}.${C & string}`, R[C]> };

/** A function's arguments, each of which may be null; a function with none (`never`) as it is. */
type NullableArgs<A> = A extends Record<string, unknown> ? { [K in keyof A]: A[K] | null } : A;

type GeneratedFunctions = Generated["public"]["Functions"];
/** A function's answer: rows of a table (the generator's `SetofOptions.to`) typed as that table's are, else as generated. */
type ClosedReturns<Fn> = Fn extends { Returns: infer Answer; SetofOptions: { to: infer T extends string } }
  ? Answer extends readonly (infer Row)[]
    ? Narrowed<T, Row>[]
    : Narrowed<T, Answer>
  : Fn extends { Returns: infer Answer }
    ? Answer
    : never;

/** One function, each of its overloads apart (a function the generator lists twice is a union of them). */
type OpenFunction<Fn> = Fn extends unknown
  ? { [P in keyof Fn]: P extends "Args" ? NullableArgs<Fn[P]> : P extends "Returns" ? ClosedReturns<Fn> : Fn[P] }
  : never;
type OpenFunctions = { [F in keyof GeneratedFunctions]: OpenFunction<GeneratedFunctions[F]> };

type GeneratedTables = Generated["public"]["Tables"];
type ClosedTables = {
  [T in keyof GeneratedTables & string]: {
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
