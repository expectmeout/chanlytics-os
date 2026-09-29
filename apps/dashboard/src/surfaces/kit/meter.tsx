/**
 * The kit's meter (kit.css, "Meter"): a whole in its parts, 8px tall, large (10px) or small (4px). A part's share is
 * its flex-grow, and its colour a tone (ok, warn) or the series colour a chart gives it; the rest of the whole, where a
 * page has one, is a part of its own after them. A part of nothing is not drawn. The meter draws no words: what it
 * says is its `aria-label`, as SegmentBar says its parts (chart-core.jsx), and a title or a legend is the page's or
 * the chart's. The share is data no class can hold, so it is the one style the kit writes in a prop, as SegmentBar
 * writes it (docs/debt.md, "Rises"). `className` is for the page's layout, and comes last; the ref reaches the element.
 *
 * It draws what the gallery's Meter family draws, entry for entry (tooling/scripts/e2e-harness/kit-gallery.mjs;
 * tooling/scripts/tests/styles/kit-components.test.mjs holds the two together).
 */
import type { ComponentPropsWithRef } from "react";
import { cx, variants } from "./variants";

const meterClasses = variants({
  base: "meter",
  variants: { size: { md: "", sm: "meter-sm", lg: "meter-lg" } },
  defaults: { size: "md" },
});

const meterPartClasses = variants({
  base: "meter-part",
  variants: { tone: { ok: "meter-ok", warn: "meter-warn", rest: "meter-rest" } },
});

/** One part: its share of the whole, and its colour, a tone or a chart's series colour (`var(--color-<key>)`). */
type MeterPart = { share: number } & ({ tone: "ok" | "warn"; color?: undefined } | { color: string; tone?: undefined });

type MeterProps = Omit<ComponentPropsWithRef<"div">, "children" | "role" | "aria-label"> & {
  /** The parts, in order. */
  parts: readonly MeterPart[];
  /** The rest of the whole, after the parts, in the strong hairline's colour. */
  rest?: boolean;
  size?: "sm" | "md" | "lg";
  /** What it says to a screen reader, since it draws no words: each part, in words. */
  "aria-label": string;
};

/** A meter: an image of its parts, named by its label. */
export function Meter({ parts, rest = false, size, className, ...div }: MeterProps) {
  return (
    <div {...div} className={cx(meterClasses({ size }), className)} role="img">
      {parts
        .filter((part) => part.share > 0)
        .map((part, at) => (
          <span
            key={at}
            className={meterPartClasses({ tone: part.tone })}
            style={{ flexGrow: part.share, background: part.color }}
          />
        ))}
      {rest ? <span className={meterPartClasses({ tone: "rest" })} /> : null}
    </div>
  );
}
