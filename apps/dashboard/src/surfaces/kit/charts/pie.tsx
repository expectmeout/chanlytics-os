/**
 * A donut for part-to-whole at a glance (moved whole from legacy/components/chart-pie.jsx, decision 0015): at most five
 * slices, each a fixed identity (a channel keeps its colour whatever its size), from twelve o'clock, separated by a 2px
 * gap of card. The legend beside it carries the numbers, so no value hangs on colour or on hovering; the focused slice
 * speaks in the centre. One slice is a whole, not a part: the number and its row are the chart, with no ring.
 */
import type { CSSProperties, PointerEvent } from "react";
import { ckArc } from "./geometry";
import type { ChartConfig } from "./geometry";
import { useChartNav, useChartWidth } from "./hooks";
import { ChartLive } from "./parts";

// The ring is measured from the WIDTH it is given and never from the height, though it is height the card has to
// spare. Height would chase itself: the ring is what makes the box tall, so a ring sized from its own box grows
// until it is capped. Basis-zero was the other way out and it was worse -- on a phone the legend stacks under the
// ring, and a box pinned to the room shrank under what it held, spilling the legend over the bar below it. Width is
// settled before the ring is drawn, so it cannot argue back; `flex: 1 1 auto` then centres the ring in whatever
// height is left.
const PIE_OF_WIDTH = 0.45;

interface PieSlice {
  key: string;
  value: number;
}

/** A slice as it is drawn: its arc and its share of the whole, in whole percent. */
interface Arc extends PieSlice {
  a0: number;
  a1: number;
  share: number;
}

interface PieChartProps {
  /** [{ key, value }] in the fixed order. */
  data: PieSlice[];
  /** { key: { label, color } } */
  config?: ChartConfig;
  /** A number, or "fill" to grow with the card: never under `floor`, never over `ceiling`. */
  size?: number | "fill";
  floor?: number;
  ceiling?: number;
  thickness?: number;
  /** What the ring's centre says while nothing is held: { value, label }. */
  center?: { value: string | number; label: string } | null;
  ariaLabel: string;
  describe?: ((slice: Arc & { label: string }) => string) | null;
}

/** The slices that count, each with its arc from twelve o'clock and its share. */
function arcsOf(data: PieSlice[]): Arc[] {
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  let a = 0;
  return slices.map((d) => {
    const a0 = a;
    const a1 = a + (d.value / total) * Math.PI * 2;
    a = a1;
    return { ...d, a0, a1, share: Math.round((d.value / total) * 100) };
  });
}

const keyStyle = (color: string): CSSProperties => ({ "--k": color }) as CSSProperties;

export function PieChart({
  data,
  config = {},
  size = 138,
  floor = 138,
  ceiling = 208,
  thickness = 16,
  center = null,
  ariaLabel,
  describe = null,
}: PieChartProps) {
  const [ref, boxW] = useChartWidth();
  const fill = size === "fill";
  const S = size === "fill" ? Math.max(floor, Math.min(ceiling, Math.round(boxW * PIE_OF_WIDTH))) : size;
  const arcs = arcsOf(data);
  const n = arcs.length;
  const [active, setActive, nav] = useChartNav(n, { start: 0 });
  const label = (k: string) => config[k]?.label || k;
  const hold = (i: number) => ({
    onPointerEnter: () => setActive(i),
    onPointerDown: () => setActive(i),
    onPointerLeave: (e: PointerEvent) => {
      if (e.pointerType === "mouse") setActive(null);
    },
  });
  const state = (i: number) => (active === null ? "" : active === i ? "hot" : "dim");
  const cur = active === null ? null : (arcs[active] ?? null);
  const legend = (
    <ul className="ck-pie-legend">
      {arcs.map((s, i) => (
        <li key={s.key} className={state(i)} {...hold(i)}>
          <i className="ck-key rect" style={keyStyle(`var(--color-${s.key})`)} aria-hidden="true" />
          <span className="ck-pie-name">{label(s.key)}</span>
          <b className="ck-pie-count">{s.value}</b>
          <span className="ck-pie-share">{s.share}%</span>
        </li>
      ))}
    </ul>
  );
  if (n < 2) {
    return (
      <div className="ck-pie ck-pie-one">
        {center && (
          <div className="ck-pie-whole">
            <span className="ck-pie-value">{center.value}</span>
            <span className="ck-pie-label">{center.label}</span>
          </div>
        )}
        {legend}
      </div>
    );
  }
  // A bigger ring deserves a bigger hole: the band keeps its share of the radius rather than swelling with it.
  const band = Math.max(thickness, Math.round(S * (thickness / 138)));
  const cx = S / 2;
  const cy = S / 2;
  const r1 = S / 2 - 4;
  const r0 = r1 - band;
  const spoken =
    cur && (describe ? describe({ ...cur, label: label(cur.key) }) : `${label(cur.key)}: ${cur.value}, ${cur.share}%`);
  return (
    <div className={`ck-pie${fill ? " fill" : ""}`} ref={ref} style={fill ? { minHeight: floor } : undefined}>
      <div
        className="ck-pie-figure"
        role="group"
        aria-roledescription="chart"
        aria-label={ariaLabel}
        {...nav}
        style={{ width: S, height: S }}
      >
        <svg width={S} height={S} className="ck-svg" aria-hidden="true">
          {arcs.map((s, i) => (
            <path
              key={s.key}
              d={ckArc(cx, cy, [r0, active === i ? r1 + 3 : r1], [s.a0, s.a1])}
              fill={`var(--color-${s.key})`}
              className={`ck-slice ${state(i)}`}
              {...hold(i)}
            />
          ))}
        </svg>
        {center && (
          <div className="ck-pie-center">
            <span className="ck-pie-value">{cur ? cur.value : center.value}</span>
            <span className="ck-pie-label">{cur ? label(cur.key) : center.label}</span>
          </div>
        )}
      </div>
      {legend}
      <ChartLive text={spoken || ""} />
    </div>
  );
}
