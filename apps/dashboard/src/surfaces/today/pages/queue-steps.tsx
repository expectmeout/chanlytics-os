/**
 * The steps due Today's queue draws (0007, 0047; the day pane stayed dropped, canvas E3): a person's next step once its day
 * has come, as a row of the queue in the row every person wears, three at most and one row for the rest (contracts
 * withSteps). They are People's rows, judged at the moment People published them as every page judges a step, so the
 * queue draws them again when People is read again: a step done here, in the Inbox, on the person's page, or by a
 * teammate (a note on the live feed is one of People's own tables) moves People, and People moves this.
 *
 * Done is the Inbox thread header's verb, press for press (inbox/thread/header.tsx IxThreadStep): the person-notes courier's
 * `done`, an owner's or an operator's (the door's rule; the gate says so to anyone else), answered in the toast with Set the
 * next one; a second press while the first is on its way waits.
 */
import { NOTE_WORDS, type TodayQueueRowVM, type TodayStepsVM } from "@chanlytics/contracts";
import type { PeopleSurface } from "@/surfaces/people/surface";
import { TODAY_HELPERS } from "../helpers";
import { borrowed, gate, openStepSheet, personNotes, stepSheetOffered, workspaceClock, type Flash } from "../shell";

/**
 * The steps due, from People's rows as the People surface holds them; null while People is unread or the workspace's zone is
 * not known, and with none due: no step is claimed on a guess.
 */
export function dueSteps(): TodayStepsVM | null {
  const people = borrowed<PeopleSurface>("__PEOPLE");
  const zone = workspaceClock()?.zone;
  if (!people || !zone) return null;
  return TODAY_HELPERS.steps(people.rows, people.fetchedAt || Date.now(), zone());
}

/** How many steps are due and not already done here, and how many of them the card cut: said in the head and the foot. */
export function stepsLeft(
  steps: TodayStepsVM | null,
  done: readonly string[],
  drawn: readonly TodayQueueRowVM[],
): { due: number; cut: number } {
  if (!steps) return { due: 0, cut: 0 };
  const due = steps.count - steps.items.filter((s) => done.includes(s.noteId)).length;
  // The row for the rest stands for every step the named rows are not; with it drawn nothing is left out.
  const named = drawn.filter((r) => r.kind === "step").length;
  return { due, cut: drawn.some((r) => r.kind === "steps") ? 0 : due - named };
}

/**
 * A step's one verb, Done, for the row's button: a row's door is the person, so the button is the act. Several rows say Done, so
 * a reader hears whose, as the thread header's does (markDone); the role gate says so to anyone who may not mark a step.
 */
export function stepAct(row: TodayQueueRowVM, kind: "primary" | "ghost", done: (row: TodayQueueRowVM) => unknown) {
  return {
    label: row.cta.label,
    kind,
    onClick: () => done(row),
    gate: { ...gate("approve", "mark a step done"), "aria-label": NOTE_WORDS.markDone(row.sentence) },
  };
}

/** A step is being marked: the press that is on its way, so a second waits. */
const PRESSED = new Set<string>();

/**
 * Mark a step done. The row goes at once (`hide`), as the thread header's line does, and People is read again behind the verb
 * (the route's refresh); the answer is said in the toast whatever the page does next.
 */
export async function stepDone(row: TodayQueueRowVM, flash: (flash: Flash) => void, hide: (noteId: string) => void) {
  const step = row.step;
  const notes = personNotes();
  if (!step || !notes || PRESSED.has(step.note_id)) return;
  PRESSED.add(step.note_id);
  let res: Awaited<ReturnType<typeof notes.done>>;
  try {
    res = await notes.done(step.person_id, step.note_id, true);
  } finally {
    PRESSED.delete(step.note_id);
  }
  if (!res.ok) {
    flash({ tone: "danger", msg: <>{res.message}</> });
    return;
  }
  hide(step.note_id);
  const next = stepSheetOffered() ? () => openStepSheet({ personId: step.person_id, dealId: step.deal_id }) : null;
  flash({
    msg: <>{NOTE_WORDS.stepDone}</>,
    ...(next ? { action: { label: NOTE_WORDS.setTheNext, onClick: next } } : {}),
  });
}
