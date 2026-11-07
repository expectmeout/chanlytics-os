/**
 * What a member does over the Pipeline's rows (0008): a card dropped in another column (pipelineMove), the order
 * the table sorts by (pipelineSorted), a selection's pass (pipelinePassMany, pipelinePassDone), and a board
 * column's cap. The peek is pipeline/peek.ts's.
 */
import {
  DEAL_LOST_REASONS,
  DEAL_LOST_REASON_WORDS,
  type DealLostReason,
  GROUP_WORDS,
  PIPELINE_WORDS,
  csvCell,
} from "@chanlytics/contracts";
import type { DealVM, DealSheetMode, PipelineGroupKey, PipelineSource, PipelineVM } from "@chanlytics/contracts";

/* ------------------------------------------------ the Pipeline as a workspace: the peek and the board's moves */

/** What a card dropped in another column asks for: the one deal sheet, in the mode the move needs (0008). */
export interface PipelineMove {
  mode: DealSheetMode;
  /** The deal the move is about; null for a new proposal. */
  dealId: string | null;
}

/**
 * What dropping a card from one group into another means, or null where it means nothing. A consultation into
 * Proposal out starts a proposal; a proposal into Clients is a yes, into Passed or ended a pass; a client into Passed
 * or ended is an end; a passed deal back into Proposal out is proposed again, and an ended one begins a new proposal.
 * Nothing else moves, and nothing moves without the sheet: a drop is a person's confirmation, never the record
 * itself, so the sheet still asks what the move needs (the amount, the reason, the day).
 */
export function pipelineMove(
  from: PipelineGroupKey,
  to: PipelineGroupKey,
  row: { deal: DealVM | null },
): PipelineMove | null {
  if (from === to) return null;
  // The row's own deal (0029): a person with two open deals has a row for each, and a move is on the one it stands for.
  const deal = row.deal;
  if (from === "consultations" && to === "proposals") return { mode: "propose", dealId: null };
  if (from === "proposals" && deal?.stage === "proposed") {
    if (to === "clients") return { mode: "won", dealId: deal.id };
    if (to === "closed") return { mode: "lost", dealId: deal.id };
  }
  if (from === "clients" && to === "closed" && deal?.stage === "won") return { mode: "ended", dealId: deal.id };
  if (from === "closed" && to === "proposals" && deal)
    return deal.stage === "lost" ? { mode: "again", dealId: deal.id } : { mode: "propose", dealId: null };
  return null;
}

/* ------------------------------------------------ the row carries the deal: its order, a selection's pass, the peek */

/**
 * How the rows order within each group, by the table's sortable headings: Stage, the Pipeline's own order (reversed,
 * the other way); Value, what each deal comes to over a year; Person, by name. The groups themselves never move.
 */
export const PIPELINE_SORTS = ["stage", "value", "name", "next"] as const;

/** The sorts a phone offers, a desk's headings' own (pipelineSorted): each a sort and the way it runs first. */
export const PIPELINE_PHONE_SORTS: readonly {
  by: (typeof PIPELINE_SORTS)[number];
  dir: "asc" | "desc";
  label: string;
}[] = [
  { by: "stage", dir: "asc", label: "By stage" },
  { by: "value", dir: "desc", label: "Highest value first" },
  { by: "next", dir: "asc", label: "Next step soonest" },
  { by: "name", dir: "asc", label: "Name, A to Z" },
];

/**
 * The deals shown, as a file (a phone's Export; Ruben, 10 Oct 2026): who, how to reach them, and the deal as its row
 * says it -- where it stands, the service, what it comes to, its standing, how long, the next step. Every cell is
 * csvCell's, the one rule every file the product writes is spelled by.
 */
export function pipelineCsv(
  rows: readonly {
    group: PipelineGroupKey;
    name: string;
    person: { phone?: string | null; email?: string | null };
    service: string | null;
    value: string | null;
    inStage: string;
    chip: { words: string } | null;
    next: { words: string; when: string } | null;
  }[],
): string {
  const head = ["Name", "Phone", "Email", "Stage", "Service", "Value", "Standing", "In stage", "Next step"];
  const lines = rows.map((row) =>
    [
      row.name,
      row.person.phone || "",
      row.person.email || "",
      GROUP_WORDS[row.group],
      row.service || "",
      row.value || "",
      row.chip ? row.chip.words : "",
      row.inStage,
      row.next ? `${row.next.words} (${row.next.when})` : "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.map(csvCell).join(","), ...lines].join("\r\n");
}
export type PipelineSort = (typeof PIPELINE_SORTS)[number];

/** A deal's worth over a year, to order by: a month's twelve times, a year's and a one-off's as they are; null for none. */
function yearCents(d: DealVM | null): number | null {
  if (!d || d.amountCents === null || !Number.isFinite(d.amountCents)) return null;
  return d.per === "month" ? d.amountCents * 12 : d.amountCents;
}

/**
 * The same Pipeline with each group's rows in the order the member picked. A tie keeps the Pipeline's own order, and a
 * row with no value goes last whichever way value runs. An order it does not know is the Pipeline's own.
 */
export function pipelineSorted<T extends PipelineSource>(
  vm: PipelineVM<T>,
  by: string | null | undefined,
  dir: "asc" | "desc",
): PipelineVM<T> {
  const sort: PipelineSort = (PIPELINE_SORTS as readonly string[]).includes(by ?? "") ? (by as PipelineSort) : "stage";
  if (sort === "stage" && dir !== "desc") return vm;
  const sign = dir === "desc" ? -1 : 1;
  const groups = vm.groups.map((group) => {
    const ranked = group.rows.map((r, i) => ({ r, i }));
    ranked.sort((first, second) => {
      if (sort === "stage") return sign * (first.i - second.i);
      if (sort === "name") return sign * first.r.name.localeCompare(second.r.name) || first.i - second.i;
      // Next step: by its day, the soonest first; a row with none goes last whichever way it runs.
      if (sort === "next") {
        const x = first.r.next?.day ?? null;
        const y = second.r.next?.day ?? null;
        if (x === y) return first.i - second.i;
        if (x === null) return 1;
        if (y === null) return -1;
        return sign * x.localeCompare(y);
      }
      // What the row shows: a consultation's row shows no value, whatever a deal of theirs that closed came to.
      // And the row's own deal (0029): a person's two proposals are two values.
      const item = first.r.value === null ? null : yearCents(first.r.deal);
      const other = second.r.value === null ? null : yearCents(second.r.deal);
      if (item === other) return first.i - second.i;
      if (item === null) return 1;
      if (other === null) return -1;
      return sign * (item - other);
    });
    return { ...group, rows: ranked.map((x) => x.r) };
  });
  return { ...vm, groups };
}

/** How many a selection's pass records at a press, as People's bar writes fifty (clients-a.jsx PL_BATCH). */
export const PIPELINE_PASS_MAX = 50;

/** A pass asked of a selection: the proposals out in it, why they passed, and those that stay as they are. */
export interface PipelinePassManyVM {
  /** The proposals out this press records, fifty at most. */
  /** Each with the row it was picked as (0029: a person's two proposals are two rows), so the selection drops it as it passes. */
  deals: { personId: string; dealId: string; rowId: string }[];
  /** The bar's button, "Mark as passed · 2"; null with no proposal out among them. */
  button: string | null;
  /** The question's own Go, "Mark 2 as passed"; null with no proposal out among them. */
  words: string | null;
  /** Proposals out past the fifty, which stay selected: "12 more stay selected, fifty at a time"; null for none. */
  more: string | null;
  /** "1 is not a proposal out and stays as it is"; null when every one is. */
  rest: string | null;
  /** The reasons a pass is asked, in the deal sheet's own words and order. */
  reasons: { code: DealLostReason; words: string }[];
}

/**
 * Mark as passed for a selection (0008): only a proposal out can pass, so the rest are counted and left as they are,
 * and the one question -- why -- is asked once for all of them. The page records each through the deal door in turn,
 * with the version the person's own read says (a People row does not carry one).
 */
export function pipelinePassMany(rows: readonly (PipelineSource & { rowId?: string })[]): PipelinePassManyVM {
  // Each picked row with its own deal (0029): `deal` is the row's, `rowId` the row it was picked as.
  const out = rows
    .filter((r) => r.deal && r.deal.stage === "proposed" && r.deal.id)
    .map((r) => ({ personId: r.id, dealId: r.deal!.id as string, rowId: r.rowId ?? r.id }));
  const deals = out.slice(0, PIPELINE_PASS_MAX);
  const later = out.length - deals.length;
  const key = rows.length - out.length;
  return {
    deals,
    button: deals.length ? `${PIPELINE_WORDS.pass.button} · ${deals.length}` : null,
    words: deals.length ? `Mark ${deals.length} as passed` : null,
    more: later ? `${later} more stay selected, fifty at a time` : null,
    rest: key
      ? key === 1
        ? "1 is not a proposal out and stays as it is"
        : `${key} are not proposals out and stay as they are`
      : null,
    reasons: DEAL_LOST_REASONS.map((code) => ({ code, words: DEAL_LOST_REASON_WORDS[code] })),
  };
}

/**
 * What a selection's pass came to, said once: how many were marked; those that had changed since (no longer a
 * proposal out, or moved by someone else), left as they are; and those that could not be recorded at all (offline, a
 * refusal of another kind), which another press may take.
 */
export function pipelinePassDone(
  done: number,
  changed: number,
  failed = 0,
): { words: string; tone: "ok" | "warn" | "danger" } {
  const parts: string[] = [];
  if (done || (!changed && !failed)) parts.push(done === 1 ? "1 marked as passed" : `${done} marked as passed`);
  if (changed)
    parts.push(
      changed === 1 ? "1 had changed, and was left as it is" : `${changed} had changed, and were left as they are`,
    );
  if (failed) parts.push(failed === 1 ? "1 could not be marked" : `${failed} could not be marked`);
  return { words: parts.join(" · "), tone: failed && !done ? "danger" : changed || failed ? "warn" : "ok" };
}

/** A board column shows this many cards, then says how many more it holds. */
export const PIPELINE_BOARD_CAP = 20;

/** A board column's way to the rest of its cards: "Show 4 more". */
export function pipelineBoardMore(count: number): string {
  return `Show ${count} more`;
}
