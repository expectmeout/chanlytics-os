/**
 * WHEN to shout about a broken sweep, and what to say.
 *
 * Separated from the sending for the same reason chooseAddressing is in
 * notify.ts: this is the decision that either floods the only alarm channel
 * this system has or silences it, and a decision buried inside a fetch cannot
 * be tested.
 */

/** One row of public.sweep_health(). */
export interface SweepHealthRow {
  sweep: string;
  healthy: boolean;
  detail: string | null;
  last_request_at: string | null;
  status_code: number | null;
  scheduled: boolean;
  alerted_at: string | null;
}

/**
 * How long a DELIVERED alert buys quiet. Six hours, not one tick: the failure
 * is config-level and needs a human, so re-sending every 30 minutes is 48
 * mails a day, which is how the alarm channel gets filtered into a folder and
 * the NEXT real alert is missed. Four a day is noticed at the start of a
 * working day and again mid-day, and survives the overnight gap.
 */
export const ALERT_SUPPRESSION_MS = 6 * 60 * 60 * 1000;

export interface SweepAlertPlan {
  /** Every sweep currently failing, for the response body and the log. */
  broken: string[];
  /** The failing sweeps this tick may actually email about. */
  alert: SweepHealthRow[];
  /** Every healthy sweep — their suppression stamps are cleared. */
  healthy: string[];
  /** Healthy now, but we had alerted about them: worth an all-clear. */
  recovered: string[];
}

export function chooseSweepAlerts(
  rows: SweepHealthRow[],
  nowMs: number,
  suppressionMs: number = ALERT_SUPPRESSION_MS,
): SweepAlertPlan {
  const broken = rows.filter((r) => !r.healthy);
  return {
    broken: broken.map((r) => r.sweep),
    healthy: rows.filter((r) => r.healthy).map((r) => r.sweep),
    recovered: rows.filter((r) => r.healthy && r.alerted_at).map((r) => r.sweep),
    // Suppression is PER SWEEP, so a second sweep breaking during the first
    // one's quiet window is reported at once rather than up to six hours late.
    alert: broken.filter((r) => {
      if (!r.alerted_at) return true;
      const last = Date.parse(r.alerted_at);
      // An unreadable stamp must never buy silence.
      if (!Number.isFinite(last)) return true;
      return nowMs - last >= suppressionMs;
    }),
  };
}

/** What each sweep failing COSTS, in the terms the owner cares about. */
const CONSEQUENCE: Record<string, string> = {
  deadman: "a customer handed to a human is no longer flagged when nobody picks it up",
  calls: "a call whose 'ended' webhook was lost stays 'ongoing' forever, and metrics count it",
  health: "this check itself is not running, so nothing else on this list can be trusted",
};

/**
 * The alert body. It carries sweep names, timestamps, HTTP status codes and
 * the edge's own JSON reply — the three sweep endpoints answer with counts and
 * error slugs only — and never touches a conversation, because this goes to
 * the PLATFORM mailbox and there is no tenant it could belong to.
 */
export function describeSweepTrouble(rows: SweepHealthRow[]): string {
  const lines = rows.map(
    (r) => `  ${r.sweep} — ${r.detail ?? "failing, with no detail recorded"}\n` +
           `      while this is broken: ${CONSEQUENCE[r.sweep] ?? "a scheduled sweep is not running"}`,
  );
  return (
    `The database is asking the edge to run these sweeps and the edge is not doing them.\n\n` +
    `${lines.join("\n\n")}\n\n` +
    `pg_cron records every one of these as "succeeded" the moment the request is queued, ` +
    `whichever way the edge answers, so this mail is the only place the truth appears.\n\n` +
    `GET /api/diag with the x-diag-key header shows the current state under "sweeps".\n` +
    `Further notices are suppressed for six hours per sweep, and only once this one has ` +
    `actually been delivered.\n`
  );
}