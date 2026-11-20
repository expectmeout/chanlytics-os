/**
 * What an answer shows of the numbers it read (turn.tsx draws them under an answer): a chart in the card every chart
 * stands in, or one whole in its parts, each with where it was read from and the door there.
 */
import type { AskAnswer, AskBreakdown as Breakdown } from "@chanlytics/contracts";
import { BarChart, BarList } from "../kit/charts/bar";
import { ChartCard, SegmentBar } from "../kit/charts/card";
import type { ChartConfig, ChartRow } from "../kit/charts/geometry";
import { LineChart } from "../kit/charts/line";
import { LinePress } from "../kit/line/line";
import type { LineWords } from "./words";

/** A chart of numbers the turn read. */
type Chart = NonNullable<AskAnswer["show"]["chart"]>;

// Two or three series on the ink ramp's ends and middle, so thin lines read apart; one is the kit's one data hue.
const ASK_SERIES_COLORS = ["var(--chart-ramp-5)", "var(--chart-ramp-3)", "var(--chart-ramp-1)"];

// A chart of numbers the turn read (contracts AskChart) in the card every chart stands in, with its legend, its Table and
// its CSV: a line over time, columns by day or week, stacked where there are two or three series, bars for a few things
// compared, each the chart kit's own part on its validated palette, with where it was read from under the card.
export const AskChart = ({ c, t, onNav }: { c: Chart; t: LineWords; onNav: (to: string) => void }) => {
  const config: ChartConfig = {};
  const keys = c.series.map((label, i) => {
    const key = `s${i}`;
    config[key] = { label, color: (c.series.length > 1 && ASK_SERIES_COLORS[i]) || "var(--chart-1)" };
    return key;
  });
  const rows: Array<ChartRow & Record<string, string | number | undefined>> = c.points.map((p) => ({
    label: p.label,
    short: p.label,
    ...Object.fromEntries(keys.map((key, i) => [key, p.values[i]])),
  }));
  const plot =
    c.kind === "bars" ? (
      <BarList rows={c.points.map((p, i) => ({ id: String(i), label: p.label, value: p.values[0] ?? 0 }))} />
    ) : c.kind === "columns" ? (
      <BarChart data={rows} keys={keys} config={config} height={140} ariaLabel={c.label} />
    ) : (
      <LineChart
        data={rows}
        keys={keys.map((key) => ({ key, fill: keys.length === 1 }))}
        config={config}
        height={140}
        ariaLabel={c.label}
      />
    );
  const table = {
    columns: [c.kind === "bars" ? t.chartName : t.chartWhen, ...c.series],
    rows: c.points.map((p) => [p.label, ...p.values]),
  };
  return (
    <div className="ask-chart" data-testid="ask-chart" data-kind={c.kind}>
      <ChartCard title={c.label} config={config} legend={keys.length > 1 ? null : false} table={table}>
        {plot}
      </ChartCard>
      <span className="ask-breakdown-from">
        {t.from} {c.source.label}
        {c.source.door ? (
          <LinePress kind="open" onClick={() => onNav(c.source.to)}>
            {t.open}
          </LinePress>
        ) : null}
      </span>
    </div>
  );
};

// One whole in its parts, on the chart kit's bar (chart-core.jsx SegmentBar), coloured as Reports colours who answered:
// the parts in the kit's blues in order, the one marked for attention in the warn status with its icon.
const AT_PART_COLORS = ["var(--chart-1)", "var(--chart-1-soft)", "var(--chart-ramp-2)", "var(--chart-ramp-1)"];
export const AskBreakdown = ({ b, t, onNav }: { b: Breakdown; t: LineWords; onNav: (to: string) => void }) => {
  const config: Record<string, { label: string; color: string; icon?: string }> = {};
  let shade = 0;
  const rows = b.parts.map((p, k) => {
    const key = `p${k}`;
    config[key] = p.warn
      ? { label: p.label, color: "var(--warn)", icon: "alert" }
      : { label: p.label, color: AT_PART_COLORS[shade++] || "var(--chart-1)" };
    return { key, value: p.value };
  });
  const title = `${b.total} ${b.label}`;
  return (
    <div className="ask-breakdown" data-testid="ask-breakdown">
      <SegmentBar title={title} rows={rows} config={config} small />
      {b.source ? (
        <span className="ask-breakdown-from">
          {t.from} {b.source.label}
          {b.source.door ? (
            <LinePress kind="open" onClick={() => b.source && onNav(b.source.to)}>
              {t.open}
            </LinePress>
          ) : null}
        </span>
      ) : null}
    </div>
  );
};
