/**
 * The note a step arrives with (decision 0120, D7): the check-back a not-now asked for, written the morning its step is
 * due, or a first note to the person a wrong person named, written as their reply was read. The reply's job keeps it on
 * their thread as a draft of its own kind (`step`), naming the step; the step's row reads it there, and its sheet opens
 * with the words written.
 */
import type { ReplyDraftDto, TodayQueueRowVM } from "@chanlytics/contracts";
import type { PeopleSurface } from "../../people/surface";
import { borrowed } from "../shell";
import { stepNoteNow, type DraftWant } from "./drafts";

/** The thread of the person a step is on, as People's row holds it; null where People's rows do not hold them. */
export function stepThreadOf(row: Pick<TodayQueueRowVM, "person_id">): string | null {
  const person = borrowed<PeopleSurface>("__PEOPLE")?.rows.find((r) => r.id === row.person_id);
  return person?.threadId?.replace(/^th-/, "") ?? null;
}

/** A step row's note as it stands now; null for a row that is no step, or a step with none written. */
export function stepNoteOf(row: Pick<TodayQueueRowVM, "kind" | "person_id" | "step">): ReplyDraftDto | null {
  return row.kind === "step" ? stepNoteNow(stepThreadOf(row), row.step?.note_id) : null;
}

/** The draft a step row reads: its thread's note, read by its thread where the workspace's newest did not hold it. */
export function stepNoteWantOf(row: Pick<TodayQueueRowVM, "kind" | "person_id">): DraftWant | null {
  const conversationId = row.kind === "step" ? stepThreadOf(row) : null;
  return conversationId ? { conversationId, kind: "step", forMessageId: null, expected: false, askedAtMs: null } : null;
}
