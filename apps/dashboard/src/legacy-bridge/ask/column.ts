/**
 * The column the Line draws an answer in, measured as a question is sent (contracts AskColumn): an answer already drawn,
 * else the panel less the Line's gutters. A desk's docked panel is 440px and a phone's screen its own width; the Line
 * keeps 16px either side of an answer (measured 18 Oct 2026: 408px on a desk, 358px on a 390px phone). A phone is the
 * takeover's own width, as the three's light reads it (arrival.ts). None where nothing is drawn yet.
 */
import type { AskColumn } from "@chanlytics/contracts";

/** The Line's gutter either side of an answer, in CSS pixels. */
const GUTTER_PX = 16;

const widthOf = (el: Element | null | undefined): number => {
  const w = el ? el.getBoundingClientRect().width : 0;
  return Number.isFinite(w) && w > 0 ? w : 0;
};

export function askColumn(win: Window): AskColumn | null {
  const doc = win.document;
  if (!doc) return null;
  const drawn = widthOf(doc.querySelector('[data-testid="ask-answer"]'));
  const panel = widthOf(doc.querySelector(".ask-real"));
  const px = Math.round(drawn || (panel ? panel - 2 * GUTTER_PX : 0));
  if (px <= 0) return null;
  const phone = typeof win.matchMedia === "function" && win.matchMedia("(max-width: 720px)").matches;
  return { px, phone };
}
