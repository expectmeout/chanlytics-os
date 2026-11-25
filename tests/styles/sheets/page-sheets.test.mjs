/**
 * Each page its own styles (apps/dashboard/src/styles/page-sheets.ts and write-page-sheets.ts): what a page's code can
 * draw is read from the code, and a stylesheet's files are nested, so the cascade reads as it did in one file.
 *
 * The parts are run here on small sources, and the writer on the app itself, into a folder of its own:
 *
 * - a module is read as TypeScript reads it: what it loads (a type's import aside), every word of its strings, and the
 *   pieces a name is built on;
 * - a rule is a page's where one of its selectors needs only classes the page's code writes, a class inside `:is()`,
 *   `:not()` or `:has()` asked of nobody;
 * - a stylesheet's files hold each other in turn, and each page links the first that holds all it reaches;
 * - on the app: every page under app/(os) has files, a page's own stylesheet is its own (the Inbox's rules are not
 *   Reports'), every file a page links is one the writer wrote, in the order of the list, and nothing of the frame is
 *   left out of a page (the kit is every page's).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { transform } from "lightningcss";
import { ROOT } from "../../_source.mjs";
import {
  levelsOf,
  neededClasses,
  pageKeyOf,
  pageReachOf,
  readModule,
  writtenBy,
} from "../../../apps/dashboard/src/styles/page-sheets.ts";
import { writePageSheets } from "../../../apps/dashboard/src/styles/write-page-sheets.ts";

/** A stylesheet's rules as the split reads them: what each selector needs. */
function sheetRulesIn(css) {
  const rules = [];
  transform({
    filename: "t.css",
    code: Buffer.from(css),
    visitor: {
      Rule: { style: (rule) => void rules.push({ needs: rule.value.selectors.map(neededClasses), weight: 1 }) },
    },
  });
  return rules;
}

test("a module is read for what it loads, the words of its strings and the names it builds", () => {
  const read = readModule(
    [
      'import { a } from "./a";',
      'import type { T } from "./types";',
      'import "./side";',
      'export { b } from "@/b";',
      'export type { U } from "./more-types";',
      'const lazy = () => import("./lazy");',
      'type Later = typeof import("./never-loaded");',
      '// a comment that says it\'s "cl-ghost" draws nothing',
      'export const Row = ({ kind, on }: P) => <div className={`cl-row ${on ? "is-on" : ""} tone-${kind}`}>it\'s</div>;',
      'const built = "pill-" + kind;',
      'const whole = "ends-in-a-hyphen-";',
    ].join("\n"),
    true,
  );
  assert.deepEqual(read.imports, ["./a", "./side", "@/b", "./lazy"], "a type's import loads nothing");
  for (const word of ["cl-row", "is-on"]) assert.ok(read.words.includes(word), word);
  assert.ok(!read.words.includes("cl-ghost"), "a comment writes nothing");
  assert.deepEqual(
    read.stems.sort(),
    ["pill-", "tone-"],
    "a piece with something joined after it; a whole string is a word",
  );
});

test("a rule is a page's where one of its selectors needs only classes the page's code writes", () => {
  const rules = sheetRulesIn(
    [
      ".cl-row { color: red }",
      ".cl-row .btn { color: red }",
      ".ix-thread, .cl-row.is-on { color: red }",
      ".main:has(> .inbox) .crumbs { color: red }",
      ":is(.ix-a, .ix-b) > span:not(.ix-c) { color: red }",
      "button[data-x] { color: red }",
      ".tone-warn { color: red }",
      "@media (max-width: 900px) { .ix-thread { color: red } }",
    ].join("\n"),
  );
  const people = writtenBy([{ imports: [], words: ["cl-row", "btn", "is-on", "main", "crumbs"], stems: ["tone-"] }]);
  assert.deepEqual(pageReachOf(rules, people), [true, true, true, true, true, true, true, false]);
  const nobody = writtenBy([]);
  assert.deepEqual(
    pageReachOf(rules, nobody),
    [false, false, false, false, true, true, false, false],
    "a rule that needs no class is everyone's",
  );
});

test("a stylesheet's files are nested, and a page links the first that holds all it reaches", () => {
  const rules = Array.from({ length: 10 }, () => ({ needs: [[]], weight: 1 }));
  const pick = (...kept) => rules.map((_, at) => kept.includes(at));
  const frame = pick(0, 1);
  const pages = {
    reports: pick(0, 1),
    today: pick(0, 1, 2),
    people: pick(0, 1, 2, 3, 4, 5, 6, 7),
    console: pick(),
    odd: pick(1),
  };
  const { levels, of } = levelsOf(rules, frame, pages);
  assert.deepEqual(levels[0], pick(0, 1), "the frame's part");
  assert.deepEqual(levels[1], pick(0, 1, 2), "with what a page reaching a little adds");
  assert.deepEqual(levels[2], pick(0, 1, 2, 3, 4, 5, 6, 7), "every rule a page reaches; 8 and 9 are nobody's");
  assert.deepEqual(of, { reports: 0, today: 1, people: 2, console: -1, odd: 0 });
  for (let depth = 1; depth < levels.length; depth++) {
    assert.ok(
      levels[depth - 1].every((kept, at) => !kept || levels[depth][at]),
      `file ${depth} holds file ${depth - 1}`,
    );
  }
  for (const [page, reach] of Object.entries(pages)) {
    if (of[page] >= 0)
      assert.ok(
        reach.every((kept, at) => !kept || levels[of[page]][at]),
        `${page} has all it reaches`,
      );
  }
});

test("a page's key is its folders, the workspace's and a segment in brackets left out", () => {
  assert.equal(pageKeyOf("w/[workspace]/people/[[...param]]/page.tsx"), "people");
  assert.equal(pageKeyOf("w\\[workspace]\\today\\page.tsx"), "today");
  assert.equal(pageKeyOf("w/[workspace]/[[...route]]/page.tsx"), "route");
  assert.equal(pageKeyOf("console/[[...route]]/page.tsx"), "console");
  assert.equal(pageKeyOf("page.tsx"), "home");
});

/* ---- the writer, on the app ---- */

test("the writer gives every page of the frame its files, in the list's order, a page's own stylesheet to that page alone", (t) => {
  // Into a folder of the test's own: the app's public one is a build's.
  const written = fs.mkdtempSync(path.join(os.tmpdir(), "page-sheets-"));
  t.after(() => fs.rmSync(written, { recursive: true, force: true }));
  const app = path.join(ROOT, "apps/dashboard");
  const manifest = writePageSheets(app, "split", written);
  const pages = Object.keys(manifest.pages);
  for (const page of [
    "today",
    "inbox",
    "people",
    "calendar",
    "campaigns",
    "reports",
    "settings",
    "start",
    "route",
    "home",
    "console",
  ])
    assert.ok(pages.includes(page), `${page} is a page of the frame`);
  const text = (place) => fs.readFileSync(path.join(written, path.basename(manifest.files[place][1])), "utf8");
  for (const [page, places] of Object.entries(manifest.pages)) {
    assert.ok(places.length > 0, `${page} links files`);
    assert.deepEqual(
      [...places].sort((a, b) => a - b),
      places,
      `${page}: in the cascade's order`,
    );
    assert.equal(new Set(places).size, places.length, `${page}: each once`);
  }
  const slots = manifest.files.map(([slot]) => slot);
  assert.deepEqual([...slots].sort(), slots, "the files' precedences are in the cascade's order");
  assert.equal(new Set(slots).size, slots.length);
  const holds = (page, needle) => manifest.pages[page].some((place) => text(place).includes(needle));
  // The kit is every page's; a page's own stylesheet is its own.
  for (const page of pages) assert.ok(holds(page, ".btn{") || holds(page, ".btn,"), `${page} has the kit's button`);
  assert.ok(holds("inbox", ".ix-thread-line1"), "the Inbox has its list's rules");
  assert.ok(!holds("reports", ".ix-thread-line1"), "Reports has none of the Inbox's list");
  // The Calendar links the whole of its own; the Inbox the part of it the frame and a visit's sheet can draw, a smaller file.
  const calendarOf = (page) =>
    manifest.pages[page].filter((place) => path.basename(manifest.files[place][1]).startsWith("calendar"));
  assert.equal(calendarOf("calendar").length, 1, "the Calendar has its own, one file");
  assert.equal(calendarOf("inbox").length, 1, "and the Inbox one of the Calendar's");
  assert.ok(
    text(calendarOf("inbox")[0]).length < text(calendarOf("calendar")[0]).length,
    "the smaller: its part of it",
  );
  assert.ok(text(calendarOf("calendar")[0]).includes(".cal-body"));
  // Today draws the Inbox's thread in a sheet: it has the thread's rules, by its imports.
  assert.ok(holds("today", ".tl-msg"), "Today has the thread it can open");
  // The map's is no page's: the map links it.
  assert.ok(
    manifest.apart.map >= 0 && !Object.values(manifest.pages).some((places) => places.includes(manifest.apart.map)),
  );
  // And the development server's: every stylesheet whole, for every page, under names that never change.
  const whole = writePageSheets(app, "whole", written);
  assert.ok(
    whole.files.every(([, href]) => /^\/sheets\/[a-z0-9-]+\.css$/.test(href)),
    "no hash in a name",
  );
  for (const page of pages)
    assert.equal(whole.pages[page].length, whole.files.length - 1, `${page}: every one but the map's`);
});
