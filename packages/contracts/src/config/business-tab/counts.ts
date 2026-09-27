/**
 * How the Business tab says a number: grouped for English, with its plural, and how many chips a row draws before
 * the "+N" for the rest. Every fold's words in this folder count with these.
 */
export const count = (n: number): string => n.toLocaleString("en-US");

/**
 * How many chips a row of the record draws at rest, and how the rest of them are said.
 *
 * One number and one spelling for every list of chips on the page -- the services, the notes, the rules -- because
 * three of them with their own caps is three rows that wrap to different depths on the same phone. Three (24 Sep):
 * the chips are words on the row's own line now (record.css .rec-chips), and three names with "+N" after the count is
 * one line at a desktop's width and two at a phone's; four was two and three.
 */
export const CHIPS_SHOWN = 3;

/** "+30": the rest of a list of chips, said once, wherever a row cuts one. It said "+30 more"; the "more" is the plus. */
export function chipsMoreWords(n: number): string {
  return `+${count(n)}`;
}

export const pluralGrouped = (n: number, one: string, many: string): string => `${count(n)} ${n === 1 ? one : many}`;
