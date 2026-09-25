/**
 * The clock helpers the playbook modules share: a day, the sweep's tick, the first tick at or after a moment.
 * Internal: index.ts never re-exports it (the person-words.ts / run-words.ts pattern).
 */
export const DAY_MS = 86_400_000;

/** The playbooks sweep's tick: five past every hour (00048's cron, '5 * * * *'). */
const SWEEP_TICK_MS = 5 * 60_000;

const HOUR_MS = 3_600_000;

/** The sweep's first tick at or after `ms`. */
export function sweepTickAtOrAfter(ms: number): number {
  return Math.ceil((ms - SWEEP_TICK_MS) / HOUR_MS) * HOUR_MS + SWEEP_TICK_MS;
}
