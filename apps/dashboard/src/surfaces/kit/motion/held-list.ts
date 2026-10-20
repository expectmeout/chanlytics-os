/**
 * A list held under what it opened: open a row, come back, and the list is where you left it, the row you were on where
 * it stood (Ruben, 20 Oct 2026: "if users are scrolled down to a specific row when they open the row page they can swipe
 * back to go back exactly where they were", as iMessage does).
 *
 * On a phone the window scrolls the list (mobile.css, "The window scrolls"), and what a row opens takes the window: an open
 * thread holds the page to one screen, so the window's scroll fell to the top, and a person's page is a page of its own,
 * for which People's whole page was taken down. Nothing kept where the list stood. Now:
 * - in the draw that opens the row, while the page still shows the list as it was left (React changes the page only once
 *   that draw is done), the list's place is taken: the row at the top of what shows and where it stood on the screen,
 *   and the box that scrolls the list and how far;
 * - while the row's page stands the list is held: drawn where it stood and out of sight (`data-held`, components.css:
 *   fixed in place, hidden, taking no room and no touch), or, where its page keeps it out of the document (People's tabs,
 *   under React's Activity), stood in for by a still picture of it, made when the phone is idle; a thumb carrying the row's
 *   page away shows either under it (`showHeld`, `heldUnder`), at the rows it was left on;
 * - in the draw that takes the row's page away, by whatever Back (a thumb, its arrow, Safari's edge, Android's) and before
 *   the first paint, the list is put back with that row where it stood. A row added above it while away is passed over;
 *   with the row gone, the scroll is put back as it was.
 * A list's rows (kit/rows/shown-rows.ts) and its page's place in the tab (People's use-place.ts) hear nothing of the window
 * while it is held, and the page's place is not put back a second time over this one (`heldPutBack`).
 * One list is held at a time: one row's page is on the screen at a time.
 */
import { useLayoutEffect, useRef } from "react";
import { measureFrameTop } from "../head/frame-top";
import { stillCopyOf } from "./leaving";
import { isDocumentScroller, movingScrollerOf } from "./page-scroll";

/** What a row of a list is, to the place: a table's row, a list's item, a listbox's option. */
const ROW = 'tr, li, [role="option"], [role="row"]';
/** How long a still picture of a list kept out of the document waits for the phone to be idle. */
const COPY_WAIT_MS = 1000;
/** The inline styles a held list is given, by the hold and by a thumb's carrying (kit/motion/swipe.ts `under`). */
const HELD_STYLES = ["top", "left", "width", "height", "translate", "opacity", "transition"];

/** Where a list stood as its row opened. */
interface Place {
  list: HTMLElement;
  /** The box that scrolls it: the document's scroller on a phone, the table's own on a desk. */
  scroller: HTMLElement;
  /** How far that box was scrolled. */
  scrolled: number;
  /** The row at the top of what showed, and its top on the screen. */
  row: Element | null;
  rowAt: number;
  /** The list's own box on the screen. */
  box: { top: number; left: number; width: number; height: number };
}

/** The list held now, the page that holds it (its useHeldList), and its still picture once made. */
interface Held {
  place: Place;
  owner: object;
  copy: HTMLElement | null;
  idle: number;
}

let holding: Held | null = null;
/** Lists just put back, until their page asks (heldPutBack). */
const putBack = new WeakSet<Element>();

/** Where a box's view of what it scrolls begins on the screen: under what stands over it (its scroll padding). */
function viewTop(scroller: HTMLElement): number {
  const pad = Number.parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0;
  return isDocumentScroller(scroller) ? pad : scroller.getBoundingClientRect().top + pad;
}

/** The row at the top of what shows of the list, or the list's own element there; null where none of it shows. */
function rowAtTop(list: HTMLElement, scroller: HTMLElement): Element | null {
  const box = list.getBoundingClientRect();
  const y = Math.max(box.top, viewTop(scroller)) + 1;
  if (y >= box.bottom || y >= window.innerHeight) return null;
  const hit = document.elementFromPoint(box.left + box.width / 2, y);
  if (!hit || !list.contains(hit)) return null;
  const row = hit.closest(ROW);
  return row && list.contains(row) ? row : hit;
}

/** The list's place as it stands now, or null where it is not on the screen. */
function placeOf(list: HTMLElement): Place | null {
  if (!list.isConnected || list.getClientRects().length === 0) return null;
  const roughly = movingScrollerOf(list.firstElementChild ?? list);
  const row = rowAtTop(list, roughly);
  const scroller = row ? movingScrollerOf(row) : roughly;
  const r = list.getBoundingClientRect();
  return {
    list,
    scroller,
    scrolled: scroller.scrollTop,
    row,
    rowAt: row ? row.getBoundingClientRect().top : 0,
    box: { top: r.top, left: r.left, width: r.width, height: r.height },
  };
}

/** A held list, or its picture, stands where the list stood. */
function standAt(el: HTMLElement, box: Place["box"]): void {
  el.style.top = `${box.top}px`;
  el.style.left = `${box.left}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
}

const touchScreen = (): boolean => !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
const whenIdle = (fn: () => void): number =>
  typeof window.requestIdleCallback === "function"
    ? window.requestIdleCallback(fn, { timeout: COPY_WAIT_MS })
    : window.setTimeout(fn, 0);
const cancelIdle = (id: number): void => {
  if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(id);
  else window.clearTimeout(id);
};

/** A still picture of a list kept out of the document, laid where the list stood, for a thumb to uncover. */
function pictureOf(was: Held): void {
  const { list, box } = was.place;
  if (holding !== was || !list.isConnected) return;
  const copy = stillCopyOf(list) as HTMLElement;
  copy.style.removeProperty("display");
  copy.dataset.held = "";
  standAt(copy, box);
  list.after(copy);
  was.copy = copy;
}

/** The list is held, from the place taken before the row's page was drawn. */
function hold(place: Place, owner: object): void {
  if (holding) letGo(holding);
  const { list } = place;
  const now: Held = { place, owner, copy: null, idle: 0 };
  holding = now;
  putBack.delete(list);
  list.dataset.held = "";
  // Still laid out once marked (the page hides only a list nobody holds): it stands where it was, out of sight. A list its
  // page keeps out of the document is stood in for by a picture, only where a thumb may carry the row's page away.
  if (list.getClientRects().length > 0) standAt(list, place.box);
  else if (touchScreen()) now.idle = whenIdle(() => pictureOf(now));
  // The row's page starts at its top where the window scrolls it, as a page arriving does (view-deck.ts toTop).
  if (isDocumentScroller(place.scroller) && window.scrollY > 0) window.scrollTo(0, 0);
}

/** Let go of a held list as it is, putting nothing back. */
function letGo(was: Held): void {
  if (holding === was) holding = null;
  cancelIdle(was.idle);
  was.copy?.remove();
  const { list } = was.place;
  delete list.dataset.held;
  for (const name of HELD_STYLES) list.style.removeProperty(name);
}

/** The row's page has gone: the list is put back where it stood, before the first paint. */
function release(owner: object): void {
  const was = holding;
  if (!was || was.owner !== owner) return;
  letGo(was);
  const { list, scroller, row, rowAt, scrolled } = was.place;
  if (!list.isConnected || list.getClientRects().length === 0) return;
  // Placed against the frame's top as it will be painted, not as its observer last measured it.
  measureFrameTop();
  if (row && row.isConnected && list.contains(row)) scrollBoxBy(scroller, row.getBoundingClientRect().top - rowAt);
  else scrollBoxTo(scroller, scrolled);
  putBack.add(list);
}

function scrollBoxBy(scroller: HTMLElement, by: number): void {
  if (Math.abs(by) < 0.5) return;
  if (isDocumentScroller(scroller)) window.scrollBy(0, by);
  else scroller.scrollTop += by;
}
function scrollBoxTo(scroller: HTMLElement, top: number): void {
  if (isDocumentScroller(scroller)) window.scrollTo(0, top);
  else scroller.scrollTop = top;
}

/** What stands for the held list on the screen: the list itself where it is laid out, else its picture; null with none. */
export function heldUnder(): HTMLElement | null {
  if (!holding) return null;
  const { list } = holding.place;
  return holding.copy ?? (list.getClientRects().length > 0 ? list : null);
}

/**
 * A thumb is carrying the row's page away (on), or has let it settle back (off): what stands for the list shows under it
 * (`data-held="shown"`, components.css).
 */
export function showHeld(on: boolean): void {
  const el = heldUnder();
  if (el) el.dataset.held = on ? "shown" : "";
}

/**
 * Whether the list `el` is in was just put back where it stood (useHeldList), asked once by the page that keeps its own
 * place in the tab (People's use-place.ts), which then puts back nothing over it.
 */
export function heldPutBack(el: Element | null): boolean {
  for (let n = el; n; n = n.parentElement) {
    if (putBack.has(n)) {
      putBack.delete(n);
      return true;
    }
  }
  return false;
}

/**
 * A list held under the row's page it opens, while `held`, and put back in the draw that ends it: called by the page that
 * draws both, with the list as it stands on the screen. The place is read as the draw that opens the row's page is made,
 * since React gives a function no moment between that draw and its change to the page (a class's snapshot); a draw it
 * throws away only reads again.
 */
export function useHeldList(held: boolean, list: () => HTMLElement | null): void {
  const owner = useRef<object>({});
  const was = useRef(held);
  const place = useRef<Place | null>(null);
  if (held && !was.current) {
    const el = list();
    place.current = el ? placeOf(el) : null;
  }
  useLayoutEffect(() => {
    if (held === was.current) return;
    was.current = held;
    if (!held) release(owner.current);
    else if (place.current) hold(place.current, owner.current);
    place.current = null;
  }, [held]);
  useLayoutEffect(
    () => () => {
      if (holding?.owner === owner.current) letGo(holding);
    },
    [],
  );
}
