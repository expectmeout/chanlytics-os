/**
 * The Receptionist lens's mix, from its own read: what became of the replies it held, what customers asked about, the language it
 * wrote in, how calls ended, and the booking link with what came of it. Every row, line and sentence is the fold's (contracts
 * `toReceptionistReportVM`, page-only): a card draws a bar a row, the line under its title, and, for a part with nothing in it,
 * the fold's words for why, never a bar of nothing.
 */
import type { MixPartVM, ReceptionistReportVM } from "@chanlytics/contracts/report-lens";
import { BarList } from "../../kit/charts/bar";
import { ChartCard } from "../../kit/charts/card";
import { EmptyState } from "../../kit/empty/empty";

/** One mix as a card: its bars, the fold's line under the title, and the table the card offers beside them. */
function mixCard(
  part: MixPartVM,
  card: { title: string; testid: string; className: string; columns: [string, string] },
) {
  const rows = part.rows.map((r) => ({ id: r.id, label: r.label, value: r.value }));
  return (
    <ChartCard
      className={card.className}
      title={card.title}
      testid={card.testid}
      takeaway={part.line}
      table={rows.length ? { columns: card.columns, rows: rows.map((r) => [r.label, r.value]) } : null}
    >
      {rows.length ? <BarList rows={rows} /> : part.empty ? <EmptyState kind="line" title={part.empty} /> : null}
    </ChartCard>
  );
}

/** What became of the replies held for the owner to change, cancel or let go. */
export function holdCard(v: ReceptionistReportVM, className: string) {
  return mixCard(v.hold, {
    title: "In the hold",
    testid: "chart-hold",
    className,
    columns: ["What became of it", "Replies"],
  });
}

/** What customers asked about, by the topic the receptionist read. */
export function topicsCard(v: ReceptionistReportVM, className: string) {
  return mixCard(v.topics, {
    title: "What they asked about",
    testid: "chart-topics",
    className,
    columns: ["Topic", "Messages"],
  });
}

/** The language the receptionist wrote in; drawn only where it wrote in two or more. */
export function languagesCard(v: ReceptionistReportVM, className: string) {
  if (!v.languages) return null;
  return mixCard(v.languages, {
    title: "Replied in",
    testid: "chart-languages",
    className,
    columns: ["Language", "Replies"],
  });
}

/** How the calls that connected ended. */
export function callEndingsCard(v: ReceptionistReportVM, className: string) {
  return mixCard(v.callEndings, {
    title: "How calls ended",
    testid: "chart-call-endings",
    className,
    columns: ["How it ended", "Calls"],
  });
}

/** The people sent the booking link and what came of it, said under the share who asked and booked. */
export function linkLine(v: ReceptionistReportVM | null) {
  if (!v) return null;
  return (
    <p className="rpt-booked-copy" data-testid="receptionist-link">
      {v.link.line}
    </p>
  );
}
