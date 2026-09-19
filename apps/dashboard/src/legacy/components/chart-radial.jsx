/* global React, ckArcLine, ckPolar */
// A radial meter: one share against its whole, for the numbers that are a ratio (answered, booked). A 270-degree arc
// in ink on a track that is a pale step of the same ink, so the unfilled part still reads as "of this"; a small tick
// marks the period before when there is one. Round caps; the value sweeps in once, never loops.

// value: 0..1 · marker: 0..1 or null · children: what the centre says
const RadialChart = ({ value, marker = null, size = 112, thickness = 10, ariaLabel, children }) => {
  const cx = size / 2, cy = size / 2, r = size / 2 - thickness / 2 - 2;
  const rad = (270 * Math.PI) / 180;
  const a0 = -rad / 2;
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const len = r * rad * v;
  const m = marker == null ? null : a0 + rad * Math.max(0, Math.min(1, marker));
  const tick = m == null ? null : [ckPolar(cx, cy, r - thickness / 2 - 3, m), ckPolar(cx, cy, r + thickness / 2 + 3, m)];
  return (
    <div className="ck-radial" style={{ width: size, height: size }} role="img" aria-label={ariaLabel}>
      <svg width={size} height={size} className="ck-svg" aria-hidden="true">
        <path d={ckArcLine(cx, cy, r, a0, a0 + rad)} className="ck-radial-track" strokeWidth={thickness} />
        {v > 0 && <path d={ckArcLine(cx, cy, r, a0, a0 + rad * v)} className="ck-radial-value" strokeWidth={thickness} style={{ "--len": len }} />}
        {tick && <line x1={tick[0][0]} y1={tick[0][1]} x2={tick[1][0]} y2={tick[1][1]} className="ck-radial-marker" />}
      </svg>
      <div className="ck-radial-center">{children}</div>
    </div>
  );
};

Object.assign(window, { RadialChart });
