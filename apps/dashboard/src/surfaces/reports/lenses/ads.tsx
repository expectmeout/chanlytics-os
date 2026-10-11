/**
 * The Ads lens (MOCKUP; a demo session's until the wiring lane reads a workspace's ad accounts, decision 0049): what the ads
 * cost, who they brought and who booked, over the days Reports shows, narrowed to all ads, a platform or one ad. The sentence at
 * its head is the frame's (head.ts), the fold's own; everything below is the same fold the Results sheet draws (contracts
 * `adsResultsOf`), so a number here is the number the Ads page and the sheet say for the same days.
 *
 * Top to bottom: which ads (the scope, written to the address), the four figures, by day (what was spent above, the people below
 * with the part that booked filled), from got in touch to booked beside what came of the bookings, by platform beside by what the
 * ad asks (a table: the units differ, a chat, a call and a form are counted their own ways), by ad, and what each platform says,
 * never added together. Days with nothing spent or counted are the lens's own empty card, with the door to Ads. It is loaded on
 * demand (lenses/ads-load.ts), so it and the Ads models are not part of the page every workspace loads.
 */
// The Results parts' rules, loaded with the lens (the sheet over the Ads page loads the same file).
import "../../campaigns/ads/results/results.css";
import { ADS_ROUTE, ADS_WORDS } from "@chanlytics/contracts";
import type { AdsScope } from "@chanlytics/contracts";
import { RESULTS } from "@chanlytics/contracts/ads-page";
import type { AdsResultsVM } from "@chanlytics/contracts/ads-page";
import {
  CameBackCard,
  DaysCard,
  ResultsFigures,
  RowsCard,
  ScopePicker,
} from "../../campaigns/ads/results/results-parts";
import { EmptyState } from "../../kit/empty/empty";
import { RptSection } from "../blocks";
import { AdsTableCard, FunnelCard, TheirsCards } from "./ads-cards";

interface AdsLensProps {
  fold: AdsResultsVM;
  /** Narrow the lens: the page writes it into the address, in place of the entry. */
  onScope: (scope: AdsScope) => void;
}

/** The funnel beside what came of the bookings, in twelve columns; the one that stands alone takes the row. */
function peopleRow(fold: AdsResultsVM) {
  const funnel = fold.funnel;
  const came = fold.cameBack !== null;
  if (!funnel && !came) return null;
  return (
    <div className="rpt-grid">
      {funnel ? <FunnelCard steps={funnel} className={came ? "rpt-span-5" : "rpt-span-12"} /> : null}
      {came ? <CameBackCard vm={fold} className={funnel ? "rpt-span-7" : "rpt-span-12"} /> : null}
    </div>
  );
}

/** By platform beside by what the ad asks: every ad's, then a platform's door alone; one ad needs neither. */
function tablesRow(fold: AdsResultsVM) {
  const kind = fold.scope.kind;
  const platforms = kind === "all";
  const doors = kind !== "ad";
  if (!platforms && !doors) return null;
  const span = platforms && doors ? "rpt-span-6" : "rpt-span-12";
  return (
    <div className="rpt-grid">
      {platforms ? (
        <RowsCard
          className={span}
          title={RESULTS.byPlatform.title}
          line={RESULTS.byPlatform.line}
          testid="ads-res-platforms"
          first={RESULTS.heads.platform}
          rows={fold.byPlatform}
        />
      ) : null}
      {doors ? (
        <RowsCard
          className={span}
          title={RESULTS.byDoor.title}
          line={RESULTS.byDoor.line}
          testid="ads-res-doors"
          first={RESULTS.heads.door}
          rows={fold.byDoor}
        />
      ) : null}
    </div>
  );
}

export function AdsLens({ fold, onScope }: AdsLensProps) {
  return (
    <>
      <RptSection title={ADS_WORDS.adsTab} bare testid="ads-lens">
        <div className="rpt-ads-scope">
          <ScopePicker vm={fold} variant="lens" onScope={onScope} />
          <span className="rpt-ads-pane" data-testid="ads-res-pane">
            {fold.pane}
          </span>
        </div>
        {fold.empty ? (
          <EmptyState
            kind="card"
            glyph="wave"
            title={fold.empty.title}
            body={fold.empty.body}
            testid="ads-lens-empty"
            action={{ label: RESULTS.openAds, to: ADS_ROUTE }}
          />
        ) : (
          <>
            <ResultsFigures vm={fold} variant="lens" />
            <div className="rpt-grid">
              <DaysCard vm={fold} variant="lens" className="rpt-span-12" />
            </div>
            {peopleRow(fold)}
            {tablesRow(fold)}
            {fold.scope.kind === "ad" ? null : (
              <div className="rpt-grid">
                <AdsTableCard vm={fold} className="rpt-span-12" />
              </div>
            )}
          </>
        )}
      </RptSection>
      {fold.empty ? null : (
        <RptSection title={RESULTS.theirs.title} testid="ads-res-theirs-section">
          <TheirsCards theirs={fold.theirs} />
        </RptSection>
      )}
    </>
  );
}
