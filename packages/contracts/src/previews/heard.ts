/**
 * A call to a lead's own preview, read back (decision 0079; the redesign of 17 November 2026): the words said on it, as
 * the page shows them while the call runs and keeps them on the call's line, and what the business would get after a
 * real one, in the words its Inbox says a call in (voice/call-words.ts). Pure: the rehearsal's turns and the call's own
 * analysis in, lines out. Nothing here is kept: the words are the rehearsal's row's, the analysis the provider's.
 */
import { callNoteLines, callNotesOf, callOutcomeOf, CALL_OUTCOME_WORDS, tidyCallSummary } from "../voice/call-words";
import { SECOND_MS } from "../shared/time";
import { LEAD_PREVIEW_WORDS } from "./words";

/** One thing said on the call: by AI, or by the person who called it. */
export interface PreviewHeardLine {
  who: "ai" | "you";
  text: string;
}

/** The spoken lines of a rehearsal's turns, in order: a tool it reached for and a turn with no words are left out. */
export function previewHeardOf(turns: readonly { role: string; content: string }[]): PreviewHeardLine[] {
  return turns.flatMap((turn): PreviewHeardLine[] => {
    const text = turn.content.replace(/\s+/g, " ").trim();
    if (!text || (turn.role !== "agent" && turn.role !== "user")) return [];
    return [{ who: turn.role === "agent" ? "ai" : "you", text }];
  });
}

/**
 * Where a call's write-up stands at the provider: still being written, written, or none to come (a call it has no
 * record of, or one whose analysis it never made).
 */
export const PREVIEW_AFTER_CALL_STATES = ["writing", "ready", "none"] as const;
export type PreviewAfterCallState = (typeof PREVIEW_AFTER_CALL_STATES)[number];

/** What a call's analysis said, as the edge's door answers it: the provider's own fields, each null where it said none. */
export interface PreviewCallAnalysis {
  outcome: string | null;
  wanted: string | null;
  summary: string | null;
  follow_up: string | null;
  caller_name: string | null;
  caller_email: string | null;
}

/** What the business would get after a real call like this one: the card its Inbox would hold. */
export interface PreviewGotVM {
  /** How it ended, in the Inbox's words; null where the analysis named none. */
  outcome: string | null;
  /** Whether something is left for a person at the business to do: what the card's mark says. */
  yours: boolean;
  /** What the caller wanted, in one sentence. */
  wanted: string;
  /** The to-do first, then what the caller gave about themselves. */
  notes: string[];
}

/** The first sentence of a paragraph, or all of it where it is one. */
const firstSentenceOf = (text: string): string => text.split(/(?<=[.!?])\s/)[0] ?? text;

/**
 * The card, from a call's analysis: what the caller wanted leads, in the analysis's plain words, with the provider's
 * own summary as the fallback (its opening folded, as every surface folds it). A call nobody asked anything on says so
 * in the page's own sentence. Null where the analysis holds nothing a card could say.
 */
export function previewGotOf(analysis: PreviewCallAnalysis): PreviewGotVM | null {
  const outcome = callOutcomeOf(analysis.outcome);
  const notes = callNotesOf(analysis);
  const lines = callNoteLines(notes);
  const summary = tidyCallSummary(analysis.summary);
  const wanted = analysis.wanted?.replace(/\s+/g, " ").trim() || (summary ? firstSentenceOf(summary) : "");
  if (!wanted && !lines.length) {
    // Nothing asked and nothing noted: a card only where the analysis itself said so.
    if (outcome !== "no_request") return null;
    return { outcome: CALL_OUTCOME_WORDS.no_request, yours: false, wanted: LEAD_PREVIEW_WORDS.gotNothing, notes: [] };
  }
  return {
    outcome: outcome ? CALL_OUTCOME_WORDS[outcome] : null,
    yours: outcome === "callback_needed" || notes.todo !== null,
    wanted: wanted || LEAD_PREVIEW_WORDS.gotNothing,
    notes: lines,
  };
}

/** What the page's read of a call answers: its words so far, whether it has ended, and what comes after it. */
export interface PreviewHeardDto {
  lines: PreviewHeardLine[];
  ended: boolean;
  /** The card, once the call's write-up is there. */
  got: PreviewGotVM | null;
  /** Whether a write-up may still come: the page asks again while it is true. */
  writing: boolean;
}

/** How long after a call's end its write-up is still waited for: the provider writes one in seconds, or never. */
export const PREVIEW_WRITE_UP_MS = 90 * SECOND_MS;
