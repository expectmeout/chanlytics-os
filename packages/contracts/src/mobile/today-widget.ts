/**
 * The home-screen widget's snapshot, made from Today's view model and the one count every surface says (decision 0048 as
 * amended by Today in three zones, 2 Nov 2026). Apart from widget.ts, the shape and its parser, so the phone app's entry
 * does not compile Today's builders.
 */
import { needYouGroupsOf } from "../need-you/groups";
import type { TodayVM } from "../today/vm";
import { standingWithRuns, todayHeadLine } from "../today/bands";
import { isHoldRow } from "../today/queue";
import { needsYouCount, type Waits } from "../waits/waits";
import type { TodayWidgetSnapshot } from "./widget";

/**
 * The count is the one count the badge says (`oneCount`: needs-you.ts needsYouNow, Need you's rows above To do and the
 * runs an approval can still send), the headline the lead of Today's head over it, and the first the first hold among
 * those rows (Up next, then who waits on you): a closing window or a call worth a listen is never shown as someone who
 * needs you, nor anyone Older, and the widget never says a number the badge would not (the wiring's second audit, S8-4).
 * When only a run or a held send waits, `first` is null and the widget prints the count. Without the one count (a demo
 * session, or Today not read yet), the parts the Inbox counts (`needs`) stand in for it, as the badge's own fallback does.
 */
export function todayWidgetSnapshot(
  vm: TodayVM,
  at: Date,
  needs: Waits,
  oneCount: number | null = null,
): TodayWidgetSnapshot {
  const waiting = oneCount ?? needsYouCount(needs);
  const groups = needYouGroupsOf(vm.queue.rows);
  const someone = oneCount === null ? needs.holds > 0 : oneCount > 0;
  const row = someone ? ([...groups.next, ...groups.waiting].find(isHoldRow) ?? null) : null;
  return {
    headline:
      oneCount === null
        ? standingWithRuns(vm.standing, needs.runs).headline
        : todayHeadLine(vm.standing, oneCount, null, vm.quiet ?? null).lead,
    // A count the day could not read is no figure on the widget, never a zero it does not know (TodayFigureVM.value).
    figures: vm.figures.flatMap((f) => (f.value === null ? [] : [{ label: f.label, value: f.value }])),
    waiting,
    first: row ? { who: row.who, reason: row.sentence } : null,
    at: at.toISOString(),
  };
}
