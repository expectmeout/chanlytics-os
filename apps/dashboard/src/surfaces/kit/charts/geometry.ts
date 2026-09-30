/**
 * What every chart measures and draws with, as pure functions (moved whole from legacy/components/chart-core.jsx,
 * decision 0015): the axis a data set wants, the curve through it, the arcs of a donut, the frame the plot sits in, and
 * the words a point says when the page gives none. Nothing here touches the document.
 */
import type { CSSProperties } from "react";

/** One series: a label and a colour token, and how its key is drawn in a legend (a rect for bars, a line for lines). */
export interface ChartSeries {
  label: string;
  color: string;
  icon?: string;
  shape?: "rect" | "line";
}

/** A card's series, named once by their keys: what every chart in the card paints with (`--color-<key>`). */
export type ChartConfig = Record<string, ChartSeries>;

/** What a chart row must be: it says its day, and its short and long label. The values are the row's own, by key. */
export interface ChartRow {
  day?: string;
  label: string;
  short?: string;
}

/** What a tooltip says of a point: a title, a row per series (a value beside its label), and a note. */
export interface ChartWords {
  title?: string | null;
  rows: Array<{ key: string; label: string; value: string | number; color?: string }>;
  note?: string | null;
}

// A clean axis from 0 in about `count` steps of 1, 2, 5 or 10 x 10^n (and 2.5 when the values are not counts).
export function ckNice(max: number, count = 3, { integer = true }: { integer?: boolean } = {}) {
  const m = Math.max(integer ? 1 : 1e-6, Number(max) || 0);
  const raw = m / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const steps = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  let step = steps.map((k) => k * p).find((s) => s >= raw) || 10 * p;
  if (integer) step = Math.max(1, Math.round(step));
  const top = Math.ceil(m / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return { max: top, step, ticks };
}

// Seconds in the steps people count in: 5s, 10s, 15s, 30s, 1m, 2m, 5m, 10m, 15m, 30m, 1h.
const CK_SECOND_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
export function ckNiceSeconds(max: number, count = 3) {
  const m = Math.max(5, Number(max) || 0);
  const step = CK_SECOND_STEPS.find((s) => s >= m / count) || 3600;
  const top = Math.ceil(m / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { max: top, step, ticks };
}

// An axis tick in seconds. Ticks are whole steps of the list above, so this never meets a value fmtSeconds would
// round differently; a data value is always said by contracts' fmtSeconds, never by this.
export function ckSecondsLabel(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return s % 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s / 60}m`;
  return s % 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${s / 3600}h`;
}

type Point = [number, number];

// d3's curveMonotoneX (Steffen, 1990): smooth, and it never overshoots its data, so a count of 0 is never drawn
// below the baseline and a peak never above itself.
export function ckMonotone(pts: Point[]): string {
  const n = pts.length;
  if (!n) return "";
  const f = (v: number) => Math.round(v * 10) / 10;
  const at = (i: number): Point => pts[i] ?? [0, 0];
  if (n === 1) return `M${f(at(0)[0])},${f(at(0)[1])}`;
  if (n === 2) return `M${f(at(0)[0])},${f(at(0)[1])}L${f(at(1)[0])},${f(at(1)[1])}`;
  const sign = (x: number) => (x < 0 ? -1 : 1);
  const slope3 = (i: number) => {
    const [x0, y0] = at(i - 1),
      [x1, y1] = at(i),
      [x2, y2] = at(i + 1);
    const h0 = x1 - x0,
      h1 = x2 - x1;
    const s0 = (y1 - y0) / (h0 || (h1 < 0 ? -0 : 0)),
      s1 = (y2 - y1) / (h1 || (h0 < 0 ? -0 : 0));
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  };
  const slope2 = (a: number, b: number, t: number) => {
    const h = at(b)[0] - at(a)[0];
    return h ? ((3 * (at(b)[1] - at(a)[1])) / h - t) / 2 : t;
  };
  const t: number[] = new Array<number>(n);
  for (let i = 1; i < n - 1; i++) t[i] = slope3(i);
  t[0] = slope2(0, 1, t[1] ?? 0);
  t[n - 1] = slope2(n - 2, n - 1, t[n - 2] ?? 0);
  let d = `M${f(at(0)[0])},${f(at(0)[1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = at(i),
      [x1, y1] = at(i + 1),
      dx = (x1 - x0) / 3;
    d += `C${f(x0 + dx)},${f(y0 + dx * (t[i] ?? 0))},${f(x1 - dx)},${f(y1 - dx * (t[i + 1] ?? 0))},${f(x1)},${f(y1)}`;
  }
  return d;
}

// Runs of consecutive points: a day with nothing to plot is a gap in the line, never a dive to 0.
export function ckRuns(pts: Array<Point | null>): Point[][] {
  const runs: Point[][] = [];
  let cur: Point[] = [];
  for (const p of pts) {
    if (p == null) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length) runs.push(cur);
  return runs;
}

// Angles in radians, 0 at twelve o'clock, clockwise.
export const ckPolar = (cx: number, cy: number, r: number, a: number): Point => [
  cx + r * Math.sin(a),
  cy - r * Math.cos(a),
];

// An annular sector (a donut slice), between radii [inner, outer] and angles [from, to]. A full turn is two halves: an arc from a point to itself draws nothing.
export function ckArc(cx: number, cy: number, [r0, r1]: Point, [a0, a1]: Point): string {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const mid = a0 + Math.PI;
    return ckArc(cx, cy, [r0, r1], [a0, mid]) + ckArc(cx, cy, [r0, r1], [mid, a0 + Math.PI * 2]);
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = ckPolar(cx, cy, r1, a0),
    [x1, y1] = ckPolar(cx, cy, r1, a1);
  const [x2, y2] = ckPolar(cx, cy, r0, a1),
    [x3, y3] = ckPolar(cx, cy, r0, a0);
  return `M${x0},${y0}A${r1},${r1} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${r0},${r0} 0 ${large} 0 ${x3},${y3}Z`;
}

// The centre line of an arc between angles [from, to], for a stroked, round-capped radial mark.
export function ckArcLine(cx: number, cy: number, r: number, [a0, a1]: Point): string {
  const sweep = Math.min(a1 - a0, Math.PI * 2 - 1e-4);
  const [x0, y0] = ckPolar(cx, cy, r, a0),
    [x1, y1] = ckPolar(cx, cy, r, a0 + sweep);
  return `M${x0},${y0}A${r},${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x1},${y1}`;
}

// A column with a 4px rounded data end and a square foot on the baseline.
export function ckTopRound({ x, y, w, h }: { x: number; y: number; w: number; h: number }, r = 4): string {
  if (h <= 0 || w <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// How wide the y-axis labels need to be, from the longest (Geist Mono at 10.5px is about 6.3px a character).
export const ckAxisWidth = (labels: Array<string | number>): number =>
  10 + Math.max(1, ...labels.map((l) => String(l).length)) * 6.3;

/** The plot inside its margins: the left margin fits the y labels, and y(v) maps a value onto the plot. */
export interface Frame {
  L: number;
  R: number;
  T: number;
  B: number;
  pw: number;
  ph: number;
  y: (v: number) => number;
}

export function ckFrame({
  width,
  height,
  max,
  ticks,
  labels = ticks,
  R = 10,
  T = 12,
  B = 24,
}: {
  width: number;
  height: number;
  max: number;
  ticks: number[];
  labels?: Array<string | number>;
  R?: number;
  T?: number;
  B?: number;
}): Frame {
  const L = ckAxisWidth(labels);
  const pw = Math.max(0, width - L - R);
  const ph = height - T - B;
  return { L, R, T, B, pw, ph, y: (v: number) => T + ph * (1 - Math.min(v, max) / max) };
}

// How many points apart the x labels stand, so each has about `per` pixels of axis.
export const ckEvery = (n: number, pw: number, per = 52): number =>
  Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / per))));

// How tall to draw: the height the page fixed, or -- with "fill" -- the room its card has left over, never under the
// floor the page names. A row is as tall as the card with most to say, and the surplus used to fall as a hole under
// whichever card had least; a chart that fills spends it on itself instead. Every filling chart keeps a floor, so a
// row whose cards all fill is exactly as tall as it was before any of them did.
export const ckHeight = (height: number | "fill", box: number, floor: number): number =>
  height === "fill" ? Math.max(floor, box) : height;

// What a chart says of a point when the page gives no words of its own: the row's label, then each series' value
// under its name from the config. The page passes `tip` or `describe` where a unit needs saying.
export function ckTip<D extends ChartRow>(
  row: D,
  keys: Array<keyof D & string>,
  config: ChartConfig,
  {
    title = row.label,
    note = null,
    extra = [],
  }: { title?: string; note?: string | null; extra?: ChartWords["rows"] } = {},
): ChartWords {
  return {
    title,
    rows: [
      ...keys.map((k) => ({
        key: k,
        label: config[k]?.label || k,
        value: row[k] == null ? "—" : (row[k] as string | number),
      })),
      ...extra,
    ],
    note,
  };
}

export const ckDescribe = <D extends ChartRow>(
  row: D,
  keys: Array<keyof D & string>,
  config: ChartConfig,
  extra: ChartWords["rows"] = [],
): string =>
  `${row.label}: ${[
    ...keys.map((k) => ({ key: k, label: config[k]?.label || k, value: row[k] == null ? "nothing" : String(row[k]) })),
    ...extra,
  ]
    .map((r) => `${r.label} ${r.value}`)
    .join(", ")}`;

// The tooltip sits above the plot, beside the point it reads, on whichever side has room for its widest (260px);
// when neither side has, it spans the plot. Decided in pixels: a share of the width let it leave any plot narrower
// than about 800px, which is every card on a phone.
export const CK_TIP_W = 260;
export const CK_TIP_GAP = 14;
export const ckTipSide = (x: number, width: number): "start" | "end" | "pin" =>
  x + CK_TIP_GAP + CK_TIP_W <= width ? "start" : x - CK_TIP_GAP - CK_TIP_W >= 0 ? "end" : "pin";

/** Each series' colour as a CSS variable, for everything drawn inside. */
export function ckVars(config: ChartConfig | null | undefined): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [k, c] of Object.entries(config || {})) if (c && c.color) vars[`--color-${k}`] = c.color;
  return vars;
}
