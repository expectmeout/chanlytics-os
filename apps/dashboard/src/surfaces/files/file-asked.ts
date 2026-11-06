/**
 * A file asked for from somewhere over the page (Ask's card, decision 0099): the address names it (`?do=file:<id>`), which a Files page
 * reads as it mounts. One already on screen under Ask has mounted, and a query the page keeps is no move the frame hears, so it is told.
 */
let toldOfFile: ((id: string) => void) | null = null;

/** The page listening, while it is on screen. */
export function hearFileAsked(listener: (id: string) => void): () => void {
  toldOfFile = listener;
  return () => {
    if (toldOfFile === listener) toldOfFile = null;
  };
}

/** Go to this file, whether its page is on screen already or not. */
export function openFile(id: string, go: (route: string) => void): void {
  go(`admin/files?do=file:${id}`);
  toldOfFile?.(id);
}
