/**
 * A line chart, and the area chart as its filled case (moved whole from legacy/components/chart-line.jsx, decision
 * 0015): series over days as 2px lines, a gap where a day has nothing (never a dive to 0), a filled series washed from
 * its line down to the baseline, the period before as a quiet gray line, and an optional reference line (a promise, a
 * limit) drawn as a labelled solid hairline whose value no tick repeats. A crosshair finds the day: nobody has to land
 * on a 2px line.
 */
import { useRef } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { ckDescribe, ckEvery, ckFrame, ckHeight, ckMonotone, ckNice, ckNiceSeconds, ckRuns, ckTip } from "./geometry";
import type { ChartConfig, ChartRow, ChartWords, Frame } from "./geometry";
import { ckPointer, useChartNav, useChartWidth } from "./hooks";
import { ChartLive, ChartTooltip, ChartTooltipContent, CkXLabels, CkYAxis } from "./parts";

let ckWashSeq = 0;

/** One plotted series: its key, whether it is washed to the baseline, and its stroke's width. */
interface LineKey<D> {
  key: keyof D & string;
  fill?: boolean;
  width?: number;
}

/** What a tip and a description are told besides the day: the period before, on this day. */
interface LineContext {
  prior: number | null;
}

interface LineChartProps<D extends ChartRow> {
  data: D[];
  keys: Array<LineKey<D>>;
  /** The card's series, for the words. */
  config?: ChartConfig;
  /** The period before: a number (or null) per day, drawn gray and read under config[priorKey].label. */
  prior?: Array<number | null> | null;
  priorKey?: string;
  /** A number, or "fill" to take the room the card has left, never under `floor`. */
  height?: number | "fill";
  floor?: number;
  scale?: "count" | "seconds";
  yFormat?: (tick: number) => string | number;
  /** A promise or a limit: a labelled solid hairline, whose value no tick repeats. */
  reference?: { value: number; label: string } | null;
  yTicks?: number;
  /** Replaces the words said from config. */
  tip?: ((d: D, i: number, ctx: LineContext) => ChartWords) | null;
  /** Adds a line under the default tip. */
  tipNote?: ((d: D) => string | null) | null;
  describe?: ((d: D, i: number, ctx: LineContext) => string) | null;
  ariaLabel: string;
  animKey?: string | number;
}

type Reference = { value: number; label: string } | null;

/** Every value the axis must hold: each series, the period before and the reference. */
function lineValues<D extends ChartRow>(
  data: D[],
  keys: Array<LineKey<D>>,
  before: Array<number | null> | null,
  reference: Reference,
): number[] {
  const values: number[] = [];
  keys.forEach(({ key }) =>
    data.forEach((d) => {
      if (d[key] != null) values.push(Number(d[key]));
    }),
  );
  if (before)
    before.forEach((v) => {
      if (v != null) values.push(v);
    });
  if (reference) values.push(reference.value);
  return values;
}

/** The y axis: a clean scale over the values, its ticks without the reference's own, and each tick's label. */
function lineAxis(
  values: number[],
  props: {
    scale?: "count" | "seconds";
    yTicks?: number;
    reference: Reference;
    yFormat?: (tick: number) => string | number;
  },
) {
  const { reference } = props;
  const nice = (props.scale === "seconds" ? ckNiceSeconds : ckNice)(Math.max(1, ...values), props.yTicks ?? 3);
  const ticks = nice.ticks.filter((t) => !reference || t === 0 || t !== reference.value);
  return { max: nice.max, ticks, labels: ticks.map(props.yFormat ?? ((v: number) => v)) };
}

/** The tooltip's words and the live region's, for the day held (none when none is). */
function lineWords<D extends ChartRow>(props: LineChartProps<D>, active: number | null, was: number | null) {
  const { data, keys, tip, tipNote, describe } = props;
  const config = props.config ?? {};
  const d = active === null ? null : (data[active] ?? null);
  if (!d || active === null) return { d: null, said: null, spoken: "" };
  const priorKey = props.priorKey ?? "prior";
  const ctx = { prior: was };
  const extra = was != null ? [{ key: priorKey, label: config[priorKey]?.label || priorKey, value: was }] : [];
  const names = keys.map((k) => k.key);
  const said = tip ? tip(d, active, ctx) : ckTip(d, names, config, { note: tipNote ? tipNote(d) : null, extra });
  return { d, said, spoken: describe ? describe(d, active, ctx) : ckDescribe(d, names, config, extra) };
}

/** The lines: each run of a series, a dot where a run is one day, and the wash under a filled one. */
function seriesMarks<D extends ChartRow>(
  data: D[],
  keys: Array<LineKey<D>>,
  { x, f }: { x: (i: number) => number; f: Frame },
  gid: string,
) {
  return keys.map(({ key, fill = false, width: w = 2 }) =>
    ckRuns(data.map((row, i) => (row[key] == null ? null : [x(i), f.y(Number(row[key]))]))).map((run, j) => {
      const first = run[0];
      const end = run[run.length - 1];
      if (run.length === 1 && first)
        return (
          <circle
            key={`${key}${j}`}
            cx={first[0]}
            cy={first[1]}
            r="4"
            className="ck-dot"
            fill={`var(--color-${key})`}
          />
        );
      return (
        <g key={`${key}${j}`}>
          {fill && end && first && (
            <path
              d={`${ckMonotone(run)}L${end[0]},${f.y(0)}L${first[0]},${f.y(0)}Z`}
              fill={`url(#${gid})`}
              className="ck-area"
            />
          )}
          <path
            d={ckMonotone(run)}
            className="ck-line ck-draw"
            stroke={`var(--color-${key})`}
            strokeWidth={w}
            pathLength={1}
          />
        </g>
      );
    }),
  );
}

/** The period before, a quiet gray line, and a dot where a run is one day. */
function priorMarks(before: Array<number | null>, x: (i: number) => number, f: Frame) {
  return ckRuns(before.map((v, i) => (v == null ? null : [x(i), f.y(v)]))).map((run, j) => {
    const first = run[0];
    return run.length === 1 && first ? (
      <circle key={`p${j}`} cx={first[0]} cy={first[1]} r="3" className="ck-dot prior" />
    ) : (
      <path key={`p${j}`} d={ckMonotone(run)} className="ck-prior" />
    );
  });
}

/** The reference: a labelled hairline across the plot. */
function referenceLine(reference: { value: number; label: string }, f: Frame, width: number) {
  return (
    <g className="ck-ref">
      <line x1={f.L} x2={width - f.R} y1={f.y(reference.value)} y2={f.y(reference.value)} />
      <text x={width - f.R} y={f.y(reference.value) - 5} textAnchor="end">
        {reference.label}
      </text>
    </g>
  );
}

/** The wash a filled series is drawn over: its colour, faint at the line, fainter at the baseline. */
function washDefs(id: string, key: string) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={`var(--color-${key})`} stopOpacity="0.16" />
        <stop offset="100%" stopColor={`var(--color-${key})`} stopOpacity="0.01" />
      </linearGradient>
    </defs>
  );
}

/** The held day: a crosshair, and a dot on each series (and on the period before) where it stands. */
function crosshair<D extends ChartRow>(d: D, keys: Array<LineKey<D>>, at: { x: number; was: number | null }, f: Frame) {
  return (
    <g className="ck-cross">
      <line x1={at.x} x2={at.x} y1={f.T} y2={f.y(0)} className="ck-crosshair" />
      {at.was != null && <circle cx={at.x} cy={f.y(at.was)} r="4" className="ck-dot prior" />}
      {keys.map(
        ({ key }) =>
          d[key] != null && (
            <circle
              key={key}
              cx={at.x}
              cy={f.y(Number(d[key]))}
              r="4.5"
              className="ck-dot"
              fill={`var(--color-${key})`}
            />
          ),
      )}
    </g>
  );
}

// data: [{ day, label, short?, ...values }] · keys: [{ key, fill?, width? }] · config: the card's, for the words
// prior: the period before, a number (or null) per day, drawn gray and read under config[priorKey].label
// scale: "count" | "seconds" · yFormat(tick) · reference: { value, label }
// tip(d, i, { prior }) and describe(d, i, { prior }) replace the words said from config; tipNote(d) adds a line
export function LineChart<D extends ChartRow>(props: LineChartProps<D>) {
  const { data, keys, prior = null, height = 180, floor = 128, ariaLabel, animKey } = props;
  const reference = props.reference ?? null;
  const gid = useRef<string | null>(null);
  if (gid.current === null) gid.current = `ckwash${++ckWashSeq}`;
  const washId = gid.current;
  const [ref, width, box] = useChartWidth();
  const fill = height === "fill";
  const H = ckHeight(height, box, floor);
  const n = data.length;
  const [active, setActive, nav] = useChartNav(n);
  const before = prior ? prior.slice(0, n).map((v) => (v == null ? null : Number(v))) : null;
  const axis = lineAxis(lineValues(data, keys, before, reference), { ...props, reference });
  const f = ckFrame({ width, height: H, max: axis.max, ticks: axis.ticks, labels: axis.labels });
  const x = (i: number) => f.L + (n <= 1 ? f.pw / 2 : (i / (n - 1)) * f.pw);
  const at = (e: PointerEvent<HTMLDivElement>) =>
    Math.max(
      0,
      Math.min(
        n - 1,
        Math.round(((e.clientX - e.currentTarget.getBoundingClientRect().left - f.L) / Math.max(1, f.pw)) * (n - 1)),
      ),
    );
  const was = active === null || !before ? null : (before[active] ?? null);
  const { d, said, spoken } = lineWords(props, active, was);
  const wash = keys.find((k) => k.fill);
  const lastWash = wash && n > 1 ? data[n - 1]?.[wash.key] : null;
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
          {wash && washDefs(washId, wash.key)}
          <CkYAxis ticks={axis.ticks} labels={axis.labels} y={f.y} L={f.L} width={width} R={f.R} />
          {reference && referenceLine(reference, f, width)}
          <CkXLabels data={data} x={x} every={ckEvery(n, f.pw)} height={H} />
          {before && priorMarks(before, x, f)}
          {seriesMarks(data, keys, { x, f }, washId)}
          {active !== null && d && crosshair(d, keys, { x: x(active), was }, f)}
          {active === null && lastWash != null && wash && (
            <circle
              cx={x(n - 1)}
              cy={f.y(Number(lastWash))}
              r="4"
              className="ck-dot end"
              fill={`var(--color-${wash.key})`}
            />
          )}
        </svg>
      )}
      <ChartTooltip x={active === null ? null : x(active)} width={width}>
        {said ? <ChartTooltipContent {...said} /> : null}
      </ChartTooltip>
      <ChartLive text={spoken} />
    </div>
  );
}
