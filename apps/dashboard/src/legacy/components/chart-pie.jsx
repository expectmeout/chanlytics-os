/* global React, ckArc, useChartNav, ChartLive */
// A donut for part-to-whole at a glance: at most five slices, each a fixed identity (a channel keeps its colour
// whatever its size), from twelve o'clock, separated by a 2px gap of card. The legend beside it carries the numbers,
// so no value hangs on colour or on hovering; the focused slice speaks in the centre. One slice is a whole, not a
// part: the number and its row are the chart, with no ring.

// data: [{ key, value }] in the fixed order · config: { key: { label, color } } · center: { value, label }
const PieChart = ({ data, config = {}, size = 138, thickness = 16, center = null, ariaLabel, describe = null }) => {
  const slices = data.filter((d) => d.value > 0);
  const n = slices.length;
  const [active, setActive, nav] = useChartNav(n, { start: 0 });
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  const label = (k) => (config[k] || {}).label || k;
  const hold = (i) => ({ onPointerEnter: () => setActive(i), onPointerDown: () => setActive(i), onPointerLeave: (e) => { if (e.pointerType === "mouse") setActive(null); } });
  let a = 0;
  const arcs = slices.map((d) => {
    const a0 = a, a1 = a + (d.value / total) * Math.PI * 2;
    a = a1;
    return { ...d, a0, a1, share: Math.round((d.value / total) * 100) };
  });
  const cur = active === null ? null : arcs[active];
  const legend = (
    <ul className="ck-pie-legend">
      {arcs.map((s, i) => (
        <li key={s.key} className={active === null ? "" : active === i ? "hot" : "dim"} {...hold(i)}>
          <i className="ck-key rect" style={{ "--k": `var(--color-${s.key})` }} aria-hidden="true" />
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
  const cx = size / 2, cy = size / 2, r1 = size / 2 - 4, r0 = r1 - thickness;
  return (
    <div className="ck-pie">
      <div className="ck-pie-figure" role="group" aria-roledescription="chart" aria-label={ariaLabel} {...nav} style={{ width: size, height: size }}>
        <svg width={size} height={size} className="ck-svg" aria-hidden="true">
          {arcs.map((s, i) => (
            <path key={s.key} d={ckArc(cx, cy, r0, active === i ? r1 + 3 : r1, s.a0, s.a1)} fill={`var(--color-${s.key})`}
              className={`ck-slice ${active === null ? "" : active === i ? "hot" : "dim"}`} {...hold(i)} />
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
      <ChartLive text={cur ? (describe ? describe({ ...cur, label: label(cur.key) }) : `${label(cur.key)}: ${cur.value}, ${cur.share}%`) : ""} />
    </div>
  );
};

Object.assign(window, { PieChart });
