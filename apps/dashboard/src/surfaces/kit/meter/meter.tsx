/**
 * The kit's meter (kit.css, "Meter"): a whole in its parts, 8px tall, large (10px) or small (4px). A part's share is
 * its flex-grow, and its colour a tone (ok, read, warn, rest) or the series colour a chart gives it; the rest of the whole,
 * where a page has one, is a part of its own after them. A part of nothing is not drawn. The meter draws no words: what it
 * says is its `aria-label`, as SegmentBar says its parts (charts/card.tsx), and a title or a legend is the page's or
 * the chart's. The share is data no class can hold, so it is the one style the kit writes in a prop, as SegmentBar
 * writes it (docs/debt.md, "Rises"). `className` is for the page's layout, and comes last; the ref reaches the element.
 *
 * It draws what the gallery's Meter family draws, entry for entry (tooling/scripts/e2e-harness/kit-gallery.mjs;
 * tooling/scripts/tests/styles/kit-components.test.mjs holds the two together).
 */
import type { ComponentPropsWithRef } from "react";
import { cx, variants } from "../variants";

const meterClasses = variants({
  base: "meter",
  variants: { size: { md: "", sm: "meter-sm", lg: "meter-lg" }, apart: { no: "", yes: "meter-apart" } },
  defaults: { size: "md", apart: "no" },
});

const meterPartClasses = variants({
  base: "meter-part",
  variants: {
    tone: {
      ok: "meter-ok",
      read: "meter-read",
      warn: "meter-warn",
      rest: "meter-rest",
      open: "meter-open",
      ink: "meter-ink",
      ground: "meter-ground",
    },
  },
});

/**
 * One part: its share of the whole, and its colour, a tone or a chart's series colour (`var(--color-<key>)`). A part at
 * `rest` is drawn in the strong hairline's colour, as the rest of the whole is: a share that is there and does nothing (a
 * moment's paused campaigns). A part at `read` is ok's green, softer: a check that passed as Claude read it, not as the
 * listing showed it (the lead sheet's fit). A part `open` is its outline alone: a share still to come (a run's emails
 * the check is still reading). A part in `ink` is the one that is happening now (a visit under way on a phone's day bar), and
 * one on the `ground` is a share where nothing is (the day's free time), the inset's fill.
 */
type MeterPart = { share: number } & (
  | { tone: "ok" | "read" | "warn" | "rest" | "open" | "ink" | "ground"; color?: undefined }
  | { color: string; tone?: undefined }
);

/**
 * The parts with the mark among them: the part the mark falls in cut in two round it, so the mark stands in the row where
 * its share says and takes no room of its own, and the meter writes no style but its parts' shares.
 */
function withMark(parts: readonly MeterPart[], mark: number | null): Array<MeterPart | "mark"> {
  if (mark === null || !(mark >= 0)) return [...parts];
  const whole = parts.reduce((n, part) => n + Math.max(0, part.share), 0);
  const at = mark * whole;
  const out: Array<MeterPart | "mark"> = [];
  let walked = 0;
  let placed = false;
  for (const part of parts) {
    const share = Math.max(0, part.share);
    if (!placed && at <= walked + share) {
      if (at > walked) out.push({ ...part, share: at - walked });
      out.push("mark");
      if (walked + share > at) out.push({ ...part, share: walked + share - at });
      placed = true;
    } else out.push(part);
    walked += share;
  }
  if (!placed) out.push("mark");
  return out;
}

/** A meter: its parts, the rest of the whole or none, its height, and what it says to a screen reader. */
export type MeterProps = Omit<ComponentPropsWithRef<"div">, "children" | "role" | "aria-label"> & {
  /** The parts, in order. */
  parts: readonly MeterPart[];
  /** The rest of the whole, after the parts, in the strong hairline's colour. */
  rest?: boolean;
  size?: "sm" | "md" | "lg";
  /** Its parts apart, 4px between them and each rounded: a run's bar by count. */
  apart?: boolean;
  /** Where now stands on a meter of a span, a share of the whole (a phone's day bar): a line and a dot; none for none. */
  mark?: number | null;
  /** What it says to a screen reader, since it draws no words: each part, in words. */
  "aria-label": string;
};

/** A meter: an image of its parts, named by its label. */
export function Meter({ parts, rest = false, size, apart = false, mark = null, className, ...div }: MeterProps) {
  return (
    <div {...div} className={cx(meterClasses({ size, apart: apart ? "yes" : "no" }), className)} role="img">
      {withMark(parts, mark)
        .filter((part) => part === "mark" || part.share > 0)
        .map((part, at) =>
          part === "mark" ? (
            <span key={at} className="meter-mark" aria-hidden="true" />
          ) : (
            <span
              key={at}
              className={meterPartClasses({ tone: part.tone })}
              style={{ flexGrow: part.share, background: part.color }}
            />
          ),
        )}
      {rest ? <span className={meterPartClasses({ tone: "rest" })} /> : null}
    </div>
  );
}
