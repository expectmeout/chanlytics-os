/**
 * The address People wrote itself. The page follows its own address (people-route.tsx: a move between two addresses of
 * People is a pushed or replaced entry, never a request for a page that is drawn), and the shell told of a move it did not
 * make -- a link, Back -- remounts the page under the address it arrived at, as the frame did. An address the page wrote
 * itself (usePeopleAddress: the list picked, said in the path, replaced and never pushed) is its own state saying where it
 * stands, and remounts nothing: a toast and a selection are the page's.
 */
let written: string | null = null;

/** The page says where it stands (a route as the shell names it: `clients/seg:x`). */
export function noteOwnAddress(route: string): void {
  written = route;
}

/** Whether a route the address arrived at is the one the page wrote last; either way, the note is spent. */
export function takeOwnAddress(route: string): boolean {
  const mine = written === route;
  written = null;
  return mine;
}
