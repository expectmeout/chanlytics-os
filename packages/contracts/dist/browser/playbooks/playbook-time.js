import { DAY_MS, HOUR_MS, MIN_MS } from "../shared/time.js";
export { DAY_MS } from "../shared/time.js";
export const PLAYBOOK_BREATH_MS = 7 * DAY_MS;
const SWEEP_TICK_MS = 5 * MIN_MS;
export function sweepTickAtOrAfter(ms) {
  return Math.ceil((ms - SWEEP_TICK_MS) / HOUR_MS) * HOUR_MS + SWEEP_TICK_MS;
}
