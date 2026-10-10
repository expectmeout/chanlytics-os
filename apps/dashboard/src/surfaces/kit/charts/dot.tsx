/**
 * A dot plot: one dot per event on the day it happened, as high as its value (a reply's seconds past the hold the owner
 * set), against an optional reference line. Drawn as the columns are: the card's days are the x slots, a dot stands
 * inside the middle of its day's slot (several on one day are spread across it in their order), the held dot stays while
 * the others step back, and the whole plot is one tab stop the arrows walk.
 *
 * A dot whose day is none of the slots (or whose value is not a number) is skipped: it has no place to be drawn, so it
 * is not drawn at NaN, not read by the arrows and not counted in the axis.
 */
import type { PointerEvent } from "react";
import { ckEvery, ckFrame } from "./geometry";
import type { ChartConfig, ChartRow, ChartWords } from "./geometry";
import { ckPointer, useChartNav, useChartWidth } from "./hooks";
import { lineAxis, referenceLine } from "./line";
import { ChartLive, ChartTooltip, ChartTooltipContent, CkXLabels, CkYAxis } from "./parts";

const CK_DOT_R = 3;
/** A day's dots stand in the middle 60% of its slot, the first 20% and the last 20% left to its neighbours. */
const CK_SLOT_EDGE = 0.2;
const CK_SLOT_SPREAD = 0.6;

export interface DotRow {
  day: string;
  value: number;
}

interface DotPlotProps {
  /** The card's days, oldest first: the x slots and their labels. */
  days: ChartRow[];
  /** One dot per event, oldest first; its x is its day's slot, spread inside the slot by its order that day. */
  dots: DotRow[];
  /** One series, key "dot": the card publishes its colour as `--color-dot`. */
  config: ChartConfig;
  /**
   * A promise or a limit: a solid hairline whose value no tick repeats. Its label is a caption above the svg, never text on the
   * line: the events that meet the promise land on that line, and words there are drawn over by them.
   */
  reference?: { value: number; label: string } | null;
  /** The plot's height in pixels; the plot is as tall as its svg. */
  height?: number;
  yTicks?: number;
  scale?: "count" | "seconds";
  yFormat?: (tick: number) => string | number;
  /** Replaces the words said from config. `i` is the dot's place in `dots`. */
  tip?: ((d: DotRow, i: number) => ChartWords) | null;
  describe?: ((d: DotRow, i: number) => string) | null;
  ariaLabel: string;
  animKey?: string | number;
}

/** A dot with a place: its slot, and its order among the dots of its day. */
interface Placed {
  dot: DotRow;
  /** Where it stands in `dots`. */
  at: number;
  slot: number;
  rank: number;
  of: number;
}

/** The dots that have a place, in their order: a day that is none of the slots, or a value that is no number, has none. */
function dotsPlaced(days: ChartRow[], dots: DotRow[]): Placed[] {
  const slotOf = new Map<string, number>();
  days.forEach((d, i) => {
    if (d.day) slotOf.set(d.day, i);
  });
  const found = dots.flatMap((dot, at) => {
    const slot = slotOf.get(dot.day);
    return slot === undefined || !Number.isFinite(dot.value) ? [] : [{ dot, at, slot }];
  });
  const counts = new Map<number, number>();
  found.forEach((p) => counts.set(p.slot, (counts.get(p.slot) ?? 0) + 1));
  const seen = new Map<number, number>();
  return found.map((p) => {
    const rank = seen.get(p.slot) ?? 0;
    seen.set(p.slot, rank + 1);
    return { ...p, rank, of: counts.get(p.slot) ?? 1 };
  });
}

/** The dot nearest the pointer inside the slot the pointer is over (its place among `placed`), none where the slot has none. */
function nearestDot(placed: Placed[], over: { slot: number; x: number }, xOf: (p: Placed) => number): number | null {
  let best: number | null = null;
  let gap = Infinity;
  for (let k = 0; k < placed.length; k++) {
    const p = placed[k];
    if (!p || p.slot !== over.slot) continue;
    const away = Math.abs(xOf(p) - over.x);
    if (away < gap) {
      gap = away;
      best = k;
    }
  }
  return best;
}

/** The tooltip's words and the live region's for a dot: the page's own, else its day and its value under the series' name. */
function dotWords(p: Placed, days: ChartRow[], props: DotPlotProps) {
  const { dot, at } = p;
  const day = days[p.slot]?.label ?? dot.day;
  const label = props.config.dot?.label ?? "Value";
  const value = props.yFormat ? props.yFormat(dot.value) : dot.value;
  return {
    said: props.tip ? props.tip(dot, at) : { title: day, rows: [{ key: "dot", label, value }] },
    spoken: props.describe ? props.describe(dot, at) : `${day}: ${label} ${value}`,
  };
}

/** The dots: the held one whole, the others stepped back while one is held. */
function dotMarks(
  placed: Placed[],
  where: { x: (p: Placed) => number; y: (v: number) => number },
  active: number | null,
) {
  return placed.map((p, k) => (
    <circle
      key={p.at}
      cx={where.x(p)}
      cy={where.y(p.dot.value)}
      r={CK_DOT_R}
      fill="var(--color-dot)"
      className={`ck-dotplot-dot${active === null ? "" : active === k ? " hot" : " dim"}`}
    />
  ));
}

// days: the card's days, the slots · dots: [{ day, value }], one per event · config: the card's, one series "dot"
// reference: { value, label } · scale: "count" | "seconds" · yFormat(tick)
// tip(d, i) and describe(d, i) replace the words said from config (i is the dot's place in `dots`)
export function DotPlot(props: DotPlotProps) {
  const { days, dots, height = 180, ariaLabel, animKey } = props;
  const reference = props.reference ?? null;
  const [ref, width] = useChartWidth();
  const placed = dotsPlaced(days, dots);
  const [active, setActive, nav] = useChartNav(placed.length);
  const values = [...placed.map((p) => p.dot.value), reference?.value ?? 0];
  const axis = lineAxis(values, { ...props, reference });
  const f = ckFrame({ width, height, max: axis.max, ticks: axis.ticks, labels: axis.labels, R: 2, T: 10, B: 24 });
  const slot = f.pw / Math.max(1, days.length);
  const slotX = (i: number) => f.L + i * slot + slot / 2;
  const dotX = (p: Placed) => f.L + p.slot * slot + slot * (CK_SLOT_EDGE + (CK_SLOT_SPREAD * (p.rank + 0.5)) / p.of);
  const at = (e: PointerEvent<HTMLDivElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    return nearestDot(placed, { slot: Math.floor((x - f.L) / Math.max(1, slot)), x }, dotX);
  };
  const held = active === null ? undefined : placed[active];
  const words = held ? dotWords(held, days, props) : null;
  return (
    <div
      className="ck-plot"
      ref={ref}
      role="group"
      aria-roledescription="chart"
      aria-label={ariaLabel}
      {...nav}
      {...ckPointer(setActive, at)}
    >
      {reference && (
        <div className="ck-dotplot-ref" aria-hidden="true">
          <span className="ck-dotplot-ref-line" />
          {reference.label}
        </div>
      )}
      {width > 0 && (
        <svg key={animKey} width={width} height={height} className="ck-svg" aria-hidden="true">
          <CkYAxis ticks={axis.ticks} labels={axis.labels} y={f.y} L={f.L} width={width} R={f.R} />
          {reference && referenceLine({ value: reference.value }, f, width)}
          {dotMarks(placed, { x: dotX, y: f.y }, active)}
          <CkXLabels data={days} x={slotX} every={ckEvery(days.length, f.pw, 46)} height={height} edges={slot < 44} />
        </svg>
      )}
      <ChartTooltip x={held ? dotX(held) : null} width={width}>
        {words ? <ChartTooltipContent {...words.said} /> : null}
      </ChartTooltip>
      <ChartLive text={words ? words.spoken : ""} />
    </div>
  );
}
