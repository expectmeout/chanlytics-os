/**
 * An arc (Today, calm, 19 Nov 2026, D9): a thing goes from one box to another along a curve, not a line, the way a thrown
 * thing goes. Across and up each have their own movement, on two nested elements, so each has its own curve: up first and
 * then across (`rise`), or across first and then down (`fall`, the same path back). Transforms only, which the compositor
 * runs; nothing plays under reduced motion. Resolves as it lands.
 *
 * `outer` holds `inner`, and both stand where the thing lands; `from` is the box it leaves, `to` the box it lands in (the
 * outer's own, read by whoever calls). The inner scales about its centre, so the boxes are matched centre to centre.
 */
export type ArcWay = "rise" | "fall";

const OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";

/** A box as an arc reads it: where it stands and how large. */
export type ArcBox = Pick<DOMRect, "left" | "top" | "width" | "height">;

/** How large the thing is as it leaves, against how large it lands: the boxes' own widths, unless the caller says. */
export function flyArc(
  outer: HTMLElement,
  inner: HTMLElement,
  from: ArcBox,
  to: ArcBox,
  how: { ms: number; way: ArcWay; scale?: number },
): Promise<void> {
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still || typeof outer.animate !== "function" || typeof inner.animate !== "function") return Promise.resolve();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const scale = how.scale ?? (to.width ? from.width / to.width : 1);
  const rise = how.way === "rise";
  const across = outer.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], {
    duration: how.ms,
    easing: rise ? IN_OUT : OUT,
  });
  const up = inner.animate([{ transform: `translateY(${dy}px) scale(${scale})` }, { transform: "none" }], {
    duration: how.ms,
    easing: rise ? OUT : IN_OUT,
  });
  return Promise.all([across.finished, up.finished]).then(
    () => undefined,
    () => undefined,
  );
}
