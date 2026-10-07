/** Arithmetic every report does: three modules summed a list for themselves, and five rounded a share each their own way. */

/** The sum of a list; zero for an empty one. */
export const sumOf = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * A whole-number share: 3 of 8 is 38. Of nothing it is null, never 0: a share of no one is no share, and a caller that
 * prints a zero says so itself (`?? 0`).
 */
export const pct = (n: number, of: number): number | null => (of > 0 ? Math.round((n / of) * 100) : null);
