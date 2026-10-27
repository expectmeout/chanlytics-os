/**
 * A count that grows on screen as it is read again glides to its new value instead of jumping (Ruben, 27 Oct 2026: the
 * Brought in card's "214 emails so far" leapt by a hundred on each read). The first value is drawn as it is; a change
 * after it counts from what is shown to the new value over GLIDE_MS on the house's ease-out, a frame at a time, and is
 * whole numbers throughout. A change during a glide carries on from where the count stands.
 *
 * Where the glide starts is state set as the component draws, from the value it is given (React's own way to keep what
 * an earlier draw held), so the count is never drawn at its new value before it glides there; the frames are asked for
 * from an effect. Nothing glides under reduced motion, where there is no frame to ask for (a server's draw, a test's
 * stub), or for a count that falls.
 */
import { useEffect, useState } from "react";

/** How long a count takes to reach its new value. */
const GLIDE_MS = 600;

/** The house's ease-out (tokens.css --ease-out), as a curve over 0..1. */
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

const lessMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const canGlide = () => typeof requestAnimationFrame === "function" && !lessMotion();

interface Glide {
  from: number;
  to: number;
  start: number;
}

/** Where a glide stands at a moment: the count to draw, and whether it has more to go. */
function standing(g: Glide, now: number): { shown: number; going: boolean } {
  const t = g.start ? Math.min(1, (now - g.start) / GLIDE_MS) : 1;
  return { shown: t >= 1 ? g.to : Math.round(g.from + (g.to - g.from) * easeOut(t)), going: t < 1 };
}

/** The count to draw for `value`: the value itself, or where its glide to it stands. */
export function useCountGlide(value: number): number {
  const [glide, setGlide] = useState<Glide>({ from: value, to: value, start: 0 });
  const [, nextFrame] = useState(0);
  let g = glide;
  if (value !== glide.to) {
    const now = performance.now();
    const from = standing(glide, now).shown;
    g = value > from && canGlide() ? { from, to: value, start: now } : { from: value, to: value, start: 0 };
    setGlide(g);
  }
  const { shown, going } = standing(g, typeof performance === "undefined" ? 0 : performance.now());
  useEffect(() => {
    if (!going) return;
    const frame = requestAnimationFrame(() => nextFrame((n) => n + 1));
    return () => cancelAnimationFrame(frame);
  });
  return shown;
}
