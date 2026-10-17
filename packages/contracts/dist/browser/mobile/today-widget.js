import { standingWithRuns } from "../today/today-bands.js";
import { isHoldRow } from "../today/today-queue.js";
import { needsYouCount } from "../waits/waits.js";
export function todayWidgetSnapshot(vm, at, needs) {
  const row = needs.holds > 0 ? vm.queue.rows.find(isHoldRow) ?? null : null;
  return {
    headline: standingWithRuns(vm.standing, needs.runs).headline,
    figures: (vm.figures ?? []).map((f) => ({ label: f.label, value: f.value })),
    waiting: needsYouCount(needs),
    first: row ? { who: row.who, reason: row.sentence } : null,
    at: at.toISOString()
  };
}
