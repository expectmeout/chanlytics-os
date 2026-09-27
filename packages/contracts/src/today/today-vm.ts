/**
 * Today's view model: the shape of the brief (`TodayVM`) and of each row and figure in it. Types only; the brief
 * that builds it is today-brief.ts, over the facts (today-facts.ts) and the bands, rows and queue beside them.
 */

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
  kind: "handoff" | "callback" | "window" | "call" | "search";
  /** The thread this row is about; null for a call with no thread. The away card drops a bell row about the same thread. */
  conversationId: string | null;
  /** The call this row is about: a call-back's newest call, a call worth a listen; null otherwise. */
  callId: string | null;
  who: string;
  initials: string;
  /** The wire, in the words a row shows. It was `"WhatsApp" | "Phone"`, which is
   *  what let every escalation row be hard-coded to WhatsApp: the type could
   *  not have held an email even if the code had tried to put one there.
   *  "Leads" is a search waiting on its owner (spec G6), the one row that is not a person. */
  channel: "WhatsApp" | "Phone" | "Text" | "Email" | "Leads";
  /** "waited 2h" · "closes 5:10 PM · in 40m" · "2:14 PM · 1:35". */
  when: string;
  sentence: string;
  quoted: boolean;
  status: string[];
  tone: "escalated" | "warn";
  warn: boolean;
  cta: { label: string; to: string };
  also: { label: string; verb: "snooze" | "resolve"; conversationId: string; escalationId: string } | null;
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

export interface TodayVM {
  standing: {
    eyebrow: string;
    chips: Array<{ text: string; ok: boolean }>;
    /**
     * The wires, counted, in one sentence: "2 of 3 lines connected", "no lines
     * connected yet". `down` is true when one of them is off, the dot beside
     * it. The PAGE counted the chips, so the count could not be told about a
     * wire that is not a tenant_channels row, and email was invisible in it.
     */
    lines: { text: string; down: boolean };
    alert: string | null;
    /** Ask reads these three; the page draws none of them. */
    headline: string;
    detail: string | null;
    tone: "needs" | "calm" | "alert";
  };
  /** Ask's rows: the same escalations the queue draws, read once. */
  needsYou: { count: number; hint: string; rows: TodayNeedsRowVM[]; empty: string | null } | null;
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
  /** When the last message arrived and how long the answer took. Always said: on a day with traffic it is the messages figure's clause, on a quiet day the card's line. */
  proof: string;
  /** Who is waiting with nothing back, oldest first, for Worth a look to name. */
  noReply: TodayNoReplyVM[];
  calls: { line: string; rows: TodayCallRowVM[] } | null;
  /** Whether the calls read succeeded; false means the rows above omit the phone, and the card says so. */
  callsRead: boolean;
  /**
   * Everything that asks for a person, in one row grammar, longest wait first: the rows, the rest as a count, what the
   * rows hold in words, and how many people are waiting on you across the whole queue (a handoff, a call-back or a
   * closing window; a call worth a listen is nobody waiting), which Ask's Right now says.
   */
  queue: { rows: TodayQueueRowVM[]; more: number; parts: string[]; empty: TodayQueueEmptyVM; waiting: number };
  quiet: {
    headline: string;
    sub: string;
    proof: Array<{ label: string; value: string }>;
    launchpad: { label: string; to: string } | null;
  } | null;
}
