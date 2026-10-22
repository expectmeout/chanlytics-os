export const ASK_MEMORY_LIMITS = {
  /** One fact, in a sentence or two. */
  textMin: 3,
  textMax: 300,
  /**
   * The lines a workspace keeps at once, every one read into each turn's shape block (so what the pane lists is what Ask
   * knows): past it, a line is forgotten or changed before another is kept. The door holds the same number (00470).
   */
  liveMax: 40
};
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
  perRun: 3
};
const SECRET = /\b(?:sk|pk|rk|ghp|gho|xox[abps]|AKIA)[-_]?[A-Za-z0-9_-]{12,}|\b[A-Za-z0-9+/_-]{40,}\b|\b(?:password|passcode|contraseña|clave)\s*(?:is|es|:|=)/i;
const CARD = /\b(?:\d[ -]?){13,19}\b/;
export function memoryTextProblem(raw) {
  const text = memoryText(raw);
  if (text.length < ASK_MEMORY_LIMITS.textMin) return "Say the fact in a few words.";
  if (text.length > ASK_MEMORY_LIMITS.textMax)
    return `Keep it under ${ASK_MEMORY_LIMITS.textMax} characters: one fact, in a sentence or two.`;
  if (SECRET.test(text) || CARD.test(text)) return "A password, a key or a card number is never kept.";
  return null;
}
export function memoryText(raw) {
  return raw.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
}
export const ASK_MEMORY_WORDS = {
  cardTitle: "Remembered",
  receipt: (text) => `Remembered: ${text}`,
  undoLabel: "Forget it",
  undone: "Forgotten",
  full: `Ask already keeps ${ASK_MEMORY_LIMITS.liveMax} things. Forget one on Settings \u203A Memory before it keeps another.`,
  paneTitle: "Memory",
  paneLede: "What Ask keeps about your business, and what it saw each day. Every question Ask answers reads it.",
  linesHead: "What Ask remembers",
  journalHead: "Ask's journal",
  none: "Nothing yet. Tell Ask something worth keeping, like who your best customers are, and it remembers it here.",
  noJournal: "Ask writes a line here at the end of each day something happened.",
  sources: { ask: "Told to Ask", pane: "Written here" },
  edit: "Change",
  forget: "Forget",
  save: "Save",
  cancel: "Cancel",
  add: "Add a line",
  addLabel: "Something Ask should remember",
  addHint: "One fact about your business, in a sentence or two: who your best customers are, how you like things done.",
  keptByYou: "kept by you",
  reading: "Reading what Ask remembers\u2026",
  unread: "What Ask remembers could not be read just now.",
  retry: "Try again",
  forgotten: (text) => `Forgotten: ${text}`,
  changed: "Changed"
};
