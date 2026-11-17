/**
 * The kit's spark (kit.css, "Spark"; Today with colour, 17 Nov 2026): a run of small columns, a day each, each its value's
 * share of the tallest. The last is the day still counting where `today` says so, drawn in the accent (live, right now); a
 * column of two parts draws its lower part in the ok tone (what AI answered, the ok tone's own word) and the rest of it in
 * the strong hairline's colour. It draws no words: what it says is its `aria-label`, as the Meter does. The heights are
 * data no class can hold, so they are the one style it writes in a prop, as the Meter's shares are (docs/debt.md, "Rises").
 *
 * Drawn in spans, so it may stand inside a press (a figure's button, the period line's link).
 *
 * It draws what the gallery's Spark family draws, entry for entry (tooling/scripts/e2e-harness/kit-gallery.mjs;
 * tests/styles/kit-components.test.mjs holds the two together).
 */
import type { ComponentPropsWithRef } from "react";
import { cx, variants } from "../variants";

const sparkClasses = variants({
  base: "spark",
  variants: { size: { md: "", sm: "spark-sm" } },
  defaults: { size: "md" },
});

const columnClasses = variants({
  base: "spark-col",
  variants: { now: { no: "", yes: "spark-now" } },
  defaults: { now: "no" },
});

/** A column: its value, and the share of it drawn in the ok tone where it has one (`part`, no more than the value). */
export interface SparkColumn {
  value: number;
  part?: number;
}

/** The lowest a column of something is drawn, as a share of the tallest: a day of one beside a day of forty still shows. */
const LEAST_SHARE = 4;

/** A share of a whole as the height a column is drawn at. */
const heightOf = (value: number, whole: number): string => `${whole > 0 ? (value / whole) * 100 : 0}%`;

/** A spark: its columns in order, the last today's where `today`, its height, and what it says to a screen reader. */
export type SparkProps = Omit<ComponentPropsWithRef<"span">, "children" | "role" | "aria-label"> & {
  columns: readonly SparkColumn[];
  /** The last column is today, still counting: drawn in the accent. */
  today?: boolean;
  size?: "sm" | "md";
  /** What it says to a screen reader, since it draws no words. */
  "aria-label": string;
};

/** A spark: an image of its columns, named by its label. */
export function Spark({ columns, today = false, size, className, ...span }: SparkProps) {
  const tallest = Math.max(0, ...columns.map((c) => c.value));
  return (
    <span {...span} className={cx(sparkClasses({ size }), className)} role="img">
      {columns.map((column, index) => (
        <span
          key={index}
          className={columnClasses({ now: today && index === columns.length - 1 ? "yes" : "no" })}
          style={{
            height: column.value > 0 ? `${Math.max(LEAST_SHARE, (column.value / tallest) * 100)}%` : undefined,
          }}
        >
          {column.part !== undefined && column.value > 0 ? (
            <span
              className="spark-part"
              style={{ height: heightOf(Math.min(column.part, column.value), column.value) }}
            />
          ) : null}
        </span>
      ))}
    </span>
  );
}
