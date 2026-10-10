/**
 * The product is for any trade. The words of one — a salon's — must not sit
 * in the code a customer reads: not in a placeholder, a command, a prompt, a
 * template example or a hint. This scans the sources that reach users and
 * fails on the first salon word, the way the no-fabricated-data spec fails on
 * a mockup name.
 *
 * Comments are skipped (they are not copy), member accesses are skipped
 * (`c.therapist` is a seed field, not a word), and a line may carry
 * `trade-word:` in a comment to say why it must keep one. The trees it reads and the lines a reader reads are
 * `_source.mjs`'s (READER_SCOPE, readerFiles, readerLines), which the appointment words' ratchet reads too.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { ROOT as REPO, readerFiles, readerLines } from "../_source.mjs";

/** Files that may keep a trade's words, and why. */
const ALLOWED = new Map([
  [
    "apps/dashboard/src/legacy/demo/pages/segments.jsx",
    "the seeded Segments of the mockup; a real workspace's lists are a view of People (surfaces/people/)",
  ],
  [
    "apps/dashboard/src/legacy/demo/pages/content-cal.jsx",
    "the seeded content calendar; a real workspace sees the in-design card",
  ],
  [
    "apps/dashboard/src/legacy/demo/pages/agent-studio.jsx",
    "the seeded Studio; a real workspace sees the in-design card",
  ],
]);
const BANNED = /\b(salons?|stylists?|balayage|therapists?|chair rental|haircuts?|keratin|blowouts?|lash(?:es)?)\b/i;

test("no salon words reach a customer of another trade", () => {
  const hits = [];
  for (const file of readerFiles()) {
    const rel = relative(REPO, file).split(sep).join("/");
    if (ALLOWED.has(rel)) continue;
    const src = readFileSync(file, "utf8");
    for (const { n, text } of readerLines(src)) {
      const m = BANNED.exec(text);
      if (m) hits.push(`${rel}:${n}: “${m[0]}” — ${text.trim().slice(0, 110)}`);
    }
  }
  assert.deepEqual(hits, [], `salon words in code a customer reads:\n${hits.join("\n")}`);
});

test("the scanner reads what a reader reads", () => {
  const lines = readerLines(
    `// a stylist in a comment\nconst a = c.therapist; /* salon */ const b = "salon"; // trade-word: kept on purpose\nconst c = "haircut";\n/* stylist\n balayage */\nconst d = 1;`,
  );
  assert.deepEqual(
    lines.map((l) => l.text.trim()),
    ['const c = "haircut";', "const d = 1;"],
    "a comment is not copy, an exempted line is skipped whole, a member access is not a word",
  );
});
