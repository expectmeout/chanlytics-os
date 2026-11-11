/**
 * A file asked for from somewhere else (Ask's card, the bell's row, a link: decision 0099): the address names it
 * (`?do=file:<id>`), and the Files page opens it whichever way the ask reaches it. A page loaded at that address reads it as it
 * is drawn (pane.tsx). One the router moves to is drawn before the address moves, so it reads the address again once it has
 * landed. One already on screen hears its address moved to a file; and under Ask it is told too, since a query the page keeps
 * is no move the frame hears.
 */
import { hearAddress } from "@/bridge/workspace";
import { doAsked, doAskedAnew } from "../kit/sheet/back";

let toldOfFile: ((id: string) => void) | null = null;

/** The page listening, while it is on screen: `open` is handed each file asked for. Answers the stop. */
export function followFileAsked(open: (id: string) => void): () => void {
  // The router draws the page it moves to and then moves the address: what it names is read now that the page has landed.
  const landed = doAsked("file");
  if (landed) open(landed);
  // The address moved to one of its files while the page stands: the bell's row, a link in Ask's words.
  const unhear = hearAddress(
    () => {
      const fileId = doAskedAnew("file");
      if (fileId) open(fileId);
    },
    window,
    { everyMove: true },
  );
  toldOfFile = open;
  return () => {
    unhear();
    if (toldOfFile === open) toldOfFile = null;
  };
}

/** Go to this file, whether its page is on screen already or not. */
export function openFile(id: string, go: (route: string) => void): void {
  go(`admin/files?do=file:${id}`);
  toldOfFile?.(id);
}
