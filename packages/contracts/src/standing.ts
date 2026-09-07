/**
 * Who has a thread — decided once.
 *
 * Three surfaces used to answer this three ways. The Inbox counted a paused
 * thread with an open escalation as "needs you"; People counted the same
 * pause as ownership and called it "waiting on you"; Today counted every open
 * escalation, including the ones a person had already taken over. One word,
 * three numbers. Everything below reads this function, so a thread has one
 * standing wherever it is shown.
 *
 *   needs_you  flagged for a person, and nobody has it
 *   yours      flagged, and you have it — you took it, or you replied and the
 *              receptionist paused for you
 *   theirs     flagged, and a teammate has it
 *   snoozed    put aside until it wakes; whatever it was waits with it
 *   quiet      nothing open — the receptionist is answering, or nothing is
 *              happening
 */

export interface StandingInput {
  /** The conversation's state column. */
  state: string;
  paused_until?: string | null;
  assignee_user_id?: string | null;
  /** Unknown (undefined) reads as "mine": a row that cannot say whose claim it is does not accuse a teammate. */
  assignee_is_me?: boolean | null;
  /** An escalation row still open on the thread. */
  open_escalation: boolean;
}

export type Standing = "needs_you" | "yours" | "theirs" | "snoozed" | "quiet";

export interface StandingVerdict {
  standing: Standing;
  /** Something asked for a person: an open escalation, the needs_human state, or a live pause. */
  flagged: boolean;
  /** The receptionist is paused on this thread right now. */
  paused: boolean;
  /** You have it. */
  takenOver: boolean;
  /** A teammate has it. */
  claimedByOther: boolean;
}

export function standingOf(i: StandingInput, nowMs: number): StandingVerdict {
  const paused = !!i.paused_until && new Date(i.paused_until).getTime() > nowMs;
  const flagged = i.open_escalation || i.state === "needs_human" || paused;
  const claimedByOther = !!i.assignee_user_id && i.assignee_is_me === false;
  // A pause with no escalation open is the one a person's own reply leaves
  // behind: the receptionist stepped back because someone answered. A pause
  // WITH an escalation open is the receptionist waiting for that someone.
  const mine = !!i.assignee_user_id || (paused && !i.open_escalation);
  const standing: Standing =
    i.state === "snoozed" ? "snoozed"
    : !flagged ? "quiet"
    : claimedByOther ? "theirs"
    : mine ? "yours"
    : "needs_you";
  return { standing, flagged, paused, takenOver: standing === "yours", claimedByOther };
}
