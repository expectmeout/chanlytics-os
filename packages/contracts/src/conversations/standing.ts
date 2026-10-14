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
import { holdWaits, type OpenHold } from "./escalations";

export interface StandingInput {
  /** The conversation's state column. */
  state: string;
  paused_until?: string | null;
  assignee_user_id?: string | null;
  /** Unknown (undefined) reads as "mine": a row that cannot say whose claim it is does not accuse a teammate. */
  assignee_is_me?: boolean | null;
  /** An escalation row still open on the thread. */
  open_escalation: boolean;
  /**
   * What the open one is for, where the caller has it. A hold that waits on nobody (escalations.ts waitsOnAPerson: a
   * customer who asked to stop, opened before the receptionist stopped opening them) flags nothing, whatever else is
   * open. Unsaid, the hold is read as one that waits.
   */
  escalation_reason?: string | null;
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

/**
 * "Needs you": a thread flagged for a person that nobody has taken (standing `needs_you`), and nothing else. The one word
 * for it wherever it is said (the Inbox's pill, People's state and list, Reports' tile, Ask), so a figure on one page and a
 * list on another count the same threads under the same name. A thread somebody HAS is HELD_WORDS', and a run waiting for
 * an owner's approval is BROADCAST_STATE_LABELS' (broadcasts.ts): "Waiting on you" named all three once (D1-waiting-on-you).
 */
export const NEEDS_YOU_WORD = "Needs you";

/**
 * The Inbox's three lists of real threads, as its tabs name them and as an open thread says it moved to one (the wiring's
 * second audit, S9-9: the thread pane typed its own copy of the tabs' words).
 */
export const INBOX_BUCKET_WORDS = { escalated: NEEDS_YOU_WORD, done: "Handled", snoozed: "Snoozed" } as const;

/** The list a thread's state puts it in, in the tabs' words; null for a state no tab lists. */
export function inboxBucketWord(state: string): string | null {
  return state === "escalated" || state === "done" || state === "snoozed" ? INBOX_BUCKET_WORDS[state] : null;
}

/**
 * The pill for a thread somebody has, once: the member looking has it ("You have it"), or a teammate does, by name where
 * the roster names them ("Ruben has it") and "A teammate has it" where it does not (the roster is unread, or they have left
 * the team). The Inbox's row and bar, Conversations' pill and People's Receptionist fact all say it through here, so one
 * thread is not "Ruben has it" on one page and "A teammate has it" on the next. A name is never invented.
 */
export function heldPill(holder: "yours" | "theirs", name?: string | null): string {
  if (holder === "yours") return HELD_WORDS.yours.pill;
  const said = typeof name === "string" ? name.trim() : "";
  return said ? `${said} has it` : HELD_WORDS.theirs.pill;
}

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
  // An open hold that waits on nobody (a STOP, decision 0048) is no escalation here: it is news the bell already told.
  const holds = holdWaits(i.open_escalation ? { reason: i.escalation_reason } : false);
  const flagged = holds || i.state === "needs_human" || paused;
  const claimedByTeammate = !!i.assignee_user_id && i.assignee_is_me === false;
  // A pause with no escalation open is the one a person's own reply leaves
  // behind: the receptionist stepped back because someone answered. A pause
  // WITH an escalation open is the receptionist waiting for that someone.
  const mine = !!i.assignee_user_id || (paused && !holds);
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
  openEscalation: OpenHold,
  nowMs: number,
): StandingVerdict {
  return standingOf(
    {
      state: thread.state,
      paused_until: thread.paused_until,
      assignee_user_id: thread.assignee_user_id,
      assignee_is_me: thread.assignee_is_me,
      // The hold itself where the caller has it: its reason says whether anyone has to act (waitsOnAPerson).
      open_escalation: !!openEscalation,
      escalation_reason: typeof openEscalation === "object" && openEscalation ? openEscalation.reason : null,
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
 * reading of each person (00349: contact_reads, the floor everything before which is seen, and contact_marks, when they
 * last opened the person and whether they put it back as unread), and a person is new to them when the customer's
 * last message or call (conversations.last_inbound_at) came after it.
 *
 * Apart from standing: a thread that needs you may be one you have read, and one the receptionist answered on its own
 * may be one you have not. The two are drawn apart too (the amber of Needs you is never this).
 */

/**
 * What the door answers for a member (contact_seen): their floor, and their marks for the people asked about.
 * `marked_at` is the database's stamp of the mark's last writing, whichever way it went.
 */
export interface SeenMarksDto {
  floor_at: string | null;
  marks: { contact_id: string; seen_at: string | null; unread_at: string | null; marked_at?: string | null }[];
}

/**
 * A member's reading of one person, as a row carries it. `seen_at` is the later of their floor and when they last
 * opened the person; absent or null where the reader could not say (the marks were not read, or the workspace has none
 * yet), and then nothing is called new: a list never claims an unread it cannot show a mark for.
 */
export interface SeenOf {
  seen_at?: string | null;
  marked_unread?: boolean;
  /**
   * When the member's own mark on this person was last written, as the database stamped it; absent where they have
   * none. A tab that has just marked someone holds its word until a read carries a stamp as late as its own
   * (surfaces/seen.ts): the one way to tell a read that left before the mark from one made after it.
   */
  marked_at?: string | null;
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
      ...(mark?.marked_at ? { marked_at: mark.marked_at } : {}),
    };
  };
}

/**
 * New to the member: they put it back as unread, or the customer wrote or called after they last saw the person.
 * Nothing came in, nothing is new; and a reading that is not known is never called new. `heardAt` is when the customer
 * last wrote or called, as the row holds it: the column's own words, or epoch ms where a row has worked it out (People).
 */
export function isUnseen(heardAt: string | number | null | undefined, seen: SeenOf): boolean {
  if (seen.marked_unread) return true;
  if (!heardAt || !seen.seen_at) return false;
  return (typeof heardAt === "number" ? heardAt : Date.parse(heardAt)) > Date.parse(seen.seen_at);
}

/**
 * What a row says of its reader, for the tab that draws it (surfaces/seen.ts): whether the person is new to them, when
 * the customer was last heard from, and the stamp of the reader's own mark as the read carried it. Epoch ms, 0 where
 * there is none.
 */
export interface SeenReading {
  unseen: boolean;
  heardAtMs: number;
  markAtMs: number;
}

const msOf = (at: string | number | null | undefined): number => {
  const ms = typeof at === "number" ? at : at ? Date.parse(at) : 0;
  return Number.isFinite(ms) ? ms : 0;
};

/** A row's reading, from when its person was last heard from and what the read said of the member's marks. */
export function readingOf(heardAt: string | number | null | undefined, seen: SeenOf): SeenReading {
  return { unseen: isUnseen(heardAt, seen), heardAtMs: msOf(heardAt), markAtMs: msOf(seen.marked_at) };
}
