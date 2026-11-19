/**
 * Meta's pace for one ad account, kept so no call is sent that Meta will refuse (the Ads plan, 5.2 and 6.6).
 *
 * In its first tier Meta gives an app a score of 60 for each ad account: a read costs 1, a change 3, the score eases
 * over five minutes, and a caller that reaches the top is held for five more. Every answer says how much of each limit
 * is used. So after every answer the account keeps the share used and, where Meta is holding back or the share is high,
 * the moment before which it is not asked again. A press that reaches Meta and a read on a clock both ask here first.
 * Pure: the clock is handed in.
 */
import { MIN_MS, SECOND_MS } from "@chanlytics/contracts";
import type { MetaAdsFault, MetaUsage } from "@chanlytics/channels/ads";

/** The share of a limit past which a read waits: what is left is kept for an owner's press, which costs three reads. */
export const ADS_USAGE_HOLD_PCT = 75;
/** How long Meta takes to ease a score, and how long it holds a caller that reached the top (its page: 300 seconds). */
const META_EASES_MS = 5 * MIN_MS;

/**
 * The moment before which Meta is not asked about an account again, after an answer: null where nothing holds a call
 * back. A caller Meta slowed waits out Meta's own word or the five minutes, whichever is longer; one whose share is
 * high waits for the score to ease.
 */
export function readAfterOf(usage: MetaUsage | null, fault: MetaAdsFault | null, nowMs: number): string | null {
  const saidMs = (usage?.waitS ?? 0) * SECOND_MS;
  const held = fault === "slowed" || (usage !== null && usage.pct >= ADS_USAGE_HOLD_PCT);
  const waitMs = held ? Math.max(saidMs, META_EASES_MS) : saidMs;
  return waitMs > 0 ? new Date(nowMs + waitMs).toISOString() : null;
}

/** Whether Meta may be asked about an account now: nothing holds it back, or what did has passed. */
export function mayAskMeta(account: { read_after: string | null }, nowMs: number): boolean {
  return account.read_after === null || Date.parse(account.read_after) <= nowMs;
}
