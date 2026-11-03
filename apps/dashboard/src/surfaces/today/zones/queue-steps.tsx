/**
 * The steps due Today's queue draws (0007, 0047; the day pane stayed dropped, canvas E3): a person's next step once its day
 * has come, as a row of the queue in the row every person wears, three at most and one row for the rest (contracts
 * withSteps). They are People's rows, judged at the moment People published them as every page judges a step, so the
 * queue draws them again when People is read again: a step done here, in the Inbox, on the person's page, or by a
 * teammate (a note on the live feed is one of People's own tables) moves People, and People moves this.
 *
 * Done is the Inbox thread header's verb, press for press (inbox/thread/header.tsx IxThreadStep): the person-notes courier's
 * `done`, an owner's or an operator's (the door's rule; the gate says so to anyone else), said as every page says it
 * (step-done.tsx): "Step done · its words", with an Undo that brings the row back. The row's button is Need you's
 * (need-you/call-work.tsx StepWork, decision 0071), beside Not now, which moves the step's day.
 */
import type { TodayQueueRowVM, TodayStepsVM } from "@chanlytics/contracts";
import type { PeopleSurface } from "@/surfaces/people/surface";
import { TODAY_HELPERS } from "../helpers";
import { completeStep, type StepSay } from "../../step-done";
import { refreshSurface } from "../../legacy-verbs";
import { borrowed, personNotes, workspaceClock } from "../shell";

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

/**
 * Mark a step done. The row goes at once (`hide`), as the thread header's line does, and People is read again behind the verb
 * (the route's refresh); the toast says it, and its Undo brings the row back (`show`). Refused, People is read again: the
 * row is People's, and the step it drew may be the one a teammate moved (the wiring's second audit, S9-10).
 */
export async function stepDone(
  row: TodayQueueRowVM,
  say: StepSay,
  page: { hide: (noteId: string) => void; show: (noteId: string) => void },
) {
  const step = row.step;
  const notes = personNotes();
  if (!step || !notes) return;
  await completeStep({
    personId: step.person_id,
    noteId: step.note_id,
    words: row.sentence,
    done: notes.done,
    say,
    onDone: () => page.hide(step.note_id),
    onUndone: () => page.show(step.note_id),
    onRefused: () => void refreshSurface("people"),
  });
}
