/**
 * The receptionist's memory of one conversation, as the handler reads it.
 *
 * Postgres is the only memory. The rows are assembled by packages/db's
 * readThreadState and handed over by lib/whatsapp/persist.ts; this file is
 * the shape they arrive in, and it is dependency-free so the brain can name a
 * turn without importing the database.
 *
 * The one distinction that changes behaviour lives here: a thread Postgres
 * could not produce is UNKNOWN, not empty. A blank thread has `pausedUntil:
 * 0`, so reading a failed read as blank makes the receptionist believe nobody
 * has taken the thread over, that it has never spoken to this person, and
 * that it has used none of its daily replies — so it talks over the human
 * handling the conversation and re-greets a customer mid-thread. There is
 * nowhere to fall back to, so an unknown thread goes to a person instead.
 */

export interface ThreadTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ThreadState {
  /** The conversation so far, oldest first — what the model is shown. */
  history: ThreadTurn[];
  /** Epoch ms — a human is handling this thread until then. */
  pausedUntil: number;
  /** Epoch ms of the bot's replies in the last day (the rate cap). */
  replies: number[];
  /**
   * Postgres could not produce this thread.
   *
   * A FIELD on a fresh object, never a shared sentinel compared by identity.
   * Callers mutate what they are handed (`t.pausedUntil = ...`), so one
   * exported instance accumulated every customer's state on a process-global
   * object and leaked it to the next customer inside a warm lambda.
   */
  unknown?: boolean;
  /**
   * We have written to this person before, per Postgres.
   *
   * It exists because the question "is this our first reply to them" — which
   * decides whether a text carries the rates/STOP/HELP footer the campaign
   * filing promises — cannot be answered from the history: a voice call note
   * is an INBOUND row whose sender is "system", and assembleHistory maps that
   * to an assistant turn, so a customer who phoned and then texted for the
   * first time was taken for someone we had already written to and their
   * first reply went out without the disclosure.
   */
  repliedBefore?: boolean;
}

/**
 * The state of a thread nobody can read. `pausedUntil: -1` is a second line
 * of defence: a caller that forgets the check still fails closed.
 */
export const unreadableThread = (): ThreadState => ({
  history: [],
  pausedUntil: -1,
  replies: [],
  unknown: true,
});

/** True when this state came from a failed read rather than from the rows. */
export function isThreadUnknown(s: ThreadState): boolean {
  return s.unknown === true;
}
