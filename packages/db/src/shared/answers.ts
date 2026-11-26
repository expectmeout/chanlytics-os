/**
 * What PostgREST can answer, said to the checker where the generated types say less. Two places they promise more than
 * the database keeps:
 *
 * - A SQL function's columns. Postgres keeps no nullability for what a function returns, so every column of a
 *   `returns table` row is typed as always there; a column read through an outer join, or one a branch leaves out,
 *   arrives null all the same. A read names the columns that may be null.
 * - A row embedded through a foreign key. The type reads the key alone (a key that is never null embeds a row that is
 *   always there), but a reader on a session sees only the rows its policies let it, and an embedded row it may not see
 *   arrives null.
 *
 * Nothing changes at run time: each says what may arrive, so the guard on it stays a guard the checker can see.
 */

/** A row with the named columns as they can arrive: possibly null. */
export type NullableIn<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

/** A function's rows, the columns named possibly null. */
export const nullableIn = <T, K extends keyof T>(rows: T[], ..._columns: readonly K[]): NullableIn<T, K>[] => rows;

/** A row embedded through a foreign key, as a reader on a session can receive it: null where its policies hide it. */
export const embedded = <T>(row: T): T | null => row;

/**
 * The account the platform's identity store answers for an id, or none. Its client types an answer with no error as
 * carrying the account, but a store that keeps none under the id may answer none with no error (the suite's stand-in
 * for it does), and a read of who an account is then says nobody.
 */
export const accountOf = <U>(answer: { data: { user: U | null } }): U | null => answer.data.user;
