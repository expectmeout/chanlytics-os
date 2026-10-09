/**
 * The Pipeline lens: the proposals of the period and what became of them, and the clients now (the Deals section's own comment
 * stays with it).
 */
import type { DealReportVM } from "@chanlytics/contracts";
import { BarList } from "../../kit/charts/bar";
import { ChartCard } from "../../kit/charts/card";
import { RptSection } from "../blocks";
import { LensEmpty, type LensProps } from "./shared";

// Deals (0004, 0008): one cohort, the proposals of the period, and beside it the stock. The headline says how many
// went out; the card draws what became of them in the kit's bars, each outcome's count and its share of the cohort,
// said there and nowhere else (a sentence of the same counts would say each twice); the lines beside it say what the
// bars cannot -- how long a yes took, where the new clients came from, why people passed, what is still open -- each
// only when it has something; the clients now close the section under the one hairline. Every word is contracts'
// DealReportVM. Drawn wherever deals are on and a deal was ever recorded, whatever came in this period: an engagement
// is agreed in a call or a meeting as often as in a message, so a quiet month for the receptionist is not a month
// without clients.
function dealsSection(deals: DealReportVM | null | undefined) {
  const dl = deals && deals.present ? deals : null;
  if (!dl) return null;
  const dealLines = dl.lines.length ? (
    <ul className={`rpt-deals-lines${dl.outcomes ? " rpt-span-7" : ""}`} data-testid="rpt-deals-lines">
      {dl.lines.map((l) => (
        <li key={l.id} data-line={l.id}>
          {l.text}
        </li>
      ))}
    </ul>
  ) : null;
  return (
    <RptSection title="Deals" testid="rpt-deals" bare>
      <div className="rpt-deals">
        <p className="rpt-deals-headline" data-testid="rpt-deals-headline">
          {dl.headline}
        </p>
        {dl.outcomes ? (
          <div className="rpt-grid">
            <ChartCard className="rpt-span-5" title={dl.outcomes.title} testid="rpt-deals-outcomes">
              <BarList max={dl.outcomes.max} rows={dl.outcomes.rows} />
            </ChartCard>
            {dealLines}
          </div>
        ) : (
          dealLines
        )}
        <p className="rpt-booked-rest" data-testid="rpt-deals-stock">
          {dl.stock}
        </p>
      </div>
    </RptSection>
  );
}

export function PipelineLens({ R }: LensProps) {
  return R.deals && R.deals.present ? dealsSection(R.deals) : <LensEmpty lens="pipeline" vm={R.vm} />;
}
