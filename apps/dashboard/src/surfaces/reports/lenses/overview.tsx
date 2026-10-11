/**
 * The Overview lens: the receptionist's share of the answered beside Worth knowing, and the strip of counts. A period nobody
 * wrote or called in says so under the strip. Worth knowing is the page's (reports-page.tsx), made once from the report and the
 * Campaigns lens's own read; the lens draws the facts it is handed.
 */
import type { ReportFactVM } from "@chanlytics/contracts";
import { RptFacts, RptHero, RptTiles } from "../blocks";
import { nothingCameIn, type LensProps } from "./shared";

export function OverviewLens({ R, pick, phone, facts }: LensProps & { facts: ReportFactVM[] }) {
  const vm = R.vm;
  return (
    <>
      <section className="rpt-grid rpt-top" aria-label="This period">
        <RptHero vm={vm} phone={phone} />
        {!vm.empty && <RptFacts facts={facts} />}
      </section>
      <RptTiles vm={vm} booking={R.booking || null} />
      {vm.empty ? nothingCameIn(vm, R.range, pick) : null}
    </>
  );
}
