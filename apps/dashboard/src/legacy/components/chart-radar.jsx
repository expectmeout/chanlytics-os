/* global React, ckNice, ckPolar, ckPointer, useChartWidth, useChartNav, ChartTooltip, ChartTooltipContent, ChartLive */
// A radar, for data that goes round: the days of a week. The first series is a 2px line with a faint wash, a series
// with fill: false a quiet gray line (the period before); the grid is hairline rings and spokes. Hover, a touch or the
// arrow keys read one axis, in the words of the card's config unless the page gives its own.

// axes: short labels round the circle · names: the long ones, for the words · series: [{ key, values, fill? }]
const RadarChart = ({ axes, names = axes, series, config = {}, height = 190, tip = null, describe = null, ariaLabel, animKey }) => {
  const [ref, width] = useChartWidth();
  const n = axes.length;
  const [active, setActive, nav] = useChartNav(n);
  const rings = 4;
  const { max } = ckNice(Math.max(1, ...series.flatMap((s) => s.values.filter((v) => v != null))), rings);
  const size = Math.min(width, height);
  const cx = width / 2, cy = height / 2, R = Math.max(10, size / 2 - 28);
  const ang = (i) => (i / n) * Math.PI * 2;
  const at = (i, v) => ckPolar(cx, cy, (Math.max(0, v || 0) / max) * R, ang(i));
  const path = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("") + "Z";
  const ring = (k) => path(axes.map((_, i) => ckPolar(cx, cy, (R * k) / rings, ang(i))));
  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - r.left - cx, dy = e.clientY - r.top - cy;
    if (Math.hypot(dx, dy) > R + 30) return null;
    let a = Math.atan2(dx, -dy);
    if (a < 0) a += Math.PI * 2;
    return Math.round(a / ((Math.PI * 2) / n)) % n;
  };
  const label = (k) => (config[k] || {}).label || k;
  const words = active === null ? null : tip ? tip(active)
    : { title: names[active], rows: series.map((s) => ({ key: s.key, label: label(s.key), value: s.values[active] == null ? "—" : s.values[active] })) };
  const live = active === null ? "" : describe ? describe(active) : `${names[active]}: ${series.map((s) => `${label(s.key)} ${s.values[active]}`).join(", ")}`;
  const tipX = active === null ? null : at(active, Math.max(...series.map((s) => s.values[active] || 0)))[0];
  return (
    <div className="ck-plot ck-radar" ref={ref} role="group" aria-roledescription="chart" aria-label={ariaLabel} {...nav} {...ckPointer(setActive, pick)} style={{ height }}>
      {width > 0 && (
        <svg key={animKey} width={width} height={height} className="ck-svg" aria-hidden="true">
          {Array.from({ length: rings }, (_, k) => <path key={k} d={ring(k + 1)} className="ck-grid ck-ring" />)}
          {axes.map((a, i) => {
            const [x, y] = ckPolar(cx, cy, R, ang(i));
            const [lx, ly] = ckPolar(cx, cy, R + 15, ang(i));
            const anchor = Math.abs(lx - cx) < 4 ? "middle" : lx > cx ? "start" : "end";
            return (
              <g key={a}>
                <line x1={cx} y1={cy} x2={x} y2={y} className={active === i ? "ck-spoke hot" : "ck-grid"} />
                <text x={lx} y={ly + 3.5} className={`ck-tick ck-radar-label${active === i ? " hot" : ""}`} textAnchor={anchor}>{a}</text>
              </g>
            );
          })}
          {series.slice().reverse().map((s) => (
            <path key={s.key} d={path(s.values.map((v, i) => at(i, v)))} className={s.fill === false ? "ck-radar-line prior" : "ck-radar-line ck-draw"}
              stroke={`var(--color-${s.key})`} fill={s.fill === false ? "none" : `var(--color-${s.key})`} pathLength={s.fill === false ? undefined : 1} />
          ))}
          {active !== null && series.map((s) => {
            const [x, y] = at(active, s.values[active]);
            return <circle key={s.key} cx={x} cy={y} r="4" className={`ck-dot${s.fill === false ? " prior" : ""}`} fill={`var(--color-${s.key})`} />;
          })}
        </svg>
      )}
      <ChartTooltip x={tipX} width={width}>{words ? <ChartTooltipContent {...words} /> : null}</ChartTooltip>
      <ChartLive text={live} />
    </div>
  );
};

Object.assign(window, { RadarChart });
