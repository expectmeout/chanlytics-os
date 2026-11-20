/**
 * The three on the phone's circle, and their way home (Today, calm, 19 Nov 2026, D9). With AI open on a phone the three
 * stand in AI's home, by the field, and the circle holds AI's one press (shell-chrome.tsx phoneAsk). As AI closes they go
 * back to their circle in one arc, across and then down: the frame notes where they stood (`markLeftFrom`, called before
 * the Line is let go), and the circle's own face, shown again, comes in from there (kit/motion/arc.ts). Nothing moves on a
 * first draw, under reduced motion, or where AI was not open on a phone.
 */
import { useLayoutEffect, useRef } from "react";
import { MASCOT } from "@/bridge/mascot";
import { AskFace } from "../kit/face/ask-face";
import { flyArc, type ArcBox } from "../kit/motion/arc";

/** How long the three take home: the canvas's 360 ms, shorter than their way out. */
const HOME_MS = 360;
/** One tile of the three on the circle, in CSS px (ask.css, `.phone-ask-face`). */
const SIDE = 14;

/** Where the three stood in AI as it closed, until the circle's face has taken it. */
let leftFrom: ArcBox | null = null;

/** Note where the three stand in AI (their canvas), as AI is closed; null where there is nothing to come home from. */
export function markLeftFrom(face: Element | null): void {
  const box = face ? face.getBoundingClientRect() : null;
  // Only from where they can be seen: in a long conversation the three may stand far above the screen.
  const seen = !!box && box.width > 0 && box.bottom > 0 && box.top < window.innerHeight;
  leftFrom = box && seen ? { left: box.left, top: box.top, width: box.width, height: box.height } : null;
}

/**
 * The circle's own three: the press that opens AI. `away` while AI holds the circle (they are kept drawn, unseen, so they
 * are whole when they are needed); as that ends they come home along the arc from where they stood in AI.
 */
export function PhoneAskFace({ away }: { away: boolean }) {
  const outer = useRef<HTMLSpanElement | null>(null);
  const inner = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    if (away) return;
    const from = leftFrom;
    leftFrom = null;
    if (!from || !outer.current || !inner.current) return;
    const to = outer.current.getBoundingClientRect();
    // By the three's own size in each place: a tile there (fitted to its canvas, MASCOT.fitSide) against a tile here.
    void flyArc(outer.current, inner.current, from, to, {
      ms: HOME_MS,
      way: "fall",
      scale: MASCOT.fitSide(from.width, from.height) / SIDE,
    });
  }, [away]);
  return (
    <span className="phone-ask-arc" ref={outer}>
      <span className="phone-ask-arc" ref={inner}>
        <AskFace className="phone-ask-face" ground="raised" side={SIDE} testId="phone-ask-face" />
      </span>
    </span>
  );
}
