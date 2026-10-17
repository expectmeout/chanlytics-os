/**
 * A check's mark (moved from legacy/pages/leads-peek.jsx, decision 0015), which the lead sheet's Why tab draws beside
 * each check (sheet/panes.tsx).
 */
import type { SVGProps } from "react";

const LD_MARKS = {
  check: "M3.5 8.5l3 3 6-6.5",
  cross: "M4.5 4.5l7 7M11.5 4.5l-7 7",
};

/**
 * A check's mark. Nothing Claude read wears a plain check (PRD 0.1, P2): what was seen gets the check, what was read
 * gets a dashed ring, and either can say it could not tell.
 */
export const ldCheckMark = (how: "seen" | "read", answer: "yes" | "no" | "unknown") => {
  const p: SVGProps<SVGSVGElement> = {
    width: 13,
    height: 13,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  if (answer === "unknown")
    return (
      <span className="pk-ck-mark pk-ck-ask">
        <svg {...p}>
          <path d="M6 6.2a2 2 0 113 1.8v1" />
          <circle cx="8" cy="11.6" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      </span>
    );
  if (answer === "no")
    return (
      <span className={`pk-ck-mark pk-ck-cross${how === "read" ? " pk-ck-read" : ""}`}>
        <svg {...p}>
          <path d={LD_MARKS.cross} />
        </svg>
      </span>
    );
  if (how === "read")
    return (
      <span className="pk-ck-mark pk-ck-read">
        <svg {...p}>
          <circle cx="8" cy="8" r="5.5" strokeDasharray="2.5 2.5" />
        </svg>
      </span>
    );
  return (
    <span className="pk-ck-mark pk-ck-check">
      <svg {...p}>
        <path d={LD_MARKS.check} />
      </svg>
    </span>
  );
};
