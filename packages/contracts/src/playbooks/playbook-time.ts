/**
 * The clock helpers the playbook modules share: a day, the sweep's tick, the first tick at or after a moment.
 * Internal: index.ts never re-exports it (the person-words.ts / run-words.ts pattern). A day and an hour are
 * shared/time.ts's; the playbook modules read the day through here.
 */
import { HOUR_MS, MIN_MS } from "../shared/time";

export { DAY_MS } from "../shared/time";

/** The playbooks sweep's tick: five past every hour (00048's cron, '5 * * * *'). */
const SWEEP_TICK_MS = 5 * MIN_MS;

/** The sweep's first tick at or after `ms`. */
export function sweepTickAtOrAfter(ms: number): number {
  return Math.ceil((ms - SWEEP_TICK_MS) / HOUR_MS) * HOUR_MS + SWEEP_TICK_MS;
}
