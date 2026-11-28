/**
 * A store in the tab says whose it is (the reviews of 28 Nov 2026: R2.10, R3.12).
 *
 * The pages read no window since decision 0151: what they read is held in modules' own variables, 380-odd of them across
 * the browser's code. Some are the tab's own working. Some hold one workspace's records, and of those a part is kept
 * under the workspace the address names, and a part is right only because a switch of workspace loads the page again.
 * Nothing said which was which, so the day a switch stops loading the page nobody would know what shows the last
 * workspace's rows.
 *
 * The rule: every variable a module keeps at its top level and can change has a row in tab-stores.json that says whose it
 * is, in one of five words (the list's own head says what each means). This finds them in the syntax tree (_stores.mjs)
 * and fails on a store with no row, on a row for a store that is gone, and on a word that is none of the five. What each
 * word promises is run, not read: the bridge's keyed stores each have the address moved under them with nothing loaded
 * again (tests/shell/surfaces/read-cache.test.mjs, held-views.test.mjs, tab-memory.test.mjs, surface-cache.test.mjs), and
 * a-switch-is-a-new-document.test.mjs holds the reload that every "new document" row leans on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ROOT } from "../../_source.mjs";
import { STORE_MAKERS, browserStores, storesIn } from "./_stores.mjs";

const LIST = "tests/shell/stores/tab-stores.json";
const KINDS = ["tab", "keyed", "by record", "emptied", "new document"];
const listed = JSON.parse(fs.readFileSync(path.join(ROOT, LIST), "utf8")).stores;
const found = browserStores();

/** A module's stores as the finder reads them, from its text: the names, in the module's order. */
const storesOf = (text) =>
  storesIn(ts.createSourceFile("made-up.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)).map((s) => s.name);

test("the finder finds what a module keeps and can change, and nothing it only reads", () => {
  assert.deepEqual(storesOf("let last: Rows | null = null;\nexport let shared = 0;"), ["last", "shared"], "any let");
  assert.deepEqual(
    storesOf("const byId = new Map<string, Row>();\nconst seen = new Set();\nconst rows = new Array<Row>();"),
    ["byId", "seen", "rows"],
    "an empty container is there to be filled",
  );
  assert.deepEqual(
    storesOf("const held = { rows: null };\nfunction keep(r) { held.rows = r; }\nconst WORDS = { a: 1 };"),
    ["held"],
    "a table written out is a store only where the module changes it",
  );
  assert.deepEqual(
    storesOf(
      "const queue = [1];\nqueue.push(2);\nconst TABLE = new Map([[1, 2]]);\nconst live = new Set([1]);\nlive.delete(1);",
    ),
    ["queue", "live"],
    "one made with something in it, the same",
  );
  assert.deepEqual(
    storesOf(
      "const counts = { n: 0 };\ncounts.n++;\nconst gone = { a: 1 };\ndelete gone.a;\nconst given = {};\nObject.assign(given, { a: 1 });",
    ),
    ["counts", "gone", "given"],
    "a step, a delete and Object.assign change it too",
  );
  assert.deepEqual(
    storesOf("const NONE: ReadonlySet<string> = new Set();\nconst EMPTY: readonly string[] = [];"),
    [],
    "one its type says is never written holds what it was made with",
  );
  assert.deepEqual(
    storesOf('const people = readCache<Person>("person");\nconst views = heldViews<View>(8);\nconst made = other();'),
    ["people", "views"],
    "a store maker's store, whose variables are inside the maker",
  );
  assert.deepEqual(storesOf("function page() { let inside = 0; const kept = new Map(); }"), [], "top level only");
  assert.deepEqual(STORE_MAKERS, ["readCache", "heldViews"]);
});

test("every store has a row that says whose it is", () => {
  const silent = [];
  for (const [file, stores] of Object.entries(found))
    for (const { name, kind, line } of stores)
      if (listed[file]?.[name] === undefined) silent.push(`${file}:${line}  ${name}  (${kind})`);
  assert.deepEqual(
    silent,
    [],
    `${silent.length} store(s) in the browser's code say nothing of whose they are. Give each a row in ${LIST}: ` +
      `"tab" where it holds nothing of a workspace's records; else "keyed" (under the workspace the address names: ` +
      `readCache, heldViews, or a compare of its own), "by record" (under a record's own id, and only asked for by it), ` +
      `"emptied" (by the switch itself) or "new document" (right only because a switch loads the page again).`,
  );
});

test("every row is of a store that is there, and says one of the five words", () => {
  const gone = [];
  const unsaid = [];
  for (const [file, rows] of Object.entries(listed)) {
    const there = new Set((found[file] ?? []).map((s) => s.name));
    for (const [name, whose] of Object.entries(rows)) {
      if (!there.has(name)) gone.push(`${file}  ${name}`);
      if (!KINDS.includes(whose)) unsaid.push(`${file}  ${name}: "${whose}"`);
    }
  }
  assert.deepEqual(gone, [], `rows in ${LIST} for stores that are gone, or renamed: take each out, or name it anew`);
  assert.deepEqual(unsaid, [], `a row says one of: ${KINDS.join(", ")}`);
});

test("a store made by a store maker is keyed, since the maker keeps each workspace's apart", () => {
  const off = [];
  for (const [file, stores] of Object.entries(found))
    for (const { name, kind } of stores)
      if (STORE_MAKERS.some((maker) => kind === `${maker}()`) && listed[file]?.[name] !== "keyed")
        off.push(`${file}  ${name}: "${listed[file]?.[name]}"`);
  assert.deepEqual(off, []);
});

test("the list says how many stores are of each kind, and which lean on the reload", (t) => {
  const counts = Object.fromEntries(KINDS.map((kind) => [kind, 0]));
  for (const rows of Object.values(listed)) for (const whose of Object.values(rows)) counts[whose] += 1;
  t.diagnostic(`stores by whose they are: ${KINDS.map((kind) => `${kind} ${counts[kind]}`).join(", ")}`);
  // The bridge's own keyed stores are proven by running them; none is emptied by a switch today, which loads the page.
  assert.ok(counts.keyed > 0 && counts.tab > 0);
});
