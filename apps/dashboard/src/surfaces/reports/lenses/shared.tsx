/**
 * What the lenses share (moved from sections.tsx, decision 0015): the props every lens body takes, and the card a period
 * nobody wrote or called in draws.
 */
import type { ReportPeriodId, ReportVM } from "@chanlytics/contracts";
import { EmptyState } from "../../kit/empty/empty";
import type { ReportsSurface } from "../surface";

/** What a lens body draws from: the one read the surface holds, the row's own period switch, and whether the page is a phone's. */
export interface LensProps {
  R: ReportsSurface;
  pick: (period: ReportPeriodId) => Promise<void>;
  phone: boolean;
}

/** Nothing came in: the period said so, and a door to a longer one. */
export function nothingCameIn(vm: ReportVM, period: ReportPeriodId, pick: (period: ReportPeriodId) => Promise<void>) {
  return (
    <EmptyState
      kind="card"
      glyph="wave"
      title="Nothing came in"
      testid="reports-empty"
      body={`Nobody wrote or called between ${vm.since} and ${vm.until}.`}
      action={period !== "90d" ? { label: "Look at 90 days", onClick: () => void pick("90d") } : null}
    />
  );
}
