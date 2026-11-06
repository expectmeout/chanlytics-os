/**
 * A cell's two lines (the table review of 5 Nov 2026): the fact, then what qualifies it. Every cell of People's, Leads'
 * and the Pipeline's tables that says more than one thing says it this way, so a row reads on one grid: the fact at the
 * rows' size, what qualifies it a step smaller in the dim ink, each on a line of its own and cut in its own column, never
 * run together and never into the next (a lead's stage, its place and its reason stood on one line with nothing between
 * them, 78px past their column). At the compact height the second stands beside the first (kit.css). A cell keeps drawing
 * its own `<td>`; a number's lines stand at the column's end (`end`), with its heading. A line that holds a control
 * with a ring and a tip of its own is left open (`open`): what it holds cuts its own words, and nothing of it is clipped.
 */
import type { ReactNode } from "react";

/** What a line holds that is nothing to draw: a cell with one fact draws one line. */
const nothing = (said: ReactNode): boolean => said === null || said === undefined || said === false || said === "";

export function Lines({
  top,
  sub = null,
  end = false,
  open = false,
}: {
  top: ReactNode;
  sub?: ReactNode;
  end?: boolean;
  open?: boolean;
}) {
  return (
    <span className="dtable-lines" data-end={end ? "" : undefined} data-open={open ? "" : undefined}>
      <span className="dtable-line-top">{top}</span>
      {nothing(sub) ? null : <span className="dtable-line-sub">{sub}</span>}
    </span>
  );
}

/** What a line is measured by: how wide its words are, how wide it stands, and the words. */
export interface LineBox {
  scrollWidth: number;
  clientWidth: number;
  textContent: string | null;
}

/** A line's whole words where its column cut them, which its tip then says; null where it shows them whole. */
export const cutWords = (line: LineBox): string | null => {
  const words = (line.textContent ?? "").trim();
  return words && line.scrollWidth > line.clientWidth + 1 ? words : null;
};
