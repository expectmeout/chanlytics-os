/**
 * What Ask remembers (decision 0070, "Ask remembers", 21 Oct 2026): the facts about the business a member told Ask, kept
 * by Ask itself (ask_memory), and what happened on each of the workspace's days, as Ask's journal says it (ask_journal).
 * Both ride into every turn's cached shape block (server/ask/companion/remembered.ts), so a question in one thread knows
 * what another thread was told and what was done on the site yesterday, without a read.
 *
 * Ask keeps a line itself (its `remember` act), as the turn is saved, as Anthropic's memory tool has the model keep its
 * own memory: the card arrives kept, with Undo, when the question bears the line out (the member's own words); any other
 * waits on its card for their press. A member who may change settings edits or forgets a line on Settings › Memory. A line is Ask's own context, never what customers hear: a fact the receptionist should say goes through Keep
 * as a note (decision 0063), as it always has.
 *
 * Pure: the dashboard's reader and doors, the Memory pane and the edge's journal step read the same limits and words.
 */

import type { SchemaSet } from "../shared/schema-sets";

/** How much Ask keeps, and how much of it rides into every turn. */
export const ASK_MEMORY_LIMITS = {
  /** One fact, in a sentence or two. */
  textMin: 3,
  textMax: 300,
  /**
   * The lines a workspace keeps at once, every one read into each turn's shape block (so what the pane lists is what Ask
   * knows): past it, a line is forgotten or changed before another is kept. The door holds the same number (00470).
   */
  liveMax: 40,
} as const;

/** How much of the journal is written, read and carried. */
export const ASK_JOURNAL_LIMITS = {
  /** A day's entry, in a few short paragraphs at most. */
  textMax: 1200,
  /** The newest this many days ride into every turn's shape block. */
  shown: 7,
  /** At most this many of the day's activity lines are read for an entry, from at most `rowsRead` rows of each ledger. */
  linesMax: 120,
  rowsRead: 400,
  /** Each line the model reads is cut to this many characters. */
  lineMaxChars: 240,
  /** A day is written once its own midnight has passed by this many hours, so the night's runs are in it. */
  afterMidnightHours: 1,
  /** A day older than this is never written: a sweep that missed it lets it go. */
  daysBack: 2,
  /** At most this many days written in one run of the sweep, which stops early when its time is short. */
  perRun: 3,
} as const;

/** Where a line came from: a member told Ask in a thread and Ask kept it, or a member wrote it on the pane (00470). */
export type AskMemorySource = SchemaSet<"ask_memory_lines.source">;

/** One line as the pane and the shape read it. */
export interface AskMemoryLineDto {
  id: string;
  text: string;
  source: AskMemorySource;
  made_at: string;
  updated_at: string;
  /** The member who kept it, by their user id; null where that member has left. */
  kept_by: string | null;
  /** The thread it was told in (its keeper's own, so only they open it), or null. */
  thread_id: string | null;
}

/** One day of the journal. */
export interface AskJournalDayDto {
  /** YYYY-MM-DD, by the workspace's clock. */
  day: string;
  text: string;
}

/** What Settings › Memory reads: the lines kept, newest first, and the journal's newest days. */
export interface AskMemoryPageDto {
  lines: AskMemoryLineDto[];
  journal: AskJournalDayDto[];
  /** Whether the caller may change or forget a line (the settings permission). */
  may_change: boolean;
}

/** What the memory's routes answer (POST, PATCH and DELETE ask/memory): the line, and whether it was so already. */
export interface AskMemoryDoorDto {
  memory: { id: string; text: string };
  again: boolean;
}

/**
 * What no line may hold, whatever a member says: a secret (a key, a token, a password said as one) or a card's number.
 * Memory rides into every turn of every member and stays until it is forgotten; Anthropic's memory guidance is the
 * same ("never store API keys, passwords, tokens").
 */
const SECRET =
  /\b(?:sk|pk|rk|ghp|gho|xox[abps]|AKIA)[-_]?[A-Za-z0-9_-]{12,}|\b[A-Za-z0-9+/_-]{40,}\b|\b(?:password|passcode|contraseña|clave)\s*(?:is|es|:|=)/i;
const CARD = /\b(?:\d[ -]?){13,19}\b/;

/** Why a line cannot be kept as written, in words a member reads, or null when it can. */
export function memoryTextProblem(raw: string): string | null {
  const text = memoryText(raw);
  if (text.length < ASK_MEMORY_LIMITS.textMin) return "Say the fact in a few words.";
  if (text.length > ASK_MEMORY_LIMITS.textMax)
    return `Keep it under ${ASK_MEMORY_LIMITS.textMax} characters: one fact, in a sentence or two.`;
  if (SECRET.test(text) || CARD.test(text)) return "A password, a key or a card number is never kept.";
  return null;
}

/** A line as it is kept: one line of plain words, its spaces made one. */
export function memoryText(raw: string): string {
  return raw
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The words the card, its undo and the pane say. */
export const ASK_MEMORY_WORDS = {
  cardTitle: "Remembered",
  receipt: (text: string) => `Remembered: ${text}`,
  undoLabel: "Forget it",
  undone: "Forgotten",
  full: `Ask already keeps ${ASK_MEMORY_LIMITS.liveMax} things. Forget one on Settings › Memory before it keeps another.`,
  paneTitle: "Memory",
  paneLede: "What Ask keeps about your business, and what it saw each day. Every question Ask answers reads it.",
  linesHead: "What Ask remembers",
  journalHead: "Ask's journal",
  none: "Nothing yet. Tell Ask something worth keeping, like who your best customers are, and it remembers it here.",
  noJournal: "Ask writes a line here at the end of each day something happened.",
  sources: { ask: "Told to Ask", pane: "Written here" } as Record<AskMemorySource, string>,
  edit: "Change",
  forget: "Forget",
  save: "Save",
  cancel: "Cancel",
  add: "Add a line",
  addLabel: "Something Ask should remember",
  addHint: "One fact about your business, in a sentence or two: who your best customers are, how you like things done.",
  keptByYou: "kept by you",
  reading: "Reading what Ask remembers…",
  unread: "What Ask remembers could not be read just now.",
  retry: "Try again",
  forgotten: (text: string) => `Forgotten: ${text}`,
  changed: "Changed",
} as const;
