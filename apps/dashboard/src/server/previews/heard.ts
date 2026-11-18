import "server-only";

/**
 * A call to a lead's own preview, read back (decision 0079; the redesign of 17 November 2026): the rehearsal's turns as
 * the lines the page shows, and a call's analysis as the card its Inbox would hold after a real call like it, in the
 * words every surface says a call in (contracts voice/call-words.ts). Pure: the door that answers the page is
 * doors.ts's previewHeard, and the analysis is the edge's (lib/previews/after-call.ts). Nothing here is kept.
 */
import {
  CALL_OUTCOME_WORDS,
  LEAD_PREVIEW_WORDS,
  MIN_MS,
  callNoteLines,
  callNotesOf,
  callOutcomeOf,
  tidyCallSummary,
  type PreviewCallAnalysis,
  type PreviewGotVM,
  type PreviewHeardLine,
} from "@chanlytics/contracts";

/**
 * How long after a call's end its write-up is waited for, and the provider asked for it: it writes one in seconds, or
 * never. The page's own asking ends inside this (surfaces/preview/use-talk.ts), so its last read is still answered.
 */
export const WRITE_UP_MS = 2 * MIN_MS;

/** The spoken lines of a rehearsal's turns, in order: a tool it reached for and a turn with no words are left out. */
export function previewHeardOf(turns: readonly { role: string; content: string }[]): PreviewHeardLine[] {
  return turns.flatMap((turn): PreviewHeardLine[] => {
    const text = turn.content.replace(/\s+/g, " ").trim();
    if (!text || (turn.role !== "agent" && turn.role !== "user")) return [];
    return [{ who: turn.role === "agent" ? "ai" : "you", text }];
  });
}

/** The first sentence of a paragraph, or all of it where it is one. */
const firstSentenceOf = (text: string): string => text.split(/(?<=[.!?])\s/)[0] ?? text;

/**
 * The card, from a call's analysis: what the caller wanted leads, in the analysis's plain words, with the provider's
 * own summary as the fallback (its opening folded, as every surface folds it). A call nobody asked anything on says so
 * in the page's own sentence, and only there: a call with a to-do and no sentence of what was wanted says its notes
 * alone, never that there is nothing to do. Null where the analysis holds nothing a card could say.
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
    wanted,
    notes: lines,
  };
}
