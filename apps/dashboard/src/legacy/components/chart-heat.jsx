/* global React, ckPointer, useChartWidth, useChartNav, ChartTooltip, ChartTooltipContent, ChartLive */
// A heat strip: the 24 hours of a day as cells, darker where more people reached the business. One hue, light to
// dark, in five steps (the ordinal ink ramp); an hour with nobody is the empty step, never the lightest blue. The
// hour names are the view model's, printed every sixth hour; focus starts on the busiest hour.

// values: a number per hour · labels: each hour in words · unit: what a value counts, for the words
const HeatStrip = ({ values, labels, unit = "", ariaLabel, tip = null, describe = null }) => {
  const [ref, width] = useChartWidth();
  const n = values.length;
  const max = Math.max(1, ...values);
  const [active, setActive, nav] = useChartNav(n, { start: values.indexOf(Math.max(...values)) });
  const height = 28;
  const gap = 2;
  const cw = Math.max(2, (width - gap * (n - 1)) / n);
  const level = (v) => (v <= 0 ? 0 : Math.min(5, Math.ceil((v * 5) / max)));
  const at = (e) => {
    const i = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / (cw + gap));
    return i >= 0 && i < n ? i : null;
  };
  const span = (h) => `${labels[h]} to ${labels[(h + 1) % n]}`;
  const words = active === null ? null : tip ? tip(active)
    : { title: span(active), rows: [{ key: "h", color: "var(--chart-1)", label: unit, value: values[active] }] };
  const live = active === null ? "" : describe ? describe(active) : `${span(active)}: ${values[active]} ${unit}`.trim();
  return (
    <div className="ck-plot ck-heat" ref={ref} role="group" aria-roledescription="chart" aria-label={ariaLabel} {...nav} {...ckPointer(setActive, at)} style={{ height: height + 18 }}>
      {width > 0 && (
        <svg width={width} height={height + 18} className="ck-svg" aria-hidden="true">
          {values.map((v, i) => (
            <g key={i}>
              <rect x={i * (cw + gap)} y={0} width={cw} height={height} rx="3"
                fill={level(v) ? `var(--chart-ramp-${level(v)})` : "var(--chart-empty)"}
                className={`ck-cell${active === i ? " hot" : active !== null ? " dim" : ""}`} />
              {i % 6 === 0 && <text x={i * (cw + gap)} y={height + 14} className="ck-tick" textAnchor="start">{labels[i]}</text>}
            </g>
          ))}
        </svg>
      )}
      <ChartTooltip x={active === null ? null : active * (cw + gap) + cw / 2} width={width}>{words ? <ChartTooltipContent {...words} /> : null}</ChartTooltip>
      <ChartLive text={live} />
    </div>
  );
};

Object.assign(window, { HeatStrip });
