/**
 * A phone's sheet is as tall as what it holds (kit.css, "Sheet"; record.css), so a step, a tab or a fold that changes
 * what it holds changes its height, and the sheet goes there in one move instead of jumping (Ruben, 14 Oct 2026: the
 * fitted sheets). A ResizeObserver hears the new height after layout and before paint, and the web animations API plays
 * from the last height to it and lets go, so the sheet is its own height again at the end: no class, no remount, its
 * scroll and its focus kept.
 *
 * Nothing plays under reduced motion, or where the cap moved with the height (the keyboard rose, --kb): there the sheet
 * follows the keyboard at once. On a desk a sheet is the window's height, so its height never changes and nothing plays.
 * While a box in it is typed in, it does not shrink (a search narrowing its list would pull the box from under the
 * thumb): it holds its height (--sheet-hold, which kit.css and record.css read under the cap) until the box lets go.
 */
import { useCallback, useRef } from "react";

/** How long the height takes to change, on the house's ease-out (tokens.css --ease-out, read off the sheet). */
const GLIDE_MS = 220;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

/** A box a person types in, which holds the sheet's height while it has focus. */
function typingIn(sheet: HTMLElement): boolean {
  const at = document.activeElement;
  if (!at || !sheet.contains(at)) return false;
  if (at.tagName === "TEXTAREA") return true;
  return at.tagName === "INPUT" && !/^(checkbox|radio|button|submit|range)$/.test((at as HTMLInputElement).type);
}

const lessMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Glide this sheet's height as what it holds changes; the function it answers stops it. */
export function glideHeight(sheet: HTMLElement): () => void {
  if (typeof ResizeObserver === "undefined" || typeof sheet.animate !== "function") return () => {};
  let last = sheet.offsetHeight;
  let cap = getComputedStyle(sheet).maxHeight;
  let playing: Animation | null = null;
  const letGo = () => {
    if (sheet.style.getPropertyValue("--sheet-hold")) sheet.style.removeProperty("--sheet-hold");
  };
  const watch = new ResizeObserver(() => {
    if (playing) return;
    const was = last;
    const now = sheet.offsetHeight;
    const capNow = getComputedStyle(sheet).maxHeight;
    const capMoved = capNow !== cap;
    cap = capNow;
    if (Math.abs(now - was) < 2) return;
    if (now < was && !capMoved && typingIn(sheet)) {
      sheet.style.setProperty("--sheet-hold", `${was}px`);
      return;
    }
    last = now;
    if (capMoved || lessMotion()) return;
    const ease = getComputedStyle(sheet).getPropertyValue("--ease-out").trim() || EASE_OUT;
    playing = sheet.animate([{ height: `${was}px` }, { height: `${now}px` }], { duration: GLIDE_MS, easing: ease });
    const done = () => {
      playing = null;
      last = sheet.offsetHeight;
    };
    playing.onfinish = done;
    playing.oncancel = done;
  });
  watch.observe(sheet);
  sheet.addEventListener("focusout", letGo);
  return () => {
    watch.disconnect();
    sheet.removeEventListener("focusout", letGo);
    if (playing) playing.cancel();
  };
}

/** A callback ref that glides the sheet it is given, and stops as React lets go of it. */
export function useHeightGlide(): (el: HTMLElement | null) => void {
  const stop = useRef<(() => void) | null>(null);
  return useCallback((el: HTMLElement | null) => {
    if (stop.current) stop.current();
    stop.current = el ? glideHeight(el) : null;
  }, []);
}
