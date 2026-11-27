/**
 * The card every chart lives in, its table twin and its CSV, and the one bar split into parts (moved whole from
 * legacy/components/chart-core.jsx, decision 0015): a title, one line of what it shows, the legend for two or more
 * series, and on the right a Chart/Table switch (the kit's Segmented) and the CSV (the kit's quiet icon Button),
 * which wait for the pointer or the keyboard (charts.css) and stay while the table shows. The card is the kit's panel. The
 * card owns the series: `config` is published as --color-<key> on its <section>.
 */
import { useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { csvCell } from "@chanlytics/contracts";
import { holdStill } from "../../frame-verbs";
import { downloadCsv } from "../download";
import { Button } from "../button/button";
import { Icon } from "../icon/icon";
import type { SegmentedOption } from "../segmented/segmented";
import { SegmentedOnDraw } from "../segmented/on-draw";
import { ckVars } from "./geometry";
import type { ChartConfig } from "./geometry";
import { ChartLegend } from "./parts";
import { customProperties } from "../variants";

/** A table a chart offers beside itself: its columns and its rows, a number sitting right, a missing value a dash. */
interface ChartTableData {
  columns: string[];
  rows: Array<Array<string | number | null | undefined>>;
}

/** A twin made from a chart's own rows: the first column is the row's label, then a column per series under its name. */
interface ChartTwin {
  data: Array<{ label: string } & object>;
  keys: string[];
  first?: string;
}

// A CSV of the table, each cell spelled by contracts' csvCell (quoted where it must be, and a cell a spreadsheet would
// run as a formula made text), one rule for every file the product writes.
function ckSaveCsv(title: string, table: ChartTableData): void {
  const body = [table.columns, ...table.rows].map((r) => r.map((v) => csvCell(v)).join(",")).join("\r\n");
  const name = `${String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}.csv`;
  downloadCsv(name, body);
}

// A number sits right, in tabular figures; a missing value is the tree's own dash, and an empty cell in the CSV.
function ChartTable({ columns, rows }: ChartTableData) {
  const numeric = columns.map((_, j) => rows.some((r) => typeof r[j] === "number"));
  return (
    <div className="ck-table-wrap">
      <table className="ck-table">
        <thead>
          <tr>
            {columns.map((c, j) => (
              <th key={j} className={numeric[j] ? "num" : ""}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={typeof v === "number" ? "num" : ""}>
                  {v == null ? "—" : v}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={columns.length} className="ck-table-none">
                Nothing in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// The table a chart's own rows make: the first column the row's label, then a column per series under its name.
const ckTwin = (twin: ChartTwin | null, config: ChartConfig | null): ChartTableData | null =>
  twin
    ? {
        columns: [twin.first || "Day", ...twin.keys.map((k) => (config && config[k] ? config[k].label : k))],
        rows: twin.data.map((d) => [
          d.label,
          ...twin.keys.map((k) => {
            const v: unknown = Reflect.get(d, k);
            return v == null ? null : (v as string | number);
          }),
        ]),
      }
    : null;

interface ChartCardProps {
  title: string;
  takeaway?: string | null;
  testid?: string;
  /** The page places the card with this; the kit knows no grid. */
  className?: string;
  config?: ChartConfig | null;
  /** `false` draws no legend; `{ values }` puts a value beside each series. */
  legend?: false | { values: Record<string, string | number | null | undefined> } | null;
  /** The twin, when the page has one of its own. */
  table?: ChartTableData | null;
  /** Or made from the chart's own rows. */
  twin?: ChartTwin | null;
  /** A card whose body is already a table passes false: the CSV stays, the switch would only swap a table for a table. */
  switchable?: boolean;
  /** The title as a place focus can be sent to (a page that takes a row out of the card sends focus here); it takes no tab stop. */
  titleRef?: Ref<HTMLHeadingElement>;
  children?: ReactNode;
}

/** What a card shows: its chart, or the chart's table. */
type CardShows = "chart" | "table";
/** The card's switch: the kit's segmented control (kit.css, "A choice of a few"), the ids a page's tests press. */
const CARD_SHOWS: readonly SegmentedOption<CardShows>[] = [
  { value: "chart", label: "Chart", testid: "card-chart" },
  { value: "table", label: "Table", testid: "card-table" },
];

// The card every chart lives in, the kit's panel. The twin is `table` when the page has one of its own, or made from
// `twin`.
export function ChartCard({
  title,
  takeaway = null,
  testid,
  className = "",
  config = null,
  legend = null,
  table = null,
  twin = null,
  switchable = true,
  titleRef,
  children,
}: ChartCardProps) {
  const [asTable, setAsTable] = useState(false);
  const data = table || ckTwin(twin, config);
  const showTable = asTable && !!data;
  // A chart and its table are not one height: the switch holds still, the last card's too.
  const switchRef = useRef<HTMLDivElement>(null);
  const switchTo = (to: CardShows) => holdStill(switchRef.current, () => setAsTable(to === "table"));
  return (
    <section
      className={`panel ck-chart${className ? ` ${className}` : ""}${showTable ? " is-table" : ""}`}
      data-testid={testid}
      style={customProperties(ckVars(config))}
    >
      <header className="ck-chart-head">
        <div className="ck-chart-titles">
          <h3 className="ck-chart-title" ref={titleRef} {...(titleRef && { tabIndex: -1 })}>
            {title}
          </h3>
          {takeaway && <p className="ck-chart-takeaway">{takeaway}</p>}
        </div>
        {data && (
          <div className="ck-chart-actions">
            {switchable && (
              // The kit's Segmented, loaded as the card first draws (segmented/on-draw.tsx), its place held till then.
              <SegmentedOnDraw
                ref={switchRef}
                label={`Show ${title} as`}
                value={showTable ? "table" : "chart"}
                onValueChange={switchTo}
                options={CARD_SHOWS}
              />
            )}
            <Button
              variant="quiet"
              size="sm"
              iconOnly
              className="ck-csv"
              onClick={() => ckSaveCsv(title, data)}
              aria-label={`Save “${title}” as a CSV file`}
              data-tip="Save as CSV"
              data-testid="card-csv"
            >
              <Icon name="download" size={13} />
            </Button>
          </div>
        )}
      </header>
      {config && legend !== false && !showTable && (
        <ChartLegend config={config} values={legend ? legend.values : null} />
      )}
      <div className="ck-chart-body">
        {showTable && data ? <ChartTable columns={data.columns} rows={data.rows} /> : children}
      </div>
    </section>
  );
}

// One bar split into its parts, in the order given (a scale reads in its own order), with a 2px gap of card between
// them, under a small title; its legend names every part with its count, so a part of 0 is said, not drawn. `rows`
// are { key, value }; `config` names and colours them, and is published on the bar's own root.
export function SegmentBar({
  title,
  rows,
  config,
  testid,
  small = false,
}: {
  title: string;
  rows: Array<{ key: string; value: number }>;
  config: ChartConfig;
  testid?: string;
  small?: boolean;
}) {
  const shown = rows.filter((r) => r.value > 0);
  if (!shown.length) return null;
  const label = (k: string) => config[k]?.label || k;
  return (
    <div className="ck-segbar" data-testid={testid} style={customProperties(ckVars(config))}>
      <span className="ck-segbar-title">{title}</span>
      <div
        className={`ck-segbar-bar${small ? " small" : ""}`}
        role="img"
        aria-label={rows.map((r) => `${r.value} ${label(r.key)}`).join(", ")}
      >
        {shown.map((r) => (
          <i key={r.key} style={customProperties({ "--share": r.value, "--part-color": `var(--color-${r.key})` })} />
        ))}
      </div>
      <ChartLegend
        config={config}
        keys={rows.map((r) => r.key)}
        values={Object.fromEntries(rows.map((r) => [r.key, r.value]))}
        min={1}
      />
    </div>
  );
}
