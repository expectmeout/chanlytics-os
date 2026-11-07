/**
 * Whether a door's refusal says the function is not on this database at all (a migration not applied yet): PostgREST's
 * `PGRST202`, which is what a schema cache without the function answers, or Postgres's own `42883`, undefined_function,
 * which a cache that still lists a function the database has dropped answers.
 */
export function isMissingDoor(error: { code: string | null }): boolean {
  return error.code === "PGRST202" || error.code === "42883";
}

/** The same question of a door that may also say so only in its words. */
export const isMissingFunction = (error: { code?: string | null; message: string }): boolean =>
  error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message);

/** Whether a database's words say a column or a table is not there: a migration not applied yet. */
export const saysMissing = (message: string): boolean => /does not exist|could not find/i.test(message);
