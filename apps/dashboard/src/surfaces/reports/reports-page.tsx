/**
 * Chanlytics, Reports: the page shell (moved from legacy/pages/reports.jsx, decision 0015). One row above everything
 * (the period, its days and the Ask door), then the sections (sections.tsx), then the reach-outs and Google's reviews.
 * A real workspace draws the bridge's own numbers (`useSurface("reports")`); a demo session draws the same page from the
 * contracts sample (sample.ts); without either, the page says what Reports reads.
 */
import { useEffect, useState } from "react";
import { REPORT_PERIOD_DEFAULT, REPORT_RANGES, type ReportPeriodId } from "@chanlytics/contracts";
import { askAbout, demoSession } from "../legacy-verbs";
import { EmptyState } from "../kit/empty/empty";
import { Icon } from "../kit/icon/icon";
import { useSurface } from "../use-surface";
import { GoogleSection } from "./google";
import { setReportRange } from "./period";
import { RptReachOuts } from "./reach-outs";
import { reportsSample } from "./sample";
import { ReportsSections } from "./sections";
import type { ReportsSurface } from "./surface";

/** Reports read nothing: a session with no workspace, and no demo to draw. */
function readsAWorkspace() {
  return (
    <div className="rpt" data-testid="reports-none">
      <div className="rpt-inner">
        <EmptyState
          kind="page"
          glyph="wave"
          title="Reports reads a workspace's own numbers"
          body="Open a workspace to see what its receptionist answered, who reached it, and what its campaigns sent."
        />
      </div>
    </div>
  );
}

/** One row above everything: the period, the days it covers, and a door to ask about them. */
function periodRow(p: {
  R: ReportsSurface;
  busy: boolean;
  failed: ReportPeriodId | null;
  pick: (period: ReportPeriodId) => Promise<void>;
}) {
  const { R, busy, failed, pick } = p;
  const vm = R.vm;
  return (
    <div className="rpt-head">
      <div className="rpt-range" role="group" aria-label="Period">
        {REPORT_RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={R.period === r.id ? "on" : ""}
            aria-pressed={R.period === r.id}
            aria-disabled={busy}
            onClick={() => void pick(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <span className="rpt-dates" title={`Days follow ${vm.timezone}`}>
        {vm.since} to {vm.until}
      </span>
      {failed && (
        <span className="rpt-failed" role="status" aria-live="polite">
          Couldn't load {REPORT_RANGES.find((r) => r.id === failed)?.label}. Still showing {vm.rangeLabel}.
        </span>
      )}
      <button
        type="button"
        className="rpt-ask"
        aria-label="Ask about this period"
        onClick={() => askAbout({ prompt: `What stood out in my last ${vm.rangeLabel}?` })}
        data-testid="reports-ask"
      >
        <Icon name="sparkle" size={13} />
        <span className="rpt-ask-label">Ask about this period</span>
      </button>
    </div>
  );
}

export function ReportsPage() {
  const live = useSurface("reports");
  // A demo's own period: the sample answers at once, so the tabs switch it here.
  const [samplePeriod, setSamplePeriod] = useState<ReportPeriodId>(REPORT_PERIOD_DEFAULT);
  const [busy, setBusy] = useState(false);
  // The period that failed to load, if any: the page keeps the old one and says so, instead of dimming forever and
  // switching later on its own.
  const [failed, setFailed] = useState<ReportPeriodId | null>(null);
  const fetchedAt = live ? live.fetchedAt : 0;
  useEffect(() => {
    setBusy(false);
  }, [fetchedAt]);
  const R = live || (demoSession() ? reportsSample(samplePeriod) : null);
  if (!R) return readsAWorkspace();
  const pick = async (period: ReportPeriodId) => {
    // One period at a time: while one loads the tabs hold, rather than start a second load over the first.
    if (busy || period === R.period) return;
    if (!live) {
      setSamplePeriod(period);
      return;
    }
    setBusy(true);
    setFailed(null);
    const ok = await setReportRange(period);
    if (!ok) {
      setBusy(false);
      setFailed(period);
    }
  };
  return (
    // A period on its way dims by the one rule every page uses (components.css [data-loading] [data-dims]).
    <div className="rpt" data-testid={live ? "reports-real" : "reports-sample"} data-loading={busy ? "" : undefined}>
      <div className="rpt-inner">
        {/* One row above everything: the period, the days it covers, and a door to ask about them. The top bar says
            Reports; the page does not title itself. */}
        {periodRow({ R, busy, failed, pick })}
        <div className="rpt-body" data-dims aria-busy={busy ? "true" : "false"}>
          <ReportsSections R={R} pick={pick} />
          {/* What the reach-outs wrote and what came back (Reach out Part 6, H3): a section of its own, after Campaigns. */}
          <RptReachOuts R={R} />
          <GoogleSection days={R.days} />
        </div>
      </div>
    </div>
  );
}
