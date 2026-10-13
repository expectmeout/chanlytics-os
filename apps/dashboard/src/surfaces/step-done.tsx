/**
 * A step marked done, said one way wherever it is marked (0007, amended; canvas A, M5): Today's queue, the Inbox thread's
 * header, the person page's Up next, their Notes and a deal's card (and the Pipeline's peek, which draws the card). The
 * toast is `Step done · {the step's words}` with an Undo, and nothing else: the row or the line going is the rest of the
 * answer. The Undo is the same door, done false, with the version the done gave the note, so a step someone changed since
 * is refused in the door's words rather than written over. A page hands in its own done verb and its own flash, so this
 * reads no window and asks no server of its own.
 */
import type { ReactNode } from "react";
import { NOTE_WORDS } from "@chanlytics/contracts";
import type { markStepDone } from "./people/people-detail";

/** What the step's toast asks of a page's flash: each page's own (the shell's, the person page's, People's) takes it. */
interface StepToast {
  tone?: "danger";
  msg: ReactNode;
  undo?: () => void;
}

/** A page's flash, as the step's toast speaks through it. */
export type StepSay = (toast: StepToast) => void;

/** The step in question, the page's door to it, and how the page answers. */
interface StepAsk {
  personId: string;
  noteId: string;
  /** The step's words, said after "Step done ·". */
  words: string;
  /** The version the page saw, where it holds one (a deal card's step, a note): the door refuses a stale press. */
  version?: number;
  /** The page's done verb: people-detail.ts markStepDone, or the courier's where a page reads it off the window. */
  done: typeof markStepDone;
  /** The page's flash; null says nothing (the verb still runs). */
  say: StepSay | null;
  /** The door took the done: the page's row or line goes at once. */
  onDone?: () => void;
  /** The Undo was taken: the page's row comes back, or it reads again. */
  onUndone?: () => void;
  /** The door refused (the done or its Undo): nothing was written, so the page reads again. */
  onRefused?: () => void;
}

/** A done on its way, by note, for the whole tab: a second press of the same step, anywhere, waits for the first. */
const PRESSED = new Set<string>();

const press = (s: StepAsk, done: boolean, version?: number) =>
  version === undefined ? s.done(s.personId, s.noteId, done) : s.done(s.personId, s.noteId, done, version);

/** Mark a step done and say so, with its Undo. Answers whether the door wrote. */
export async function completeStep(s: StepAsk): Promise<boolean> {
  if (PRESSED.has(s.noteId)) return false;
  PRESSED.add(s.noteId);
  let r: Awaited<ReturnType<typeof markStepDone>>;
  try {
    r = await press(s, true, s.version);
  } finally {
    PRESSED.delete(s.noteId);
  }
  if (!r.ok) {
    s.say?.({ tone: "danger", msg: <>{r.message}</> });
    s.onRefused?.();
    return false;
  }
  s.onDone?.();
  // The version this done gave the note: what the Undo is sent with.
  const now = r.data?.note?.version;
  s.say?.({
    msg: (
      <>
        <b>{NOTE_WORDS.stepDone}</b> · {s.words}
      </>
    ),
    undo: () => void reopen(s, now),
  });
  return true;
}

/** The Undo: the same door, open again, with the version the done gave it. Its row coming back is its answer. */
async function reopen(s: StepAsk, version: number | undefined): Promise<void> {
  const r = await press(s, false, version);
  if (!r.ok) {
    s.say?.({ tone: "danger", msg: <>{r.message}</> });
    s.onRefused?.();
    return;
  }
  s.onUndone?.();
}
