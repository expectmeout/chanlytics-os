export const sumOf = (xs) => xs.reduce((a, b) => a + b, 0);
export const pct = (n, of) => of > 0 ? Math.round(n / of * 100) : null;
