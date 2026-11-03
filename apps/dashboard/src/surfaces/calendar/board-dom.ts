/**
 * What the board asks of the browser (moved from legacy/pages/calendar.jsx, decision 0015): whether the screen is a phone's,
 * where the board opens, and whether a field has the keys. The date picker is the kit's (kit/datepicker), not the
 * browser's.
 */
import { isDocumentScroller, scrollerOf } from "../kit/motion/page-scroll";

/** A phone opens on the agenda: a week grid is four times a phone's width. */
export const crPhone = (): boolean => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);

/** Whether a field has the keys: the board's arrows and T are not the board's while a person is typing. */
export const crTyping = (): boolean => {
  const el = document.activeElement;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      (el as HTMLElement).isContentEditable)
  );
};

/** How far over the board's foot the now line stands to count as shown: its dot's room. */
const CR_NOW_CLEAR = 8;

/** What changed since the page was last drawn: its first draw, the view, the days it shows, or nothing. */
export type DaysChange = "first" | "view" | "days" | null;

/**
 * Where the page stands after a change, the one rule (spec 2026-11-03, a still Calendar on a phone), run in the commit
 * before its paint: on a phone every change is drawn in place (calendar.css, the view holds still), so the page decides.
 * After a new view, or new days in the Agenda or the Month, the days' top is put just under the bar where the page had
 * gone past it; a board (Day, Week) keeps its hours across days, since its heads stick. Then a board that holds today
 * opens at now, once for the view (boardToNow). A desk's views scroll in a box of their own. Says whether the board has
 * opened at now.
 */
export function standAfter(p: {
  /** The view's element, and the bar that sticks over it on a phone. */
  body: Element | null;
  bar: Element | null;
  change: DaysChange;
  /** Whether the view is a board (Day, Week). */
  board: boolean;
  /** Where now stands down a board that holds today, in hours from its top; null where it holds none. */
  nowAt: number | null;
  /** Whether the board has opened at now in this view. */
  opened: boolean;
}): boolean {
  const { body, bar, change, board, nowAt } = p;
  if (!body) return p.opened;
  if (bar && crPhone() && (change === "view" || (change === "days" && !board))) {
    // Where the bar sticks, not where it stands now: near the foot of a shorter page it was pushed up out of its place
    // (10px in WebKit, after the Agenda's next days at y 400), and the days came to rest that much under it.
    const foot = (Number.parseFloat(getComputedStyle(bar).top) || 0) + bar.getBoundingClientRect().height;
    const top = body.getBoundingClientRect().top;
    if (top < foot) window.scrollBy(0, top - foot);
  }
  if (!board || p.opened || nowAt === null) return p.opened;
  const scroller = body.querySelector<HTMLElement>(".cal-scroll");
  if (scroller) boardToNow(scroller, nowAt);
  return true;
}

/**
 * The board opened at now, once for the view (standAfter), on a day it holds today in: where the now line is
 * below what shows, the hour before it is brought to the top. Where the now line already shows, the board stays at its
 * top: put an hour above five-thirty, a board that scrolls a little stopped at its foot with its first hour or two cut
 * off, and read as scrolled by mistake (Ruben's screenshots, 18 Oct 2026). On a desk the board's own box scrolls; on a
 * phone the window does (mobile.css, "The window scrolls"), and the hour is brought under the day heads where they stick.
 */
function boardToNow(el: HTMLElement, nowAt: number): void {
  const grid = el.firstElementChild as HTMLElement;
  const hour = parseFloat(getComputedStyle(grid).getPropertyValue("--cal-hour")) || 64;
  const heads = grid.querySelector<HTMLElement>(".cal-corner")?.offsetHeight ?? 0;
  // A phone's board runs on under the tab bar, the room kept for it at the scroller's foot (mobile.css): a now line
  // under the bar is not shown.
  const bar = crPhone() ? parseFloat(getComputedStyle(el).paddingBottom) || 0 : 0;
  if (!isDocumentScroller(scrollerOf(el, { self: true }))) {
    if (el.scrollHeight <= el.clientHeight + 1) return;
    if (nowAt * hour + CR_NOW_CLEAR <= el.clientHeight - heads - bar) return;
    el.scrollTop = Math.max(0, (nowAt - 1) * hour);
    return;
  }
  const top = grid.getBoundingClientRect().top + window.scrollY;
  if (top + heads + nowAt * hour + CR_NOW_CLEAR <= window.innerHeight - bar) return;
  const corner = grid.querySelector<HTMLElement>(".cal-corner");
  const stuck = corner ? parseFloat(getComputedStyle(corner).top) || 0 : 0;
  window.scrollTo(0, Math.max(0, top + (nowAt - 1) * hour - stuck));
}
