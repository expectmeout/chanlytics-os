/**
 * A version's words as parts, for the editor that draws each slot by its name (One message, every channel, step 1; the
 * review of 3 Oct 2026, item 16; the reach-out's emails on the same editor, step 5). The stored words never change: a
 * slot is written `{{1}}` in a campaign email's subject and body and in a text's words, `{{business}}` in a reach-out's,
 * and everything that checks, counts, fills or sends reads that string. The editor shows a slot as its name ("First
 * name") and keeps the string: it reads it as parts to draw, and writes the parts it was left with back as the string,
 * so the owner never sees braces and a slot is one thing to the caret, to Backspace and to a paste. All of it is pure;
 * the page's DOM is a thin reader of these. Which slots there are, and how each is written, is the message's slot set
 * (slot-sets.ts): numbered, or named from a list.
 *
 * A slot is whatever the fill reads as one (slot-sets.ts, the one reader): `{{10}}` and `{{01}}` name a number,
 * `{{your name}}` and `{{ Your Name }}` a name. The send fills every spelling the editor draws as a chip and no other,
 * so the editor never shows as plain words what the send puts a value in. A slot keeps the way it was written
 * (`written`, where that is not its key between plain braces), so no string changes as it goes to parts and back, and
 * a spelling the box did not make is still a slot it draws by name. A key the message has no slot for (`{{5}}` on a
 * message with two values, `{{first name}}` on a reach-out's email) is a slot too, drawn by its own name and refused in
 * those words: the editor keeps what it was given and says so. Braces that name nothing (a named set's `{{}}` and
 * `{{ }}`) are words, and the fill puts no value there either.
 */
import { versionSlotsRefusal } from "./message-versions";
import type { VersionCheck, VersionWords } from "./message-versions";
import { slotMentions, slotOutside, slotWritten } from "./slot-sets";
import type { SlotKey, SlotSet } from "./slot-sets";

/**
 * One piece of a version's words: words as they are written, or a slot by its key. A slot written in any way but its key
 * between plain braces (`{{01}}`, `{{ Your Name }}`) says how, in `written`; the usual way says nothing.
 */
export type SlotPart = { kind: "text"; text: string } | { kind: "slot"; slot: SlotKey; written?: string };

/** A slot part as it is written in the stored words. */
export const partWritten = (part: Extract<SlotPart, { kind: "slot" }>): string =>
  part.written ?? slotWritten(part.slot);

/** The words as parts, in order: a slot is its own part, adjacent slots have no empty words between them. */
export function toSlotParts(text: string, set: Pick<SlotSet, "kind"> = { kind: "numbered" }): SlotPart[] {
  const parts: SlotPart[] = [];
  let last = 0;
  for (const m of slotMentions(set, text)) {
    // Braces that name nothing are words: no slot is there, and the fill puts no value there either.
    if (m.key === "") continue;
    if (m.index > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    const slot = { kind: "slot" as const, slot: m.key };
    parts.push(m.written === slotWritten(m.key) ? slot : { ...slot, written: m.written });
    last = m.index + m.written.length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

/** The parts as the stored words: the inverse of toSlotParts, for any words it was given. */
export function fromSlotParts(parts: readonly SlotPart[]): string {
  return parts.map((p) => (p.kind === "slot" ? partWritten(p) : p.text)).join("");
}

/** What an edit leaves: the words, and where the caret stands in them (a place in the stored string). */
export interface SlotEdit {
  text: string;
  caret: number;
}

const within = (text: string, at: number): number => Math.max(0, Math.min(text.length, Math.trunc(at)));

/**
 * A slot put in place of what is selected (`start` to `end`, equal for a caret), the caret after it. Places past
 * either end are the end; a selection given the wrong way round is read the right way.
 */
export function insertSlot(text: string, slot: SlotKey | number, start: number, end: number): SlotEdit {
  const from = within(text, Math.min(start, end));
  const to = within(text, Math.max(start, end));
  const written = slotWritten(slot);
  return { text: `${text.slice(0, from)}${written}${text.slice(to)}`, caret: from + written.length };
}

/**
 * The words kept to a limit, for an edit that went past it where it could not be refused (an input method's word, a
 * spelling the browser put in): what is over is taken from the letters nearest the caret, those before it first, then
 * those after. A slot is never cut, so what is left is words and whole slots (still over where slots alone are), a
 * character of two units goes whole, and the caret keeps its place among the words that stay.
 */
export function clampWords(
  text: string,
  caret: number,
  max: number,
  set: Pick<SlotSet, "kind"> = { kind: "numbered" },
): SlotEdit {
  const at = within(text, caret);
  const over = text.length - Math.max(0, max);
  if (over <= 0) return { text, caret: at };
  const held = new Array<boolean>(text.length).fill(false);
  for (const m of slotMentions(set, text)) if (m.key !== "") held.fill(true, m.index, m.index + m.written.length);
  const letters: Array<{ from: number; to: number }> = [];
  for (let i = 0; i < text.length;) {
    const to = i + ((text.codePointAt(i) ?? 0) > 0xffff ? 2 : 1);
    if (!held[i]) letters.push({ from: i, to });
    i = to;
  }
  const nearest = [...letters.filter((l) => l.from < at).reverse(), ...letters.filter((l) => l.from >= at)];
  const gone = new Set<number>();
  for (const l of nearest) {
    if (gone.size >= over) break;
    for (let i = l.from; i < l.to; i += 1) gone.add(i);
  }
  let kept = "";
  let before = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (!gone.has(i)) kept += text.charAt(i);
    else if (i < at) before += 1;
  }
  return { text: kept, caret: at - before };
}

/**
 * Backspace (`back`) or Delete (`forward`) at a caret that stands against a slot: the whole slot goes, as one thing,
 * and the caret stays where it stood. Null where there is no such slot: a selection is the browser's to delete, and
 * words beside the caret go a letter at a time.
 */
export function eraseSlot(
  text: string,
  start: number,
  end: number,
  way: "back" | "forward",
  set: Pick<SlotSet, "kind"> = { kind: "numbered" },
): SlotEdit | null {
  if (start !== end) return null;
  let at = 0;
  for (const p of toSlotParts(text, set)) {
    const length = p.kind === "slot" ? partWritten(p).length : p.text.length;
    const hit = p.kind === "slot" && (way === "back" ? at + length === start : at === start);
    if (hit) return { text: `${text.slice(0, at)}${text.slice(at + length)}`, caret: at };
    at += length;
  }
  return null;
}

/** Whether a key is one of the message's slots. */
export const slotKnown = (set: SlotSet, slot: SlotKey | number): boolean => set.keys.includes(String(slot));

/**
 * What a slot is called: the message's own label for it; "Value 5" for a number it has no label for; a name it does not
 * list, as it was written.
 */
export function slotLabel(set: SlotSet, slot: SlotKey | number): string {
  const key = String(slot);
  const own = set.labels[set.keys.indexOf(key)]?.trim();
  return own || (set.kind === "numbered" ? `Value ${key}` : key);
}

/** A list the way a person says it: "First name", "First name and Date", "First name, Date and Link". */
function namesJoined(names: readonly string[]): string {
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The slot rule's sentence for these words, in the slots' names: the first number the message has no slot for. */
function namedRefusal(text: string, set: SlotSet): string | null {
  const extra = slotOutside(set, text);
  if (extra === null) return null;
  const name = slotLabel(set, extra);
  return set.keys.length === 0
    ? `This message fills no values, so ${name} has nothing to take.`
    : `${name} is not one of this message's values: it has ${namesJoined(set.keys.map((k) => slotLabel(set, k)))}.`;
}

/**
 * What is wrong with a version, for the editor that draws slots by name: the check's own sentence, except where that
 * is a numbered set's slot rule, which the editor says in the names it draws instead of the braces it never shows. A
 * named set's sentences name its slots already, so they are said as they are. Null when the check passed. `set` is the
 * message's slots with what each is called.
 */
export function namedProblem(check: VersionCheck, words: VersionWords, set: SlotSet): string | null {
  if (check.ok) return null;
  if (set.kind === "named") return check.error;
  const subject = words.subject ?? "";
  const count = set.keys.length;
  const theirs = versionSlotsRefusal(subject, count) ?? versionSlotsRefusal(words.body, count);
  // Only the slot rule's own sentence is put in names: a subject that is missing or long is said as the check says it.
  if (theirs === null || theirs !== check.error) return check.error;
  return namedRefusal(subject, set) ?? namedRefusal(words.body, set) ?? check.error;
}
