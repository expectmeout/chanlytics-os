/**
 * The strip's highlight in motion (kit.css `.stabs-pill`; docs/superpowers/specs/2026-10-08-one-motion-for-every-strip-design.md).
 *
 * At rest the picked tab draws its own fill, by a class, with nothing measured. While a view changes, one element is
 * carried from the tab lit to the tab picked, and the strip says so (`data-glide`), which clears the tab's own. It moves
 * by `transform` alone, so the compositor carries it through the frame the next page renders in, and on the page's own
 * timeline (kit/motion/view-deck.ts `Move.follow`), so the two cannot part. It was a pseudo-element placed by two custom
 * properties and eased by `width`, from two functions with two clocks: it glided on a tap, jumped in one frame on every
 * swipe, stalled while the page rendered, and stood under the first tab while a second press lit another (8 Oct 2026).
 *
 * The element is a fixed width the stylesheet gives it, scaled across to a tab's; its corners are set against that
 * scale in an animation of their own, so the ends stay round at any width and never take the compositor's work.
 */
import type { Follow } from "../motion/view-deck";

/** The highlight's own width in the stylesheet, which a glide scales to a tab's. */
export const PILL_BASE = 100;
/** How far clear of the strip's edge a picked tab is brought, in pixels. */
const CLEAR = 16;

/** A tab, as far as its place in the strip goes. */
interface Place {
  offsetLeft: number;
  offsetWidth: number;
}

const between = (a: number, b: number, share: number) => a + (b - a) * share;
const pillShape = (x: number, width: number) => `translate3d(${x}px, 0, 0) scaleX(${width / PILL_BASE})`;
const corners = (width: number, radius: number) => `${radius / (width / PILL_BASE)}px / ${radius}px`;
/** The highlight: a strip's own, or the tab bar's lozenge, which is carried the same way (../tab-bar/tab-bar.tsx). */
const pillOf = (strip: Element) =>
  strip.querySelector<HTMLElement>(".stabs-pill") ?? strip.querySelector<HTMLElement>(".tab-bar-pill");

/** The glide a strip is in: its animations, which a newer glide replaces and only its own end clears. */
const gliding = new WeakMap<Element, Animation[]>();

/** The highlight, back to nothing: the picked tab draws its own again. */
function rest(strip: Element): void {
  for (const anim of gliding.get(strip) ?? []) anim.cancel();
  gliding.delete(strip);
  strip.removeAttribute("data-glide");
  const pill = pillOf(strip);
  if (!pill) return;
  pill.style.transform = "";
  pill.style.borderRadius = "";
}

/** Where the highlight is drawn now, in the strip's own measure: part way through a glide, or under a finger. */
function drawnAt(strip: Element, pill: Element): Place {
  const box = pill.getBoundingClientRect();
  const within = strip.getBoundingClientRect();
  return { offsetLeft: box.left - within.left + strip.scrollLeft - strip.clientLeft, offsetWidth: box.width };
}

/** Animate the highlight between two places as `follow` goes, and rest when it ends unless a newer glide has begun. */
function carry(
  strip: Element,
  pill: HTMLElement,
  follow: Follow,
  place: (share: number) => { x: number; width: number },
): void {
  const radius = pill.offsetHeight / 2;
  const made = [
    follow.follow(pill, (share) => {
      const at = place(share);
      return { transform: pillShape(at.x, at.width) };
    }),
    follow.follow(pill, (share) => ({ borderRadius: corners(place(share).width, radius) })),
  ].filter((anim): anim is Animation => anim !== null);
  gliding.set(strip, made);
  const done = () => {
    if (gliding.get(strip) === made) rest(strip);
  };
  const [lead] = made;
  if (lead) lead.finished.then(done, done);
  else done();
}

/** A strip wider than its place: how far it is scrolled when `tab` stands a step clear of its edges, or null as it is. */
function scrollFor(strip: Element, tab: Place): number | null {
  if (strip.scrollWidth <= strip.clientWidth) return null;
  const start = tab.offsetLeft - CLEAR;
  const end = tab.offsetLeft + tab.offsetWidth + CLEAR;
  if (start < strip.scrollLeft) return Math.max(0, start);
  if (end > strip.scrollLeft + strip.clientWidth) return end - strip.clientWidth;
  return null;
}

/**
 * The view picked is brought into a strip wider than its place (Reports' lenses on a phone), at once: for a strip
 * drawn at rest. Reviews stood past the screen's edge with the strip at its start, so the page said nothing of which
 * view it was (6 Oct 2026).
 */
export function showPicked(strip: Element | null): void {
  if (!strip || gliding.has(strip)) return;
  const tab = strip.querySelector<HTMLElement>(".stabs-tab.active");
  const left = tab ? scrollFor(strip, tab) : null;
  if (left !== null) strip.scrollLeft = left;
}

/**
 * A press: the highlight goes from the tab lit (or from where it is, part way through another change) to the tab
 * pressed, on the change's own timeline, and the strip scrolls with it. With no change to follow (reduced motion, no
 * page to move) nothing glides, and the tab's class lights it. The tab bar's lozenge goes the same way, on a timeline of
 * its own (motion/view-deck.ts `alone`).
 */
export function glideTo(strip: HTMLElement, from: Place, to: Place, move: Follow | null): void {
  const pill = pillOf(strip);
  if (!pill || !move) return;
  const began = strip.hasAttribute("data-glide") ? drawnAt(strip, pill) : from;
  for (const anim of gliding.get(strip) ?? []) anim.cancel();
  strip.setAttribute("data-glide", "");
  pill.style.transform = "";
  pill.style.borderRadius = "";
  // The change may begin part way (a page a finger had carried): the highlight covers what is left of it.
  let first: number | null = null;
  carry(strip, pill, move, (share) => {
    first ??= share;
    const left = first >= 1 ? 1 : (share - first) / (1 - first);
    return {
      x: between(began.offsetLeft, to.offsetLeft, left),
      width: between(began.offsetWidth, to.offsetWidth, left),
    };
  });
  const scroll = scrollFor(strip, to);
  if (scroll !== null) strip.scrollTo({ left: scroll, behavior: "smooth" });
}

/** A finger carries the page: the highlight is that share of the way from the tab lit to the one the page goes to. */
export function glideDrag(strip: HTMLElement, from: Place, to: Place, share: number): void {
  const pill = pillOf(strip);
  if (!pill) return;
  for (const anim of gliding.get(strip) ?? []) anim.cancel();
  gliding.delete(strip);
  strip.setAttribute("data-glide", "");
  const width = between(from.offsetWidth, to.offsetWidth, share);
  pill.style.transform = pillShape(between(from.offsetLeft, to.offsetLeft, share), width);
  pill.style.borderRadius = corners(width, pill.offsetHeight / 2);
}

/** The finger let go short: the highlight goes back as the page does, or at once where nothing moves back. */
export function glideHome(strip: HTMLElement, from: Place, to: Place, back: Follow | null): void {
  const pill = pillOf(strip);
  if (!pill || !back) {
    rest(strip);
    return;
  }
  pill.style.transform = "";
  pill.style.borderRadius = "";
  carry(strip, pill, back, (share) => ({
    x: between(from.offsetLeft, to.offsetLeft, share),
    width: between(from.offsetWidth, to.offsetWidth, share),
  }));
}
