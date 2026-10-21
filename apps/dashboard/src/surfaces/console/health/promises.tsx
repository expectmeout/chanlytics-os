/**
 * Promises, a day at a time (decision 0068): the seven targets the platform wrote down (decision 0031), read from the
 * nightly roll-up, one row each with a cell per day (kept, missed, or nothing to judge that day) and the row's last
 * word. The pager reads the same targets, so the grid and a page never disagree. On the Promises tab each row says its
 * worst miss and where. Every word is contracts' (promiseDaysOf).
 */
import type { PromiseRowVM } from "@chanlytics/contracts";
import { NoneRow, ScreenSection } from "../parts";

const CELL_WORDS = { kept: "kept", missed: "missed", none: "nothing to judge that day" } as const;

/** A day as the grid's head says it: its day of the month; the month is said once, after the last. */
const dayOfMonth = (day: string) => String(new Date(`${day}T00:00:00Z`).getUTCDate());
const monthOf = (day: string | undefined) =>
  day ? new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }) : "";

export function PromiseGrid({
  grid,
  read,
  sub,
  detailed = false,
}: {
  grid: { days: string[]; rows: PromiseRowVM[] };
  read: boolean;
  sub: string;
  detailed?: boolean;
}) {
  const shown = grid.days.slice(-14);
  return (
    <ScreenSection title={`Promises · the last ${shown.length} days rolled`} sub={sub} testid="console-health-promises">
      {!read ? (
        <NoneRow words="The nightly counts could not be read just now." />
      ) : shown.length === 0 ? (
        <NoneRow words="The nightly roll-up has not counted a day yet." />
      ) : (
        <div className="cs-h-scroll">
          <div className="cs-h-grid" role="table">
            <div className="cs-h-grid-row cs-h-grid-head" role="row">
              <span role="columnheader">What the platform promises</span>
              {shown.map((d) => (
                <span key={d} className="cs-h-day" role="columnheader">
                  {dayOfMonth(d)}
                </span>
              ))}
              <span className="cs-h-last" role="columnheader">
                {monthOf(shown[shown.length - 1])}
              </span>
            </div>
            {grid.rows.map((r) => {
              const cells = r.cells.slice(-shown.length);
              return (
                <div className="cs-h-grid-row" role="row" key={r.key} data-testid={`console-health-promise-${r.key}`}>
                  <span className="cs-h-promise" role="rowheader">
                    <span className="cs-q-title">{r.title}</span>
                    <span className="cs-h-small">{r.small}</span>
                  </span>
                  {cells.map((c) => (
                    <span
                      key={c.day}
                      className="cs-h-cell"
                      data-state={c.state}
                      role="cell"
                      aria-label={`${c.day}: ${c.words ?? CELL_WORDS[c.state]}`}
                    />
                  ))}
                  <span className="cs-h-last" data-state={r.state} role="cell">
                    {r.last}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="cs-h-legend" aria-hidden="true">
            {(["kept", "missed", "none"] as const).map((s) => (
              <span key={s} className="cs-h-legend-item">
                <span className="cs-h-cell" data-state={s} />
                {CELL_WORDS[s]}
              </span>
            ))}
          </div>
        </div>
      )}
      {detailed && read
        ? grid.rows
            .filter((r) => r.worst)
            .map((r) => (
              <div className="set-row" key={`worst:${r.key}`} data-testid={`console-health-promise-${r.key}-worst`}>
                <div className="set-row-info">
                  <span className="set-row-label">{r.title}</span>
                  <span className="set-row-hint" data-tone="danger">
                    {`${r.worst} · missed on ${r.missedDays} day${r.missedDays === 1 ? "" : "s"} · ${r.where}`}
                  </span>
                </div>
              </div>
            ))
        : null}
    </ScreenSection>
  );
}
