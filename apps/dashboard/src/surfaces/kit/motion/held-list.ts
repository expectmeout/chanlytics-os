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
 *   and the box that scrolls the list and how far, and what the frame's head said over it;
 * - while the row's page stands the list is held: drawn where it stood and out of sight (`data-held`, components.css:
 *   fixed in place, hidden, taking no room and no touch), or, where its page keeps it out of the document (People's tabs,
 *   under React's Activity), stood in for by a still picture of it, made when the phone is idle. The row it was opened
 *   from is drawn as under the finger (`data-hover`) from then until the screen is touched once the list is back, so the
 *   picture shows it as the list will (`pressRow`);
 * - while a thumb carries the row's page away, what lies under it is the whole screen it goes back to, as it will stand
 *   (`showHeld`, `heldUnder`): the list, or its picture, at the rows it was left on, and the frame's chrome over it as the
 *   list had it (Ruben, 20 Oct 2026: the head, the strip of views and the tab bar came in at once as the Back landed).
 *   The frame lets go of none of it while the page is carried (`data-carrying` on the document, mobile.css), its head and
 *   strip draw as they stood as the row opened (the place keeps them, kit/head/standing.ts `headUnder`), its top's height
 *   holds, so the page under the finger never moves (kit/head/frame-top.ts `holdFrameTop`), and all of it comes in with
 *   the list. What the row's page drew in the frame's top for itself (a person's ‹ People and ‹ ›) goes with the page, as a
 *   still copy (`heldAlong`);
 * - in the draw that takes the row's page away, by whatever Back (a thumb, its arrow, Safari's edge, Android's) and before
 *   the first paint, the list is put back with that row where it stood, and kept there for a moment after: whatever is
 *   drawn again above it once the Back has landed (the frame's head naming the page, a strip, a count, a row) is answered
 *   before the paint, as Chromium's scroll anchoring does and Safari's lacks, until the screen is touched (`keepRow`). A
 *   row added above it while away is passed over; with the row gone, the scroll is put back as it was.
 * A list's rows (kit/rows/shown-rows.ts) and its page's place in the tab (People's use-place.ts) hear nothing of the window
 * while it is held, and the page's place is not put back a second time over this one (`heldPutBack`).
 * One list is held at a time: one row's page is on the screen at a time.
 */
import { useLayoutEffect, useRef } from "react";
import { pagesOwnTop } from "../head/frame-head";
import { frameTopsWatched, holdFrameTop, measureFrameTop } from "../head/frame-top";
import { headNow, headUnder, type HeadAt } from "../head/standing";
import { stillCopyOf } from "./leaving";
import { inHeldList, isDocumentScroller, movingScrollerOf } from "./page-scroll";

/** What a row of a list is, to the place: a table's row, a list's item, a listbox's option. */
const ROW = 'tr, li, [role="option"], [role="row"]';
/** How long a still picture of a list kept out of the document waits for the phone to be idle. */
const COPY_WAIT_MS = 1000;
/** The inline styles a held list is given, by the hold and by a thumb's carrying (kit/motion/swipe.ts `under`). */
const HELD_STYLES = ["top", "left", "width", "height", "translate", "opacity", "transition"];
/** The frame's own chrome over every page (its top, the tab bar, Ask's circle), which comes in with the list held under it. */
const CHROME = "[data-chrome]";
/** Over the frame's chrome, as the page carried is (components.css, data-going). */
const ALONG_LAYER = "202";
/** How long a list put back keeps its row where it stood against what is drawn again above it (keepRow). */
const KEEP_MS = 1000;
/** What ends that sooner: the screen touched, a key, a wheel. A scroll is not one: the keeping's own scrolls are scrolls. */
const KEEP_ENDS = ["pointerdown", "keydown", "wheel"] as const;

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
  /** The row under the finger or the pointer: the one whose page is opening. */
  opened: Element | null;
  /** What the frame's head said over it: drawn again under the row's page while a thumb carries that page away. */
  head: HeadAt;
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
/** The list put back in the draw now being made, until that draw is done (cameBack). */
let backNow: Element | null = null;

/** A thumb carrying the row's page away: what stands for the list under it, and the still copies that go with the page. */
interface Carry {
  standIn: HTMLElement;
  along: HTMLElement[];
}

let carrying: Carry | null = null;
/** The keeping of a row put back, to end (keepRow); null with none. */
let keeping: (() => void) | null = null;
/** The row a page was opened from, drawn as under the finger (pressRow); null with none. */
let pressed: Element | null = null;

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

/** The row under the finger or the pointer in the list: on a touch screen, the one a tap last landed on (its :hover stays). */
function rowUnderPointer(list: HTMLElement): Element | null {
  const row = Array.from(list.querySelectorAll(":hover")).at(-1)?.closest(ROW) ?? null;
  return row && list.contains(row) ? row : null;
}

/** The list's place as it stands now, or null where it is not on the screen. */
function listPlace(list: HTMLElement): Place | null {
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
    opened: rowUnderPointer(list),
    head: headNow(),
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
function holdList(place: Place, owner: object): void {
  keeping?.();
  if (holding) letListGo(holding);
  pressRow(place.opened);
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
function letListGo(was: Held): void {
  if (holding === was) {
    holding = null;
    endCarry();
  }
  cancelIdle(was.idle);
  was.copy?.remove();
  const { list } = was.place;
  delete list.dataset.held;
  for (const name of HELD_STYLES) list.style.removeProperty(name);
}

/** The row's page has gone: the list is put back where it stood, before the first paint. */
function putListBack(owner: object): void {
  const was = holding;
  if (!was || was.owner !== owner) return;
  letListGo(was);
  const { list } = was.place;
  if (!list.isConnected || list.getClientRects().length === 0) return;
  placeList(was.place);
  putBack.add(list);
  backNow = list;
  queueMicrotask(() => {
    if (backNow === list) backNow = null;
  });
  keepRow(was.place);
  pressedUntilTouched();
}

/**
 * The row a page is opened from, drawn as under the finger (`data-hover`, clients.css) while the page stands and after it,
 * where a finger's last tap leaves it lit: a still picture of the list keeps it, where it has no :hover of its own, so the
 * row the thumb uncovers is the row it lands on, lit (Ruben, 20 Oct 2026: it lit only once the person had gone). Null lets
 * go of the one drawn so.
 */
function pressRow(row: Element | null): void {
  pressed?.removeAttribute("data-hover");
  pressed = row;
  row?.setAttribute("data-hover", "");
}

/** The row a page was opened from, lit until the screen is touched, a key pressed or a wheel turned, as its :hover is. */
function pressedUntilTouched(): void {
  const row = pressed;
  if (!row) return;
  const off = (): void => {
    if (pressed === row) pressRow(null);
    for (const kind of KEEP_ENDS) window.removeEventListener(kind, off, true);
  };
  for (const kind of KEEP_ENDS) window.addEventListener(kind, off, { capture: true, passive: true });
}

/**
 * The row kept where it stood for a moment after the list is put back. What stands over and above it can be drawn again
 * after the draw that put it back (the frame's head naming the page as the page says so, a strip, a count read again), and
 * the column starts under the frame's top (mobile.css, --frame-top): Chromium keeps the row in view by itself (scroll
 * anchoring), Safari keeps nothing, and on an iPhone the list moved by each change (Ruben, 20 Oct 2026, "a layout shift
 * on the table page when swiping back"). Watched as the list and the top are sized, which is after each is laid out and
 * before the paint, from the first frame on. Ends at the first touch, key or wheel, or once the moment has passed.
 */
function keepRow(place: Place): void {
  keeping?.();
  if (typeof ResizeObserver !== "function") return;
  const watch = new ResizeObserver(() => placeList(place));
  watch.observe(place.list);
  for (const top of frameTopsWatched()) watch.observe(top);
  const end = (): void => {
    if (keeping !== end) return;
    keeping = null;
    watch.disconnect();
    window.clearTimeout(timer);
    for (const kind of KEEP_ENDS) window.removeEventListener(kind, end, true);
  };
  const timer = window.setTimeout(end, KEEP_MS);
  for (const kind of KEEP_ENDS) window.addEventListener(kind, end, { capture: true, passive: true });
  keeping = end;
}

/** The list put where it stood, against the frame's top as it will be painted, not as its observer last measured it. */
function placeList({ list, scroller, row, rowAt, scrolled }: Place): void {
  if (!list.isConnected || list.getClientRects().length === 0) return;
  measureFrameTop();
  if (row && row.isConnected && list.contains(row)) scrollBoxBy(scroller, row.getBoundingClientRect().top - rowAt);
  else scrollBoxTo(scroller, scrolled);
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
function heldStandIn(): HTMLElement | null {
  if (!holding) return null;
  const { list } = holding.place;
  return holding.copy ?? (list.getClientRects().length > 0 ? list : null);
}

/**
 * What lies under the row's page while a thumb carries it away (kit/motion/swipe.ts `under`): what stands for the list,
 * and the frame's chrome drawn over it again; none where nothing is held.
 */
export function heldUnder(): HTMLElement[] {
  const standIn = heldStandIn();
  if (!standIn) return [];
  const chrome = Array.from(document.querySelectorAll<HTMLElement>(CHROME));
  return [standIn, ...chrome.filter((el) => el.getClientRects().length > 0)];
}

/** What goes with the row's page as a thumb carries it away (kit/motion/swipe.ts `along`): what it drew in the frame's top. */
export function heldAlong(): HTMLElement[] {
  return carrying ? carrying.along : [];
}

/** A still copy of what the page drew in the frame's top, laid where it stands, over the head the frame draws again. */
function goesWith(part: HTMLElement): HTMLElement {
  const r = part.getBoundingClientRect();
  const copy = stillCopyOf(part) as HTMLElement;
  Object.assign(copy.style, {
    position: "fixed",
    top: `${r.top}px`,
    left: `${r.left}px`,
    right: "auto",
    width: `${r.width}px`,
    height: `${r.height}px`,
    margin: "0",
    zIndex: ALONG_LAYER,
  });
  (part.closest(CHROME) ?? part).after(copy);
  return copy;
}

/**
 * A thumb is carrying the row's page away (on), or has let it go or settle back (off): the screen it goes back to shows
 * under it (`data-held="shown"`, components.css; `data-carrying`, mobile.css), drawn as the list had it.
 */
export function showHeld(on: boolean): void {
  if (!on) {
    endCarry();
    return;
  }
  const standIn = heldStandIn();
  if (!standIn || carrying || !holding) return;
  // Taken before the frame draws its head again, as the page has it now.
  carrying = { standIn, along: pagesOwnTop().map(goesWith) };
  standIn.dataset.held = "shown";
  holdFrameTop(true);
  document.documentElement.toggleAttribute("data-carrying", true);
  headUnder(holding.place.head);
}

/** The carry over: the frame's chrome is the page's to let go of again, measured, and its head the page's own. */
function endCarry(): void {
  const was = carrying;
  if (!was) return;
  carrying = null;
  if (was.standIn.dataset.held === "shown") was.standIn.dataset.held = "";
  for (const copy of was.along) copy.remove();
  document.documentElement.removeAttribute("data-carrying");
  headUnder(null);
  holdFrameTop(false);
}

/**
 * Whether `el` is in a list held, or being put back where it stood in the draw now being made, for whatever is drawn again
 * as it comes back (React's Activity mounts People's kept scope again, in the draw that puts it back and, in development,
 * once more just after): it is where it was left, as the screen showed it under the row's page, and arrives as nothing
 * new. Asked as often as need be, unlike heldPutBack.
 */
export function cameBack(el: Element | null): boolean {
  return inHeldList(el) || (!!backNow && !!el && backNow.contains(el));
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
    place.current = el ? listPlace(el) : null;
  }
  useLayoutEffect(() => {
    if (held === was.current) return;
    was.current = held;
    if (!held) putListBack(owner.current);
    else if (place.current) holdList(place.current, owner.current);
    place.current = null;
  }, [held]);
  useLayoutEffect(
    () => () => {
      if (holding?.owner !== owner.current) return;
      letListGo(holding);
      pressRow(null);
    },
    [],
  );
}
