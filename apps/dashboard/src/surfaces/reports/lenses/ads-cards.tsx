/**
 * The Ads lens's cards that are its own (MOCKUP): the people funnel, the table of the ads, and what each platform says. The head,
 * the figures, the days, the platform and door tables and what came of the bookings are drawn by the parts the Results sheet
 * draws too (campaigns/ads/results/results-parts.tsx). Every row, cell and sentence is the fold's (contracts `adsResultsOf`).
 */
import { RESULTS } from "@chanlytics/contracts/ads-page";
import type { AdsResultsVM, ResultsStepVM, ResultsTheirsVM } from "@chanlytics/contracts/ads-page";
import { ResNum } from "../../campaigns/ads/results/results-parts";
import { BarList } from "../../kit/charts/bar";
import { ChartCard } from "../../kit/charts/card";
import { EmptyState } from "../../kit/empty/empty";
import { LinkButton } from "../../kit/link-button/link-button";
import { routeDoor } from "../../legacy-verbs";

/** From got in touch to booked: people only. A step that is not read is a dash, and its reason stands under the bars. */
export function FunnelCard({ steps, className }: { steps: readonly ResultsStepVM[]; className?: string }) {
  const why = steps.filter((s) => s.why !== null);
  return (
    <ChartCard
      className={className}
      title={RESULTS.funnel.title}
      takeaway={RESULTS.funnel.line}
      testid="ads-res-funnel"
      table={{ columns: RESULTS.funnel.columns, rows: steps.map((s) => [s.label, s.n === null ? null : s.n]) }}
    >
      <BarList
        max={Math.max(1, ...steps.map((s) => s.n ?? 0))}
        rows={steps.map((s) => ({ id: s.id, label: s.label, value: s.n ?? 0, display: s.display }))}
      />
      {why.map((s) => (
        <p key={s.id} className="ads-res-note">
          {s.why}
        </p>
      ))}
    </ChartCard>
  );
}

/** Each ad, with the page's own cells: its name opens it. */
export function AdsTableCard({ vm, className }: { vm: AdsResultsVM; className?: string }) {
  const H = RESULTS.heads;
  const text = (c: { value: string; unit: string | null }) => (c.unit ? `${c.value} ${c.unit}` : c.value);
  return (
    <ChartCard
      className={className}
      title={RESULTS.byAd.title}
      testid="ads-res-ads"
      switchable={false}
      table={{
        columns: [H.ad, H.spent, H.touch, H.booked, H.each, H.state],
        rows: vm.byAd.map((r) => [r.name, text(r.spent), text(r.inTouch), text(r.booked), text(r.each), r.state.word]),
      }}
    >
      <div className="ck-table-wrap">
        <table className="ck-table ads-res-table">
          <thead>
            <tr>
              <th>{H.ad}</th>
              <th className="num">{H.spent}</th>
              <th className="num">{H.touch}</th>
              <th className="num">{H.booked}</th>
              <th className="num">{H.each}</th>
              <th>{H.state}</th>
            </tr>
          </thead>
          <tbody>
            {vm.byAd.map((r) => (
              <tr key={r.id} data-testid="ads-res-ad">
                <td>
                  <LinkButton {...routeDoor(r.open)} className="ads-res-name" data-testid="ads-res-ad-open">
                    {r.name}
                  </LinkButton>
                  <span className="ads-res-sub">{r.hint}</span>
                </td>
                <td className="num">
                  <ResNum cell={r.spent} />
                </td>
                <td className="num">
                  <ResNum cell={r.inTouch} />
                </td>
                <td className="num">
                  <ResNum cell={r.booked} />
                </td>
                <td className="num">
                  <ResNum cell={r.each} />
                </td>
                <td>
                  <span className="ads-res-name">{r.state.word}</span>
                  {r.state.second ? <span className="ads-res-sub">{r.state.second}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

/** One platform's own numbers: a row for each of its ads, in the columns it counts in. Nothing here is added to another platform's. */
function TheirsCard({ card, className }: { card: ResultsTheirsVM; className: string }) {
  return (
    <ChartCard
      className={className}
      title={card.title}
      takeaway={card.read}
      testid={`ads-res-theirs-${card.platform}`}
      switchable={false}
      table={{ columns: [RESULTS.theirs.ad, ...card.columns], rows: card.rows.map((r) => [r.name, ...r.cells]) }}
    >
      <div className="ck-table-wrap">
        <table className="ck-table ads-res-table">
          <thead>
            <tr>
              <th>{RESULTS.theirs.ad}</th>
              {card.columns.map((c) => (
                <th key={c} className="num">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="ads-res-name">{r.name}</span>
                </td>
                {r.cells.map((cell, at) => (
                  <td key={card.columns[at]} className="num tabular">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

/** The grid class of a card among `n` standing in a row of twelve. */
const spanOf = (n: number): string => (n >= 3 ? "rpt-span-4" : n === 2 ? "rpt-span-6" : "rpt-span-12");

/** What the platforms say: one card each, never added together; or why none is drawn. */
export function TheirsCards({ theirs }: { theirs: AdsResultsVM["theirs"] }) {
  if (theirs.cards.length === 0) {
    return theirs.why ? <EmptyState kind="line" title={theirs.why} testid="ads-res-theirs-why" /> : null;
  }
  return (
    <>
      <p className="ads-res-note ads-res-theirs-line">{RESULTS.theirs.line}</p>
      <div className="rpt-grid" data-testid="ads-res-theirs">
        {theirs.cards.map((card) => (
          <TheirsCard key={card.platform} card={card} className={spanOf(theirs.cards.length)} />
        ))}
      </div>
      <p className="ads-res-note">{RESULTS.theirs.dash}</p>
    </>
  );
}
