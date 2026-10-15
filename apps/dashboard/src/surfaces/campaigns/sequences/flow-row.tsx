/**
 * One row of a sequence's flow (the canvas's Steps board): its node on the line that joins the flow, what it says, and
 * what stands at its end. The record's Steps (steps.tsx) and a new sequence's draft (new.tsx) draw their flows with it, so
 * a draft reads as the sequence it will be. Opened, its body takes the end's column too (a step being changed).
 */
import type { ReactNode } from "react";
import { cx } from "../../kit/variants";

export function FlowRow(p: {
  node: ReactNode;
  tone?: "done" | "now" | "dot" | null;
  end?: ReactNode;
  open?: boolean;
  children: ReactNode;
  testid?: string;
}) {
  return (
    <li className={cx("sq-fl", p.open && "is-open")} data-testid={p.testid}>
      <span className={cx("sq-fl-node", p.tone && `is-${p.tone}`)} aria-hidden="true">
        {p.node}
      </span>
      <div className="sq-fl-body">{p.children}</div>
      {p.end ? <div className="sq-fl-end">{p.end}</div> : null}
    </li>
  );
}
