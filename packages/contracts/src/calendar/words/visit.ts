/** Words: visit. */

import type { VisitMark } from "../dto";
import { isGuess, matchWordsOf, type MatchVia } from "../people/matching";
import type { VisitWord } from "../../shared/enums";

/** Each word as the panel says it, on a state and on an act alike. */
export const VISIT_WORDS: Record<VisitWord, string> = { kept: "Kept", missed: "Missed", cancelled: "Cancelled" };

/** The door's refusals (mark_visit's `{ error }`), each in a sentence for the person who asked. */
export const VISIT_REFUSALS: Record<string, string> = {
  never_booked: "It was only requested, never booked: it can be cancelled, but not kept or missed.",
  cancelled: "It was cancelled already.",
  not_begun: "It hasn't begun yet: whether they came is said once it has.",
  already_said: "It's marked kept or missed already: say the other if that was wrong.",
  over: "It has ended: say whether they came instead.",
};

/**
 * Whether a visit still stands: the record has not been told it was cancelled, whoever cancelled it. A cancelled visit is
 * drawn on the board, struck, and is none anywhere a visit is counted or said to be booked (Today's day, People's visits,
 * Ask's calendar).
 */
export function visitStands(visit: { status: string } | null | undefined): boolean {
  return visit?.status !== "cancelled";
}

/**
 * Whether a sighting of a visit still stands for the same-visit rule (booking-notice.ts): not cancelled (visitStands) and,
 * for the calendar's copy, still named by the calendar. A visit cancelled or gone at that time and booked again is a
 * booking of its own, so the sweep's `twin` and the bell's told-once take only a sighting that stands. (The board still
 * folds the copy of a cancelled booking: it draws the booking itself, struck.)
 */
export function sightingStands(row: { status: string; vanished_at?: string | null }): boolean {
  return visitStands(row) && !row.vanished_at;
}

/** The word for a visit that has ended and nobody has said what became of: said once, by every page (D1-visit-match-words). */
const VISIT_PAST_WORD = "Past";

/**
 * The word for a booking tool's request (`proposed`, decision 0002): asked for, never confirmed, so no visit yet. It was
 * drawn as a booking, which 0002 says it is not; the receptionist still treats its time as taken, so no caller is offered
 * a slot the tool may yet confirm.
 */
const VISIT_REQUESTED_WORD = "Requested";

/** The states a visit is said in beyond a member's word: ended with nobody's word, or only requested. */
export type VisitStateTone = VisitWord | "past" | "requested";

/** The tone each state wears on the kit's pill, in tone.ts's six: a kept visit is done, a missed one is for a person to look at, the rest are neutral. */
const VISIT_PILL_TONES: Record<VisitStateTone, "ok" | "warn" | "plain"> = {
  kept: "ok",
  missed: "warn",
  cancelled: "plain",
  past: "plain",
  requested: "plain",
};

/** How a visit stands, as every page says it: the word, the state it is of, and the tone of the pill that wears it. */
export interface VisitStateVM {
  text: string;
  tone: VisitStateTone;
  pill: "ok" | "warn" | "plain";
}

/**
 * What a page says beside a visit's time: the member's word on it, else "Requested" for a tool's request nobody has
 * confirmed, else "Past" once it has ended (the record never infers that they came: 0002's answer 3), else nothing. A word
 * said stands whether or not the visit has ended, so a visit marked while it is under way reads as its mark.
 */
export function visitStateOf(visit: VisitMark | null, endMs: number, nowMs: number): VisitStateVM | null {
  const sentence = visit?.status;
  if (sentence === "kept" || sentence === "missed" || sentence === "cancelled")
    return { text: VISIT_WORDS[sentence], tone: sentence, pill: VISIT_PILL_TONES[sentence] };
  if (sentence === "proposed")
    return { text: VISIT_REQUESTED_WORD, tone: "requested", pill: VISIT_PILL_TONES.requested };
  return endMs <= nowMs ? { text: VISIT_PAST_WORD, tone: "past", pill: VISIT_PILL_TONES.past } : null;
}

/**
 * What a member may say of a visit now, in the order it is offered, by mark_visit's own rules (00397): kept or missed
 * once it has begun, cancelled until it ends; a kept visit that has begun may be corrected to missed and a missed one to
 * kept; nothing
 * of a cancelled one, nor of an event the record has not kept yet.
 */
export function visitActsOf(visit: VisitMark | null, startMs: number, endMs: number, nowMs: number): VisitWord[] {
  if (!visit) return [];
  switch (visit.status) {
    // A correction is a word about a visit that has begun, as the door holds it (not_begun).
    case "kept":
      return startMs <= nowMs ? ["missed"] : [];
    case "missed":
      return startMs <= nowMs ? ["kept"] : [];
    case "cancelled":
      return [];
    case "proposed":
      return endMs > nowMs ? ["cancelled"] : [];
    case "booked": {
      const out: VisitWord[] = startMs <= nowMs ? ["kept", "missed"] : [];
      if (endMs > nowMs) out.push("cancelled");
      return out;
    }
  }
}

/* ----------------------------------------------------------- one visit line (decision 0047, D1-visit-mark) */

/** What a page asks of the owner about a visit nobody has marked, and the role gate's "to ...". */
export const VISIT_ASK_WORDS = {
  /** The question over the presses: Today's row, the person's History and Coming up. */
  question: "Did they come?",
  /** What a visit that has ended and nobody has marked is, said where "Past" alone would leave the owner guessing. */
  unmarked: "Not marked yet",
  gate: "say whether they came",
  /** The confirm before a cancel, under the workspace's own question (appointmentWords cancelAsk). */
  cancel: {
    detail: "It can't be undone here. Its reminders stop; the calendar keeps the time until it is changed there.",
    yes: "Yes, cancelled",
    no: "Keep it",
  },
} as const;

/**
 * A visit as one line, whichever page draws it (the Calendar's panel and board, People's Visits cell, the person's
 * History and Coming up, the Inbox's chip, Today): when, what, who, how it stands, how it was matched and what can be
 * said of it. A page draws these fields and works none of them out, so a visit never reads one way here and another there.
 */
export interface VisitLineVM {
  id: string;
  /** The record's row and how it stands: what a press is said on. Null for an event the record has not kept yet. */
  mark: VisitMark | null;
  title: string;
  /** "Tue, Sep 8", "Today" or "Yesterday": the page's day word, "" where the page says the day elsewhere. */
  day: string;
  /** "2 – 3:30 PM" */
  time: string;
  person: { id: string; name: string } | null;
  /** Kept, missed, cancelled, or Past once it has ended; null while it is ahead or under way and nobody has said. */
  state: VisitStateVM | null;
  /** The record holds a row for it, it has ended, and nobody has said whether they came: it asks "Did they come?". */
  unmarked: boolean;
  /** How the calendar found it to be theirs, in the one set of words (MATCH_WORDS); null without a route. */
  match: string | null;
  /** The match is a guess (a name): a page about the person says it only then; the Calendar's panel says every match. */
  guess: boolean;
  /** Everything mark_visit allows now, in the order the panel offers it (visitActsOf). */
  acts: VisitWord[];
  /** The two presses a visit nobody has marked is asked with, once it has begun: Kept and Missed, and never Cancelled. */
  asks: VisitWord[];
  /** Where it opens on the Calendar (visitDoor); null where the page gives none. */
  to: string | null;
}

/** What a visit line is made from: the facts every page holds of a visit, whatever they came in. */
export interface VisitLineInput {
  id: string;
  mark: VisitMark | null;
  startMs: number;
  endMs: number;
  title: string;
  day: string;
  time: string;
  person: { id: string; name: string } | null;
  via: MatchVia | null;
  to?: string | null;
  /**
   * Whether the visit is someone's: a person matched, or a number or an address on it (a customer People has not met yet).
   * An event that is nobody's (a lunch, a supplier's slot on the owner's calendar) is asked nothing and said nothing of
   * once it ends: no Kept, no Missed, no Past. Absent, a matched person decides.
   */
  someone?: boolean;
}

/**
 * The one visit line: its state from visitStateOf, its presses from visitActsOf (so no page offers what the door would
 * refuse), its match from MATCH_WORDS. `asks` are the acts of a visit nobody has marked without Cancelled: a page outside
 * the Calendar asks whether they came, and the Calendar's panel keeps the rest.
 */
export function visitLineOf(visitLineInput: VisitLineInput, nowMs: number): VisitLineVM {
  const someone = visitLineInput.someone ?? !!visitLineInput.person;
  // Nobody's event is asked nothing: what would "Did they come?" mean of a lunch (VS-03).
  const acts = someone ? visitActsOf(visitLineInput.mark, visitLineInput.startMs, visitLineInput.endMs, nowMs) : [];
  const standing = someone && visitLineInput.mark?.status === "booked";
  const sentence = visitStateOf(visitLineInput.mark, visitLineInput.endMs, nowMs);
  return {
    id: visitLineInput.id,
    mark: visitLineInput.mark,
    title: visitLineInput.title,
    day: visitLineInput.day,
    time: visitLineInput.time,
    person: visitLineInput.person,
    // A word a member said stands; "Past" is said only of someone's visit, which waits for that word.
    state: sentence && sentence.tone === "past" && !someone ? null : sentence,
    unmarked: standing && visitLineInput.endMs <= nowMs,
    match: matchWordsOf(visitLineInput.via),
    guess: isGuess(visitLineInput.via),
    acts,
    asks: standing ? acts.filter((a) => a !== "cancelled") : [],
    to: visitLineInput.to ?? null,
  };
}

/** A block of the board as a visit line reads it (CalendarBlockVM satisfies it). */
interface VisitLineBlock {
  id: string;
  title: string;
  time: string;
  /** ISO instants. */
  start: string;
  end: string;
  visit: VisitMark | null;
  person: { id: string; name: string; via?: MatchVia | null } | null;
  /** The numbers and addresses the event carried: someone People has not met yet is still someone. */
  contacts?: { e164: readonly string[]; emails: readonly string[] } | null;
}

/** The board's block as a visit line, at `nowMs`; `day` is the page's own word for the day ("" where it says it beside). */
export function visitLineOfBlock(
  visitLineBlock: VisitLineBlock,
  nowMs: number,
  day = "",
  to: string | null = null,
): VisitLineVM {
  return visitLineOf(
    {
      id: visitLineBlock.visit ? visitLineBlock.visit.id : visitLineBlock.id,
      mark: visitLineBlock.visit,
      startMs: Date.parse(visitLineBlock.start),
      endMs: Date.parse(visitLineBlock.end),
      title: visitLineBlock.title,
      day,
      time: visitLineBlock.time,
      person: visitLineBlock.person ? { id: visitLineBlock.person.id, name: visitLineBlock.person.name } : null,
      via: visitLineBlock.person?.via ?? null,
      to,
      someone:
        !!visitLineBlock.person || !!visitLineBlock.contacts?.e164.length || !!visitLineBlock.contacts?.emails.length,
    },
    nowMs,
  );
}
