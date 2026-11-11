/**
 * The words of a page's act, as the frame's head draws them beside the row of views (components.css, `.pg-act-fit`): the
 * mark and the first word are kept, and the rest gives way where the row has no room for it. People's scopes say their
 * act with its words on a phone too (Ruben, 7 Oct 2026), and three scopes beside "New proposal" pass a narrow phone's
 * width: there the capsule says "New", "Add" or "Find" beside its mark, and a reader still hears the whole of it.
 *
 * Whether the rest fits is measured (Ruben, 11 Nov 2026: "words when they fit"). It was left to wrap onto a line the
 * capsule did not show, but a capsule whose words wrap keeps the width they asked for: on a phone 360 wide the Pipeline's
 * "+ New" stood in a capsule 124px wide, as Campaigns' had before it said "+ New" alone. So the room beside the row of
 * views is measured, the row's width less any other act standing in it, and where the act's whole words pass it the fit
 * is marked short (`data-short`): the rest is kept for a screen reader only, and the capsule is as wide as its mark and
 * its first word. Measured as the act is drawn, before it is shown, and again as the row, the words or a font change.
 *
 * On a desk, and wherever the row holds it, it draws what the words drew before: the mark, 6px, the words.
 */
import type { ReactNode } from "react";

/** What an act's padding and border take of its width: the room its words must fit inside. */
function chromeOf(act: HTMLElement): number {
  const style = getComputedStyle(act);
  return (
    parseFloat(style.paddingLeft) +
    parseFloat(style.paddingRight) +
    parseFloat(style.borderLeftWidth) +
    parseFloat(style.borderRightWidth)
  );
}

/** The other acts standing in the slot's row beside this one (the page's own in `#pg-act`, and the frame's after it). */
function othersIn(slot: HTMLElement, act: HTMLElement): HTMLElement[] {
  return [...slot.children]
    .flatMap((part) => (part.id === "pg-act" ? [...part.children] : [part]))
    .filter((part): part is HTMLElement => part instanceof HTMLElement && part !== act && part.offsetWidth > 0);
}

/** The room the act has in the slot's row: its width, less the other acts and the gaps beside them. */
function widthLeftIn(slot: HTMLElement, act: HTMLElement): number {
  const style = getComputedStyle(slot);
  const others = othersIn(slot, act);
  const gap = parseFloat(style.columnGap) || 0;
  const taken = others.reduce((sum, part) => sum + part.getBoundingClientRect().width + gap, 0);
  return slot.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - taken;
}

/**
 * A part's own width: drawn, its box; kept for a reader alone (a box one pixel wide), what it holds. A part kept is
 * measured whole, so the act goes back to its words once the room for them comes back.
 */
const partWidth = (part: HTMLElement): number => Math.max(part.getBoundingClientRect().width, part.scrollWidth);

/** Whether the act's whole words pass the room it has: one pixel kept for the two ways a width is rounded. */
function isShort(fit: HTMLElement): boolean {
  const act = fit.parentElement;
  const slot = fit.closest<HTMLElement>(".pg-act-slot");
  const keep = fit.querySelector<HTMLElement>(":scope > .pg-act-keep");
  const rest = fit.querySelector<HTMLElement>(":scope > .pg-act-rest");
  if (!act || !slot || !keep || !rest) return false;
  return chromeOf(act) + partWidth(keep) + partWidth(rest) > widthLeftIn(slot, act) + 1;
}

/**
 * The fit, measured as it is drawn and watched while it stands: the row's slot, the words and the other acts beside it. Its
 * mark is written on the element, as a sheet's fitted rest is (sheet/use-fit-rest.ts), so nothing draws again for it.
 */
function fitWords(fit: HTMLSpanElement | null): (() => void) | undefined {
  if (!fit || typeof ResizeObserver === "undefined") return undefined;
  const slot = fit.closest<HTMLElement>(".pg-act-slot");
  if (!slot || !fit.querySelector(":scope > .pg-act-rest")) return undefined;
  const mark = () => {
    const short = isShort(fit);
    if (short !== fit.hasAttribute("data-short")) fit.toggleAttribute("data-short", short);
  };
  const watching = new ResizeObserver(mark);
  watching.observe(slot);
  for (const part of fit.children) watching.observe(part);
  if (fit.parentElement) for (const other of othersIn(slot, fit.parentElement)) watching.observe(other);
  mark();
  return () => watching.disconnect();
}

/** An act's words, the first kept with its mark and the rest after it, the space between them the rest's own. */
export function ActWords({ icon, words }: { icon?: ReactNode; words: string }) {
  const at = words.indexOf(" ");
  const keep = at < 0 ? words : words.slice(0, at);
  const rest = at < 0 ? "" : words.slice(at);
  return (
    <span className="pg-act-fit" ref={fitWords}>
      <span className="pg-act-keep">
        {icon}
        {keep}
      </span>
      {rest ? <span className="pg-act-rest">{rest}</span> : null}
    </span>
  );
}
