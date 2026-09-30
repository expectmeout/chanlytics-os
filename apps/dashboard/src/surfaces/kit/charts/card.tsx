/**
 * The card every chart lives in, its table twin and its CSV, and the one bar split into parts (moved whole from
 * legacy/components/chart-core.jsx, decision 0015): a title, one line of what it shows, the legend for two or more
 * series, and on the right a Chart/Table switch and the CSV, which wait for the pointer or the keyboard (charts.css)
 * and stay while the table shows. The card owns the series: `config` is published as --color-<key> on its <section>.
 */
import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { csvCell } from "@chanlytics/contracts";
import { holdStill } from "../../legacy-verbs";
import { Icon } from "../icon/icon";
import { ckVars } from "./geometry";
import type { ChartConfig } from "./geometry";
import { ChartLegend } from "./parts";

/** A table a chart offers beside itself: its columns and its rows, a number sitting right, a missing value a dash. */
export interface ChartTableData {
  columns: string[];
  rows: Array<Array<string | number | null | undefined>>;
}

/** A twin made from a chart's own rows: the first column is the row's label, then a column per series under its name. */
export interface ChartTwin {
  data: Array<{ label: string } & object>;
  keys: string[];
  first?: string;
}

// A CSV of the table, each cell spelled by contracts' csvCell (quoted where it must be, and a cell a spreadsheet would
// run as a formula made text), one rule for every file the product writes.
const CK_BOM = String.fromCharCode(0xfeff);
/** The browser has started the save by then: the address made for it is let go. */
const REVOKE_AFTER_MS = 1000;
export function ckSaveCsv(title: string, table: ChartTableData): void {
  const body = [table.columns, ...table.rows].map((r) => r.map((v) => csvCell(v)).join(",")).join("\r\n");
  const name = `${String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}.csv`;
  // Inside the phone app a WebView cannot save a file made in the page: the app's bridge takes it to the share sheet
  // and cancels the event (legacy-bridge/app-bridge.ts); anywhere else nothing listens, and the browser saves it.
  const asked = new CustomEvent("app:file", {
    cancelable: true,
    detail: { name, type: "text/csv", text: CK_BOM + body },
  });
  if (typeof window.dispatchEvent === "function" && !window.dispatchEvent(asked)) return;
  const blob = new Blob([CK_BOM + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

// A number sits right, in tabular figures; a missing value is the tree's own dash, and an empty cell in the CSV.
export function ChartTable({ columns, rows }: ChartTableData) {
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
              <td colSpan={columns.length} className="ck-table-empty">
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

export interface ChartCardProps {
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
  children?: ReactNode;
}

// The card every chart lives in. The twin is `table` when the page has one of its own, or made from `twin`.
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
  children,
}: ChartCardProps) {
  const [asTable, setAsTable] = useState(false);
  const data = table || ckTwin(twin, config);
  const showTable = asTable && !!data;
  // A chart and its table are not one height: the switch holds still, the last card's too.
  const switchTo = (to: boolean) => (e?: MouseEvent<HTMLButtonElement>) =>
    holdStill(e && e.currentTarget, () => setAsTable(to));
  return (
    <section
      className={`ck-card${className ? ` ${className}` : ""}${showTable ? " is-table" : ""}`}
      data-testid={testid}
      style={ckVars(config)}
    >
      <header className="ck-card-head">
        <div className="ck-card-titles">
          <h3 className="ck-card-title">{title}</h3>
          {takeaway && <p className="ck-card-takeaway">{takeaway}</p>}
        </div>
        {data && (
          <div className="ck-card-actions">
            {switchable && (
              <div className="ck-seg" role="group" aria-label={`Show ${title} as`}>
                <button
                  type="button"
                  className={showTable ? "" : "on"}
                  aria-pressed={!showTable}
                  onClick={switchTo(false)}
                  data-testid="card-chart"
                >
                  Chart
                </button>
                <button
                  type="button"
                  className={showTable ? "on" : ""}
                  aria-pressed={showTable}
                  onClick={switchTo(true)}
                  data-testid="card-table"
                >
                  Table
                </button>
              </div>
            )}
            <button
              type="button"
              className="ck-icon-btn"
              onClick={() => ckSaveCsv(title, data)}
              aria-label={`Save “${title}” as a CSV file`}
              title="Save as CSV"
              data-testid="card-csv"
            >
              <Icon name="download" size={13} />
            </button>
          </div>
        )}
      </header>
      {config && legend !== false && !showTable && (
        <ChartLegend config={config} values={legend ? legend.values : null} />
      )}
      <div className="ck-card-body">
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
    <div className="ck-segbar" data-testid={testid} style={ckVars(config)}>
      <span className="ck-segbar-title">{title}</span>
      <div
        className={`ck-segbar-bar${small ? " small" : ""}`}
        role="img"
        aria-label={rows.map((r) => `${r.value} ${label(r.key)}`).join(", ")}
      >
        {shown.map((r) => (
          <i key={r.key} style={{ flexGrow: r.value, background: `var(--color-${r.key})` }} />
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
