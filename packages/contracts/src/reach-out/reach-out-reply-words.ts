/**
 * A reach-out's replies as the dashboard is told them (Reach out Part 5, PR 6): one reading per row, what it did, the
 * receptionist's draft, whether the member may undo it, and the address an answer to it goes out from. The undo's
 * refusals are the words its door says (00222 reach_out_reply_undo), named here once so the page and the route agree.
 */
import { z } from "zod";
import { clockDate, wallClockAt } from "../shared/clock";
import { REPLY_INTENT_WORDS, REPLY_REREADS, type ReplyClaim, type ReplyIntent, type Unread } from "./reach-out-replies";
import type { DraftWhy } from "./reach-out-reply-draft";

/** The most readings one page is told, and how far back it looks (the reading's own window, REACH_OUT_REPLY_DAYS). */
export const REPLIES_PAGE = 200;

/** Why a reading cannot be undone (00222 reach_out_reply_undoable), and the words each is said in. */
export const REPLY_UNDO_REFUSALS = {
  not_found: "Reply not found.",
  role: "Not allowed to act in this workspace.",
  not_a_no: "Only a no can be undone.",
  already: "Already undone.",
  too_late: "It's been more than seven days.",
  moved: "They unsubscribed since, and that stays.",
} as const;
export type ReplyUndoRefusal = keyof typeof REPLY_UNDO_REFUSALS;
export const isReplyUndoRefusal = (v: unknown): v is ReplyUndoRefusal =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(REPLY_UNDO_REFUSALS, v);

/**
 * Where a person's answer to a reach-out's reply goes out from (C15, N5): the reach-out's own address when its domain
 * is verified now; otherwise the mailbox, and why (the domain held, or removed) with the own address it would have
 * gone from. `because` is null when the thread answers no reach-out at all, which is every other email reply.
 */
export type ReplyFrom =
  | { from: "own"; address: string }
  | { from: "mailbox"; because: "domain_held" | "domain_removed"; own: string }
  | { from: "mailbox"; because: null };

/** One reading as the Inbox and Today read it. */
export interface ReachOutReplyDto {
  message_id: string;
  conversation_id: string;
  read_at: string;
  intent: ReplyIntent;
  claim: ReplyClaim;
  summary: string | null;
  /** The day they named (not now, their own away), as the business's calendar has it. */
  named_day: string | null;
  refer_to: string | null;
  /** Why it could not be read yet; null once it was. */
  unread: Unread | null;
  /** Whether a later read replaced what the first could not read, and how many reads came after the first. */
  reread: boolean;
  rereads: number;
  undone: boolean;
  /** The door's own test (reach_out_reply_undoable), asked of each no that may still be undone. */
  can_undo: boolean;
  draft: string | null;
  draft_state: "none" | "waiting" | "written" | "not_written";
  draft_why: DraftWhy | null;
  business: string | null;
  chain: string | null;
  /** The step it answers, 1 for the chain's first email. */
  step: number | null;
  reply_from: ReplyFrom;
  /** What a no stopped (the reading's plan): the address that said it, and the business's own domain when it was. */
  said_no: { address: string | null; domain: string | null } | null;
  /** The day of the step the reading put on Today (YYYY-MM-DD), if it did. */
  step_day: string | null;
  /** An automatic out-of-office's day back, as an instant (reach_out_replies.until_at). */
  until_at: string | null;
}

/** GET reach-out-replies' answer: the readings, and the mailbox's own address for the composer's lines. */
export interface ReachOutRepliesDto {
  replies: ReachOutReplyDto[];
  mailbox: string | null;
}

/** GET reach-out-replies: since when (at most the reading's window back), and one thread's alone. */
export const ReachOutRepliesQuerySchema = z.object({
  since: z.string().datetime({ offset: true }).optional(),
  conversation_id: z.string().uuid().optional(),
});
export type ReachOutRepliesQuery = z.infer<typeof ReachOutRepliesQuerySchema>;

/* ------------------------------------------------------------ what the Inbox says of a reading (PR 7) -- */

/** A day key (YYYY-MM-DD) as the business's calendar says it: "Jan 4", with the year when it is not this year. */
function replyDayWords(key: string, tz: string, now: number): string {
  return clockDate(wallClockAt(tz, key, 12, 0), tz, now);
}

/** A door the strip offers: put the receptionist's draft in the reply box, or undo a no. */
export type ReplyDoor = "use_draft" | "undo";

/** The strip above a thread's composer: its title, their words, what the reading did, and its doors. */
export interface ReplyStrip {
  title: string;
  said: string | null;
  did: string | null;
  doors: ReplyDoor[];
}

/** What the reading did with the receptionist's draft, said after what it did with the lead. */
function draftLine(r: ReachOutReplyDto): string | null {
  if (r.draft_state === "written" && r.draft) {
    return r.intent === "not_now"
      ? "The receptionist drafted a line of thanks: it's in the reply box."
      : "The receptionist drafted an answer: it's in the reply box.";
  }
  return r.draft_state === "waiting" ? "The receptionist is drafting an answer." : null;
}

/** What a no stopped, in a sentence. */
function saidNoLine(r: ReachOutReplyDto): string {
  if (r.claim === "auto_reply")
    return "Their automatic reply asked to be taken off your list. Nothing more will be written to them.";
  const address = r.said_no?.address;
  const domain = r.said_no?.domain;
  if (!address) return "Nothing more will be written to them.";
  return domain
    ? `Nothing more will be written to ${address} or anyone at ${domain}.`
    : `Nothing more will be written to ${address}.`;
}

/** What the reading did, by its intent: the line under their words. */
function didLine(r: ReachOutReplyDto, now: number, tz: string): string | null {
  const step = r.step_day ? `A step is on Today for ${replyDayWords(r.step_day, tz, now)}.` : "A step is on Today.";
  switch (r.intent) {
    case "interested":
    case "question":
      return ["Talking now.", draftLine(r)].filter(Boolean).join(" ");
    case "not_now":
      return [step, draftLine(r)].filter(Boolean).join(" ");
    case "no":
      return saidNoLine(r);
    case "wrong_person":
      return `Not the right person. They said to write to ${r.refer_to ?? "someone else"}. A step is on Today.`;
    case "away":
      if (r.claim === "auto_reply" && r.until_at) {
        const back = clockDate(Date.parse(r.until_at), tz, now);
        return `Away until ${back} (an automatic reply). The reach-out goes on after that.`;
      }
      return r.named_day ? `Away until ${replyDayWords(r.named_day, tz, now)}. A step is on Today for that day.` : step;
    default:
      return null;
  }
}

/**
 * The strip a thread shows for its newest reading (the Inbox, PR 7): what was read and what was done, in the business's
 * calendar. An undone no says what stands now; a reply not read yet says it will be read again, until the last try.
 */
export function replyStripOf(r: ReachOutReplyDto, now: number, tz: string): ReplyStrip {
  const said = r.summary ? `“${r.summary}”` : null;
  if (r.undone) {
    return {
      title: "Wrote back",
      said,
      did:
        r.claim === "auto_reply"
          ? "Read as no, then undone. It was an automatic reply, so the reach-out goes on."
          : "Read as no, then undone. The reach-out stays stopped: they wrote back.",
      doors: [],
    };
  }
  if (r.unread) {
    const last = r.rereads >= REPLY_REREADS;
    return {
      title: "Wrote back",
      said: null,
      did: last ? "We couldn't read it." : "We couldn't read it yet: we'll try again.",
      doors: [],
    };
  }
  const doors: ReplyDoor[] = [];
  if (r.draft_state === "written" && r.draft) doors.push("use_draft");
  if (r.can_undo) doors.push("undo");
  return {
    title:
      r.intent === "no"
        ? "Said no"
        : r.intent === "other"
          ? "Wrote back"
          : `Wrote back · ${REPLY_INTENT_WORDS[r.intent]}`,
    said,
    did: didLine(r, now, tz),
    doors,
  };
}

const CHIPS: Record<ReplyIntent, string> = {
  interested: "Interested",
  question: "Question",
  not_now: "Not now",
  no: "Said no",
  wrong_person: "Wrong person",
  away: "Away",
  other: "Wrote back",
};

/** The chip on the Inbox's row: what the reply was read as, or "Wrote back" when it was not, or was undone. */
export function replyChipOf(r: Pick<ReachOutReplyDto, "intent" | "unread" | "undone">): string {
  return r.unread || r.undone ? CHIPS.other : CHIPS[r.intent];
}

/**
 * The composer's line: the address an answer goes out from (C15), or why it goes from the mailbox (N5). Null for a
 * thread that answers no reach-out, where the mailbox is all there ever was.
 */
export function replyFromLineOf(from: ReplyFrom, mailbox: string | null): string | null {
  if (from.from === "own") return `Goes from ${from.address}.`;
  if (from.because === null) return null;
  const box = mailbox ?? "your mailbox";
  return from.because === "domain_held"
    ? `${from.own} is held, so this goes from ${box}.`
    : `${from.own} was removed, so this goes from ${box}.`;
}

/** The bare address in a From ("Sam <sam@a.example>" or "sam@a.example"), lower-cased. */
const bareAddress = (from: unknown): string | null => {
  if (typeof from !== "string" || !from.trim()) return null;
  const m = /<([^<>]+)>\s*$/.exec(from);
  return (m ? m[1] : from).trim().toLowerCase();
};

/**
 * A sent reply's line when it could not leave by its own domain (PR 4's `left_as`, N5): which address it went from,
 * and which could not send it. Null for every other row.
 */
export function replyLeftAsOf(meta: unknown): string | null {
  const email = (meta as { email?: Record<string, unknown> } | null)?.email;
  if (!email || email.left_as !== "mailbox") return null;
  const went = bareAddress((email.request as { from?: unknown } | undefined)?.from);
  const own = bareAddress((email.own_request as { from?: unknown } | undefined)?.from);
  if (!went) return null;
  return own ? `Went from ${went}: ${own} could not send it.` : `Went from ${went}.`;
}
