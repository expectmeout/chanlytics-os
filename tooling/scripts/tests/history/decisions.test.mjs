/**
 * Decision notes are numbered once, and listed with the state their note says (docs/naming.md, History;
 * docs/decisions/README.md).
 *
 * The numbers are handed out by hand and the index is typed by hand. Two pull requests have written the same number
 * (0018 twice, 0011 twice), and on 28 September 0017's row still said "Decided, not built" after its step 2 was built.
 * This holds what a reader of the index trusts: every note is named for a number of its own, which its heading says;
 * every note has one row, and every row a note; and each row's status says the state its note's status line says.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";

const DIR = path.join(ROOT, "docs/decisions");
const read = (file) => fs.readFileSync(path.join(DIR, file), "utf8").split("\r\n").join("\n");
const notes = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .sort();

/** The index's rows: `| [NNNN](file.md) | what it decides | its status |`. */
const rows = read("README.md")
  .split("\n")
  .map((line) => /^\|\s*\[(\d{4})\]\(([^)]+)\)\s*\|([^|]*)\|([^|]*)\|\s*$/.exec(line))
  .filter(Boolean)
  .map(([, number, file, decides, status]) => ({ number, file, decides: decides.trim(), status: status.trim() }));

/** A note's status line: the paragraph that opens with **Status:**, as one line, without its label; null with none. */
function statusOf(text) {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.startsWith("**Status:**"));
  if (at < 0) return null;
  const paragraph = [];
  for (let i = at; i < lines.length && lines[i].trim() !== ""; i++) paragraph.push(lines[i].trim());
  return paragraph.join(" ").replace(/^\*\*Status:\*\*\s*/, "");
}

/**
 * The state a status says, one of four: proposed; decided, not built; built, in part or whole; or decided, with
 * nothing built, or nothing to build. "Not built" ("not yet built", "nothing built yet") is read from the first
 * sentence, which says the note's own state; "built" from the first two, since a note decided first says next what of
 * it is built ("decided. M1 and M2 built", 0013). What comes after is the note's provenance, which may name other
 * notes' states.
 */
function stateOf(status) {
  const [first = "", second = ""] = status.split(/(?<=\.)\s+/);
  if (/^proposed\b/i.test(first)) return "proposed";
  if (/\b(not|nothing) (yet )?built\b/i.test(first)) return "decided, not built";
  if (/\b(built|merged)\b/i.test(`${first} ${second}`)) return "built";
  return "decided";
}

test("every note is named for a number of its own, NNNN-what-is-decided.md, and its heading says the number", () => {
  const misnamed = notes.filter((f) => !/^\d{4}-[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(f));
  assert.deepEqual(misnamed, [], "a note is NNNN-what-is-decided.md");
  const numbers = notes.map((f) => f.slice(0, 4));
  assert.deepEqual(
    numbers.filter((n, i) => numbers.indexOf(n) !== i),
    [],
    "one note per number: a number taken on main or by an open pull request is not reused",
  );
  for (const f of notes) assert.match(read(f).split("\n")[0], new RegExp(`^# ${f.slice(0, 4)} · \\S`), f);
});

test("every note has one row in the index, and every row names a note under its own number", () => {
  const listed = rows.map((r) => r.file);
  assert.deepEqual(
    notes.filter((f) => listed.filter((l) => l === f).length !== 1),
    [],
    "one row per note in docs/decisions/README.md",
  );
  assert.deepEqual(
    rows.filter((r) => !notes.includes(r.file) || r.file.slice(0, 4) !== r.number).map((r) => `${r.number} ${r.file}`),
    [],
    "a row points at the note of its number",
  );
});

test("every row's status says the state its note's status line says", () => {
  const disagree = [];
  for (const r of rows.filter((row) => notes.includes(row.file))) {
    const status = statusOf(read(r.file));
    if (status === null) disagree.push(`${r.number}: the note has no **Status:** line`);
    else if (stateOf(status) !== stateOf(r.status))
      disagree.push(`${r.number}: the note says ${stateOf(status)}, the index ${stateOf(r.status)}`);
  }
  assert.deepEqual(disagree, [], "change the row with the note's status line, in the same pull request");
});

test("a status's state, as the notes write it", () => {
  const cases = [
    [
      "decided, not built. Written against commit `b729bdf`, and verified against the code at it.",
      "decided, not built",
    ],
    ["Decided, not built (Reach out Part 5's PR 5 builds it)", "decided, not built"],
    // Not built yet, however the sentence says it: the word "built" in it is no step built.
    ["decided, not yet built. Written against commit `4bc3e49a7`.", "decided, not built"],
    ["decided; nothing built yet (its first pull request builds step 1).", "decided, not built"],
    ["proposed, not built; Ruben's to accept. Written against commit `519724e9c`.", "proposed"],
    // A proposal stays one when a step of it is built: whose word it waits on comes first.
    [
      "proposed by the naming review (its D1), taken with the plan's Phase 1; Ruben's confirmation is owed. Step 1 is built with this note.",
      "proposed",
    ],
    ["decided. M1 and M2 built (00217, #1192); M3 built (00218, #1195) on `76d28c6d`.", "built"],
    ["decided; P1 (the role) and P3 (the ledger) merged (#1151). Written against commit `b6f2216`.", "built"],
    ["Built with the note (00209, #1165)", "built"],
    // A later sentence naming another note's state is not this note's.
    ["built, steps 1 to 4 (#892). Step 5's items are their own notes: 0005 is decided and not built.", "built"],
    ["decided, and held from the change that wrote it. Written against `4bc3e49a7`.", "decided"],
  ];
  for (const [status, state] of cases) assert.equal(stateOf(status), state, status);
});
