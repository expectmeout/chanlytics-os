/**
 * Rows land while a search runs and you are at the top (D9 of the answers canvas): what a refresh found is taken in by itself,
 * in the groups it arrives in. The moment you scroll or open a lead they hold still and "3 new" comes back, so nothing moves
 * under your finger, which is what the rule it softens was for (E8).
 *
 * "At the top" is asked of what really scrolls the rows (kit motion/page-scroll.ts): their own box on a desk, the window on a
 * phone, where the rows' box is as tall as what it holds and its own scroll stays at nothing (mobile.css, "The window
 * scrolls"), so it said "at the top" under a reader halfway down. It is asked as the take is decided, and again, with whether
 * a lead is open, as its read lands (surface.ts leadsTakeOffered `still`): what changed meanwhile keeps them offered.
 */
import { useEffect, useRef } from "react";
import { isDocumentScroller, scrollerOf } from "../../kit/motion/page-scroll";

/** How far down the rows may stand and still be at their top. */
const AT_TOP_PX = 8;

/** Whether the reader of `rows` is at their top: asked of the box that scrolls them, or of the window that does. */
function atTopOf(rows: HTMLElement | null): boolean {
  if (!rows) return true;
  const box = scrollerOf(rows, { self: true });
  return (isDocumentScroller(box) ? window.scrollY : box.scrollTop) < AT_TOP_PX;
}

interface RowsLandProps {
  /** How many leads a refresh found and the view holds back. */
  offered: number;
  /** Whether a search is running, finding more. */
  running: boolean;
  /** Whether a lead is open over the rows. */
  open: boolean;
  /** The rows' own box, from which what scrolls them is found. */
  rows: { current: HTMLElement | null } | null;
  /** The take (surface.ts leadsTakeOffered), with what must still hold as its read lands. */
  take: (still: () => boolean) => unknown;
}

/** Takes the leads offered in by itself while a search runs and the reader is at the top with no lead open. */
export function RowsLand({ offered, running, open, rows, take }: RowsLandProps) {
  const openNow = useRef(open);
  useEffect(() => {
    openNow.current = open;
  }, [open]);
  useEffect(() => {
    const here = () => atTopOf(rows?.current ?? null) && !openNow.current;
    if (offered > 0 && running && !open && here()) void take(here);
  }, [offered, running, open, rows, take]);
  return null;
}
