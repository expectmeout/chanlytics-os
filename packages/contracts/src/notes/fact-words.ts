/**
 * What a note suggested from an owner's correction is, as a page holds it, and the words the pages say of it (decision
 * 0063). Apart from the rules (fact-suggest.ts), which the edge's sweep reads, because the Autonomy pane and the verb every
 * page loads (ask-proposals/autonomy.ts) need these words alone.
 */
import type { AskSettingsChange } from "../ask/ask-settings-change";
import { PROFILE_LIMITS } from "../config/workspace-config/config-rules";

/** What an owner corrected (00448 fact_suggestions.source): a held draft rewritten to their instruction, or their reply. */
export type CorrectionSource = "steer" | "reply";

/** A suggestion waiting, as the pane draws it (00448 fact_suggestions, state suggested). */
export interface FactSuggestionDto {
  id: string;
  source: CorrectionSource;
  title: string;
  body: string;
  quote: string;
  conversation_id: string | null;
  created_at: string;
}

/** The change a Keep makes: the note as the receptionist will be told it (contracts applySettingsChange). */
export function factNoteChange(s: Pick<FactSuggestionDto, "title" | "body">): AskSettingsChange {
  return { op: "add_note", title: s.title, text: s.body };
}

/** The words the pane says of what it learned. */
export const FACT_SUGGEST_WORDS = {
  heading: "Learned from your corrections",
  sub: "When you rewrite a reply or answer a customer yourself, what you said can become a note the receptionist reads.",
  keep: "Keep as a note",
  dismiss: "Dismiss",
  wrote: (source: CorrectionSource, quote: string) =>
    `${source === "steer" ? "You asked for a rewrite" : "You replied"}: “${quote}”`,
  thread: "Open the thread",
  kept: (title: string) => `Kept as a note: “${title}”`,
  alreadyKept: (title: string) => `Your notes already say this: “${title}”`,
  dismissed: "Dismissed",
  gate: "Only the owner and a partner change what the receptionist reads.",
  notesFull: `Your notes are full (${PROFILE_LIMITS.notes}). Take one away in Settings › Business, then keep this.`,
  answered: "This was answered already.",
  moved: "The settings changed while this was kept. Try again.",
} as const;
