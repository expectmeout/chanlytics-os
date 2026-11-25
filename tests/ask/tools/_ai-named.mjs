/**
 * The answers the registry gave at 7405e34b (tests/fixtures/ask-tool-results-7405e34b.json), read with the product's AI
 * named as it is named now.
 *
 * 15 Nov 2026 (docs/words.md; Ruben: "lets always refer to our ai as simply AI"): the product's AI is called AI wherever
 * a person reads of it, so a card's words and a page's own figures say AI where they said the receptionist. A tool's
 * own notes to the model and its keys (`for: receptionist`, `receptionist_mode`) keep theirs. The fixture stays as it
 * was frozen; ask/tool-names/ reads it through this, in each answer's result and in the card it proposed.
 */
import fs from "node:fs";
import path from "node:path";
import { taughtToday } from "./_taught-words.mjs";

const AI_NAMED = [
  ["Answered by the receptionist", "Answered by AI"],
  ["Receptionist answered", "AI answered"],
  ["times the receptionist stopped", "times AI stopped"],
  ["Receptionist for Rosa", "AI for Rosa"],
  ["The receptionist stays silent with them", "AI stays silent with them"],
  [
    "only an owner can change how the receptionist treats one person",
    "only an owner can change how AI treats one person",
  ],
  ['"Receptionist: ', '"AI: '],
  ['"Receptionist"', '"AI"'],
];

/** And in the words its tools say since 16 Nov 2026 (_taught-words.mjs): campaign, conversation, AI, send. */
const aiNamed = (said) =>
  typeof said === "string"
    ? taughtToday(AI_NAMED.reduce((words, [was, is]) => words.replaceAll(was, is), said))
    : taughtToday(said);

/** Every frozen answer, its result and its card's words with AI named; everything else as it was frozen. */
export const frozenAnswers = (root) =>
  JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/ask-tool-results-7405e34b.json"), "utf8")).map((answer) =>
    "proposal" in answer
      ? { ...answer, result: aiNamed(answer.result), proposal: aiNamed(answer.proposal) }
      : { ...answer, result: aiNamed(answer.result) },
  );
