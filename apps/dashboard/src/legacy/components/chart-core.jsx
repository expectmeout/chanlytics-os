/* global React, Icon */
// Chanlytics chart kit: the core every chart builds on.
//
// Shaped like shadcn/ui's charts: a `config` names each series once ({ key: { label, color, icon?, shape? } }). The
// ChartCard a chart sits in publishes each colour as a CSS variable (--color-<key>) on its own <section>, so a chart
// body only ever paints var(--color-<key>); the card also draws the legend (for two or more series), the Chart/Table
// switch, the table twin and its CSV. There is no React context: the node test stub renders children before their
// parents, so a chart that needs the labels takes the same `config` as a prop.
//
// Every chart is plain SVG drawn at the width it is given (measured by a ResizeObserver, never a stretched viewBox),
// so text stays crisp and never scales; it starts at 600px so nothing paints blank before the first measure.
//
// What this file holds for every chart (the dataviz method): thin marks, a 2px gap of card between touching marks,
// 4px rounded data ends square at the baseline, solid hairline grids, text in ink tokens and never in a series
// colour, one tab stop per chart with the arrow keys walking it and a live region saying each point, a tooltip that
// stays inside the card at any width, and a table twin with its CSV for every chart.

const { useState: useCkState, useRef: useCkRef, useLayoutEffect: useCkLayout } = React;

// ---------- numbers ----------

// A clean axis from 0 in about `count` steps of 1, 2, 5 or 10 x 10^n (and 2.5 when the values are not counts).
const ckNice = (max, count = 3, { integer = true } = {}) => {
  const m = Math.max(integer ? 1 : 1e-6, Number(max) || 0);
  const raw = m / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const steps = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  let step = steps.map((k) => k * p).find((s) => s >= raw) || 10 * p;
  if (integer) step = Math.max(1, Math.round(step));
  const top = Math.ceil(m / step - 1e-9) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return { max: top, step, ticks };
};

// Seconds in the steps people count in: 5s, 10s, 15s, 30s, 1m, 2m, 5m, 10m, 15m, 30m, 1h.
const CK_SECOND_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
const ckNiceSeconds = (max, count = 3) => {
  const m = Math.max(5, Number(max) || 0);
  const step = CK_SECOND_STEPS.find((s) => s >= m / count) || 3600;
  const top = Math.ceil(m / step) * step;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { max: top, step, ticks };
};
// An axis tick in seconds. Ticks are whole steps of the list above, so this never meets a value fmtSeconds would
// round differently; a data value is always said by contracts' fmtSeconds, never by this.
const ckSecondsLabel = (s) => {
  if (s < 60) return `${s}s`;
  if (s < 3600) return s % 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s / 60}m`;
  return s % 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${s / 3600}h`;
};

// ---------- geometry ----------

// d3's curveMonotoneX (Steffen, 1990): smooth, and it never overshoots its data, so a count of 0 is never drawn
// below the baseline and a peak never above itself.
const ckMonotone = (pts) => {
  const n = pts.length;
  if (!n) return "";
  const f = (v) => Math.round(v * 10) / 10;
  if (n === 1) return `M${f(pts[0][0])},${f(pts[0][1])}`;
  if (n === 2) return `M${f(pts[0][0])},${f(pts[0][1])}L${f(pts[1][0])},${f(pts[1][1])}`;
  const sign = (x) => (x < 0 ? -1 : 1);
  const slope3 = (i) => {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const h0 = x1 - x0, h1 = x2 - x1;
    const s0 = (y1 - y0) / (h0 || (h1 < 0 && -0)), s1 = (y2 - y1) / (h1 || (h0 < 0 && -0));
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  };
  const slope2 = (a, b, t) => { const h = pts[b][0] - pts[a][0]; return h ? (3 * (pts[b][1] - pts[a][1]) / h - t) / 2 : t; };
  const t = new Array(n);
  for (let i = 1; i < n - 1; i++) t[i] = slope3(i);
  t[0] = slope2(0, 1, t[1]);
  t[n - 1] = slope2(n - 2, n - 1, t[n - 2]);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], dx = (x1 - x0) / 3;
    d += `C${f(x0 + dx)},${f(y0 + dx * t[i])},${f(x1 - dx)},${f(y1 - dx * t[i + 1])},${f(x1)},${f(y1)}`;
  }
  return d;
};

// Runs of consecutive points: a day with nothing to plot is a gap in the line, never a dive to 0.
const ckRuns = (pts) => {
  const runs = [];
  let cur = [];
  for (const p of pts) {
    if (p == null) { if (cur.length) runs.push(cur); cur = []; } else cur.push(p);
  }
  if (cur.length) runs.push(cur);
  return runs;
};

// Angles in radians, 0 at twelve o'clock, clockwise.
const ckPolar = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];

// An annular sector (a donut slice). A full turn is two halves: an arc from a point to itself draws nothing.
const ckArc = (cx, cy, r0, r1, a0, a1) => {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const mid = a0 + Math.PI;
    return ckArc(cx, cy, r0, r1, a0, mid) + ckArc(cx, cy, r0, r1, mid, a0 + Math.PI * 2);
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = ckPolar(cx, cy, r1, a0), [x1, y1] = ckPolar(cx, cy, r1, a1);
  const [x2, y2] = ckPolar(cx, cy, r0, a1), [x3, y3] = ckPolar(cx, cy, r0, a0);
  return `M${x0},${y0}A${r1},${r1} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${r0},${r0} 0 ${large} 0 ${x3},${y3}Z`;
};

// The centre line of an arc, for a stroked, round-capped radial mark.
const ckArcLine = (cx, cy, r, a0, a1) => {
  const sweep = Math.min(a1 - a0, Math.PI * 2 - 1e-4);
  const [x0, y0] = ckPolar(cx, cy, r, a0), [x1, y1] = ckPolar(cx, cy, r, a0 + sweep);
  return `M${x0},${y0}A${r},${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x1},${y1}`;
};

// A column with a 4px rounded data end and a square foot on the baseline.
const ckTopRound = (x, y, w, h, r = 4) => {
  if (h <= 0 || w <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
};

// How wide the y-axis labels need to be, from the longest (Geist Mono at 10.5px is about 6.3px a character).
const ckAxisWidth = (labels) => 10 + Math.max(1, ...labels.map((l) => String(l).length)) * 6.3;

// ---------- the frame every x-y chart shares ----------

// The plot inside its margins: the left margin fits the y labels, and y(v) maps a value onto the plot.
const ckFrame = ({ width, height, max, ticks, labels = ticks, R = 10, T = 12, B = 24 }) => {
  const L = ckAxisWidth(labels);
  const pw = Math.max(0, width - L - R);
  const ph = height - T - B;
  return { L, R, T, B, pw, ph, y: (v) => T + ph * (1 - Math.min(v, max) / max) };
};

// How many points apart the x labels stand, so each has about `per` pixels of axis.
const ckEvery = (n, pw, per = 52) => Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / per))));

// The y axis: a solid hairline per tick (the baseline a step stronger), its label to the left, in ink.
const CkYAxis = ({ ticks, labels = ticks, y, L, width, R }) => (
  <g className="ck-y">
    {ticks.map((t, i) => (
      <g key={t}>
        <line x1={L} x2={width - R} y1={y(t)} y2={y(t)} className={t === 0 ? "ck-base" : "ck-grid"} />
        <text x={L - 8} y={y(t) + 3.5} className="ck-tick" textAnchor="end">{labels[i]}</text>
      </g>
    ))}
  </g>
);

// The x labels, one rule for every chart: every `every`-th point and always the last (the newest day), dropping the
// one too near the last; the first and last say the whole date, the rest the day of the month (all whole under nine
// points). `edges` anchors the first to its start and the last to its end, so neither spills past the plot.
const CkXLabels = ({ data, x, every, height, edges = true }) => {
  const n = data.length;
  return (
    <g className="ck-x">
      {data.map((row, i) => (i % every === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= every * 0.6) && (
        <text key={row.day || i} x={x(i)} y={height - 7} className="ck-tick"
          textAnchor={!edges || n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
          {i === 0 || i === n - 1 || n <= 8 ? row.label : (row.short || row.label)}
        </text>
      ))}
    </g>
  );
};

// ---------- sizing and the keyboard ----------

// The box a chart is given, measured, so it draws in real pixels; 600 wide until the first measure. The height is
// only wanted by a chart told to fill, and is 0 until measured, which is what `ckHeight` reads as "use the floor".
const useChartWidth = (initial = 600) => {
  const ref = useCkRef(null);
  const [box, setBox] = useCkState({ w: initial, h: 0 });
  useCkLayout(() => {
    const el = ref.current;
    if (!el) return undefined;
    const set = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.round(r.width));
      const h = Math.max(0, Math.round(r.height));
      // The same box is the same state: a resize that changes neither redraws nothing.
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    };
    set();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box.w, box.h];
};

// How tall to draw: the height the page fixed, or -- with "fill" -- the room its card has left over, never under the
// floor the page names. A row is as tall as the card with most to say, and the surplus used to fall as a hole under
// whichever card had least; a chart that fills spends it on itself instead. Every filling chart keeps a floor, so a
// row whose cards all fill is exactly as tall as it was before any of them did.
const ckHeight = (height, box, floor) => (height === "fill" ? Math.max(floor, box) : height);

// One tab stop per chart. Focus lands on `start` (the newest day by default), the arrows move one at a time, Home and
// End go to the ends, Escape lets go. A point held across a period change that no longer exists reads as none. (A
// stop per day was 270 unnamed stops at 90 days.)
const useChartNav = (n, { start = n - 1 } = {}) => {
  const [held, setActive] = useCkState(null);
  const active = held !== null && held < n ? held : null;
  const first = Math.max(0, Math.min(n - 1, start));
  const keys = {
    tabIndex: 0,
    onFocus: () => setActive((a) => (a === null || a >= n ? first : a)),
    onBlur: () => setActive(null),
    onKeyDown: (e) => {
      if (e.key === "Escape") { setActive(null); return; }
      const at = active === null ? first : active;
      const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? at + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp" ? at - 1
        : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
      if (to === null) return;
      e.preventDefault();
      setActive(Math.max(0, Math.min(n - 1, to)));
    },
  };
  return [active, setActive, keys];
};

// The pointer as the keyboard's twin: a mouse that leaves lets go; a finger's point stays until the next touch.
const ckPointer = (setActive, at) => ({
  onPointerMove: (e) => setActive(at(e)),
  onPointerDown: (e) => setActive(at(e)),
  onPointerLeave: (e) => { if (e.pointerType === "mouse") setActive(null); },
});

// ---------- words, legend, tooltip ----------

// What a chart says of a point when the page gives no words of its own: the row's label, then each series' value
// under its name from the config. The page passes `tip` or `describe` where a unit needs saying.
const ckTip = (row, keys, config, { title = row.label, note = null, extra = [] } = {}) => ({
  title,
  rows: [...keys.map((k) => ({ key: k, label: (config[k] || {}).label || k, value: row[k] == null ? "—" : row[k] })), ...extra],
  note,
});
const ckDescribe = (row, keys, config, extra = []) =>
  `${row.label}: ${[...keys.map((k) => ({ key: k, label: (config[k] || {}).label || k, value: row[k] == null ? "nothing" : row[k] })), ...extra]
    .map((r) => `${r.label} ${r.value}`).join(", ")}`;

// The legend mirrors the mark (a rect for bars and areas, a short line for lines), for two or more series: one
// series' legend only says the title again. Values ride beside the label in ink; the colour is only ever the key's.
// A status series (unanswered) carries its icon. Drawn inside a ChartCard or a SegmentBar, which publish the colours.
const ChartLegend = ({ config = {}, keys = null, values = null, min = 2 }) => {
  const list = (keys || Object.keys(config)).filter((k) => config[k]);
  if (list.length < min) return null;
  return (
    <div className="ck-legend">
      {list.map((k) => (
        <span key={k} className="ck-legend-item">
          <i className={`ck-key ${config[k].shape || "rect"}`} style={{ "--k": `var(--color-${k})` }} aria-hidden="true" />
          {config[k].icon && <Icon name={config[k].icon} size={11} className="ck-legend-icon" />}
          <span className="ck-legend-label">{config[k].label}</span>
          {values && values[k] != null && <b className="ck-legend-value">{values[k]}</b>}
        </span>
      ))}
    </div>
  );
};

// Values lead, labels follow: the reader has the series and wants the number. A row keys its series with a short
// stroke of its colour: a tooltip is never a legend, so never a box.
const ChartTooltipContent = ({ title = null, rows = [], note = null }) => (
  <div className="ck-tip-inner">
    {title && <div className="ck-tip-title">{title}</div>}
    {rows.map((r) => (
      <div className="ck-tip-row" key={r.key}>
        <i className="ck-key line" style={{ "--k": r.color || `var(--color-${r.key})` }} aria-hidden="true" />
        <b className="ck-tip-value">{r.value}</b>
        <span className="ck-tip-label">{r.label}</span>
      </div>
    ))}
    {note && <div className="ck-tip-note">{note}</div>}
  </div>
);

// The tooltip sits above the plot, beside the point it reads, on whichever side has room for its widest (260px);
// when neither side has, it spans the plot. Decided in pixels: a share of the width let it leave any plot narrower
// than about 800px, which is every card on a phone.
const CK_TIP_W = 260;
const CK_TIP_GAP = 14;
const ckTipSide = (x, width) => (x + CK_TIP_GAP + CK_TIP_W <= width ? "start" : x - CK_TIP_GAP - CK_TIP_W >= 0 ? "end" : "pin");
const ChartTooltip = ({ x, width, children }) => {
  if (x == null || !children) return null;
  const side = ckTipSide(x, width);
  return <div className={`ck-tip ${side}`} style={side === "pin" ? undefined : { left: `${x}px` }} role="presentation">{children}</div>;
};

const ChartLive = ({ text }) => <span className="ck-live" aria-live="polite">{text}</span>;

// ---------- card, table, CSV ----------

// Each series' colour as a CSS variable, for everything drawn inside.
const ckVars = (config) => {
  const vars = {};
  for (const [k, c] of Object.entries(config || {})) if (c && c.color) vars[`--color-${k}`] = c.color;
  return vars;
};

// A CSV of the table, each cell spelled by contracts' csvCell (window.__csvCell: quoted where it must be, and a cell
// a spreadsheet would run as a formula made text), one rule for every file the product writes.
const CK_BOM = String.fromCharCode(0xfeff);
const ckSaveCsv = (title, table) => {
  const cell = window.__csvCell;
  const body = [table.columns, ...table.rows].map((r) => r.map((v) => cell(v)).join(",")).join("\r\n");
  const blob = new Blob([CK_BOM + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// A number sits right, in tabular figures; a missing value is the tree's own dash, and an empty cell in the CSV.
const ChartTable = ({ columns, rows }) => {
  const numeric = columns.map((_, j) => rows.some((r) => typeof r[j] === "number"));
  return (
    <div className="ck-table-wrap">
      <table className="ck-table">
        <thead><tr>{columns.map((c, j) => <th key={j} className={numeric[j] ? "num" : ""}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === "number" ? "num" : ""}>{v == null ? "—" : v}</td>)}</tr>)}
          {!rows.length && <tr><td colSpan={columns.length} className="ck-table-empty">Nothing in this period.</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

// The table a chart's own rows make: the first column the row's label, then a column per series under its name.
const ckTwin = (twin, config) => (twin ? {
  columns: [twin.first || "Day", ...twin.keys.map((k) => (config && config[k] ? config[k].label : k))],
  rows: twin.data.map((d) => [d.label, ...twin.keys.map((k) => (d[k] == null ? null : d[k]))]),
} : null);

// The card every chart lives in: a title, one line of what it shows, the legend for two or more series, and on the
// right a Chart/Table switch and the CSV, which wait for the pointer or the keyboard (charts.css) and stay while the
// table shows. The card owns the series: `config` is published as --color-<key> on its <section>. The twin is
// `table` when the page has one of its own, or made from `twin: { data, keys, first }`. A card whose body is already
// a table passes switchable={false}: the CSV stays, the switch would only swap a table for a table. The page places
// the card with `className`; the kit knows no grid.
const ChartCard = ({ title, takeaway = null, testid, className = "", config = null, legend = null, table = null, twin = null, switchable = true, children }) => {
  const [asTable, setAsTable] = useCkState(false);
  const data = table || ckTwin(twin, config);
  const showTable = asTable && !!data;
  return (
    <section className={`ck-card${className ? ` ${className}` : ""}${showTable ? " is-table" : ""}`} data-testid={testid} style={ckVars(config)}>
      <header className="ck-card-head">
        <div className="ck-card-titles">
          <h3 className="ck-card-title">{title}</h3>
          {takeaway && <p className="ck-card-takeaway">{takeaway}</p>}
        </div>
        {data && (
          <div className="ck-card-actions">
            {switchable && (
              <div className="ck-seg" role="group" aria-label={`Show ${title} as`}>
                {/* A chart and its table are not one height: the switch holds still, the last card's too. */}
                <button type="button" className={showTable ? "" : "on"} aria-pressed={!showTable} onClick={(e) => (window.holdStill ? window.holdStill(e && e.currentTarget, () => setAsTable(false)) : setAsTable(false))} data-testid="card-chart">Chart</button>
                <button type="button" className={showTable ? "on" : ""} aria-pressed={showTable} onClick={(e) => (window.holdStill ? window.holdStill(e && e.currentTarget, () => setAsTable(true)) : setAsTable(true))} data-testid="card-table">Table</button>
              </div>
            )}
            <button type="button" className="ck-icon-btn" onClick={() => ckSaveCsv(title, data)} aria-label={`Save “${title}” as a CSV file`} title="Save as CSV" data-testid="card-csv">
              <Icon name="download" size={13} />
            </button>
          </div>
        )}
      </header>
      {config && legend !== false && !showTable && <ChartLegend config={config} values={legend ? legend.values : null} />}
      <div className="ck-card-body">{showTable ? <ChartTable columns={data.columns} rows={data.rows} /> : children}</div>
    </section>
  );
};

// One bar split into its parts, in the order given (a scale reads in its own order), with a 2px gap of card between
// them, under a small title; its legend names every part with its count, so a part of 0 is said, not drawn. `rows`
// are { key, value }; `config` names and colours them, and is published on the bar's own root.
const SegmentBar = ({ title, rows, config, testid, small = false }) => {
  const shown = rows.filter((r) => r.value > 0);
  if (!shown.length) return null;
  const label = (k) => (config[k] || {}).label || k;
  return (
    <div className="ck-segbar" data-testid={testid} style={ckVars(config)}>
      <span className="ck-segbar-title">{title}</span>
      <div className={`ck-segbar-bar${small ? " small" : ""}`} role="img" aria-label={rows.map((r) => `${r.value} ${label(r.key)}`).join(", ")}>
        {shown.map((r) => <i key={r.key} style={{ flexGrow: r.value, background: `var(--color-${r.key})` }} />)}
      </div>
      <ChartLegend config={config} keys={rows.map((r) => r.key)} values={Object.fromEntries(rows.map((r) => [r.key, r.value]))} min={1} />
    </div>
  );
};

Object.assign(window, {
  ckNice, ckNiceSeconds, ckSecondsLabel, ckMonotone, ckRuns, ckPolar, ckArc, ckArcLine, ckTopRound, ckAxisWidth,
  ckFrame, ckEvery, ckHeight, ckPointer, ckTip, ckDescribe, ckTipSide, ckVars, ckSaveCsv,
  useChartWidth, useChartNav,
  CkYAxis, CkXLabels, ChartLegend, ChartTooltip, ChartTooltipContent, ChartLive, ChartCard, ChartTable, SegmentBar,
});
