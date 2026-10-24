/**
 * Yesterday's visits to mark, as rows of Today's queue (decision 0047, D1-visit-mark; the product call of 11 Oct 2026): a
 * visit of yesterday's that has ended, that the record keeps a row for and that is for a person the board matched, and that
 * nobody has said whether they came to, asks "Did they come?" with Kept and Missed, three at most and one row for the rest
 * (contracts withVisitsAsked). Like the steps due (queue-steps.tsx) they are the team's own to-do and nobody waiting on a person:
 * counted in the head's sub-line and its foot, never in the number that says who needs you.
 *
 * They are the Calendar's blocks, as the surface holds them (the day's card reads the same surface), so the queue draws them
 * again when the Calendar is read again: a visit marked here, on the person's page, on the Calendar's panel or by a teammate
 * moves the board (the refresh map's `visits`), and the board moves this. The press is the Calendar's own door and the gate is
 * the panel's (surfaces/visit-line.tsx sayVisit): an operator's, said to anyone else by the button, which is Need you's own
 * (need-you/visit-work.tsx, decision 0071: Missed goes on to the rebook Ask writes).
 */
import type { AppointmentWord, CalendarLike, TodayQueueRowVM, TodayVisitsAskedVM } from "@chanlytics/contracts";
import type { CalendarSurface } from "@/surfaces/calendar/surface";
import { TODAY_HELPERS } from "../helpers";
import { borrowed } from "../shell";

/**
 * Yesterday's unmarked visits, from the Calendar as the surface holds it; null while the calendar is unread, one that could not
 * be read, one that does not hold the day before today, and with none to mark: no visit is claimed on a guess.
 */
export function askedVisits(word: AppointmentWord): TodayVisitsAskedVM | null {
  const cal = borrowed<CalendarSurface>("__CALENDAR");
  if (!cal || !cal.vm || cal.vm.feed.state !== "ok") return null;
  return TODAY_HELPERS.visitsAsked(cal.vm as CalendarLike, Date.now(), word);
}

/**
 * How many are to mark and not already marked here, and how many of them the card cut: said in the head and the foot. The row
 * for the rest stands for every visit the named rows are not, so with it drawn nothing is left out.
 */
export function visitsLeft(
  asked: TodayVisitsAskedVM | null,
  marked: readonly string[],
  drawn: readonly TodayQueueRowVM[],
): { due: number; cut: number } {
  if (!asked) return { due: 0, cut: 0 };
  const due = asked.count - asked.items.filter((a) => marked.includes(a.markId)).length;
  const named = drawn.filter((r) => r.kind === "visit").length;
  return { due, cut: drawn.some((r) => r.kind === "visits") ? 0 : due - named };
}
