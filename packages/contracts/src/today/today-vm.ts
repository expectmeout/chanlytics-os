/**
 * Today's view model: the shape of the brief (`TodayVM`) and of each row and figure in it. Types only; the brief
 * that builds it is today-brief.ts, over the facts (today-facts.ts) and the bands, rows and queue beside them.
 */
import type { VisitWord } from "../shared/enums";

export interface TodayNeedsRowVM {
  id: string;
  conversationId: string;
  escalationId: string;
  who: string;
  reason: string;
  waited: string;
  warn: boolean;
  quote: string;
  meta: string;
  windowNote: string | null;
  to: string;
}

export interface TodayCallRowVM {
  id: string;
  who: string;
  at: string;
  duration: string;
  note: string;
  to: string;
}

export interface TodayFactVM {
  label: string;
  value: string;
  hint?: string;
}

export interface TodaySentenceVM {
  text: string;
  /** The day's traffic, which the recap's one line already says. The page prints the line and skips these; Ask still
   *  reads every sentence. */
  traffic?: true;
  /** True for the one line that must never read as calm: a reply that
   *  failed to deliver. */
  warn?: boolean;
  /** The record the sentence is about, when the read holds it: the thread of the newest reply that failed. */
  to?: string;
}

/**
 * One row of the queue on Today, in the strip's grammar (people.ts
 * attentionRow): who, where and when, one sentence, one state line, one
 * verb — and, where the state asks a second thing of you, a second.
 */
export interface TodayQueueRowVM {
  id: string;
  /**
   * `reply`: a reply to a reach-out, read (Reach out Part 5), in place of its thread's handoff (withReplies). `step`: a
   * person's next step come due (0007), and `steps` the one row for the rest, to People's Steps due (withSteps): both are
   * the team's own to-do and nobody waiting on a person, so neither is a person row (isPersonRow). `visit`: a visit of
   * yesterday's nobody has marked, asking "Did they come?" with Kept and Missed, and `visits` the one row for the rest, to
   * the Calendar on yesterday (withVisitsAsked, 0047): the team's to-do as a step is, and no person waiting either.
   */
  kind: "handoff" | "callback" | "window" | "call" | "search" | "reply" | "step" | "steps" | "visit" | "visits";
  /** The thread this row is about; null for a call with no thread. The away card drops a bell row about the same thread. */
  conversationId: string | null;
  /** The call this row is about: a call-back's newest call, a call worth a listen; null otherwise. */
  callId: string | null;
  /**
   * The person the row names, by their People id, where the row knows them: a thread's person, a caller on record, a
   * step's or a visit's person. The page trails their name with the business they work at, from People's rows (0052).
   * Null for a search, a count, and a caller with no record.
   */
  person_id: string | null;
  who: string;
  initials: string;
  /** The wire, in the words a row shows. It was `"WhatsApp" | "Phone"`, which is
   *  what let every escalation row be hard-coded to WhatsApp: the type could
   *  not have held an email even if the code had tried to put one there.
   *  "Leads" is a search waiting on its owner (spec G6), the one row that is not a person. "Next step" is a step due: no
   *  wire at all, the kind of row. "Calendar" is a visit to mark, which the Calendar holds. */
  channel: "WhatsApp" | "Phone" | "Text" | "Email" | "Leads" | "Next step" | "Calendar";
  /** "waited 2h" · "closes 5:10 PM · in 40m" · "2:14 PM · 1:35"; empty on a step, whose day is the first word of its state line. */
  when: string;
  sentence: string;
  quoted: boolean;
  status: string[];
  tone: "escalated" | "warn";
  warn: boolean;
  cta: { label: string; to: string };
  also: { label: string; verb: "snooze" | "resolve"; conversationId: string; escalationId: string } | null;
  /**
   * On a `step` only: whose step it is and which note, and the deal it moves, so the row's button can mark it done (the
   * person-notes verb the thread header uses). Its `cta.to` is the person, which the row opens; its `cta.label` is the verb.
   */
  step?: { person_id: string; note_id: string; deal_id: string | null };
  /**
   * On a `visit` only: the record's row for the visit, and the presses it is asked with (Kept, then Missed: visitLineOf's
   * `asks`), so the row's two buttons can say what became of it (POST calendar/visits/[id], the Calendar's own door). Its
   * `cta.to` is the visit on the Calendar, which the row opens.
   */
  visit?: { id: string; asks: VisitWord[] };
  /** For the order: the longest wait first; a window by how soon it closes; a call last. */
  waitedMs: number;
}

/** What an empty queue MEANS for this workspace: the colour rides with a glyph and the words. */
export interface TodayQueueEmptyVM {
  title: string;
  /** The queue heading's own words when nothing is waiting: "nothing needs you" only where the receptionist is holding the floor. */
  sub: "nothing in the queue" | "nothing needs you";
  glyph: "alert" | "phone" | "mail" | "check";
  tone: "warn" | "ok" | "";
  testid: string;
}

export type TodayFigureId = "messages" | "answered" | "calls" | "new";

/**
 * One of the day's four figures: the number, its word, the clause always drawn under it, and the why behind it with
 * one door. A receipt adds to its figure and never repeats its number or its clause, so nothing is said twice and
 * nothing an owner needs lives only behind a hover.
 */
export interface TodayFigureVM {
  id: TodayFigureId;
  label: string;
  value: number;
  meta: string;
  receipt: { text: string; door: { label: string; to: string } | null } | null;
}

/** A thread where the customer wrote last and nothing went back for an hour or more, and nobody was handed it. */
export interface TodayNoReplyVM {
  conversationId: string;
  who: string;
  sinceMs: number;
  to: string;
}

/**
 * The calm rung's words before the runs are known (the wiring's second audit, S7-1): what the queue holds besides the
 * people (todayAlsoWaiting), the day's traffic ("3 messages from 2 people and 1 call"), whether the receptionist handled
 * all of it, and how it answered, with no subject ("answered 3 of the 3 on its own, typically in about 20s."). Kept on
 * the standing so a page that holds the runs says the head again with them (standingWithRuns), and a run waiting leads.
 */
export interface TodayCalmVM {
  also: string[];
  traffic: string | null;
  handled_all: boolean;
  answered: string | null;
}

export interface TodayVM {
  standing: {
    chips: Array<{ text: string; ok: boolean }>;
    /**
     * The wires, counted, in one sentence: "2 of 3 lines connected", "no lines
     * connected yet". `down` is true when one of them is off, the dot beside
     * it. The PAGE counted the chips, so the count could not be told about a
     * wire that is not a tenant_channels row, and email was invisible in it.
     * `short` is the same count in the sidebar's two words ("2 of 2 lines on"), which Glass draws under the
     * workspace's name as the canvases do.
     */
    lines: { text: string; short: string; down: boolean };
    alert: string | null;
    /** Ask reads these three; the page draws none of them. */
    headline: string;
    detail: string | null;
    tone: "needs" | "calm" | "alert";
    /** The calm rung's words, on the last rung and the quiet day; null on the alert and needs rungs (standingWithRuns). */
    calm: TodayCalmVM | null;
  };
  /**
   * The campaign runs waiting for your word that a word can still send (waits.ts runsThatWait), where the brief was
   * handed the runs; null where it was not (the browser's brief, whose page holds Sent's runs and says the head with them).
   */
  runs_waiting: number | null;
  /**
   * Ask's rows: the same escalations the queue draws, read once. `count` is the threads' part of the one count (holds
   * and replies counting down, waits.ts), and `holds` and `sends` its two parts: a held send has no row.
   */
  needsYou: {
    count: number;
    holds: number;
    sends: number;
    hint: string;
    rows: TodayNeedsRowVM[];
    empty: string | null;
  } | null;
  windowClosing: { label: string; hint: string; rows: Array<{ id: string; text: string; to: string }> } | null;
  /** Ask reads the sentences and the facts; the page draws the sentences that are not numbers and the receipts. */
  recap: {
    label: string;
    line: string;
    sentences: TodaySentenceVM[];
    facts: TodayFactVM[];
    receipts: Array<{ at: string; text: string; to: string }>;
  } | null;
  /** The day's own figures, in order: customer messages, answered by the receptionist, calls, new people. Null on a day with nothing at all. */
  figures: TodayFigureVM[] | null;
  /**
   * The day's four figures as zeros when there was nothing to count while people wait (figuresOf found no traffic), for
   * a look that draws the tile whole (Glass, canvas E3; card.tsx); null when the figures stand, and on a quiet day, whose
   * zeros are its own (quiet.figures).
   */
  zero_figures: TodayFigureVM[] | null;
  /** When the last message arrived and how long the answer took. Always said: on a day with traffic it is the messages figure's clause, on a quiet day the card's line. */
  proof: string;
  /** Who is waiting with nothing back, oldest first, for Worth a look to name. */
  noReply: TodayNoReplyVM[];
  calls: { line: string; rows: TodayCallRowVM[] } | null;
  /** Whether the calls read succeeded; false means the rows above omit the phone, and the card says so. */
  callsRead: boolean;
  /**
   * Everything that asks for a person, in one row grammar, longest wait first: the rows, the rest as a count, and what
   * the rows hold in words. How many wait on you is the one count's (needsYou and runs_waiting; waits.ts), never a sum of
   * rows: a closing window is a window, a call worth a listen nobody waiting, and a held send has no row.
   */
  queue: {
    rows: TodayQueueRowVM[];
    /** Every row past the six, whatever it is. */
    more: number;
    /** The people past the six (a handoff, a call-back, a closing window, a reply read), apart from the calls and the searches. */
    more_people: number;
    /** The calls worth a listen, drawn or not. */
    calls: number;
    /** The searches waiting for your answer, drawn or not. */
    searches: number;
    /** The reply windows closing, drawn or not: said as windows, never as people who need you. */
    windows: number;
    parts: string[];
    empty: TodayQueueEmptyVM;
  };
  quiet: {
    headline: string;
    sub: string;
    proof: Array<{ label: string; value: string }>;
    launchpad: { label: string; to: string } | null;
    /** The day's four figures as zeros, each with what is true under it, for a look that draws the tile whole (Glass). */
    figures: TodayFigureVM[];
  } | null;
}
