/**
 * The Results sheet (MOCKUP), at `campaigns/ads:results`: every ad's last 30 days in one sheet from the side over the Ads page (a
 * phone's rises from the bottom, as the drawer's does), scoped to all ads or one platform, with "Full report ›" to Reports › Ads
 * over the same days and the same scope. One fold (contracts `adsResultsOf`) draws it, Reports' lens and the page's figures, so
 * the three never disagree: the head, the page's four figures, the days, the platforms and what came of the bookings. A press
 * changes only what it shows; nothing leaves the browser.
 */
// Results' own rules, loaded with the sheet and with Reports' Ads lens, which draws the same parts.
import "./results.css";
import { useEffect, useMemo, useState } from "react";
import { ADS_SCOPE_ALL, adsReportRoute } from "@chanlytics/contracts";
import type { AdsConfig, AdsRead, AdsScope } from "@chanlytics/contracts";
import { RESULTS, adsResultsOf } from "@chanlytics/contracts/ads-page";
import type { AdsResultsVM } from "@chanlytics/contracts/ads-page";
import { EmptyState } from "../../../kit/empty/empty";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { routeDoor } from "../../../legacy-verbs";
import { PaneSheet } from "../../home/pane-sheet";
import { CmPane } from "../../parts/split";
import { CameBackCard, DaysCard, ResultsFigures, ResultsHead, RowsCard, ScopePicker } from "./results-parts";

interface ResultsSheetProps {
  /** Whether the address asks for the sheet (`campaigns/ads:results`). */
  open: boolean;
  read: AdsRead;
  config: AdsConfig;
  onClose: () => void;
}

/** The foot: the way on to the full report, over the same days and the same scope. */
function FullReport({ vm }: { vm: AdsResultsVM }) {
  const to = adsReportRoute({ from: vm.window.from, to: vm.window.to }, vm.scope);
  return (
    <div className="ads-res-foot">
      <LinkButton {...routeDoor(to)} className="ads-res-full" data-testid="ads-res-full">
        {RESULTS.fullReport} <Icon name="chevron" size={11} />
      </LinkButton>
    </div>
  );
}

/** What the sheet holds: nothing to report in words, or the head, the figures, the days, the platforms and what came back. */
function Body({ vm }: { vm: AdsResultsVM }) {
  if (vm.empty) {
    return <EmptyState kind="line" title={vm.empty.title} body={vm.empty.body} testid="ads-res-empty" />;
  }
  return (
    <>
      <ResultsHead vm={vm} />
      <p className="ads-res-pane-line" data-testid="ads-res-pane">
        {vm.pane}
      </p>
      <ResultsFigures vm={vm} variant="sheet" />
      <DaysCard vm={vm} variant="sheet" />
      <RowsCard
        title={RESULTS.byPlatform.title}
        testid="ads-res-platforms"
        first={RESULTS.heads.platform}
        rows={vm.byPlatform}
      />
      <CameBackCard vm={vm} />
    </>
  );
}

export function ResultsSheet({ open, read, config, onClose }: ResultsSheetProps) {
  const [scope, setScope] = useState<AdsScope>(ADS_SCOPE_ALL);
  // It opens on every ad, however it was left.
  useEffect(() => {
    if (open) setScope(ADS_SCOPE_ALL);
  }, [open]);
  // Folded only while it is open: the sheet keeps what it last drew while it leaves.
  const vm = useMemo(
    () => (open ? adsResultsOf(read, config, { from: read.window.from, to: read.window.to, scope }) : null),
    [open, read, config, scope],
  );
  return (
    <PaneSheet open={open} title={RESULTS.kicker} onClose={onClose} testid="ads-results-sheet">
      {vm ? (
        <CmPane
          testid="ads-results"
          title={RESULTS.title}
          tools={<ScopePicker vm={vm} variant="sheet" onScope={setScope} />}
          foot={<FullReport vm={vm} />}
          onClose={onClose}
        >
          <div className="ads-res-body">
            <Body vm={vm} />
          </div>
        </CmPane>
      ) : null}
    </PaneSheet>
  );
}
