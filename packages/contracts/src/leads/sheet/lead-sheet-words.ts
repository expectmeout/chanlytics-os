/**
 * A lead's own words at one step of a sequence (decision 0096): the email as a member typed it on the lead's sheet, kept
 * for this lead and this step, not for one send of it, so it stands through Take out and Put back and a run canceled,
 * before the lead is added, and for a step not planned yet. Everyone else gets the step's words.
 *
 * The box shows the email as it reads: real values, and what is not known yet as a mark in brackets. What is kept is the
 * words as a step writes them: a value the words named goes back to its slot where that changes no character, so a sign-off
 * still names {{your name}} (coldEndingOf), a preview still starts its thirty days (recordPreviewSent) and a name put right
 * still reaches the email. The line written for them is kept as it was typed: it is the member's now.
 *
 *   leadWordsPieces    the same email as the sheet reads it at rest, each piece at its place in the box's words
 *   leadWordsBlanks    a step's words with every blank by its name: what everyone on the step gets (decision 0127)
 *   leadWordsInBox     the email as the box opens with it
 *   leadWordsFromBox   what the box says, as the words to keep
 *   leadWordsProblem   what is wrong with those words, in the step's own rules; null where they may go
 */
import { slotMentions, slotValueOf, slotWritten } from "../../campaigns/templates/slot-sets";
import { capitalize } from "../../shared/words";
import { leadAddresseeOf } from "../kind";
import {
  reachOutCardEmailOf,
  reachOutValues,
  type SlotLead,
  type SlotWorkspace,
} from "../../campaigns/reach-out/rules";
import { chainIssueWords, firstEmailLinkProblem } from "../../campaigns/reach-out/words/opening";
import { REACH_OUT_SLOT_SET as SLOTS } from "../../campaigns/reach-out/words/slots";
import { validateReachOutWords, wordsIssueWords } from "../../campaigns/reach-out/words/limits";

/** An email's words: a later step answers the one before, and has no subject (null). */
export interface LeadEmailText {
  subject: string | null;
  body: string;
}

/**
 * A piece of the email as the sheet reads it at rest: its words, the line written for them, a blank's value where it has
 * one (`value`, naming its blank), what stands for one not known yet (`mark`), or a blank by its name alone (`blank`, what
 * Show the blanks draws: decision 0127). `at` is where it starts in the words it was read from, so a press on it puts the
 * caret there.
 */
export interface LeadEmailPiece {
  at: number;
  kind: "words" | "line" | "mark" | "value" | "blank";
  text: string;
  slot?: string;
}

/** One lead's own words at one step (GET leads/:id/emails `words`, 00545 sequence_lead_words). */
export interface LeadStepWordsDto extends LeadEmailText {
  step_id: string;
  /** When they were last typed. */
  at: string;
}

export const LEAD_WORDS_BOX = {
  /** What stands for the line while it is still to be written: left alone, the check writes it. */
  line: "[A line about them, written before it goes]",
  /** What Show the blanks calls the line written for them. */
  lineBlank: "A line about them",
  /** The switch over the email: the email with this lead's values in, or the step's words with each blank named. */
  view: {
    label: "How the email is shown",
    read: "As they'll read it",
    blanks: "Show the blanks",
    note: "These words go to everyone on this step. Only the blanks change.",
  },
  edit: "Edit",
  editOf: (personName: string) => `Edit the email to ${personName}`,
  bodyOf: (personName: string) => `The email to ${personName}`,
  subject: "Subject",
  done: "Done",
  back: "Use the sequence's words",
  more: "More for this email",
  everyone: "Change it for everyone",
  test: "Send me a test",
  /** Under an email whose words are this lead's. */
  only: (personName: string) => `Only for ${personName}`,
  saved: (personName: string) => `Saved for ${personName}`,
  undo: "Undo",
  undone: (personName: string) => `${personName} gets the words you had before`,
  backAgain: (personName: string) => `${personName} gets the sequence's words`,
  fill: (labels: readonly string[]) => `Fill in ${labels.join(" and ")}, or take it out.`,
  /** Under the box while it is typed in: what goes under the words that is not theirs to change. */
  foot: "Your footer is added when it goes.",
  /** The dock's question where the words cannot be kept and the member is leaving them. */
  stay: "Keep editing",
  drop: "Put them back",
  cantGo: "These words can't go as they are.",
  /** A step opened on the Sequence line that went: what it said, once read. */
  reading: "Reading what went",
  unread: "What went couldn't be read. It's in their conversation.",
  /** Their own words could not be read: this is the step's, and may not be what goes. */
  wordsUnread: "These are the sequence's words. Any you wrote for them couldn't be read just now.",
} as const;

const W = LEAD_WORDS_BOX;

/** What the words call a slot, lower-cased for a sentence ("their title"). */
const labelOf = (key: string): string => (SLOTS.labels[SLOTS.keys.indexOf(key)] || key).toLowerCase();

/** What stands in the box for a slot with no value yet. */
const markOf = (key: string): string => (key === "opening" ? W.line : `[${capitalize(labelOf(key))}]`);

/** Words with each slot's value in, or its mark. */
function inBox(text: string, values: ReadonlyArray<string | undefined>): string {
  let out = "";
  let from = 0;
  for (const m of slotMentions(SLOTS, text)) {
    out += text.slice(from, m.index) + (slotValueOf(SLOTS, m.key, values) ?? markOf(m.key));
    from = m.index + m.written.length;
  }
  return out + text.slice(from);
}

interface WordsFor {
  lead: SlotLead;
  workspace: SlotWorkspace;
}

/** The email as the sheet reads it at rest: the box's words in pieces, the line and what is not known yet apart. */
export function leadWordsPieces(wordsFor: WordsFor & { body: string; opening: string | null }): LeadEmailPiece[] {
  const values = reachOutValues(wordsFor.lead, wordsFor.workspace, wordsFor.opening);
  const out: LeadEmailPiece[] = [];
  let at = 0;
  const put = (kind: LeadEmailPiece["kind"], text: string, slot?: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (kind === "words" && last?.kind === "words") last.text += text;
    else out.push({ at, kind, text, ...(slot ? { slot } : {}) });
    at += text.length;
  };
  let from = 0;
  for (const m of slotMentions(SLOTS, wordsFor.body)) {
    put("words", wordsFor.body.slice(from, m.index));
    const value = slotValueOf(SLOTS, m.key, values);
    if (!value) put("mark", markOf(m.key), m.key);
    else if (m.key === "opening") put("line", value);
    else put("value", value, m.key);
    from = m.index + m.written.length;
  }
  put("words", wordsFor.body.slice(from));
  return out;
}

/** A step's words with every blank by its name: what everyone on the step gets, before any value is in. */
export function leadWordsBlanks(text: string): LeadEmailPiece[] {
  const out: LeadEmailPiece[] = [];
  let from = 0;
  for (const m of slotMentions(SLOTS, text)) {
    if (m.index > from) out.push({ at: from, kind: "words", text: text.slice(from, m.index) });
    out.push({
      at: m.index,
      kind: "blank",
      text: m.key === "opening" ? W.lineBlank : capitalize(labelOf(m.key)),
      slot: m.key,
    });
    from = m.index + m.written.length;
  }
  if (from < text.length) out.push({ at: from, kind: "words", text: text.slice(from) });
  return out;
}

/** The email as the box opens with it: `words` for this lead, with the line written for them where there is one. */
export function leadWordsInBox(wordsFor: WordsFor & { words: LeadEmailText; opening: string | null }): LeadEmailText {
  const values = reachOutValues(wordsFor.lead, wordsFor.workspace, wordsFor.opening);
  return {
    subject: wordsFor.words.subject === null ? null : inBox(wordsFor.words.subject, values),
    body: inBox(wordsFor.words.body, values),
  };
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** The text with `from` swapped for `to` wherever it stands alone: "Ann" is not in "Annual". */
function swapStandingAlone(text: string, from: string, to: string): string {
  let out = "";
  let at = 0;
  for (let i = text.indexOf(from); i >= 0; i = text.indexOf(from, at)) {
    const alone = !WORD_CHAR.test(text[i - 1] ?? "") && !WORD_CHAR.test(text[i + from.length] ?? "");
    out += text.slice(at, i) + (alone ? to : from);
    at = i + from.length;
  }
  return out + text.slice(at);
}

/** Each mark and value of the slots `base` names, longest first, and the slot it goes back to. */
function swapsOf(wordsFor: WordsFor & { base: LeadEmailText }): Array<{ from: string; to: string; value: boolean }> {
  const values = reachOutValues(wordsFor.lead, wordsFor.workspace, null);
  const named = [
    ...new Set(slotMentions(SLOTS, `${wordsFor.base.subject ?? ""}\n${wordsFor.base.body}`).map((m) => m.key)),
  ];
  const greetsAnyone = !leadAddresseeOf(wordsFor.lead)?.first_name;
  return named
    .flatMap((key) => {
      const to = slotWritten(key);
      const value = slotValueOf(SLOTS, key, values);
      // "there" is a word as well as the fallback: "over there" never becomes a slot.
      const changes = value && !(key === "first name" && greetsAnyone) ? [{ from: value, to, value: true }] : [];
      return [{ from: markOf(key), to, value: false }, ...changes];
    })
    .sort((a, b) => b.from.length - a.from.length);
}

/** One text of the box as words: its marks back to their slots, and its values where that changes no character. */
function fromBox(typed: string, p: WordsFor & { base: LeadEmailText }): string {
  const swaps = swapsOf(p);
  const marked = swaps.filter((s) => !s.value).reduce((t, s) => t.split(s.from).join(s.to), typed);
  const slotted = swaps.filter((s) => s.value).reduce((t, s) => swapStandingAlone(t, s.from, s.to), marked);
  const values = reachOutValues(p.lead, p.workspace, null);
  return inBox(slotted, values) === inBox(marked, values) ? slotted : marked;
}

/**
 * What the box says, as the words to keep. `base` is what the box opened from, whose slots are the ones its values go
 * back to. A step after the first keeps no subject.
 */
export function leadWordsFromBox(wordsFor: WordsFor & { typed: LeadEmailText; base: LeadEmailText }): LeadEmailText {
  const body = fromBox(wordsFor.typed.body.replace(/\r\n?/g, "\n").trimEnd(), wordsFor);
  if (wordsFor.base.subject === null) return { subject: null, body };
  return { subject: fromBox((wordsFor.typed.subject ?? "").trim(), wordsFor), body };
}

/**
 * What is wrong with words to keep, by the rules a step's own are held to (validateReachOutWords, a first email's links),
 * then a value this lead still lacks, which would hold the email. Null where they may go. The model reads none of it: the
 * check keeps the model honest, and these are the member's words.
 */
export function leadWordsProblem(wordsFor: WordsFor & { words: LeadEmailText; first: boolean }): string | null {
  const issue = validateReachOutWords(wordsFor.words, wordsFor.first)[0];
  if (issue) return wordsIssueWords(issue);
  const link = wordsFor.first ? firstEmailLinkProblem(wordsFor.words) : null;
  if (link) return chainIssueWords({ step: 0, field: "body", problem: link });
  const { holes } = reachOutCardEmailOf(wordsFor.words, wordsFor.lead, wordsFor.workspace);
  return holes.length ? W.fill(holes.map(labelOf)) : null;
}
