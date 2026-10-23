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
 * - on a phone the row's page is pushed in over the list as iOS pushes a page (`Arrival`, kit/motion/swipe.ts `pushIn`):
 *   the swipe back played forward, over the same screen a thumb would uncover;
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
 *   row added above it while away is passed over; with the row gone, the scroll is put back as it was. A list nothing
 *   held, whose row's page stood from its first draw (an address opened it), lands at its top (`listAtItsTop`).
 * A list's rows (kit/rows/shown-rows.ts) and its page's place in the tab (People's use-place.ts) hear nothing of the window
 * while it is held, and the page's place is not put back a second time over this one (`heldPutBack`).
 * One list is held at a time: one row's page is on the screen at a time.
 */
import { useLayoutEffect, useRef } from "react";
import { pagesOwnTop } from "../head/frame-head";
import { frameTopsWatched, holdFrameTop, measureFrameTop } from "../head/frame-top";
import { headNow, headUnder, type HeadAt } from "../head/standing";
import { stillCopyOf } from "./leaving";
import {
  clearOfFoot,
  inHeldList,
  isDocumentScroller,
  movingScrollerOf,
  ROW,
  rowsBeginAt,
  viewTop,
} from "./page-scroll";
import { motionReduced, pushIn } from "./swipe";

/** How long a still picture of a list kept out of the document waits for the phone to be idle. */
const COPY_WAIT_MS = 1000;
/** The inline styles a held list is given, by the hold and by a thumb's carrying (kit/motion/swipe.ts `under`). */
const HELD_STYLES = ["top", "left", "width", "height", "translate", "opacity", "transition", "clip-path"];
/** The frame's own chrome over every page (its top, the tab bar, Ask's circle), which comes in with the list held under it. */
const CHROME = "[data-chrome]";
/**
 * Over the page carried (202, components.css data-going) and the sheet of ground it slides over (201, .carry-ground):
 * a page scrolled down passes under the top, and drew over what went with it as it moved.
 */
const ALONG_LAYER = "204";
/** The frames the screen draws of a list put back, hidden under its picture, before the two change places (coverLanding). */
const COVER_FRAMES = 2;
/** How long a list put back keeps its row where it stood against what is drawn again above it (keepRow). */
const KEEP_MS = 1000;
/** What ends that sooner: the screen touched, a key, a wheel. A scroll is not one: the keeping's own scrolls are scrolls. */
const KEEP_ENDS = ["pointerdown", "keydown", "wheel"] as const;
/**
 * How long a row tapped may take to open its page before the list's entry asks the browser for nothing again
 * (restoredBack): a press waits up to PUSH_WAIT_MS for a page the tab has not read.
 */
const MARK_MS = 1000;

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
  /** Where the box's view began on the screen, under the frame's top as it stood (viewTop). */
  topAt: number;
  /** How far the box scrolls before the list's first row reaches that view (rowsBeginAt); null with no row drawn. */
  rowsBegin: number | null;
  /** The list's own box on the screen. */
  box: { top: number; left: number; width: number; height: number };
  /** The row under the finger or the pointer: the one whose page is opening. */
  opened: Element | null;
  /** What the frame's head said over it: drawn again under the row's page while a thumb carries that page away. */
  head: HeadAt;
}

/** The list held now, the page that holds it (its useHeldList), its still picture once made, and the page pushed in. */
interface Held {
  place: Place;
  owner: object;
  copy: HTMLElement | null;
  idle: number;
  pushed: HTMLElement | null;
}

/**
 * How the row's page comes in over the list it was opened from (useHeldList): the element a thumb carries back, and its
 * swipe's mark while it moves (its `onGrab`: `carriedOver`, a thread's ixGoing).
 */
export interface Arrival {
  page: () => HTMLElement | null;
  going: (el: Element, on: boolean) => void;
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
/** The address a row was tapped at, while that list's entry asks the browser to put its scroll back (restoredBack). */
let markedAt: string | null = null;

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
    topAt: viewTop(scroller),
    rowsBegin: rowsBeginAt(list, scroller),
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

/** Whether a row's page is pushed in over a list `scroller` scrolls: the window, on a phone, with motion not reduced. */
const pushesOverBox = (scroller: HTMLElement): boolean => isDocumentScroller(scroller) && !motionReduced();

/**
 * How long a press on a phone waits for a row's page the tab has not read, where it would be pushed in (pushesOver), so
 * the page the push takes is drawn whole: a person (people-route.tsx openPerson), a sequence (campaigns' list.tsx).
 */
export const PUSH_WAIT_MS = 300;

/**
 * Whether a row's page opened from `list` now would be pushed in over it (holdList): what a press may wait for, so the
 * page is drawn whole as the push takes it (people-route.tsx openPerson, campaigns' list.tsx openRecord).
 */
export function pushesOver(list: HTMLElement | null): boolean {
  const place = list ? listPlace(list) : null;
  return !!place && pushesOverBox(place.scroller);
}

/** A still picture of `list` as it stands, laid at `box` beside it and out of sight (`data-held`) until shown. */
function pictureAt(list: HTMLElement, box: Place["box"]): HTMLElement {
  const copy = stillCopyOf(list) as HTMLElement;
  copy.style.removeProperty("display");
  copy.dataset.held = "";
  standAt(copy, box);
  list.after(copy);
  return copy;
}

/** A still picture of a list kept out of the document, laid where the list stood, for a thumb to uncover. */
function pictureOf(was: Held): void {
  const { list, box } = was.place;
  if (holding !== was || !list.isConnected) return;
  was.copy = pictureAt(list, box);
}

/** The list is held, from the place taken before the row's page was drawn. */
function holdList(place: Place, owner: object, arrival: Arrival | null): void {
  keeping?.();
  if (holding) letListGo(holding);
  pressRow(place.opened);
  const { list } = place;
  const now: Held = { place, owner, copy: null, idle: 0, pushed: null };
  holding = now;
  putBack.delete(list);
  list.dataset.held = "";
  // Where the window scrolls the list (a phone), the row's page is pushed in over it, and what it comes in over is drawn now.
  const page = arrival && pushesOverBox(place.scroller) ? arrival.page() : null;
  // Still laid out once marked (the page hides only a list nobody holds): it stands where it was, out of sight. A list its
  // page keeps out of the document is stood in for by a picture, only where a thumb may carry the row's page away.
  if (list.getClientRects().length > 0) standAt(list, place.box);
  else if (page) pictureOf(now);
  else if (touchScreen()) now.idle = whenIdle(() => pictureOf(now));
  // The row's page starts at its top where the window scrolls it, as a page arriving does (view-deck.ts toTop).
  if (isDocumentScroller(place.scroller) && window.scrollY > 0) window.scrollTo(0, 0);
  if (page && arrival) pushOver(now, page, arrival);
  // The row's page's own entry asks the browser for nothing, as every page's does: what is pushed from it inherits that.
  if (markedAt !== null && window.location.href !== markedAt) browserPutsBack(false);
  markedAt = null;
}

/** Whether the browser puts back the window's scroll on a Back to the history entry the window stands at. */
function browserPutsBack(on: boolean): void {
  const history = window.history as History | undefined;
  if (history && "scrollRestoration" in history) history.scrollRestoration = on ? "auto" : "manual";
}

/**
 * A row tapped in a list the window scrolls: the list's own history entry asks the browser to put its scroll back on the
 * Back from the row's page, by the browser's own hand. On an iPhone the window's scroll is Safari's, and after a swipe
 * back it took none of the page's (Ruben, 23 Oct 2026, the iPhone's logs): a list put at its top by the draw that brought
 * it back, which the page then believed, stood where the row's page had left the window, 40px down at a thread's foot (the
 * room of Safari's toolbar on a short page, mobile.css 100lvh), until a finger touched it 19 seconds on; asked again for
 * its top every frame for half a second, and again from 0.7 to 4.5 seconds on, it answered 40 each time. Its own way
 * back, asked of the list's entry, put Conversations' list at its top from the first frame, on every Back from a short
 * thread and a long one. Every other entry asks for nothing (view-deck.ts toTop): the row's page's once it stands
 * (holdList), and the list's again once it is back (putListBack, listAtItsTop), or once the tap has opened nothing. A
 * desk's list scrolls in a box of its own, which the page puts back itself.
 */
function restoredBack(e: Event, list: HTMLElement | null): void {
  const at = e.target as Element | null;
  if (!list || !at || typeof at.closest !== "function") return;
  const row = at.closest(ROW);
  if (!row || !list.contains(row) || !isDocumentScroller(movingScrollerOf(row))) return;
  browserPutsBack(true);
  const here = window.location.href;
  markedAt = here;
  window.setTimeout(() => {
    if (markedAt !== here) return;
    markedAt = null;
    if (window.location.href === here) browserPutsBack(false);
  }, MARK_MS);
}

/**
 * The list's own entry asks the browser for nothing again (restoredBack), in a task after the Back's: the browser read it
 * in that one, after the Back's popstate, and a draw made at once from that event would otherwise ask too soon.
 */
function backAsked(): void {
  window.setTimeout(() => browserPutsBack(false), 0);
}

/**
 * The row's page pushed in over the list it was opened from (swipe.ts pushIn), marked so that no entrance of its own plays
 * as well (`data-pushed`: a thread's thread-in, a person's route-in), and moved once React is done with this draw and the
 * frame's head over the page (the page's own way back, which comes in with it), before the paint.
 */
function pushOver(was: Held, page: HTMLElement, arrival: Arrival): void {
  page.setAttribute("data-pushed", "");
  was.pushed = page;
  queueMicrotask(() => {
    if (holding === was && page.isConnected)
      pushIn(page, { onGrab: arrival.going, under: heldUnder, along: heldAlong });
  });
}

/** Let go of a held list as it is, putting nothing back. */
function letListGo(was: Held): void {
  if (holding === was) {
    holding = null;
    endCarry();
  }
  cancelIdle(was.idle);
  was.copy?.remove();
  was.pushed?.removeAttribute("data-pushed");
  const { list } = was.place;
  delete list.dataset.held;
  for (const name of HELD_STYLES) list.style.removeProperty(name);
}

/**
 * The row's page has gone: the list is put back where it stood, before the first paint. Answers whether `owner` held one,
 * which is let go whether or not it is on the screen to be put back.
 */
function putListBack(owner: object): boolean {
  const was = holding;
  if (!was || was.owner !== owner) return false;
  const cover = isDocumentScroller(was.place.scroller) ? coverOf(was) : null;
  if (isDocumentScroller(was.place.scroller)) backAsked();
  letListGo(was);
  const { list } = was.place;
  if (!list.isConnected || list.getClientRects().length === 0) {
    cover?.remove();
    return true;
  }
  if (cover) coverLanding(cover, list);
  placeList(was.place);
  putBack.add(list);
  backNow = list;
  queueMicrotask(() => {
    if (backNow === list) backNow = null;
  });
  keepRow(was.place);
  pressedUntilTouched();
  return true;
}

/**
 * A list nothing held as its row's page goes lands at its top, where the window scrolls it. That page stood from the
 * list's first draw (an address opened it: a refresh in it, a link from Today or the bell; or the list was drawn again
 * under it), so the list was never on the screen and has no place but its top, as a page arriving has (view-deck.ts
 * toTop). Left where the row's page had the window, it stood at that page's foot: an open thread follows its newest
 * message down the window, which on an iPhone always has the room of Safari's toolbar to scroll (mobile.css, 100lvh), and
 * Conversations came back with its channels under the frame's top (Ruben, 22 Oct 2026). A page that keeps its own place
 * (People's use-place.ts) puts it back after this, as it does on any arrival. A box of its own (a desk's) is left alone.
 * The frame's top is measured as it will be painted, as for a list put back (placeList): the row's page drew none, and the
 * list's head stood under the top it came back to until the top's observer next reported.
 */
function listAtItsTop(list: HTMLElement | null): void {
  const place = list ? listPlace(list) : null;
  if (!place || !isDocumentScroller(place.scroller)) return;
  backAsked();
  measureFrameTop();
  if (place.scrolled > 0) scrollBoxTo(place.scroller, 0);
}

/**
 * The picture a list put back where the window scrolls it comes back under (coverLanding): the one that stood in for it,
 * kept from being let go, or one taken of it now, as it stands where it was left; with nothing of a thumb's carrying on it.
 */
function coverOf(was: Held): HTMLElement | null {
  const { list, box } = was.place;
  const laidOut = list.isConnected && list.getClientRects().length > 0;
  const cover = was.copy ?? (laidOut ? pictureAt(list, box) : null);
  was.copy = null;
  for (const name of ["translate", "opacity", "transition"]) cover?.style.removeProperty(name);
  return cover;
}

/**
 * A list put back where the window scrolls it comes back hidden under a picture of it, standing where it was left, until
 * the screen has drawn it there; then the two change places in one frame. The window jumps as the list comes back (an open
 * thread held the page to one screen, a person's page was its own length), and an iPhone draws the window's new place a
 * frame after the jump, where it had not drawn it before: the list stood blank for that frame under the frame's head, strip
 * and tab bar, or the foot of it did (Ruben, 20 Oct 2026). The picture is fixed to the screen, drawn wherever the window is.
 */
function coverLanding(cover: HTMLElement, list: HTMLElement): void {
  cover.dataset.held = "shown";
  cover.style.clipPath = clearOfFoot(cover.getBoundingClientRect().bottom);
  list.style.visibility = "hidden";
  const uncover = (): void => {
    list.style.removeProperty("visibility");
    cover.remove();
  };
  if (typeof window.requestAnimationFrame !== "function") {
    uncover();
    return;
  }
  let frames = COVER_FRAMES;
  const next = (): void => {
    frames -= 1;
    if (frames > 0) window.requestAnimationFrame(next);
    else uncover();
  };
  window.requestAnimationFrame(next);
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

/**
 * The list put where it stood, against the frame's top as it will be painted, not as its observer last measured it. A list
 * left at its top lands at its top: whatever grew over it while the row's page stood (a line in the frame's top saying a
 * newer version is ready, a call's bar, a row added above) is drawn in its own room, and the list's head stays in view.
 * Held to the row you were on instead, the list was scrolled by the growth to keep that row still, and its head went under
 * the frame's top: Conversations came back with its channels hidden, and stayed so once the line had gone (Ruben, 22 Oct
 * 2026). So does a list scrolled short of its rows, its head part under the top (a thumb's short swipe that tucks Safari's
 * toolbar leaves it so): it came back so, the head under the top, as a refresh puts its place back at its top (People's
 * scroller.ts keptTop). Only a list scrolled into its rows keeps the row where it stood, since there the rows are what you
 * were looking at, and it keeps it as far under the frame's top as it stood: what grew over the list takes its own room
 * there too. A top shorter than it stood (one drawn again a moment after the landing) still holds the row where it stood on
 * the screen, until it is whole again.
 */
function placeList({ list, scroller, row, rowAt, scrolled, topAt, rowsBegin }: Place): void {
  if (!list.isConnected || list.getClientRects().length === 0) return;
  measureFrameTop();
  if (scrolled === 0 || (rowsBegin !== null && scrolled < rowsBegin)) scrollBoxTo(scroller, 0);
  else if (row && row.isConnected && list.contains(row)) {
    const grown = Math.max(0, viewTop(scroller) - topAt);
    scrollBoxBy(scroller, row.getBoundingClientRect().top - rowAt - grown);
  } else scrollBoxTo(scroller, scrolled);
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

/**
 * The sheet of ground the page slides over while it is carried (components.css .carry-ground): the window's own picture
 * of the page's light, fixed to the window and moved with the page, so the page, which wears no ground of its own, covers
 * the list and the head drawn again under it, and uncovers them as it goes, and lands on the light it carried to the
 * pixel; what the page drew in the top goes over it, as an iOS bar crosses with its page. It was a band as tall as the
 * frame's top, with the page laying the rest of its ground itself, offset by a measure of where it stood that was read a
 * microtask before the frame's top was measured for it: a thread pushed in opened without its light (Ruben, 22 Oct 2026).
 */
function groundOver(): HTMLElement {
  const sheet = document.createElement("div");
  sheet.className = "carry-ground";
  sheet.setAttribute("aria-hidden", "true");
  document.body.append(sheet);
  return sheet;
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
 * A page carried over the list held under it, by a thumb or as it is pushed in (its swipe's `onGrab`): it wears
 * `data-going` (its place over the list, clients.css) and the screen it goes back to shows under it, with the sheet of
 * ground it slides over (showHeld).
 */
export function carriedOver(el: Element, on: boolean): void {
  el.toggleAttribute("data-going", on);
  showHeld(on);
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
  carrying = { standIn, along: [groundOver(), ...pagesOwnTop().map(goesWith)] };
  standIn.dataset.held = "shown";
  holdFrameTop(true);
  document.documentElement.toggleAttribute("data-carrying", true);
  headUnder(holding.place.head);
  // Cut where the frame's top, drawn again over it, ends: what of the list stood under the top was hidden by its ground,
  // and both are dimmed as the page covers them, so the list's head scrolled under the top read through the frame's
  // (Campaigns' search and first row through its name and strip, 22 Oct 2026).
  const box = standIn.getBoundingClientRect();
  const end = frameTopEnd();
  standIn.style.clipPath = clearOfFoot(box.bottom, end > 0 ? end - box.top : 0);
}

/** Where the frame's top ends on the screen as it is drawn now; 0 with none (a desk, where it is no box). */
function frameTopEnd(): number {
  return Math.max(0, ...frameTopsWatched().map((top) => top.getBoundingClientRect().bottom));
}

/** The carry over: the frame's chrome is the page's to let go of again, measured, and its head the page's own. */
function endCarry(): void {
  const was = carrying;
  if (!was) return;
  carrying = null;
  if (was.standIn.dataset.held === "shown") was.standIn.dataset.held = "";
  was.standIn.style.clipPath = "";
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
 * draws both, with the list as it stands on the screen, and how the row's page comes in over it (`arrival`). The place is
 * read as the draw that opens the row's page is made, since React gives a function no moment between that draw and its
 * change to the page (a class's snapshot); a draw it throws away only reads again. Answers whether this draw opens the
 * row's page over the list on the screen (a person's page fades in over it on a desk): the same for every draw React makes
 * of it, since nothing it reads changes before the draw is done.
 */
export function useHeldList(held: boolean, list: () => HTMLElement | null, arrival?: Arrival): boolean {
  const owner = useRef<object>({});
  const was = useRef(held);
  const place = useRef<Place | null>(null);
  const comes = useRef<Arrival | null>(null);
  const shown = useRef(list);
  const opening = held && !was.current;
  if (opening) {
    const el = list();
    place.current = el ? listPlace(el) : null;
  }
  useLayoutEffect(() => {
    comes.current = arrival ?? null;
    shown.current = list;
  });
  useLayoutEffect(() => {
    if (held === was.current) return;
    was.current = held;
    if (!held) {
      if (!putListBack(owner.current)) listAtItsTop(shown.current());
    } else if (place.current) holdList(place.current, owner.current, comes.current);
    place.current = null;
  }, [held]);
  // A row tapped while the list stands has its entry ask the browser to put its scroll back on the Back (restoredBack).
  useLayoutEffect(() => {
    if (held) return undefined;
    const tapped = (e: Event): void => restoredBack(e, shown.current());
    window.addEventListener("click", tapped, true);
    return () => window.removeEventListener("click", tapped, true);
  }, [held]);
  useLayoutEffect(
    () => () => {
      if (holding?.owner !== owner.current) return;
      letListGo(holding);
      pressRow(null);
    },
    [],
  );
  return opening && place.current !== null;
}
