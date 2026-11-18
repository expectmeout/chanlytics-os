"use client";

/**
 * A row of the preview that slides (its facts, its questions): it fades at an edge only where more waits past it, so
 * what is cut there reads as one more to slide to, and nothing looks chopped (the review of 18 November 2026). The
 * row says where it stands with two attributes its stylesheet reads (preview.css); before its script runs it is at its
 * start, the right-hand edge alone fading.
 */
import { useEffect, useRef, type ReactNode } from "react";

/** How near an end counts as at it, in px: a row never rests on a whole pixel. */
const AT_END_PX = 2;

export function PvSlide({
  className,
  testid,
  count,
  children,
}: {
  className: string;
  testid?: string;
  /** How many it holds: a row that loses one stands somewhere new. */
  count: number;
  children: ReactNode;
}) {
  const row = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const place = () => {
      el.toggleAttribute("data-slid", el.scrollLeft > AT_END_PX);
      el.toggleAttribute("data-ended", el.scrollLeft + el.clientWidth >= el.scrollWidth - AT_END_PX);
    };
    place();
    el.addEventListener("scroll", place, { passive: true });
    const sized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    sized?.observe(el);
    return () => {
      el.removeEventListener("scroll", place);
      sized?.disconnect();
    };
  }, [count]);
  return (
    <div className={className} ref={row} {...(testid ? { "data-testid": testid } : {})}>
      {children}
    </div>
  );
}
