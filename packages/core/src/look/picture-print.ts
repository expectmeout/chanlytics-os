/**
 * A picture's print (decision 0134, amended 15 Nov 2026): what a picture looks like, so the same one brought by two roads (a
 * website's smaller copy of what its Instagram posts) is known as one file. A difference hash: the picture as 9×9 grey, each row
 * compared left to right and each column top to bottom, 128 bits, written as 32 hex characters. Pure: the caller shrinks the
 * picture (the edge's sharp), this reads its 81 grey values.
 *
 * Measured on one real site (12 pictures of one salon, its 7 Instagram stills and its 5 video posters): the same picture
 * shrunk to 320 pixels and saved at JPEG quality 60 came back within 20 bits; two different pictures were never closer than
 * 40. The database holds twins to `PRINT_TWIN_BITS` (00630), one rule for every door.
 */

/** How many bits two prints of one picture may differ by: the database's number (00630), for a script to say the same. */
export const PRINT_TWIN_BITS = 24;

/** The side of the grey square a print is read from. */
export const PRINT_SIDE = 9;

/** The bits a print holds: a row's comparisons, then a column's. */
const PRINT_BITS = 2 * (PRINT_SIDE - 1) * (PRINT_SIDE - 1);

/**
 * A print with fewer ones than this, or more than its bits less this, is a picture with almost nothing in it (a plain colour, a
 * logo on white): every such picture prints alike, so it twins none.
 */
const FLAT_ONES = 16;

const onesOf = (bits: readonly number[]): number => bits.reduce((n, b) => n + b, 0);

/**
 * The print of a picture shrunk to `PRINT_SIDE`×`PRINT_SIDE` grey (row by row, one byte a pixel), or null where it is too flat
 * to tell from another, or the values are not that square.
 */
export function picturePrintOf(grey: ArrayLike<number>): string | null {
  if (grey.length !== PRINT_SIDE * PRINT_SIDE) return null;
  const at = (x: number, y: number): number => grey[y * PRINT_SIDE + x] ?? 0;
  const bits: number[] = [];
  for (let y = 0; y < PRINT_SIDE - 1; y++)
    for (let x = 0; x < PRINT_SIDE - 1; x++) bits.push(at(x, y) > at(x + 1, y) ? 1 : 0);
  for (let y = 0; y < PRINT_SIDE - 1; y++)
    for (let x = 0; x < PRINT_SIDE - 1; x++) bits.push(at(x, y) > at(x, y + 1) ? 1 : 0);
  const ones = onesOf(bits);
  if (ones < FLAT_ONES || ones > PRINT_BITS - FLAT_ONES) return null;
  let hex = "";
  for (let i = 0; i < PRINT_BITS; i += 4)
    hex += ((bits[i] ?? 0) * 8 + (bits[i + 1] ?? 0) * 4 + (bits[i + 2] ?? 0) * 2 + (bits[i + 3] ?? 0)).toString(16);
  return hex;
}

/** How many of two prints' bits differ: what the database counts (`bit_count`), for a test or a script to read the same. */
export function printDistance(first: string, second: string): number {
  let differ = 0;
  for (let at = 0; at < Math.min(first.length, second.length); at++) {
    let bits = Number.parseInt(first[at] ?? "0", 16) ^ Number.parseInt(second[at] ?? "0", 16);
    while (bits) {
      differ += bits & 1;
      bits >>= 1;
    }
  }
  return differ;
}
