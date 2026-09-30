/**
 * The pieces every chart is made of: the axes, the legend, the tooltip and the live region a screen reader hears (moved
 * whole from legacy/components/chart-core.jsx, decision 0015). There is no React context: the node test stub renders
 * children before their parents, so a chart that needs the labels takes the same `config` as a prop.
 */
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "../icon/icon";
import { ckTipSide } from "./geometry";
import type { ChartConfig, ChartRow, ChartWords } from "./geometry";

/** The series key drawn in a legend and a tooltip: a colour set on the element as `--k`. */
const keyStyle = (color: string): CSSProperties => ({ "--k": color }) as CSSProperties;

// The y axis: a solid hairline per tick (the baseline a step stronger), its label to the left, in ink.
export function CkYAxis({
  ticks,
  labels = ticks,
  y,
  L,
  width,
  R,
}: {
  ticks: number[];
  labels?: Array<string | number>;
  y: (v: number) => number;
  L: number;
  width: number;
  R: number;
}) {
  return (
    <g className="ck-y">
      {ticks.map((t, i) => (
        <g key={t}>
          <line x1={L} x2={width - R} y1={y(t)} y2={y(t)} className={t === 0 ? "ck-base" : "ck-grid"} />
          <text x={L - 8} y={y(t) + 3.5} className="ck-tick" textAnchor="end">
            {labels[i]}
          </text>
        </g>
      ))}
    </g>
  );
}

// The x labels, one rule for every chart: every `every`-th point and always the last (the newest day), dropping the
// one too near the last; the first and last say the whole date, the rest the day of the month (all whole under nine
// points). `edges` anchors the first to its start and the last to its end, so neither spills past the plot.
export function CkXLabels({
  data,
  x,
  every,
  height,
  edges = true,
}: {
  data: ChartRow[];
  x: (i: number) => number;
  every: number;
  height: number;
  edges?: boolean;
}) {
  const n = data.length;
  return (
    <g className="ck-x">
      {data.map(
        (row, i) =>
          (i % every === 0 || i === n - 1) &&
          (i === n - 1 || n - 1 - i >= every * 0.6) && (
            <text
              key={row.day || i}
              x={x(i)}
              y={height - 7}
              className="ck-tick"
              textAnchor={!edges || n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            >
              {i === 0 || i === n - 1 || n <= 8 ? row.label : row.short || row.label}
            </text>
          ),
      )}
    </g>
  );
}

// The legend mirrors the mark (a rect for bars and areas, a short line for lines), for two or more series: one
// series' legend only says the title again. Values ride beside the label in ink; the colour is only ever the key's.
// A status series (unanswered) carries its icon. Drawn inside a ChartCard or a SegmentBar, which publish the colours.
export function ChartLegend({
  config = {},
  keys = null,
  values = null,
  min = 2,
}: {
  config?: ChartConfig;
  keys?: string[] | null;
  values?: Record<string, string | number | null | undefined> | null;
  min?: number;
}) {
  const list = (keys || Object.keys(config)).filter((k) => config[k]);
  if (list.length < min) return null;
  return (
    <div className="ck-legend">
      {list.map((k) => {
        const series = config[k];
        const value = values ? values[k] : null;
        return (
          <span key={k} className="ck-legend-item">
            <i
              className={`ck-key ${series?.shape || "rect"}`}
              style={keyStyle(`var(--color-${k})`)}
              aria-hidden="true"
            />
            {series?.icon && <Icon name={series.icon} size={11} className="ck-legend-icon" />}
            <span className="ck-legend-label">{series?.label}</span>
            {values && value != null && <b className="ck-legend-value">{value}</b>}
          </span>
        );
      })}
    </div>
  );
}

// Values lead, labels follow: the reader has the series and wants the number. A row keys its series with a short
// stroke of its colour: a tooltip is never a legend, so never a box.
export function ChartTooltipContent({ title = null, rows = [], note = null }: ChartWords) {
  return (
    <div className="ck-tip-inner">
      {title && <div className="ck-tip-title">{title}</div>}
      {rows.map((r) => (
        <div className="ck-tip-row" key={r.key}>
          <i className="ck-key line" style={keyStyle(r.color || `var(--color-${r.key})`)} aria-hidden="true" />
          <b className="ck-tip-value">{r.value}</b>
          <span className="ck-tip-label">{r.label}</span>
        </div>
      ))}
      {note && <div className="ck-tip-note">{note}</div>}
    </div>
  );
}

export function ChartTooltip({ x, width, children }: { x: number | null; width: number; children?: ReactNode }) {
  if (x == null || !children) return null;
  const side = ckTipSide(x, width);
  return (
    <div className={`ck-tip ${side}`} style={side === "pin" ? undefined : { left: `${x}px` }} role="presentation">
      {children}
    </div>
  );
}

export const ChartLive = ({ text }: { text: string }) => (
  <span className="ck-live" aria-live="polite">
    {text}
  </span>
);
