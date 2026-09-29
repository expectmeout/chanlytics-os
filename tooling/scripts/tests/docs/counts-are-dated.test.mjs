/**
 * A count in the two pages every reader opens first carries its date, or is written by a command.
 *
 * `CLAUDE.md` says what not to introduce: "Counts in prose that go stale; measure and say when." Nothing held it, and
 * the README said "22 of the 141" specs and "112 integration tests ... 26 files" long after both had moved (the
 * scorecard's Documentation, and defect 63: docs corrected one day drifted the same day). Now a count in `README.md`
 * or `docs/architecture.md` (a number of ten or more, before a thing the repository counts, or "N of the M") sits in a
 * paragraph that names a date, or inside a block a command writes (`<!-- measured:start -->`). A count of history keeps
 * its date and stays true; a count of the tree belongs in the register, which is regenerated (docs/debt.md).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";

const PAGES = ["README.md", "docs/architecture.md"];

/** What the repository counts: a number before one of these, within a word, is a count of the tree. */
const COUNTED =
  "files|tests|specs|suites|lines|routes|tables|migrations|functions|modules|doors|packages|surfaces|pages|" +
  "components|stylesheets|rows|projects|workspaces|sweeps|variables|dependencies|exports|warnings|issues|runs|" +
  "commits|requests|checks|assertions|globals|copies|casts|jobs|events|kinds|hooks|screens|endpoints|decisions";
const COUNT = new RegExp(
  `\\b\\d{2,}(?:,\\d{3})*\\s+(?:[a-z-]+\\s+)?(?:${COUNTED})\\b|\\b(?:\\d+|[A-Z]?[a-z]+(?:-[a-z]+)?)\\s+of\\s+(?:the|its)\\s+\\d{2,}\\b`,
  "g",
);
const MONTH =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
/** A date a reader can hold the count to: "29 Sep 2026", "September 2026", "2026-09-29". */
const DATED = new RegExp(`\\b\\d{1,2} (?:${MONTH}) \\d{4}\\b|\\b(?:${MONTH}) \\d{4}\\b|\\b20\\d\\d-\\d\\d-\\d\\d\\b`);

/** Each count in `markdown`'s prose with no date in its paragraph, outside code and a measured block: [line, count]. */
function undatedCounts(markdown) {
  const found = [];
  const paragraphs = [];
  let current = [];
  let fenced = false;
  let measured = false;
  markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((line, i) => {
      if (/^\s*```/.test(line)) fenced = !fenced;
      if (line.includes("<!-- measured:start -->")) measured = true;
      const skip = fenced || measured || /^\s*```/.test(line);
      if (line.includes("<!-- measured:end -->")) measured = false;
      if (!line.trim() || skip) {
        if (current.length) paragraphs.push(current);
        current = [];
        return;
      }
      current.push({ n: i + 1, text: line.replace(/`[^`]*`/g, "`…`") });
    });
  if (current.length) paragraphs.push(current);
  for (const p of paragraphs) {
    if (DATED.test(p.map((l) => l.text).join(" "))) continue;
    for (const l of p) for (const m of l.text.matchAll(COUNT)) found.push([l.n, m[0]]);
  }
  return found;
}

test("the rule finds the counts that went stale, and leaves a dated one, a rule's number and code alone", () => {
  assert.deepEqual(undatedCounts("Twenty-two of the 141 need no credentials and pin the auth gate."), [
    [1, "Twenty-two of the 141"],
  ]);
  assert.deepEqual(undatedCounts("for its 112 integration tests,\nwhich live in 26 files and skip as a block."), [
    [1, "112 integration tests"],
    [2, "26 files"],
  ]);
  assert.deepEqual(undatedCounts("The nightly ran 24 of its 128 specs in September 2026 (#249)."), [], "dated");
  assert.deepEqual(undatedCounts("Measured 29 Sep 2026: 606 packages."), [], "dated");
  assert.deepEqual(undatedCounts("At most 100 characters; 30 token verifications an hour; 30 days."), [], "not counts");
  assert.deepEqual(undatedCounts("```\n412 files\n```\n`128 specs` in code"), [], "code is not prose");
  assert.deepEqual(undatedCounts("<!-- measured:start -->\n\n982 lines\n\n<!-- measured:end -->"), [], "written by a command");
  assert.deepEqual(undatedCounts("One paragraph from 29 Sep 2026.\n\nAnother with 40 routes."), [[3, "40 routes"]]);
});

for (const page of PAGES) {
  test(`${page}: every count carries its date or is written by a command`, () => {
    const found = undatedCounts(fs.readFileSync(path.join(ROOT, page), "utf8"));
    assert.deepEqual(
      found.map(([n, count]) => `${page}:${n}: "${count}"`),
      [],
      "date the paragraph (\"measured 29 Sep 2026\"), or say it without the number, or generate it",
    );
  });
}
