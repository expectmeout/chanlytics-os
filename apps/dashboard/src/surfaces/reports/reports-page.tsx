/**
 * Chanlytics, Reports: the page on its App Router route (`reports/[[...lens]]`, decision 0015, and the lenses spec). One page of
 * lenses, each at its own address (`/w/<slug>/reports/<lens>`, the Overview at `/w/<slug>/reports`). The page follows its own
 * address, as People's does (the path the App Router page hands it), so a move between two lenses is a pushed or replaced entry and
 * never a request for a page, and every lens draws from the one read the surface holds, so a move asks for nothing and never
 * blanks the body. The frame draws the strip of lenses (chrome.ts, its `views`) and the head (head.ts); the period and its days stand
 * at the right of the strip's row on a desk, as the page's act (head.ts), and on a row of their own above the body on a phone; the
 * page draws the lens's body (lenses/). A real workspace draws the bridge's own numbers
 * (`useSurface("reports")`); a demo session draws the same page from the contracts sample (sample.ts); without either, the page says
 * what Reports reads.
 */
import { useEffect, useState } from "react";
import {
  REPORT_PERIOD_DEFAULT,
  REPORT_RANGES,
  lensOfRoute,
  routeOfPath,
  type LensId,
  type ReportPeriodId,
} from "@chanlytics/contracts";
import { demoSession } from "../legacy-verbs";
import { EmptyState } from "../kit/empty/empty";
import { Segmented } from "../kit/segmented/segmented";
import { Tooltip } from "../kit/tooltip/tooltip";
import { useSurface } from "../use-surface";
import { useRptDesk, useRptPhone } from "./blocks";
import { lensShownHere } from "./chrome";
import { useReportsStanding } from "./head";
import { CampaignsLens } from "./lenses/campaigns";
import { OverviewLens } from "./lenses/overview";
import { PeopleLens } from "./lenses/people";
import { PipelineLens } from "./lenses/pipeline";
import { ReceptionistLens } from "./lenses/receptionist";
import { ReviewsLens } from "./lenses/reviews";
import { LensEmpty, type LensProps } from "./lenses/shared";
import { setReportRange } from "./period";
import { reportsSample } from "./sample";
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

interface PeriodProps {
  R: ReportsSurface;
  /** The period the control shows: the pick as it is made, until the page's own catches up with it. */
  chosen: ReportPeriodId;
  failed: ReportPeriodId | null;
  pick: (period: ReportPeriodId) => Promise<void>;
}

/** The period's three parts: the control, the days it covers, and what is said of a period that failed to load. */
function periodParts({ R, chosen, failed, pick }: PeriodProps) {
  const vm = R.vm;
  return {
    // The control never holds while a period loads: an arrow key chooses and choosing reads, so a key held on 30 days must be
    // able to go on to Month. Each pick is read, the surface drops the answer for a period left, and the latest pick wins.
    control: (
      <Segmented
        label="Period"
        value={chosen}
        onValueChange={(next) => void pick(next)}
        options={REPORT_RANGES.map((r) => ({ value: r.id, label: r.label, testid: `period-${r.id}` }))}
      />
    ),
    dates: (
      <Tooltip tip={`Days follow ${vm.timezone}`}>
        <span
          className="rpt-dates"
          // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a focus stop for its tip, the one way a keyboard reads which zone the days follow
          tabIndex={0}
          aria-description={`Days follow ${vm.timezone}`}
        >
          {vm.since} to {vm.until}
        </span>
      </Tooltip>
    ),
    failedLine: failed ? (
      <span className="rpt-failed" role="status" aria-live="polite">
        Couldn't load {REPORT_RANGES.find((r) => r.id === failed)?.label}. Still showing {vm.rangeLabel}.
      </span>
    ) : null,
  };
}

/**
 * The period on a desk: the page's act, at the right of the strip of lenses (head.ts), the control at the row's end with the days
 * it covers before it (Ruben, 6 Oct 2026: it stood on a row of its own under the strip).
 */
function periodAct(p: PeriodProps) {
  const { control, dates, failedLine } = periodParts(p);
  return (
    <div className="rpt-period" data-testid="reports-period">
      {failedLine}
      {dates}
      {control}
    </div>
  );
}

/** The period on a phone: one row above the body, under the strip, as it stood. */
function periodRow(p: PeriodProps) {
  const { control, dates, failedLine } = periodParts(p);
  return (
    <div className="rpt-head" data-testid="reports-period">
      {control}
      {dates}
      {failedLine}
    </div>
  );
}

/** The lens's body: nothing where it is not yet known to be shown, what it says where it is not shown, else its cards. */
function lensBody(lens: LensId, props: LensProps, shown: boolean | null) {
  if (shown === null) return null;
  if (!shown) return <LensEmpty lens={lens} vm={props.R.vm} />;
  switch (lens) {
    case "overview":
      return <OverviewLens {...props} />;
    case "receptionist":
      return <ReceptionistLens {...props} />;
    case "people":
      return <PeopleLens {...props} />;
    case "pipeline":
      return <PipelineLens {...props} />;
    case "campaigns":
      return <CampaignsLens {...props} />;
    case "reviews":
      return <ReviewsLens {...props} />;
  }
}

export function ReportsPage({ pathname }: { pathname: string | null }) {
  // The lens the address names; the frame hands the page only the addresses it takes (surfaces/routes.ts), so an address that is no
  // lens is not drawn here at all.
  const lens = lensOfRoute(routeOfPath(pathname) ?? "reports") ?? "overview";
  const phone = useRptPhone();
  const live = useSurface("reports");
  // A demo's own period: the sample answers at once, so the tabs switch it here.
  const [samplePeriod, setSamplePeriod] = useState<ReportPeriodId>(REPORT_PERIOD_DEFAULT);
  // The period picked and not yet shown: what the control says, and what dims the body until its answer lands.
  const [pending, setPending] = useState<ReportPeriodId | null>(null);
  // The period that failed to load, if any: the page keeps the old one and says so, instead of dimming forever and
  // switching later on its own.
  const [failed, setFailed] = useState<ReportPeriodId | null>(null);
  const fetchedAt = live ? live.fetchedAt : 0;
  useEffect(() => {
    setPending(null);
  }, [fetchedAt]);
  const R = live || (demoSession() ? reportsSample(samplePeriod) : null);
  const desk = useRptDesk();
  const pick = async (period: ReportPeriodId) => {
    // The one shown, or the one on its way: nothing to read. Any other pick is read, whatever else is out.
    if (!R || period === (pending ?? R.period)) return;
    if (!live) {
      setSamplePeriod(period);
      return;
    }
    setPending(period);
    setFailed(null);
    const ok = await setReportRange(period);
    if (!ok) {
      setPending(null);
      setFailed(period);
    }
  };
  const period = R ? { R, chosen: pending ?? R.period, failed, pick } : null;
  useReportsStanding(lens, R, period && desk ? periodAct(period) : null);
  if (!R || !period) return readsAWorkspace();
  // Dimmed while the page shows another period than the one picked. A pick painted at once from a held view (a pick back to
  // the period on screen, made while another loads) waits on nothing, though the read behind it is still out.
  const busy = pending !== null && pending !== R.period;
  return (
    // A period on its way dims by the one rule every page uses (components.css [data-loading] [data-dims]).
    <div
      className="rpt"
      data-testid={live ? "reports-real" : "reports-sample"}
      data-lens={lens}
      data-loading={busy ? "" : undefined}
    >
      <div className="rpt-inner">
        {/* On a phone, one row above everything: the period and the days it covers (a desk's stand at the right of the strip
            of lenses, the page's act). The frame's head says Reports and the lens's answer; the page does not title itself. */}
        {!desk && periodRow(period)}
        <div className="rpt-body" data-dims aria-busy={busy ? "true" : "false"}>
          {lensBody(lens, { R, pick, phone }, lensShownHere(lens))}
        </div>
      </div>
    </div>
  );
}
