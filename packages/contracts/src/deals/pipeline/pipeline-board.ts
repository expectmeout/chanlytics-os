/**
 * What a member does over the Pipeline's rows (0008): a card dropped in another column (pipelineMove), the order
 * the table sorts by (pipelineSorted), a selection's pass (pipelinePassMany, pipelinePassDone), and a board
 * column's cap. The peek is pipeline-peek.ts's.
 */
import { DEAL_LOST_REASONS, DEAL_LOST_REASON_WORDS, type DealLostReason } from "../deal-words";
import type { DealVM } from "../deal-vm";
import type { DealSheetMode } from "../sheet/deal-acts";
import type { PipelineGroupKey, PipelineSource, PipelineVM } from "./pipeline-vm";
import { PIPELINE_WORDS } from "./pipeline-words";

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
  row: { person: Pick<PipelineSource, "deal"> },
): PipelineMove | null {
  if (from === to) return null;
  const deal = row.person.deal;
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
  const groups = vm.groups.map((g) => {
    const ranked = g.rows.map((r, i) => ({ r, i }));
    ranked.sort((a, b) => {
      if (sort === "stage") return sign * (a.i - b.i);
      if (sort === "name") return sign * a.r.name.localeCompare(b.r.name) || a.i - b.i;
      // Next step: by its day, the soonest first; a row with none goes last whichever way it runs.
      if (sort === "next") {
        const x = a.r.next?.day ?? null;
        const y = b.r.next?.day ?? null;
        if (x === y) return a.i - b.i;
        if (x === null) return 1;
        if (y === null) return -1;
        return sign * x.localeCompare(y);
      }
      // What the row shows: a consultation's row shows no value, whatever a deal of theirs that closed came to.
      const x = a.r.value === null ? null : yearCents(a.r.person.deal);
      const y = b.r.value === null ? null : yearCents(b.r.person.deal);
      if (x === y) return a.i - b.i;
      if (x === null) return 1;
      if (y === null) return -1;
      return sign * (x - y);
    });
    return { ...g, rows: ranked.map((x) => x.r) };
  });
  return { ...vm, groups };
}

/** How many a selection's pass records at a press, as People's bar writes fifty (clients-a.jsx PL_BATCH). */
export const PIPELINE_PASS_MAX = 50;

/** A pass asked of a selection: the proposals out in it, why they passed, and those that stay as they are. */
export interface PipelinePassManyVM {
  /** The proposals out this press records, fifty at most. */
  deals: { personId: string; dealId: string }[];
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
export function pipelinePassMany(rows: readonly PipelineSource[]): PipelinePassManyVM {
  const out = rows
    .filter((r) => r.deal && r.deal.stage === "proposed" && r.deal.id)
    .map((r) => ({ personId: r.id, dealId: r.deal!.id as string }));
  const deals = out.slice(0, PIPELINE_PASS_MAX);
  const later = out.length - deals.length;
  const k = rows.length - out.length;
  return {
    deals,
    button: deals.length ? `${PIPELINE_WORDS.pass.button} · ${deals.length}` : null,
    words: deals.length ? `Mark ${deals.length} as passed` : null,
    more: later ? `${later} more stay selected, fifty at a time` : null,
    rest: k
      ? k === 1
        ? "1 is not a proposal out and stays as it is"
        : `${k} are not proposals out and stay as they are`
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
export function pipelineBoardMore(n: number): string {
  return `Show ${n} more`;
}
