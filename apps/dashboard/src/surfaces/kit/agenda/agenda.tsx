/**
 * One appointment on a list, and the list it sits on (moved whole from legacy/components/day-agenda.jsx, decision 0015:
 * the kit's one implementation, which seed-globals publishes as window.AgendaItem, AgendaItems and AgendaOpen for Today's
 * page, which has not moved). The shape Today's day drew and the Calendar's agenda drew a second time, in its own grid,
 * its own sizes and its own order: the two said the same facts about the same appointment and looked like two products.
 *
 * It is one row, `.ag-*` in components.css:
 *
 *   10:30 AM  •  Emily Chen
 *                Gloss · 1h
 *                Needs you — in Inbox
 *
 * A time column, a rail with a dot per entry (the now marker on today's), then who it is for with what it is for and how
 * long under them, and a line when their thread needs someone. Nobody matched to the appointment means the service IS
 * the headline, and there is nothing under it but the length.
 *
 * The name is said ONCE. A business writes the customer into the event's own title ("Gloss · Emily Chen"), so a row that
 * names them and then prints the title said them twice: contracts' `serviceOf` takes the name out, and `block.service`
 * is what is left. Never compose that here: the words are the view model's.
 *
 * What each page still owns: the day's heading and its notes, what a press does, whether there is a rail at all, and the
 * open windows under the list. Those genuinely differ, and the pages pass them in.
 */
import type { ReactNode } from "react";
import { Icon } from "../icon/icon";

interface AgendaItemProps {
  /** The start, in the column at the left ("10:30 AM", or "All day"). */
  time: ReactNode;
  /** The headline: who it is for, else the service. */
  name: ReactNode;
  /** What it is for, under the name. */
  service?: string | null;
  /** How long, after the service. */
  dur?: string | null;
  /** A line under them when their thread needs someone. */
  flag?: ReactNode;
  /** A mark at the right: the channel they are on. */
  glyph?: string | null;
  /** Where it stands against the clock on today's list (past, now, next, later); "later" anywhere else. */
  phase?: string;
  onOpen?: () => void;
  /** What the row says on hover. */
  hint?: string | null;
  testid?: string | null;
}

/** One row. `name` is the headline, `service` and `dur` the line under it: give it whichever of those you have. */
export function AgendaItem({
  time,
  name,
  service = null,
  dur = null,
  flag = null,
  glyph = null,
  phase = "later",
  onOpen,
  hint = null,
  testid = null,
}: AgendaItemProps) {
  // The line under the name: what it is for, then how long. Either may be missing; both missing draws no line.
  const sub = [service, dur].filter(Boolean).join(" · ");
  return (
    <button
      className={`ag-item ${phase}${flag ? " flagged" : ""}`}
      onClick={onOpen}
      title={hint || undefined}
      data-testid={testid || undefined}
      data-phase={phase}
    >
      <span className="ag-item-time">{time}</span>
      <span className="ag-item-rail" aria-hidden="true" />
      <span className="ag-item-body">
        <span className="ag-item-name">{name}</span>
        {sub && <span className="ag-item-sub">{sub}</span>}
        {flag && <span className="ag-item-flag">{flag}</span>}
      </span>
      {glyph && (
        <span className="mark ag-item-glyph">
          <Icon name={glyph} size={13} />
        </span>
      )}
    </button>
  );
}

/** The list the rows stand on: it draws the rail behind them, so a page never positions that itself. */
export function AgendaItems({ children }: { children?: ReactNode }) {
  return <div className="ag-items">{children}</div>;
}

/**
 * What the receptionist would offer, under a day's rows. The label is the page's (Today says "Open", the Calendar says
 * what service it is open FOR) and the windows are drawn the same on both.
 */
export function AgendaOpen({ label = "Open", children }: { label?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ag-open">
      <span className="ag-open-label">{label}</span>
      {children}
    </div>
  );
}
