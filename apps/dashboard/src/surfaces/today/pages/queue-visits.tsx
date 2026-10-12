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
 * the panel's (surfaces/visit-line.tsx sayVisit): an operator's, said to anyone else by the button.
 */
import {
  VISIT_ASK_WORDS,
  VISIT_WORDS,
  type AppointmentWord,
  type CalendarLike,
  type TodayQueueRowVM,
  type TodayVisitsAskedVM,
  type VisitWord,
} from "@chanlytics/contracts";
import type { CalendarSurface } from "@/surfaces/calendar/surface";
import { sayVisit } from "../../visit-line";
import { TODAY_HELPERS } from "../helpers";
import { borrowed, gate, type Flash } from "../shell";

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

/** A press that is on its way, by the visit's row, so a second waits. */
const PRESSED = new Set<string>();

/**
 * A visit's two verbs: the first the row's button (Kept), the second its quiet one (Missed), as the contracts' list has them
 * (visitLineOf's `asks`). Several rows say Kept, so a reader hears whose; the role gate says so to anyone who may not say it.
 */
export function visitActs(
  row: TodayQueueRowVM,
  kind: "primary" | "ghost",
  say: (row: TodayQueueRowVM, status: VisitWord) => unknown,
) {
  const [first, second] = row.visit?.asks ?? [];
  const act = (status: VisitWord, k: "primary" | "ghost") => ({
    label: VISIT_WORDS[status],
    kind: k,
    onClick: () => say(row, status),
    gate: { ...gate("approve", VISIT_ASK_WORDS.gate), "aria-label": `${VISIT_WORDS[status]}: ${row.who}` },
    testid: `queue-visit-${status}`,
  });
  return { cta: first ? act(first, kind) : null, also: second ? act(second, "ghost") : null };
}

/**
 * Say what became of a visit. The row goes at once (`hide`), as a step's does, and the Calendar is read again behind the verb
 * (the route's refresh); the answer, or the door's refusal in its own sentence, is said in the toast whatever the page does next.
 * `page` is what the page lends it: its toast and the way it hides the row. `say` is the door (sayVisit); a test of the row
 * hands in its own.
 */
export async function visitSay(
  row: TodayQueueRowVM,
  status: VisitWord,
  page: { flash: (flash: Flash) => void; hide: (markId: string) => void },
  say: typeof sayVisit = sayVisit,
) {
  const { flash, hide } = page;
  const visit = row.visit;
  if (!visit || PRESSED.has(visit.id)) return;
  PRESSED.add(visit.id);
  let said: Awaited<ReturnType<typeof sayVisit>>;
  try {
    said = await say(visit.id, status);
  } finally {
    PRESSED.delete(visit.id);
  }
  if (!said.ok) {
    flash({ tone: "danger", msg: <>{said.message}</> });
    return;
  }
  hide(visit.id);
  flash({ msg: <>{`${VISIT_WORDS[status]}: ${row.who}`}</> });
}
