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

/**
 * What the Inbox says of a thread somebody has, once: the pill's words and the pane's sentence, for the thread you have
 * and for one a teammate has. The Inbox's pills (shell/tone.ts), its pane (inbox-thread.ts) and a person's page
 * (people/person-receptionist.ts) all read these, so a thread is not "yours" in one place and "a person's" in another.
 */
export const HELD_WORDS = {
  yours: {
    pill: "You have it",
    sentence: "You're answering this one. The receptionist stays quiet until you hand it back.",
  },
  theirs: {
    pill: "A teammate has it",
    sentence: "A teammate is answering this. The receptionist stays quiet until they hand it back.",
  },
} as const satisfies Record<"yours" | "theirs", { pill: string; sentence: string }>;

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
  const claimedByTeammate = !!i.assignee_user_id && i.assignee_is_me === false;
  // A pause with no escalation open is the one a person's own reply leaves
  // behind: the receptionist stepped back because someone answered. A pause
  // WITH an escalation open is the receptionist waiting for that someone.
  const mine = !!i.assignee_user_id || (paused && !i.open_escalation);
  const standing: Standing =
    i.state === "snoozed"
      ? "snoozed"
      : !flagged
        ? "quiet"
        : claimedByTeammate
          ? "theirs"
          : mine
            ? "yours"
            : "needs_you";
  // A teammate has it while it is flagged, as "yours" is: a name left on a quiet thread is not a claim, and the
  // Inbox said "X is answering this" over a receptionist that was answering (I1).
  return { standing, flagged, paused, takenOver: standing === "yours", claimedByOther: standing === "theirs" };
}

/**
 * A reply counting down to send waits on you while it can still be stopped: after its seconds it goes in your name.
 * One rule for the Inbox's Needs you, its buckets and the sidebar's badge (through the shell's courier, inbox.jsx
 * ixSending) and for People's Needs you. The Inbox knows the reply's deadline (`endsAtMs`) and whether this tab held it;
 * People knows only that one is queued, which it is exactly while it can still be stopped. It lived in inbox.jsx, and
 * People counted a thread the Inbox said waited on you as not waiting on anyone.
 */
/**
 * A thread's standing from its row and whether an escalation is open on it: the one place a conversation's columns
 * become standingOf's input. The Inbox (threadStanding), Conversations and Today each built it by hand.
 */
export function standingOfThread(
  thread: Pick<StandingInput, "state" | "paused_until" | "assignee_user_id" | "assignee_is_me">,
  openEscalation: boolean,
  nowMs: number,
): StandingVerdict {
  return standingOf(
    {
      state: thread.state,
      paused_until: thread.paused_until,
      assignee_user_id: thread.assignee_user_id,
      assignee_is_me: thread.assignee_is_me,
      open_escalation: openEscalation,
    },
    nowMs,
  );
}

export function replyWaitsOnYou(
  r: { endsAtMs?: number | null; queued?: boolean; held?: boolean },
  nowMs: number,
): boolean {
  if (r.held) return false;
  if (r.endsAtMs !== undefined && r.endsAtMs !== null) return r.endsAtMs > nowMs;
  return !!r.queued;
}

/* ------------------------------------------------------ what a member has seen */

/**
 * Whether a person is new to the member looking: decided once, for the Inbox, Conversations and People.
 *
 * A row never went from unread to read. The Inbox's dot meant "needs you", every other list drew each row at one
 * weight, and nothing recorded that anyone had opened a thread (Ruben, 7 Oct 2026). Now each member keeps their own
 * reading of each person (00345: contact_reads, the floor everything before which is seen, and contact_marks, when they
 * last opened the person and whether they put it back as unread), and a person is new to them when the customer's
 * last message or call (conversations.last_inbound_at) came after it.
 *
 * Apart from standing: a thread that needs you may be one you have read, and one the receptionist answered on its own
 * may be one you have not. The two are drawn apart too (the amber of Needs you is never this).
 */

/** What the door answers for a member (contact_seen): their floor, and their marks for the people asked about. */
export interface SeenMarksDto {
  floor_at: string | null;
  marks: { contact_id: string; seen_at: string | null; unread_at: string | null }[];
}

/**
 * A member's reading of one person, as a row carries it. `seen_at` is the later of their floor and when they last
 * opened the person; absent or null where the reader could not say (the marks were not read, or the workspace has none
 * yet), and then nothing is called new: a list never claims an unread it cannot show a mark for.
 */
export interface SeenOf {
  seen_at?: string | null;
  marked_unread?: boolean;
}

/** Each person's reading, from the door's answer: the later of the floor and their own mark, and whether they put it back. */
export function seenBy(marks: SeenMarksDto | null): (contactId: string) => SeenOf {
  if (!marks) return () => ({});
  const floorMs = marks.floor_at ? Date.parse(marks.floor_at) : Number.NEGATIVE_INFINITY;
  const own = new Map(marks.marks.map((m) => [m.contact_id, m]));
  return (contactId) => {
    const mark = own.get(contactId);
    const markMs = mark?.seen_at ? Date.parse(mark.seen_at) : Number.NEGATIVE_INFINITY;
    const seenMs = Math.max(floorMs, markMs);
    return {
      ...(Number.isFinite(seenMs) ? { seen_at: new Date(seenMs).toISOString() } : {}),
      ...(mark?.unread_at ? { marked_unread: true } : {}),
    };
  };
}

/**
 * New to the member: they put it back as unread, or the customer wrote or called after they last saw the person.
 * Nothing came in, nothing is new; and a reading that is not known is never called new. `heardAt` is when the customer
 * last wrote or called, as the row holds it: the column's own words, or epoch ms where a row has worked it out (People).
 */
/** When the customer last wrote or called, as epoch ms: 0 when they never have. What a row's reading is judged against. */
export const heardMs = (lastInboundAt: string | null | undefined): number =>
  lastInboundAt ? Date.parse(lastInboundAt) : 0;

export function isUnseen(heardAt: string | number | null | undefined, seen: SeenOf): boolean {
  if (seen.marked_unread) return true;
  if (!heardAt || !seen.seen_at) return false;
  return (typeof heardAt === "number" ? heardAt : Date.parse(heardAt)) > Date.parse(seen.seen_at);
}
