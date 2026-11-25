"use client";

/**
 * A page's own stylesheets, linked: the files the build wrote for it (src/styles/page-sheets.ts says which rules are a
 * page's, write-page-sheets.ts writes them and lists them in `NEXT_PUBLIC_SHEETS`, sheet-list.ts reads the list).
 *
 * React orders stylesheets by a `precedence` and holds a draw until the ones it needs have loaded, so that is what
 * links them, and nothing here touches the document:
 *
 * - `SheetSlots` says the cascade's order once, in the frame's layout: an empty `<style>` for every file there is, in
 *   order, each under its own precedence. A file linked later, from any page, lands in its place.
 * - `PageSheets` is what a page's layout draws around it (sheets-layout.tsx): a `<link>` for each of the page's files.
 *   In the prerendered document they are in the head, in order, where the browser finds them before any script and
 *   holds the first paint for them; on a move to a page whose files are not there yet, React waits for them and never
 *   draws the page bare.
 * - `SheetsAlone` draws a page's links and not the page: the workspace's layout draws its children so beside the
 *   frame, because the frame itself is drawn only in a browser (bridge/FrameHost.tsx), and a page's links inside it
 *   would be in no prerendered document.
 * - `warmSheets` brings a page's files in ahead of a move, as its page is warmed (bridge/FrameHost.tsx), and a page
 *   waits for one of those that has not arrived by the press, which React does not do (sheet-arrival.ts).
 *
 * The list itself is read in sheet-list.ts, and a stylesheet a part of a page links for itself (the lead map's) is
 * sheet-of.tsx's, apart from here.
 */
import { createContext, use, useContext, type ReactNode } from "react";
import { preinit } from "react-dom";
import { markWarmed, waitForSheet } from "./sheet-arrival";
import { sheetSlots, sheetsOfPage, sheetsOfPath } from "./sheet-list";

/** The cascade's order, said once in the document: every file's precedence, in order, before any file is linked. */
export function SheetSlots() {
  return (
    <>
      {sheetSlots().map((slot) => (
        <style key={slot} href={`sheet:${slot}`} precedence={slot}>
          {""}
        </style>
      ))}
    </>
  );
}

/** Whether a page's links are drawn without the page (SheetsAlone). */
const Alone = createContext(false);

/** A page's links and not the page: for whoever draws the page itself somewhere a prerender does not reach. */
export function SheetsAlone({ children }: { children: ReactNode }) {
  return <Alone.Provider value>{children}</Alone.Provider>;
}

/** A page with its own stylesheets linked around it. */
export function PageSheets({ page, children }: { page: string; children: ReactNode }) {
  const alone = useContext(Alone);
  const files = sheetsOfPage(page);
  // In a browser, on a move: a file brought in ahead that is still on its way is waited for (sheet-arrival.ts).
  if (typeof document !== "undefined")
    for (const file of files) {
      const arrival = waitForSheet(file.href, document);
      if (arrival) use(arrival);
    }
  return (
    <>
      {files.map((file) => (
        <link key={file.slot} rel="stylesheet" href={file.href} precedence={file.slot} />
      ))}
      {alone ? null : children}
    </>
  );
}

/**
 * Bring a page's stylesheets in ahead of a move to its address, as its page is warmed. A file this puts in the document
 * is remembered until it is seen loaded, for the one wait React does not do (sheet-arrival.ts).
 */
export function warmSheets(pathname: string, doc: Pick<Document, "querySelectorAll">): void {
  for (const file of sheetsOfPath(pathname)) {
    markWarmed(file.href, doc);
    preinit(file.href, { as: "style", precedence: file.slot });
  }
}
