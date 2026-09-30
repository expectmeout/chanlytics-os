/**
 * Bar charts: columns over days (one series, or a stack of them), and a list of horizontal bars for categories (moved
 * whole from legacy/components/chart-bar.jsx, decision 0015).
 *
 * A column is at most 24px wide and never fills its slot; stacked segments touch through a 2px gap of card, the top
 * segment carries the 4px rounded end, the foot is square on the baseline. The whole slot of a day is its target, and
 * the hovered or focused day stays while the others step back.
 */
import type { CSSProperties, PointerEvent } from "react";
import { ckDescribe, ckEvery, ckFrame, ckHeight, ckNice, ckTip, ckTopRound } from "./geometry";
import type { ChartConfig, ChartRow, ChartWords } from "./geometry";
import { ckPointer, useChartNav, useChartWidth } from "./hooks";
import { ChartLive, ChartTooltip, ChartTooltipContent, CkXLabels, CkYAxis } from "./parts";

const CK_BAR_GAP = 2;

/** A stack of the day's series from the baseline up: the gap between neighbours comes out of the upper segment. */
function stackOf<D extends ChartRow>(
  row: D,
  keys: Array<keyof D & string>,
  scale: { base: number; max: number; ph: number },
) {
  const { base, max, ph } = scale;
  const drawn: Array<{ k: string; top: number; h: number }> = [];
  let b = base;
  keys.forEach((k) => {
    const v = Number(row[k]) || 0;
    if (v <= 0) return;
    const gap = drawn.length ? CK_BAR_GAP : 0;
    const h = Math.max(1, ph * (v / max) - gap);
    const top = b - gap - h;
    drawn.push({ k, top, h });
    b = top;
  });
  return drawn;
}

export interface BarChartProps<D extends ChartRow> {
  /** [{ day, label, short?, ...values }] */
  data: D[];
  /** Series keys, bottom first. */
  keys: Array<keyof D & string>;
  /** The card's config, for the words. */
  config?: ChartConfig;
  /** A number, or "fill" to take the room the card has left, never under `floor`. */
  height?: number | "fill";
  floor?: number;
  yTicks?: number;
  /** Replaces the words said from config. */
  tip?: ((d: D, i: number) => ChartWords) | null;
  /** Adds a line under the default tip. */
  tipNote?: ((d: D) => string | null) | null;
  describe?: ((d: D, i: number) => string) | null;
  ariaLabel: string;
  animKey?: string | number;
}

// data: [{ day, label, short?, ...values }] · keys: series keys, bottom first · config: the card's, for the words
// height: a number, or "fill" to take the room the card has left, never under `floor`
// tip(d, i) and describe(d, i) replace the words said from config; tipNote(d) adds a line under the default tip
export function BarChart<D extends ChartRow>({
  data,
  keys,
  config = {},
  height = 208,
  floor = 128,
  yTicks = 3,
  tip = null,
  tipNote = null,
  describe = null,
  ariaLabel,
  animKey,
}: BarChartProps<D>) {
  const [ref, width, box] = useChartWidth();
  const fill = height === "fill";
  const H = ckHeight(height, box, floor);
  const n = data.length;
  const [active, setActive, nav] = useChartNav(n);
  const totals = data.map((d) => keys.reduce((s, k) => s + (Number(d[k]) || 0), 0));
  const { max, ticks } = ckNice(Math.max(1, ...totals), yTicks);
  const f = ckFrame({ width, height: H, max, ticks, R: 2, T: 10, B: 24 });
  const slot = f.pw / Math.max(1, n);
  const bw = Math.max(2, Math.min(24, slot * 0.62));
  const cx = (i: number) => f.L + i * slot + slot / 2;
  const at = (e: PointerEvent<HTMLDivElement>) => {
    const i = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - f.L) / Math.max(1, slot));
    return i >= 0 && i < n ? i : null;
  };
  const d = active === null ? null : (data[active] ?? null);
  const said =
    d && active !== null && (tip ? tip(d, active) : ckTip(d, keys, config, { note: tipNote ? tipNote(d) : null }));
  const plot: CSSProperties = fill ? { minHeight: floor } : { height: H };
  return (
    <div
      className={`ck-plot${fill ? " fill" : ""}`}
      ref={ref}
      role="group"
      aria-roledescription="chart"
      aria-label={ariaLabel}
      {...nav}
      {...ckPointer(setActive, at)}
      style={plot}
    >
      {width > 0 && (
        <svg key={animKey} width={width} height={H} className="ck-svg" aria-hidden="true">
          <CkYAxis ticks={ticks} y={f.y} L={f.L} width={width} R={f.R} />
          {data.map((row, i) => {
            const x = cx(i) - bw / 2;
            const drawn = stackOf(row, keys, { base: f.y(0), max, ph: f.ph });
            const last = drawn.length - 1;
            const cls = active === null ? "ck-col" : active === i ? "ck-col hot" : "ck-col dim";
            return (
              <g key={row.day || i} className={cls} style={{ "--i": i } as CSSProperties}>
                {drawn.map((s, j) =>
                  j === last ? (
                    <path
                      key={s.k}
                      d={ckTopRound({ x, y: s.top, w: bw, h: s.h }, 4)}
                      fill={`var(--color-${s.k})`}
                      className="ck-bar"
                    />
                  ) : (
                    <rect
                      key={s.k}
                      x={x}
                      y={s.top}
                      width={bw}
                      height={s.h}
                      fill={`var(--color-${s.k})`}
                      className="ck-bar"
                    />
                  ),
                )}
              </g>
            );
          })}
          <CkXLabels data={data} x={cx} every={ckEvery(n, f.pw, 46)} height={H} edges={slot < 44} />
        </svg>
      )}
      <ChartTooltip x={active === null ? null : cx(active)} width={width}>
        {said ? <ChartTooltipContent {...said} /> : null}
      </ChartTooltip>
      <ChartLive text={d && active !== null ? (describe ? describe(d, active) : ckDescribe(d, keys, config)) : ""} />
    </div>
  );
}

export interface BarListRow {
  id: string;
  label: string;
  value: number;
  display?: string | number | null;
  color?: string;
}

// Horizontal bars for categories. A label and its value read as one line with the bar under them, so a narrow card
// never cuts a label short; no track behind the bar. A row with a door is a button.
// rows: [{ id, label, value, display?, color? }] · onPick(row) opens its door · max: what a full bar is (the largest by default)
export function BarList({
  rows,
  color = "var(--chart-1)",
  onPick = null,
  max = null,
}: {
  rows: BarListRow[];
  color?: string;
  onPick?: ((row: BarListRow) => void) | null;
  max?: number | null;
}) {
  const top = max || Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="ck-barlist">
      {rows.map((r, i) => {
        const pct = Math.max(r.value ? 1.5 : 0, (r.value / top) * 100);
        const Row = onPick ? "button" : "div";
        return (
          <li key={r.id} style={{ "--i": i } as CSSProperties}>
            <Row
              type={onPick ? "button" : undefined}
              className={`ck-barlist-row${onPick ? " door" : ""}`}
              onClick={onPick ? () => onPick(r) : undefined}
            >
              <span className="ck-barlist-head">
                <span className="ck-barlist-label">{r.label}</span>
                <b className="ck-barlist-value">{r.display != null ? r.display : r.value}</b>
              </span>
              <span className="ck-barlist-track">
                <i
                  className="ck-barlist-bar"
                  style={{ width: `${Math.round(pct * 10) / 10}%`, background: r.color || color }}
                />
              </span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}
