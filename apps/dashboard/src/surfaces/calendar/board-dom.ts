/**
 * What the board asks of the browser (moved from legacy/pages/calendar.jsx, decision 0015): whether the screen is a phone's,
 * what scrolls the board and how much room it has, how tall its hours are (moved from blocks.tsx, which sits at the
 * files-over-800 limit), and whether a field has the keys. The date picker is the kit's
 * (kit/datepicker), not the browser's.
 */
import { useLayoutEffect, useRef, type RefObject } from "react";
import { isDocumentScroller, scrollerOf } from "../kit/motion/page-scroll";
import { fitDeskHourPx, fitHourPx } from "./words";

/** A phone opens on the agenda: a week grid is four times a phone's width. */
export const crPhone = (): boolean => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);

/**
 * Whether the window scrolls the board's box (a phone, mobile.css "The window scrolls": Safari floats its glass toolbar over
 * the document's own scroll alone), rather than the box itself (a desk).
 */
export const windowScrollsBoard = (box: Element): boolean => isDocumentScroller(scrollerOf(box, { self: true }));

/**
 * How tall the board's box may be where the window scrolls it: from its top in the page to the foot of what the window
 * shows now, so a day that fits stands on one screen. The box is as tall as what it holds there, so its own height is
 * no room to fit to.
 */
export const boardRoomInWindow = (box: Element): number =>
  window.innerHeight - (box.getBoundingClientRect().top + window.scrollY);

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

/**
 * The board takes the room the page leaves and the day's hours share it: the hour's height is what fits them there, set on
 * the grid before the first paint and again as the room changes. A phone's is words.ts fitHourPx; a desk's is
 * fitDeskHourPx, the stylesheet's 64px where the day fits at it and never under 48, so a desk's day holds still where it
 * fits. A day that cannot opens at the hour before now on a day it holds today in (CAL-7): the morning a desk scrolled
 * past every time is above it, a scroll away. On a phone the window scrolls the board (mobile.css, "The window
 * scrolls"): the room is what the window shows under the board's top, and the heads stick under the Calendar's bar,
 * which sticks under the frame's top, so the grid is told where (`--cal-heads-at`).
 */
export function useHourFit(
  scroller: RefObject<HTMLDivElement | null>,
  span: number,
  nowAt: number | null,
  /** The day lanes' rows: a lane that comes or goes moves the heads, and the hours share what is left again. */
  laneRows: number,
): void {
  useLayoutEffect(() => {
    const el = scroller.current;
    const grid = el?.firstElementChild as HTMLElement | null | undefined;
    if (!el || !grid) return undefined;
    const page = el.closest(".calendar");
    const fit = () => {
      const box = getComputedStyle(el);
      const heads = grid.querySelector<HTMLElement>(".cal-corner")?.offsetHeight ?? 0;
      const inWindow = windowScrollsBoard(el);
      const tall = inWindow ? boardRoomInWindow(el) : el.clientHeight;
      const room = tall - heads - parseFloat(box.paddingTop) - parseFloat(box.paddingBottom);
      grid.style.setProperty("--cal-hour", `${crPhone() ? fitHourPx(room, span) : fitDeskHourPx(room, span)}px`);
      const bar = inWindow ? page?.querySelector<HTMLElement>(":scope > .cal-head") : null;
      if (bar)
        grid.style.setProperty(
          "--cal-heads-at",
          `${(parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight}px`,
        );
    };
    fit();
    if (typeof ResizeObserver === "undefined") return undefined;
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    // Where the window scrolls it, a notice coming or going over the board moves its top, and so its room.
    if (page) watch.observe(page);
    return () => watch.disconnect();
  }, [scroller, span, laneRows]);
  // Open at now, once for the view: a scroller with room to scroll, whose now line is below what its top shows, is put an
  // hour above the now line. Where the top already shows the now line, it stays at the top: put an hour above five-thirty,
  // a board that scrolls a little stopped at its foot with its first hour or two cut off, and read as scrolled by mistake
  // (Ruben's screenshots, 18 Oct 2026).
  const opened = useRef(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (opened.current || !el || nowAt === null) return;
    opened.current = true;
    const grid = el.firstElementChild as HTMLElement;
    const hour = parseFloat(getComputedStyle(grid).getPropertyValue("--cal-hour")) || 64;
    const heads = grid.querySelector<HTMLElement>(".cal-corner")?.offsetHeight ?? 0;
    // A phone's board runs on under the tab bar, the room kept for it at the scroller's foot (mobile.css): a now line
    // under the bar is not shown.
    const bar = crPhone() ? parseFloat(getComputedStyle(el).paddingBottom) || 0 : 0;
    if (windowScrollsBoard(el)) {
      // The window scrolls the board: the hour before now is brought to the top, under the heads stuck there.
      const top = grid.getBoundingClientRect().top + window.scrollY;
      if (top + heads + nowAt * hour + CR_NOW_CLEAR <= window.innerHeight - bar) return;
      const corner = grid.querySelector<HTMLElement>(".cal-corner");
      const stuck = corner ? parseFloat(getComputedStyle(corner).top) || 0 : 0;
      window.scrollTo(0, Math.max(0, top + (nowAt - 1) * hour - stuck));
      return;
    }
    if (el.scrollHeight <= el.clientHeight + 1) return;
    if (nowAt * hour + CR_NOW_CLEAR <= el.clientHeight - heads - bar) return;
    el.scrollTop = Math.max(0, (nowAt - 1) * hour);
  }, [scroller, nowAt]);
}
