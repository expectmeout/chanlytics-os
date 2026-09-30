/**
 * A radial meter: one share against its whole, for the numbers that are a ratio (answered, booked). Moved whole from
 * legacy/components/chart-radial.jsx (decision 0015). A 270-degree arc in ink on a track that is a pale step of the same
 * ink, so the unfilled part still reads as "of this"; a small tick marks the period before when there is one. Round
 * caps; the value sweeps in once, never loops.
 */
import type { CSSProperties, ReactNode } from "react";
import { ckArcLine, ckPolar } from "./geometry";

export interface RadialChartProps {
  /** 0..1 */
  value: number;
  /** 0..1 or null: the period before. */
  marker?: number | null;
  size?: number;
  thickness?: number;
  ariaLabel: string;
  /** What the centre says. */
  children?: ReactNode;
}

export function RadialChart({
  value,
  marker = null,
  size = 112,
  thickness = 10,
  ariaLabel,
  children,
}: RadialChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - thickness / 2 - 2;
  const rad = (270 * Math.PI) / 180;
  const a0 = -rad / 2;
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const len = r * rad * v;
  const m = marker == null ? null : a0 + rad * Math.max(0, Math.min(1, marker));
  const tick =
    m == null ? null : [ckPolar(cx, cy, r - thickness / 2 - 3, m), ckPolar(cx, cy, r + thickness / 2 + 3, m)];
  const sweep = { "--len": len } as CSSProperties;
  return (
    <div className="ck-radial" style={{ width: size, height: size }} role="img" aria-label={ariaLabel}>
      <svg width={size} height={size} className="ck-svg" aria-hidden="true">
        <path d={ckArcLine(cx, cy, r, [a0, a0 + rad])} className="ck-radial-track" strokeWidth={thickness} />
        {v > 0 && (
          <path
            d={ckArcLine(cx, cy, r, [a0, a0 + rad * v])}
            className="ck-radial-value"
            strokeWidth={thickness}
            style={sweep}
          />
        )}
        {tick && (
          <line x1={tick[0]?.[0]} y1={tick[0]?.[1]} x2={tick[1]?.[0]} y2={tick[1]?.[1]} className="ck-radial-marker" />
        )}
      </svg>
      <div className="ck-radial-center">{children}</div>
    </div>
  );
}
