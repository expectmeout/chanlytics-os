import { PROFILE_LIMITS } from "../config/workspace-config/config-rules.js";
export function factNoteChange(s) {
  return { op: "add_note", title: s.title, text: s.body };
}
export const FACT_SUGGEST_WORDS = {
  heading: "Learned from your corrections",
  sub: "When you rewrite a reply or answer a customer yourself, what you said can become a note the receptionist reads.",
  keep: "Keep as a note",
  dismiss: "Dismiss",
  wrote: (source, quote) => `${source === "steer" ? "You asked for a rewrite" : "You replied"}: \u201C${quote}\u201D`,
  thread: "Open the thread",
  kept: (title) => `Kept as a note: \u201C${title}\u201D`,
  alreadyKept: (title) => `Your notes already say this: \u201C${title}\u201D`,
  dismissed: "Dismissed",
  gate: "Only the owner and a partner change what the receptionist reads.",
  notesFull: `Your notes are full (${PROFILE_LIMITS.notes}). Take one away in Settings \u203A Business, then keep this.`,
  answered: "This was answered already.",
  moved: "The settings changed while this was kept. Try again."
};
