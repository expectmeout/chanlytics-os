/**
 * What the Results sheet and Reports › Ads draw alike (MOCKUP): the head, the scope Picker, the four figures, the two lanes by
 * day, and the table of the platforms. Each draws a part of the one fold (contracts `adsResultsOf`) and says nothing it was not
 * told, so the sheet, the lens and the Ads page agree. The sheet wears them in the Campaigns drawers' shape; the lens in its own
 * strip and grid (`variant`).
 */
import type { ReactNode } from "react";
import { adsScopeOfKey } from "@chanlytics/contracts";
import type { AdsScope } from "@chanlytics/contracts";
import { LEDGER, RESULTS } from "@chanlytics/contracts/ads-page";
import type { AdsResultsVM, ResultsDayVM, ResultsRowVM } from "@chanlytics/contracts/ads-page";
import { BarChart, BarList } from "../../../kit/charts/bar";
import { ChartCard } from "../../../kit/charts/card";
import type { ChartConfig } from "../../../kit/charts/geometry";
import { EmptyState } from "../../../kit/empty/empty";
import { Figure } from "../../../kit/figure/figure";
import { Picker } from "../../../kit/picker/picker";
import { Tooltip } from "../../../kit/tooltip/tooltip";
import { cmChevron, cmGroups } from "../../parts/picks";

/** Where the parts stand: the sheet's single column, or the lens's grid. */
type ResultsVariant = "sheet" | "lens";

/** The head's sentence, in the page's emphasis. */
export function ResultsHead({ vm }: { vm: AdsResultsVM }) {
  if (!vm.head) return null;
  return (
    <p className="ads-res-head" data-testid="ads-res-head">
      {vm.head.strong ? <b>{vm.head.strong}</b> : null}
      {vm.head.rest}
    </p>
  );
}

interface ScopePickerProps {
  vm: AdsResultsVM;
  /** The sheet narrows to a platform; the lens to an ad too. */
  variant: ResultsVariant;
  onScope: (scope: AdsScope) => void;
}

/** Which ads: every ad, a platform, and (in the lens) one ad. */
export function ScopePicker({ vm, variant, onScope }: ScopePickerProps) {
  const choices = vm.scopes
    .filter((s) => variant === "lens" || s.kind !== "ad")
    .map((s) => ({ id: s.key, label: s.label, group: s.kind }));
  const groups = cmGroups(choices, { platform: RESULTS.scope.platforms, ad: RESULTS.scope.ads });
  return (
    <Picker
      label={RESULTS.scope.label}
      value={vm.scopeKey}
      onValueChange={(key) => {
        const scope = adsScopeOfKey(key);
        if (scope) onScope(scope);
      }}
      groups={groups}
      chevron={cmChevron()}
      face={vm.scopeWord}
      data-testid="ads-res-scope"
    />
  );
}

/** The page's four figures over these days: the sheet's two rows of two, or Reports' strip. */
export function ResultsFigures({ vm, variant }: { vm: AdsResultsVM; variant: ResultsVariant }) {
  if (vm.figures.length === 0) return null;
  const lens = variant === "lens";
  return (
    <div className="ads-res-figures-block">
      <dl className={lens ? "rpt-figures quad" : "ads-res-figures"} data-testid="ads-res-figures">
        {vm.figures.map((f) => (
          <Figure
            key={f.id}
            id={f.id}
            label={f.label}
            value={f.value}
            change={f.change}
            meta={f.meta}
            definition={f.definition}
            n={f.n}
            minN={f.minN}
            className={lens ? "rpt-cell" : "ads-res-fig"}
            data-testid={`ads-res-figure-${f.id}`}
          />
        ))}
      </dl>
      {vm.quiet ? <p className="ads-res-quiet">{vm.quiet}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// By day

const DAY_SERIES: ChartConfig = {
  spent: { label: RESULTS.days.spentTitle, color: "var(--chart-1)" },
  booked: { label: RESULTS.days.booked, color: "var(--chart-1)" },
  waiting: { label: RESULTS.days.waiting, color: "var(--chart-1-soft)" },
};

/** A tooltip's note under a day: it is still settling. */
const settlingNote = (d: ResultsDayVM): string | null => (d.settling ? RESULTS.days.settlingDay : null);

/** The two lanes: what was spent above, the people below with the part that booked filled. */
function Lanes({ vm, height }: { vm: AdsResultsVM; height: number }) {
  const days = vm.days;
  if (!days) return null;
  const key = `${vm.window.from}:${vm.scopeKey}`;
  return (
    <>
      {days.currency === null ? null : (
        <div className="ads-res-lane" data-testid="ads-res-lane-spent">
          <span className="ck-segbar-title">{RESULTS.days.spentTitle}</span>
          <BarChart
            data={days.rows}
            keys={["spent"]}
            config={DAY_SERIES}
            height={height}
            yTicks={2}
            animKey={key}
            ariaLabel={days.spentAria}
            tip={(d) => ({
              title: d.label,
              rows: [{ key: "spent", label: RESULTS.days.spent, value: d.spentWords }],
              note: settlingNote(d),
            })}
            describe={(d) => `${d.label}: ${d.spentWords}`}
          />
        </div>
      )}
      <div className="ads-res-lane" data-testid="ads-res-lane-people">
        <span className="ck-segbar-title">{RESULTS.days.peopleTitle}</span>
        <BarChart
          data={days.rows}
          keys={["booked", "waiting"]}
          config={DAY_SERIES}
          height={height}
          yTicks={2}
          animKey={key}
          ariaLabel={days.peopleAria}
          tip={(d) => ({
            title: d.label,
            rows: [
              { key: "booked", label: RESULTS.days.booked, value: d.booked },
              { key: "waiting", label: RESULTS.days.waiting, value: d.waiting },
            ],
            note: settlingNote(d),
          })}
          describe={(d) => `${d.label}: ${d.inTouch} got in touch, ${d.booked} booked`}
        />
      </div>
    </>
  );
}

/** By day. Its table twin has every day's spend, people, bookings and Google's calls. */
export function DaysCard({
  vm,
  variant,
  className,
}: {
  vm: AdsResultsVM;
  variant: ResultsVariant;
  className?: string;
}) {
  const days = vm.days;
  if (!days) return null;
  const C = RESULTS.days.columns;
  return (
    <ChartCard
      className={className}
      title={RESULTS.days.title}
      testid="ads-res-days"
      takeaway={RESULTS.days.peopleLine}
      config={DAY_SERIES}
      legend={false}
      table={{
        columns: [C.day, C.spent, C.people, C.booked, C.calls],
        rows: days.rows.map((r) => [r.label, r.spentWords, r.inTouch, r.booked, r.calls]),
      }}
    >
      <Lanes vm={vm} height={variant === "lens" ? 120 : 96} />
      {days.notes.map((note) => (
        <p key={note} className="ads-res-note">
          {note}
        </p>
      ))}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The tables

/** A number of a table: the value, a dash saying why on hover or focus, and the short unit under it where it is not obvious. */
export function ResNum({ cell }: { cell: { value: string; unit: string | null; why: string | null } }) {
  const value = cell.why ? (
    <Tooltip tip={cell.why}>
      <span
        className="ads-num-value"
        // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a focus stop for its tip, the one way a keyboard reads why a number is a dash
        tabIndex={0}
        aria-description={cell.why}
      >
        {cell.value}
      </span>
    </Tooltip>
  ) : (
    <span className="ads-num-value">{cell.value}</span>
  );
  return (
    <span className="ads-res-num tabular">
      {value}
      {cell.unit ? <span className="ads-num-unit">{cell.unit}</span> : null}
    </span>
  );
}

/** The cells of a row of a table, as text, for its CSV and its twin. */
const textOf = (cell: { value: string; unit: string | null }): string =>
  cell.unit ? `${cell.value} ${cell.unit}` : cell.value;

/** The platforms (or the doors) as a table: one row each, the page's own cells. */
export function RowsCard(p: {
  title: string;
  line?: string;
  testid: string;
  className?: string;
  first: string;
  rows: readonly ResultsRowVM[];
  footer?: ReactNode;
}) {
  const H = RESULTS.heads;
  return (
    <ChartCard
      className={p.className}
      title={p.title}
      takeaway={p.line}
      testid={p.testid}
      switchable={false}
      table={{
        columns: [p.first, H.ads, H.spent, H.touch, H.booked, H.each],
        rows: p.rows.map((r) => [r.label, r.ads, r.spent, textOf(r.inTouch), textOf(r.booked), textOf(r.each)]),
      }}
    >
      <div className="ck-table-wrap">
        <table className="ck-table ads-res-table">
          <thead>
            <tr>
              <th>{p.first}</th>
              <th className="num">{H.spent}</th>
              <th className="num">{H.touch}</th>
              <th className="num">{H.booked}</th>
              <th className="num">{H.each}</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => (
              <tr key={r.id} data-testid="ads-res-row">
                <td>
                  <span className="ads-res-name">{r.label}</span>
                  <span className="ads-res-sub">{RESULTS.adsCount(r.ads)}</span>
                </td>
                <td className="num">{r.spent}</td>
                <td className="num">
                  <ResNum cell={r.inTouch} />
                </td>
                <td className="num">
                  <ResNum cell={r.booked} />
                </td>
                <td className="num">
                  <ResNum cell={r.each} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.footer}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// What came of the bookings

/** What came of the bookings: the page's own rows for all ads over its 30 days, and for anything else the reason it isn't read. */
export function CameBackCard({ vm, className }: { vm: AdsResultsVM; className?: string }) {
  const came = vm.cameBack;
  if (!came) return null;
  const tile = "tile" in came ? came.tile : null;
  return (
    <ChartCard
      className={className}
      title={came.title}
      takeaway={tile ? LEDGER.booked(tile.headline.n) : null}
      testid="ads-res-came-back"
      table={tile ? { columns: RESULTS.cameBack.columns, rows: tile.rows.map((r) => [r.label, r.n]) } : null}
    >
      {tile ? (
        <>
          <BarList
            rows={tile.rows.map((r) => ({
              id: r.id,
              label: r.note ? `${r.label} · ${r.note}` : r.label,
              value: r.n,
            }))}
          />
          {tile.unmatched ? <p className="ads-res-note">{tile.unmatched}</p> : null}
          <p className="ads-res-note">{tile.nudge}</p>
        </>
      ) : (
        <EmptyState kind="line" title={"why" in came ? came.why : ""} testid="ads-res-came-back-why" />
      )}
    </ChartCard>
  );
}
