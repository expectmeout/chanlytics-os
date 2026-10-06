/**
 * Chanlytics, Reports: the page on its App Router route (`reports/[[...lens]]`, decision 0015, and the lenses spec). One page of
 * lenses, each at its own address (`/w/<slug>/reports/<lens>`, the Overview at `/w/<slug>/reports`). The page follows its own
 * address, as People's does (the path the App Router page hands it), so a move between two lenses is a pushed or replaced entry and
 * never a request for a page, and every lens draws from the one read the surface holds, so a move asks for nothing and never
 * blanks the body. The frame draws the strip of lenses (chrome.ts, its `views`) and the head (head.ts); the page draws one row above
 * everything (the period, its days and the Ask door) and the lens's body (lenses/). A real workspace draws the bridge's own numbers
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
import { askAbout, demoSession } from "../legacy-verbs";
import { Button } from "../kit/button/button";
import { EmptyState } from "../kit/empty/empty";
import { Icon } from "../kit/icon/icon";
import { Segmented } from "../kit/segmented/segmented";
import { useSurface } from "../use-surface";
import { useRptPhone } from "./blocks";
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

/** One row above everything: the period, the days it covers, and a door to ask about them. */
function periodRow(p: {
  R: ReportsSurface;
  /** The period the control shows: the pick as it is made, until the page's own catches up with it. */
  chosen: ReportPeriodId;
  failed: ReportPeriodId | null;
  pick: (period: ReportPeriodId) => Promise<void>;
}) {
  const { R, chosen, failed, pick } = p;
  const vm = R.vm;
  return (
    <div className="rpt-head">
      {/* The control never holds while a period loads: an arrow key chooses and choosing reads, so a key held on 30 days must be
          able to go on to Month. Each pick is read, the surface drops the answer for a period left, and the latest pick wins. */}
      <Segmented
        label="Period"
        value={chosen}
        onValueChange={(next) => void pick(next)}
        options={REPORT_RANGES.map((r) => ({ value: r.id, label: r.label, testid: `period-${r.id}` }))}
      />
      <span className="rpt-dates" title={`Days follow ${vm.timezone}`}>
        {vm.since} to {vm.until}
      </span>
      {failed && (
        <span className="rpt-failed" role="status" aria-live="polite">
          Couldn't load {REPORT_RANGES.find((r) => r.id === failed)?.label}. Still showing {vm.rangeLabel}.
        </span>
      )}
      <Button
        size="sm"
        className="rpt-ask"
        aria-label="Ask about this period"
        onClick={() => askAbout({ prompt: `What stood out in my last ${vm.rangeLabel}?` })}
        data-testid="reports-ask"
      >
        <Icon name="sparkle" size={13} />
        <span className="rpt-ask-label">Ask about this period</span>
      </Button>
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
  useReportsStanding(lens, R);
  if (!R) return readsAWorkspace();
  const pick = async (period: ReportPeriodId) => {
    // The one shown, or the one on its way: nothing to read. Any other pick is read, whatever else is out.
    if (period === (pending ?? R.period)) return;
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
  const busy = pending !== null;
  return (
    // A period on its way dims by the one rule every page uses (components.css [data-loading] [data-dims]).
    <div
      className="rpt"
      data-testid={live ? "reports-real" : "reports-sample"}
      data-lens={lens}
      data-loading={busy ? "" : undefined}
    >
      <div className="rpt-inner">
        {/* One row above everything: the period, the days it covers, and a door to ask about them. The frame's head says
            Reports and the lens's answer; the page does not title itself. */}
        {periodRow({ R, chosen: pending ?? R.period, failed, pick })}
        <div className="rpt-body" data-dims aria-busy={busy ? "true" : "false"}>
          {lensBody(lens, { R, pick, phone }, lensShownHere(lens))}
        </div>
      </div>
    </div>
  );
}
