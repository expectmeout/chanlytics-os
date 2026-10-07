/** Arithmetic every report does: three modules summed a list for themselves. */

/** The sum of a list; zero for an empty one. */
export const sumOf = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
