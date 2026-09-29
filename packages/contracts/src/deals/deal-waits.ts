/**
 * A workspace's pace and a proposal's wait (0006, 0008 amended): how long its proposals usually take to become a
 * yes (dealPaceOf), how long one goes with nothing back before it waits on the owner (waitAfterDays), and the one
 * rule for a proposal waiting (waitingOnProposal). The pace itself is worked out from the deals in pace.ts.
 */
import { DAY_MS } from "../shared/time";
import type { DealVM } from "./deal-vm";

/** A proposal out this long with nothing back is Today's leak. */
export const WAITING_AFTER_DAYS = 7;
/** How many yeses of the last year a workspace needs before its pace is said (0008, amended). */
export const PACE_AFTER_YESES = 5;
/** The days a workspace's pace is read over: its yeses decided in the last year (pace.ts dealPaceFrom). */
export const PACE_WINDOW_DAYS = 365;

/* ------------------------------------------------ a workspace's pace (0008, amended) */

/** Whether a deal is a yes (0004): it became a client, standing won or ended since -- an ended engagement was one. */
export function isYes(d: { stage: string }): boolean {
  return d.stage === "won" || d.stage === "ended";
}

/** A workspace's pace as the server works it out (pace.ts dealPaceFrom): the median whole days to a yes, over how many. */
export interface DealPaceDto {
  median_days: number | null;
  yeses: number;
}

/** A workspace's pace once it has one: how long its proposals usually take to be decided, and when one is waiting. */
export interface DealPaceVM {
  medianDays: number;
  yeses: number;
  /** How long a proposal out goes with nothing back before it waits on the owner (waitAfterDays). */
  waitDays: number;
  /** Whether that wait is past the pace: false only where the thirty-day cap holds it at or under the median. */
  longerThanUsual: boolean;
  /** "Usually 12 days to a yes". */
  words: string;
}

/**
 * The days a proposal out goes with nothing back before it waits on the owner: the workspace's pace and a fifth, kept
 * between three and thirty; a week where it has none.
 */
export function waitAfterDays(pace: Pick<DealPaceVM, "medianDays"> | null | undefined): number {
  if (!pace) return WAITING_AFTER_DAYS;
  return Math.min(30, Math.max(3, Math.round(pace.medianDays * 1.2)));
}

/** How a wait for a yes is said, by Reports' median and the card's pace alike: "under a day", "1 day", "9 days". */
export function yesWaitWords(days: number): string {
  return days === 0 ? "under a day" : `${days} ${days === 1 ? "day" : "days"}`;
}

/** "Usually 12 days to a yes", "Usually under a day to a yes". */
export function dealPaceWords(medianDays: number): string {
  return `Usually ${yesWaitWords(medianDays)} to a yes`;
}

/** A workspace's pace: null until five of its proposals became clients in the last year, or where none was read. */
export function dealPaceOf(dto: DealPaceDto | null | undefined): DealPaceVM | null {
  if (!dto || typeof dto.median_days !== "number" || !Number.isFinite(dto.median_days)) return null;
  if (!(dto.yeses >= PACE_AFTER_YESES)) return null;
  const medianDays = Math.max(0, Math.round(dto.median_days));
  const waitDays = waitAfterDays({ medianDays });
  return {
    medianDays,
    yeses: dto.yeses,
    waitDays,
    longerThanUsual: waitDays > medianDays,
    words: dealPaceWords(medianDays),
  };
}

/**
 * Whether anything came back since a proposal went (0008): they wrote or called after it. `askedMs` is when the person
 * last did either. What "nothing back" is measured against, and what the Pipeline's "Heard back" says.
 */
export function heardSinceProposal(r: {
  deal: Pick<DealVM, "stage" | "sinceMs"> | null;
  askedMs: number | null;
}): boolean {
  const d = r.deal;
  return !!d && d.stage === "proposed" && d.sinceMs !== null && r.askedMs !== null && r.askedMs >= d.sinceMs;
}

/**
 * The one rule for a proposal waiting (0006, 0008): out past the workspace's pace by a fifth -- a week while it has
 * none (waitAfterDays) -- with nothing back since it went. Today's leak, the Pipeline and the deal card all ask it,
 * one row at a time, and each hands it the workspace's pace: there is no pace a caller may leave out.
 */
export function waitingOnProposal(
  r: { deal: Pick<DealVM, "stage" | "sinceMs"> | null; askedMs: number | null },
  nowMs: number,
  pace: Pick<DealPaceVM, "waitDays"> | null,
): boolean {
  const d = r.deal;
  if (!d || d.stage !== "proposed" || d.sinceMs === null) return false;
  // The pace's own wait, the one its words say; a week where there is none, or none a number.
  const wait = pace && Number.isFinite(pace.waitDays) ? pace.waitDays : WAITING_AFTER_DAYS;
  if (nowMs - d.sinceMs < wait * DAY_MS) return false;
  return !heardSinceProposal(r);
}

/** Today's leak: the rows waiting on a proposal, by waitingOnProposal. */
export function proposalsWaiting<T extends { deal: DealVM | null; askedMs: number | null }>(
  rows: readonly T[],
  nowMs: number,
  pace: Pick<DealPaceVM, "waitDays"> | null,
): T[] {
  return rows.filter((r) => waitingOnProposal(r, nowMs, pace));
}
