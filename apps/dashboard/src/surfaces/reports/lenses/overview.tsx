/**
 * The Overview lens: the receptionist's share of the answered beside Worth knowing, and the strip of counts. A period nobody
 * wrote or called in says so under the strip.
 */
import { RptFacts, RptHero, RptTiles } from "../blocks";
import { nothingCameIn, type LensProps } from "./shared";

export function OverviewLens({ R, pick, phone }: LensProps) {
  const vm = R.vm;
  return (
    <>
      <section className="rpt-grid rpt-top" aria-label="This period">
        <RptHero vm={vm} phone={phone} />
        {!vm.empty && <RptFacts facts={R.facts || []} />}
      </section>
      <RptTiles vm={vm} booking={R.booking || null} />
      {vm.empty ? nothingCameIn(vm, R.period, pick) : null}
    </>
  );
}
