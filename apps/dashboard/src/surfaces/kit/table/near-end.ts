/**
 * When a long list asks for its next page (decision 0103): two screens before its end, so the rows have joined before a
 * scroll reaches them, and once for each place the rows have stood at, so a scroll asks for one page and a read that fails is
 * not asked for again: Show more stands for it. Pure, and over what a box says of itself, whichever box scrolls the list.
 */

/** How many screens before its end a list asks for more. */
export const NEAR_END_SCREENS = 2;

/** What a scrolling box says of itself. */
export interface ScrollBox {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

/** Whether the list's end is within two screens of what shows: always, for a list shorter than its box. */
export const nearsEnd = (b: ScrollBox): boolean =>
  b.scrollHeight - b.scrollTop - b.clientHeight <= NEAR_END_SCREENS * b.clientHeight;

/**
 * Asks for more, once for each place the rows stand at (`at`: its view and its length). None to ask with, none asked. The box
 * is read last: a scroll that has nothing to ask costs no layout.
 */
export function nearEndAsker(): (b: ScrollBox, at: string | number, ask: (() => void) | undefined) => void {
  let asked: string | number | null = null;
  return (b, at, ask) => {
    if (!ask || asked === at || !nearsEnd(b)) return;
    asked = at;
    ask();
  };
}
