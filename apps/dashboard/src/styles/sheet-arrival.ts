/**
 * The one wait React does not do for a stylesheet: for a file that was brought in ahead of a move and has not loaded
 * by the time its page is pressed.
 *
 * React holds a draw for a stylesheet it puts in the document itself. One that is already there it takes as there,
 * loaded or not (react-dom's suspendResource does nothing for a resource it has inserted), and `preinit` inserts at
 * once. So a page pressed while its files were still arriving was drawn without them until they came: with those files
 * held back three seconds, every frame of the page for as long as it was watched (25 Nov 2026). The page waits here
 * instead (sheet-links.tsx PageSheets), as it would for a file nobody had asked for, and the page left stays on the
 * screen meanwhile.
 *
 * Only a file the warm itself put in the document is ever waited for. The document's own links are the browser's to
 * hold the first paint for, and a page's own are never among them, so a page already on the screen never waits here:
 * a wait outside a move would have nothing to keep on the screen meanwhile. A file that fails, or is ten seconds late,
 * is waited for once. Nothing here is React's or the frame's: it reads a document's links and no more, so
 * tests/styles/sheets/sheet-arrival.test.mjs runs it over a document of its own.
 */

/** What is read of a document: its stylesheet links. */
type SheetDocument = Pick<Document, "querySelectorAll">;

/** A stylesheet's link in a document, by its address. */
const sheetLinkIn = (href: string, doc: SheetDocument): HTMLLinkElement | undefined =>
  Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).find(
    (one) => one.getAttribute("href") === href,
  );

/** The files a warm put in the document and nobody has yet seen loaded: the only ones nothing holds a draw for. */
const warmedAhead = new Set<string>();
/** A file's arrival, for as long as it is on its way. */
const sheetArrivals = new Map<string, Promise<void>>();
/** How long a page waits for a file brought in ahead: past it the page is drawn without, once. */
const ARRIVAL_WAIT_MS = 10_000;

/** Remember a file a warm is about to put in the document: called before it does, and only then is it one to wait for. */
export function markWarmed(href: string, doc: SheetDocument): void {
  if (!sheetLinkIn(href, doc)) warmedAhead.add(href);
}

/** The arrival of a file that was brought in ahead and has not loaded yet, or null where there is nothing to wait for. */
export function waitForSheet(href: string, doc: SheetDocument): Promise<void> | null {
  if (!warmedAhead.has(href)) return null;
  const waiting = sheetArrivals.get(href);
  if (waiting) return waiting;
  const link = sheetLinkIn(href, doc);
  // Not in the document: React links it with the page and waits for it itself. Loaded: there is nothing to wait for.
  if (!link) return null;
  if (link.sheet) {
    warmedAhead.delete(href);
    return null;
  }
  const arrival = new Promise<void>((arrived) => {
    const done = () => {
      clearTimeout(late);
      sheetArrivals.delete(href);
      warmedAhead.delete(href);
      arrived();
    };
    const late = setTimeout(done, ARRIVAL_WAIT_MS);
    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
  });
  sheetArrivals.set(href, arrival);
  return arrival;
}
