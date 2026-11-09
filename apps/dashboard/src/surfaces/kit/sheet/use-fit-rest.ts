/**
 * A sheet's first rest fitted to what it holds (Sheet's `rest.fit`; one sheet, 9 Nov 2026). A sheet with two rests is one
 * height, standing down at half by `--sheet-rest` (kit.css "Two rests", rests.ts): with a fit, that length is worked out from
 * what it holds, so a short job stands short and a long one stands whole, and the pull that moves it is the one the two-rest
 * sheet already has. Worked out as what it holds changes, and as the sheet does (a keyboard rising): written on the element,
 * as the pull's own place is, so the rule moves it on the kit's ease.
 */
import { useCallback, useRef } from "react";

/** The height of everything in the sheet but its body, the foot's margins among it. */
function chromeOf(sheet: HTMLElement, body: HTMLElement): number {
  let around = 0;
  for (const part of sheet.children) {
    if (part === body || !(part instanceof HTMLElement)) continue;
    const style = getComputedStyle(part);
    around += part.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
  }
  return around;
}

/** How tall what the body holds is, measured from its children, since a body with room says only its own height. */
function heldBy(body: HTMLElement): number {
  const style = getComputedStyle(body);
  const pad = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const first = body.firstElementChild;
  const last = body.lastElementChild;
  if (!first || !last) return pad;
  return last.getBoundingClientRect().bottom - first.getBoundingClientRect().top + pad;
}

/** The ref that fits a sheet's first rest: hand it the sheet, and null to stop. */
export function useFitRest(): (sheet: HTMLElement | null) => void {
  const stop = useRef<(() => void) | null>(null);
  return useCallback((sheet: HTMLElement | null) => {
    stop.current?.();
    stop.current = null;
    if (!sheet || typeof ResizeObserver === "undefined") return;
    const body = sheet.querySelector<HTMLElement>(":scope > .rec-sheet-body");
    if (!body) return;
    const fit = () => {
      const left = sheet.offsetHeight - chromeOf(sheet, body) - heldBy(body);
      sheet.style.setProperty("--sheet-rest", `${Math.max(0, Math.round(left))}px`);
    };
    const watching = new ResizeObserver(fit);
    watching.observe(sheet);
    const watchHeld = () => {
      for (const part of body.children) watching.observe(part);
      fit();
    };
    // What it holds comes and goes by the row: each new part is watched as it is drawn.
    const changes = new MutationObserver(watchHeld);
    changes.observe(body, { childList: true });
    watchHeld();
    stop.current = () => {
      watching.disconnect();
      changes.disconnect();
    };
  }, []);
}
