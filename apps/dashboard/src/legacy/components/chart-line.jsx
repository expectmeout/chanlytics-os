/* global React, ckNice, ckNiceSeconds, ckMonotone, ckRuns, ckFrame, ckEvery, ckPointer, ckTip, ckDescribe, CkYAxis, CkXLabels, useChartWidth, useChartNav, ChartTooltip, ChartTooltipContent, ChartLive */
// A line chart, and the area chart as its filled case: series over days as 2px lines, a gap where a day has nothing
// (never a dive to 0), a filled series washed from its line down to the baseline, the period before as a quiet gray
// line, and an optional reference line (a promise, a limit) drawn as a labelled solid hairline whose value no tick
// repeats. A crosshair finds the day: nobody has to land on a 2px line.

const { useRef: useLnRef } = React;
let ckWashSeq = 0;

// data: [{ day, label, short?, ...values }] · keys: [{ key, fill?, width? }] · config: the card's, for the words
// prior: the period before, a number (or null) per day, drawn gray and read under config[priorKey].label
// scale: "count" | "seconds" · yFormat(tick) · reference: { value, label }
// tip(d, i, { prior }) and describe(d, i, { prior }) replace the words said from config; tipNote(d) adds a line
const LineChart = ({ data, keys, config = {}, prior = null, priorKey = "prior", height = 180, scale = "count", yFormat = (v) => v, reference = null, yTicks = 3, tip = null, tipNote = null, describe = null, ariaLabel, animKey }) => {
  const gid = useLnRef(null);
  if (gid.current === null) gid.current = `ckwash${++ckWashSeq}`;
  const [ref, width] = useChartWidth();
  const n = data.length;
  const [active, setActive, nav] = useChartNav(n);
  const before = prior ? prior.slice(0, n).map((v) => (v == null ? null : Number(v))) : null;
  const values = [];
  keys.forEach(({ key }) => data.forEach((d) => { if (d[key] != null) values.push(Number(d[key])); }));
  if (before) before.forEach((v) => { if (v != null) values.push(v); });
  if (reference) values.push(reference.value);
  const nice = (scale === "seconds" ? ckNiceSeconds : ckNice)(Math.max(1, ...values), yTicks);
  const ticks = nice.ticks.filter((t) => !reference || t === 0 || t !== reference.value);
  const labels = ticks.map(yFormat);
  const f = ckFrame({ width, height, max: nice.max, ticks, labels });
  const x = (i) => f.L + (n <= 1 ? f.pw / 2 : (i / (n - 1)) * f.pw);
  const at = (e) => Math.max(0, Math.min(n - 1, Math.round(((e.clientX - e.currentTarget.getBoundingClientRect().left - f.L) / Math.max(1, f.pw)) * (n - 1))));
  const d = active === null ? null : data[active];
  const was = active === null || !before ? null : before[active];
  const ctx = { prior: was };
  const extra = was != null ? [{ key: priorKey, label: (config[priorKey] || {}).label || priorKey, value: was }] : [];
  const names = keys.map((k) => k.key);
  const said = d && (tip ? tip(d, active, ctx) : ckTip(d, names, config, { note: tipNote ? tipNote(d) : null, extra }));
  const wash = keys.find((k) => k.fill);
  const lastWash = wash && n > 1 ? data[n - 1][wash.key] : null;
  return (
    <div className="ck-plot" ref={ref} role="group" aria-roledescription="chart" aria-label={ariaLabel} {...nav} {...ckPointer(setActive, at)} style={{ height }}>
      {width > 0 && (
        <svg key={animKey} width={width} height={height} className="ck-svg" aria-hidden="true">
          {wash && (
            <defs>
              <linearGradient id={gid.current} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`var(--color-${wash.key})`} stopOpacity="0.16" />
                <stop offset="100%" stopColor={`var(--color-${wash.key})`} stopOpacity="0.01" />
              </linearGradient>
            </defs>
          )}
          <CkYAxis ticks={ticks} labels={labels} y={f.y} L={f.L} width={width} R={f.R} />
          {reference && (
            <g className="ck-ref">
              <line x1={f.L} x2={width - f.R} y1={f.y(reference.value)} y2={f.y(reference.value)} />
              <text x={width - f.R} y={f.y(reference.value) - 5} textAnchor="end">{reference.label}</text>
            </g>
          )}
          <CkXLabels data={data} x={x} every={ckEvery(n, f.pw)} height={height} />
          {before && ckRuns(before.map((v, i) => (v == null ? null : [x(i), f.y(v)]))).map((run, j) => (
            run.length === 1
              ? <circle key={`p${j}`} cx={run[0][0]} cy={run[0][1]} r="3" className="ck-dot prior" />
              : <path key={`p${j}`} d={ckMonotone(run)} className="ck-prior" />
          ))}
          {keys.map(({ key, fill = false, width: w = 2 }) => ckRuns(data.map((row, i) => (row[key] == null ? null : [x(i), f.y(Number(row[key]))]))).map((run, j) => (
            run.length === 1
              ? <circle key={`${key}${j}`} cx={run[0][0]} cy={run[0][1]} r="4" className="ck-dot" fill={`var(--color-${key})`} />
              : (
                <g key={`${key}${j}`}>
                  {fill && <path d={`${ckMonotone(run)}L${run[run.length - 1][0]},${f.y(0)}L${run[0][0]},${f.y(0)}Z`} fill={`url(#${gid.current})`} className="ck-area" />}
                  <path d={ckMonotone(run)} className="ck-line ck-draw" stroke={`var(--color-${key})`} strokeWidth={w} pathLength={1} />
                </g>
              )
          )))}
          {active !== null && (
            <g className="ck-cross">
              <line x1={x(active)} x2={x(active)} y1={f.T} y2={f.y(0)} className="ck-crosshair" />
              {was != null && <circle cx={x(active)} cy={f.y(was)} r="4" className="ck-dot prior" />}
              {keys.map(({ key }) => d[key] != null && <circle key={key} cx={x(active)} cy={f.y(Number(d[key]))} r="4.5" className="ck-dot" fill={`var(--color-${key})`} />)}
            </g>
          )}
          {active === null && lastWash != null && <circle cx={x(n - 1)} cy={f.y(Number(lastWash))} r="4" className="ck-dot end" fill={`var(--color-${wash.key})`} />}
        </svg>
      )}
      <ChartTooltip x={active === null ? null : x(active)} width={width}>{said ? <ChartTooltipContent {...said} /> : null}</ChartTooltip>
      <ChartLive text={d ? (describe ? describe(d, active, ctx) : ckDescribe(d, names, config, extra)) : ""} />
    </div>
  );
};

Object.assign(window, { LineChart });
