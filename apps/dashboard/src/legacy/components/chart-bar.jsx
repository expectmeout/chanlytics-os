/* global React, ckNice, ckTopRound, ckFrame, ckEvery, ckHeight, ckPointer, ckTip, ckDescribe, CkYAxis, CkXLabels, useChartWidth, useChartNav, ChartTooltip, ChartTooltipContent, ChartLive */
// Bar charts: columns over days (one series, or a stack of them), and a list of horizontal bars for categories.
//
// A column is at most 24px wide and never fills its slot; stacked segments touch through a 2px gap of card, the top
// segment carries the 4px rounded end, the foot is square on the baseline. The whole slot of a day is its target, and
// the hovered or focused day stays while the others step back.

const CK_BAR_GAP = 2;

// data: [{ day, label, short?, ...values }] · keys: series keys, bottom first · config: the card's, for the words
// height: a number, or "fill" to take the room the card has left, never under `floor`
// tip(d, i) and describe(d, i) replace the words said from config; tipNote(d) adds a line under the default tip
const BarChart = ({ data, keys, config = {}, height = 208, floor = 128, yTicks = 3, tip = null, tipNote = null, describe = null, ariaLabel, animKey }) => {
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
  const cx = (i) => f.L + i * slot + slot / 2;
  const at = (e) => {
    const i = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - f.L) / Math.max(1, slot));
    return i >= 0 && i < n ? i : null;
  };
  const d = active === null ? null : data[active];
  const said = d && (tip ? tip(d, active) : ckTip(d, keys, config, { note: tipNote ? tipNote(d) : null }));
  return (
    <div className={`ck-plot${fill ? " fill" : ""}`} ref={ref} role="group" aria-roledescription="chart" aria-label={ariaLabel} {...nav} {...ckPointer(setActive, at)} style={fill ? { minHeight: floor } : { height: H }}>
      {width > 0 && (
        <svg key={animKey} width={width} height={H} className="ck-svg" aria-hidden="true">
          <CkYAxis ticks={ticks} y={f.y} L={f.L} width={width} R={f.R} />
          {data.map((row, i) => {
            const x = cx(i) - bw / 2;
            // Stack up from the baseline; the gap between neighbours comes out of the upper segment, so the column's
            // full height still reads the day's total.
            const drawn = [];
            let b = f.y(0);
            keys.forEach((k) => {
              const v = Number(row[k]) || 0;
              if (v <= 0) return;
              const gap = drawn.length ? CK_BAR_GAP : 0;
              const h = Math.max(1, f.ph * (v / max) - gap);
              const top = b - gap - h;
              drawn.push({ k, top, h });
              b = top;
            });
            const last = drawn.length - 1;
            const cls = active === null ? "ck-col" : active === i ? "ck-col hot" : "ck-col dim";
            return (
              <g key={row.day || i} className={cls} style={{ "--i": i }}>
                {drawn.map((s, j) => (j === last
                  ? <path key={s.k} d={ckTopRound(x, s.top, bw, s.h, 4)} fill={`var(--color-${s.k})`} className="ck-bar" />
                  : <rect key={s.k} x={x} y={s.top} width={bw} height={s.h} fill={`var(--color-${s.k})`} className="ck-bar" />))}
              </g>
            );
          })}
          <CkXLabels data={data} x={cx} every={ckEvery(n, f.pw, 46)} height={H} edges={slot < 44} />
        </svg>
      )}
      <ChartTooltip x={active === null ? null : cx(active)} width={width}>{said ? <ChartTooltipContent {...said} /> : null}</ChartTooltip>
      <ChartLive text={d ? (describe ? describe(d, active) : ckDescribe(d, keys, config)) : ""} />
    </div>
  );
};

// Horizontal bars for categories. A label and its value read as one line with the bar under them, so a narrow card
// never cuts a label short; no track behind the bar. A row with a door is a button.
// rows: [{ id, label, value, display?, color? }] · onPick(row) opens its door · max: what a full bar is (the largest by default)
const BarList = ({ rows, color = "var(--chart-1)", onPick = null, max = null }) => {
  const top = max || Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="ck-barlist">
      {rows.map((r, i) => {
        const pct = Math.max(r.value ? 1.5 : 0, (r.value / top) * 100);
        const Row = onPick ? "button" : "div";
        return (
          <li key={r.id} style={{ "--i": i }}>
            <Row type={onPick ? "button" : undefined} className={`ck-barlist-row${onPick ? " door" : ""}`} onClick={onPick ? () => onPick(r) : undefined}>
              <span className="ck-barlist-head">
                <span className="ck-barlist-label">{r.label}</span>
                <b className="ck-barlist-value">{r.display != null ? r.display : r.value}</b>
              </span>
              <span className="ck-barlist-track"><i className="ck-barlist-bar" style={{ width: `${Math.round(pct * 10) / 10}%`, background: r.color || color }} /></span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
};

Object.assign(window, { BarChart, BarList });
