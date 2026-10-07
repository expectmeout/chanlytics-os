/**
 * A fold's sheet leaving the page (moved whole from legacy/components/record-fold.jsx, decision 0015).
 *
 * Spec §9, item 1 closes a fold on --ease-in-out, and a fold drawn as a sheet is one React takes off the page the moment
 * the registry closes it: focus goes back to the row's act and the next fold is let in at once, and neither may wait on
 * a motion. So nothing of React's is kept. What leaves is a still copy of the sheet and its wash as they were on screen
 * -- a cloned box and textarea keep their typed values (the HTML clone steps), and the body is put back where it had
 * scrolled to -- in the app's root beside where they stood, with nothing in it to press, focus, name or find: no role,
 * no ids and no test ids anywhere in it, `inert`, hidden from a screen reader. On a phone record.css slides it down and
 * fades its wash (data-leaving) on --duration-base and --ease-in-out; beside a desktop page components.css plays it out
 * through its edge as every side sheet leaves (side-out). It is gone as its motion ends, whichever kind ran, or after
 * twice the longer if none runs. Under reduced motion there is no copy at all: the sheet goes at once.
 *
 * The sheet's leaving is put on the page before it paints (useRecLeaving), so a frame with no sheet at all is never
 * seen; a stub React with no layout effect runs it as an effect.
 */
import { useLayoutEffect, useRef } from "react";
import type { RefObject, UIEvent } from "react";
import { can, pick, pickAll } from "./dom";
import { mediaQuery } from "./shell-verbs";

const REC_LEAVE_FALLBACK_MS = 400;
const recReducedMotion = () => {
  const q = mediaQuery("(prefers-reduced-motion: reduce)");
  return !!q && !!q.matches;
};
const recStill = (node: Node, deep: boolean) => {
  const copy = node.cloneNode(deep) as HTMLElement;
  const all = [copy].concat(can(copy, "querySelectorAll") ? Array.from(pickAll(copy, "*")) : []);
  for (const n of all) {
    n.removeAttribute("id");
    n.removeAttribute("data-testid");
  }
  for (const k of ["role", "aria-modal", "aria-labelledby", "aria-describedby", "aria-busy"]) copy.removeAttribute(k);
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  copy.setAttribute("data-leaving", "true");
  return copy;
};

/**
 * Where a sheet is drawn: the app's root, where no pane's layout reaches it (RecordSheet says why), or the first run's
 * own shell, which is drawn in place of the app's chrome and has no .app-root (app-shell.jsx). One lookup, for a fold's
 * sheet, its leaving and RecordSheet alike.
 */
export const recPortalRoot = (): Element | null =>
  can(document, "querySelector") ? pick<Element>(document, ".app-root, .fr-shell") : null;

const recSheetLeaves = (sheet: HTMLElement | null, wash: HTMLElement | null, top: number) => {
  const root = recPortalRoot();
  if (!root || !sheet || !sheet.cloneNode || recReducedMotion()) return;
  const washCopy = wash && typeof wash.cloneNode === "function" ? recStill(wash, false) : null;
  const sheetCopy = recStill(sheet, true);
  if (washCopy) root.appendChild(washCopy);
  root.appendChild(sheetCopy);
  const body = can(sheetCopy, "querySelector") ? pick(sheetCopy, ".rec-sheet-body") : null;
  if (body) body.scrollTop = top;
  let gone = false;
  const go = () => {
    if (gone) return;
    gone = true;
    sheetCopy.remove();
    if (washCopy) washCopy.remove();
  };
  sheetCopy.addEventListener("transitionend", (e) => {
    if (e.target === sheetCopy) go();
  });
  sheetCopy.addEventListener("animationend", (e) => {
    if (e.target === sheetCopy) go();
  });
  setTimeout(go, REC_LEAVE_FALLBACK_MS);
};

/** What was on screen of a sheet, kept from the draw that closes it: the sheet, its wash and where its body had scrolled to. */
interface Shown {
  was: boolean;
  sheet: HTMLElement | null;
  wash: HTMLElement | null;
  top: number;
}

// A fold's sheet, its wash, and where its body had scrolled to, read as the draw that closes it is made, while React's
// refs still hold the sheet (by the time it is taken away they are let go of); and, as it goes, its leaving -- only when
// the fold has CLOSED. A width crossed with the fold open draws it in the other frame, and a page going away takes it
// with it: neither is a sheet leaving.
export function useRecLeaving(sheet: boolean, open: boolean, box: RefObject<HTMLElement | null>) {
  const wash = useRef<HTMLDivElement | null>(null);
  const shown = useRef<Shown>({ was: false, sheet: null, wash: null, top: 0 });
  const openNow = useRef(open);
  openNow.current = open;
  if (shown.current.was) {
    shown.current.sheet = box.current || shown.current.sheet;
    shown.current.wash = wash.current || shown.current.wash;
  }
  shown.current.was = sheet;
  useLayoutEffect(() => {
    if (!sheet) return undefined;
    return () => {
      const was = shown.current;
      shown.current = { was: was.was, sheet: null, wash: null, top: 0 };
      if (!openNow.current) recSheetLeaves(was.sheet, was.wash, was.top);
    };
  }, [sheet]);
  return {
    wash,
    scrolled: (e: UIEvent<HTMLElement>) => {
      if (e && e.currentTarget) shown.current.top = e.currentTarget.scrollTop;
    },
  };
}
