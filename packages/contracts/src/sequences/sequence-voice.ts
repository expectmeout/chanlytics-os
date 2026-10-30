/**
 * The owner's voice in a cold email (decision 0078): kept as lines of Ask's memory, each starting "In cold emails:", and
 * learned once from an email the owner pastes (POST sequences/voice). What the paste takes, what it answers, and the
 * words New says around it. The lines themselves are memory's (ask-memory/memory.ts), forgotten in Settings › Memory.
 */
import { ASK_MEMORY_WORDS } from "../ask-memory/memory";

/** A paste is a whole email: shorter says nothing of how its owner writes, longer is not one email. */
export const VOICE_PASTE_MIN = 40;
export const VOICE_PASTE_MAX = 4000;
/** The most lines one paste keeps. */
export const VOICE_LINES_MAX = 3;
/** How a learned line about writing starts, so it reads as one in every Ask turn and in Settings › Memory. */
export const VOICE_LINE_LEAD = "In cold emails:";

/** What a paste answers: the lines kept, and whether memory was full before all of them were. */
export interface SequenceVoiceDto {
  lines: string[];
  full: boolean;
}

/** A learned line as New says it: without its lead, and without its closing stop ("short, no greeting"). */
export function voiceSaid(line: string): string {
  const lead = new RegExp(`^${VOICE_LINE_LEAD}\\s*`, "i");
  return line
    .replace(lead, "")
    .replace(/[.\s]+$/, "")
    .trim();
}

/** The line under a draft written with learned lines; null where it was written with none. */
export function voiceLineOf(lines: readonly string[] | undefined): string | null {
  const said = (lines ?? []).map(voiceSaid).filter(Boolean);
  return said.length ? `Written the way you write: ${said.join(" · ")}` : null;
}

/** The words New says around the owner's voice. */
export const VOICE_WORDS = {
  paste: "Paste an email you've sent, and Ask writes the way you do.",
  placeholder: "An email you wrote to someone new",
  use: "Use it",
  reading: "Reading how you write…",
  memory: "Memory",
  tooShort: `Paste a whole email, ${VOICE_PASTE_MIN} characters at least.`,
  tooLong: `That is more than one email: ${VOICE_PASTE_MAX} characters at most.`,
  kept: (n: number) =>
    n === 0
      ? "Ask found nothing in it about how you write."
      : n === 1
        ? "Ask kept a line on how you write, and is drafting again."
        : `Ask kept ${n} lines on how you write, and is drafting again.`,
  full: ASK_MEMORY_WORDS.full,
} as const;
