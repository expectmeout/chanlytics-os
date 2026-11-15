/**
 * What AI answers, read for the words that never reach a screen (docs/words.md, "How it is held"), for eval-ask.mjs's
 * judge. An answer is the most-read text in the product, and the pages' own measure cannot see it: it is written at
 * the moment it is asked. The list is the pages' (tests/repo/words/_screen-words.mjs), so an answer and a page are
 * held to the same words.
 *
 * Another name for the AI fails the turn: its instructions say it is AI and to say I. The code's, a provider's and a
 * retired word are noted and counted, never failed, while its tools still teach them (check:debt's `taught-words`):
 * a turn red for a word its own tools handed it would say nothing about the turn. What a person wrote, quoted, is
 * theirs and is not read, and a case whose people are agents or assistants by trade says so (`expect.keeps_words`).
 */
import { neverOnAScreen } from "../../tests/repo/words/_screen-words.mjs";

/** What someone else said, as the answer quotes it: curly quotes (the house's) or straight ones. */
const QUOTED = /“[^”]*”|"[^"]*"/gu;

const counted = (words) => {
  const by = new Map();
  for (const w of words) by.set(w.toLowerCase(), (by.get(w.toLowerCase()) ?? 0) + 1);
  return [...by].map(([w, n]) => (n > 1 ? `${w} ×${n}` : w)).join(", ");
};

/**
 * An answer's words against the list: `fails` when it calls the AI by another name, `notes` for the code's, a
 * provider's and a retired word. `keeps` are words a case's own data says (a lead who is an agent), in any case.
 */
export function screenWordsJudged(text, keeps = []) {
  const kept = new Set(keeps.map((w) => w.toLowerCase()));
  const own = String(text ?? "").replace(QUOTED, " ");
  const found = neverOnAScreen(own, ["ai", "code", "provider", "retired"]).filter(
    (f) => !kept.has(f.word.toLowerCase()),
  );
  const names = found.filter((f) => f.family === "ai").map((f) => f.word);
  const others = found.filter((f) => f.family !== "ai").map((f) => f.word);
  return {
    fails: names.length ? [`the answer calls AI by another name (${counted(names)}): it is AI, and it says I`] : [],
    notes: others.length ? [`words that never reach a screen: ${counted(others)}`] : [],
  };
}
