/**
 * One copy of each stylesheet in a tab: of a stylesheet's ladder of nested files (page-sheets.ts), a tab keeps one.
 *
 * A page links the narrowest file that holds all its code can draw, and a page warmed has its files brought in ahead of
 * a move (sheet-links.tsx), so a tab that opened one page and warmed the rest came to hold seven stylesheets as a
 * narrow file and a wide one: 184 KB of rules twice, 1.08 MB in all against the one bundle's 1.05, and a press's
 * styles cost 6% more than with the bundle (25 Nov 2026). Now:
 *
 * - a warm brings in no file its ladder already has, nor one a wider file there holds (`heldFrom`);
 * - a page links, of each of its files, the widest that holds it and has loaded, else the widest a warm is still
 *   bringing (its draw waits for that one, sheet-arrival.ts), else its own (`linkFor`): a move never puts a narrower
 *   copy beside a wider one the tab has;
 * - once a wider file has loaded, a narrower one that has loaded too is taken out of the document (`retireNarrower`,
 *   kept at it by `keepOneOfEach`). The wider holds every rule of the narrower, in the same order and after it, so
 *   what is drawn does not change, and nothing is taken out that the page on the screen is waiting for.
 *
 * Nothing here is React's. React never takes a stylesheet out, and a link it put in and that was taken out it does not
 * put in again; it is never asked to, since a wider file of its ladder is there. What is read is a document's links, so
 * tests/styles/sheets/sheet-ladders.test.mjs runs it over a document of its own.
 */
/** What is read of a document: its stylesheet links. */
type SheetDocument = Pick<Document, "querySelectorAll">;
/** A file of a ladder, as it is linked. */
interface LadderFile {
  href: string;
}

/** The document's stylesheet links, by address. */
function linksIn(doc: SheetDocument): Map<string, HTMLLinkElement> {
  const links = new Map<string, HTMLLinkElement>();
  for (const link of doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    const href = link.getAttribute("href");
    if (href) links.set(href, link);
  }
  return links;
}

/** Whether the document links one of a file's holders: then a warm has nothing to bring for it. */
export function heldFrom(holders: readonly LadderFile[], doc: SheetDocument): boolean {
  const links = linksIn(doc);
  return holders.some((file) => links.has(file.href));
}

/**
 * The file a page links for one of its own: the widest holder loaded, else the widest on its way that the draw can wait
 * for (`awaited`: one a warm is bringing, sheet-arrival.ts), else its own.
 */
export function linkFor<File extends LadderFile>(
  own: File,
  holders: readonly File[],
  doc: SheetDocument,
  awaited: (href: string) => boolean,
): File {
  const links = linksIn(doc);
  const loaded = holders.findLast((file) => Boolean(links.get(file.href)?.sheet));
  if (loaded) return loaded;
  return holders.findLast((file) => links.has(file.href) && awaited(file.href)) ?? own;
}

/**
 * Take out of the document every file a wider file of its ladder holds, where both have loaded. A narrower file still on
 * its way is left until it has loaded: a draw may be waiting for it.
 */
function retireNarrower(ladders: readonly (readonly LadderFile[])[], doc: SheetDocument): void {
  const links = linksIn(doc);
  for (const ladder of ladders) {
    const held = ladder.map((file) => links.get(file.href));
    const widest = held.findLastIndex((link) => Boolean(link?.sheet));
    for (const link of held.slice(0, Math.max(widest, 0))) if (link?.sheet) link.remove();
  }
}

/** Whether an event was a link's. */
const fromALink = (event: Event): boolean => {
  const target: unknown = event.target;
  return typeof target === "object" && target !== null && "localName" in target && target.localName === "link";
};

/**
 * Keep a document to one file of each ladder: taken out now, and again whenever a stylesheet loads. A load does not
 * bubble, so it is heard on its way down, before React's own listener on the link has heard it: the files are taken
 * out once the event has reached every listener, a task later. Answers what stops it.
 */
export function keepOneOfEach(
  ladders: readonly (readonly LadderFile[])[],
  doc: SheetDocument & Pick<Document, "addEventListener" | "removeEventListener">,
): () => void {
  if (ladders.length === 0) return () => {};
  let pending: ReturnType<typeof setTimeout> | null = null;
  const sweep = () => {
    pending = null;
    retireNarrower(ladders, doc);
  };
  const heard = (event: Event) => {
    if (fromALink(event)) pending ??= setTimeout(sweep, 0);
  };
  doc.addEventListener("load", heard, true);
  sweep();
  return () => {
    doc.removeEventListener("load", heard, true);
    if (pending) clearTimeout(pending);
  };
}
