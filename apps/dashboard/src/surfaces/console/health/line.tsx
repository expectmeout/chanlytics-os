import type { ReactNode } from "react";

/** A count as Health says one: "1,204". */
export const healthCount = (v: number) => v.toLocaleString("en-US");

/** A count with its noun, one or many: "1 call", "12 calls". */
export const healthCountOf = (v: number, one: string, many = `${one}s`) => `${healthCount(v)} ${v === 1 ? one : many}`;

/** A moment as Health's rows say one, in UTC: "21 Oct, 13:19". */
export const utcWords = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

/** The tone a Health value is said in: amber for what needs a look, red for what failed, else plain ink. */
type HealthTone = "warn" | "danger" | undefined;

/** One column after the first: its heading, and whether a phone's narrow rows leave it out. */
type HealthColumn = string | { label: string; desk: true };

/** One cell after the first: its value, the tone it is said in, and whether a phone leaves it out (its column's). */
type HealthCell = { v: ReactNode; tone?: HealthTone; desk?: boolean };

const deskOnly = (desk: boolean | undefined) => (desk ? "true" : undefined);

/**
 * A Health table: what each row is in the first column, which takes the room, and its numbers after it in columns of
 * one width, to the right, so a column of counts reads down as one. `wide` gives the columns after the first the room
 * of a name or a time rather than a count. A column marked for the desk is left out at a phone's width, head and cells.
 */
export function HealthRows({
  head,
  label,
  wide = false,
  shape,
  testid,
  children,
}: {
  head: readonly HealthColumn[];
  /** What the table holds, for a screen reader. */
  label: string;
  wide?: boolean;
  /** A table whose columns are the clocks' or the pager's own. */
  shape?: "clocks" | "pager";
  testid?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="cs-h-rows"
      role="table"
      aria-label={label}
      data-wide={wide ? "true" : undefined}
      data-shape={shape}
      data-testid={testid}
    >
      <div className="cs-h-rows-head" role="row">
        {head.map((c, i) => {
          const words = typeof c === "string" ? c : c.label;
          return (
            <span key={i} role="columnheader" data-desk={deskOnly(typeof c !== "string")}>
              {words}
            </span>
          );
        })}
      </div>
      {children}
    </div>
  );
}

/** One row of a Health table: its title and the line under it, then its cells. */
export function HealthRow({
  title,
  sub,
  subTone,
  mono = false,
  cells,
  testid,
}: {
  title: ReactNode;
  sub?: ReactNode;
  subTone?: HealthTone;
  /** The line under the title is a machine's name or a code: set in the mono face. */
  mono?: boolean;
  cells: readonly HealthCell[];
  testid?: string;
}) {
  return (
    <div className="cs-h-rows-row" role="row" data-testid={testid}>
      <span className="cs-h-what" role="cell">
        <span className="cs-h-title">{title}</span>
        {sub ? (
          <span className={mono ? "cs-h-sub cs-h-mono" : "cs-h-sub"} data-tone={subTone}>
            {sub}
          </span>
        ) : null}
      </span>
      {cells.map((c, i) => (
        <span key={i} className="cs-h-n" role="cell" data-tone={c.tone} data-desk={deskOnly(c.desk)}>
          {c.v}
        </span>
      ))}
    </div>
  );
}
