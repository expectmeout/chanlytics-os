/**
 * The clock helpers the playbook modules share: a day, the sweep's tick, the first tick at or after a moment.
 * Internal: index.ts never re-exports it (the person-words.ts / run-words.ts pattern). A day and an hour are
 * shared/time.ts's; the playbook modules read the day through here.
 */
import { DAY_MS, HOUR_MS, MIN_MS } from "../shared/time";

export { DAY_MS } from "../shared/time";

/**
 * One playbook message per person per week, across playbooks: the week's breath, which a broadcast sent by hand keeps
 * too (broadcasts/run-words.ts leftOutBy). Public through playbook-triggers.ts, which re-exports it.
 */
export const PLAYBOOK_BREATH_MS = 7 * DAY_MS;

/** The playbooks sweep's tick: five past every hour (00048's cron, '5 * * * *'). */
const SWEEP_TICK_MS = 5 * MIN_MS;

/** The sweep's first tick at or after `ms`. */
export function sweepTickAtOrAfter(ms: number): number {
  return Math.ceil((ms - SWEEP_TICK_MS) / HOUR_MS) * HOUR_MS + SWEEP_TICK_MS;
}
