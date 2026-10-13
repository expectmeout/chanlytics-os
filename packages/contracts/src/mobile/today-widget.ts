/**
 * The home-screen widget's snapshot, made from Today's view model and the parts of what waits (the one count every
 * surface says). Apart from widget.ts, the shape and its parser, so the phone app's entry does not compile Today's
 * builders.
 */
import type { TodayVM } from "../today/today-vm";
import { standingWithRuns } from "../today/today-bands";
import { isHoldRow } from "../today/today-queue";
import { needsYouCount, type Waits } from "../waits/waits";
import type { TodayWidgetSnapshot } from "./widget";

/**
 * The count is the one count every surface says (`needs`: the parts the badge counts), the headline is Today's said
 * with the runs waiting, and the first is the first hold the queue draws: a closing window or a call worth a listen is
 * never shown as someone who needs you, and the widget never says a number the badge would not (the wiring's second
 * audit, S8-4). When only a run or a held send waits, `first` is null and the widget prints the count.
 */
export function todayWidgetSnapshot(vm: TodayVM, at: Date, needs: Waits): TodayWidgetSnapshot {
  const row = needs.holds > 0 ? (vm.queue.rows.find(isHoldRow) ?? null) : null;
  return {
    headline: standingWithRuns(vm.standing, needs.runs).headline,
    figures: (vm.figures ?? []).map((f) => ({ label: f.label, value: f.value })),
    waiting: needsYouCount(needs),
    first: row ? { who: row.who, reason: row.sentence } : null,
    at: at.toISOString(),
  };
}
