/**
 * A rule whose `:has()` stands on a box above the element it styles (`.main:has(.inbox) .crumbs > …`) makes the browser
 * look again at the elements it styles whenever something might change what the `:has()` matches. Chrome keeps those
 * rules' elements in one set for the whole document, and where any of them names its element only by its place
 * (`> :first-child`, `> :not(:first-child)`, `> *`), it cannot narrow the set and styles the whole page again: a press
 * on People's tab restyled 6,693 elements before the page had moved, 0.3 s of a 4x-slowed CPU (5 Oct 2026), and 24 ms
 * over 183 once the nine such rules named their elements. So each names its element by a class, a tag or an attribute.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { transform } from "lightningcss";
import { ROOT } from "../_source.mjs";

/** Every stylesheet of the dashboard's. */
const sheets = (dir) =>
  fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? e.name === "node_modules"
          ? []
          : sheets(path.join(dir, e.name))
        : e.name.endsWith(".css")
          ? [path.join(dir, e.name)]
          : [],
    );

/** Whether a compound names its element by something a browser can look it up by: a class, a tag, an id or an attribute. */
const NAMED = (c) => c.type === "class" || c.type === "type" || c.type === "id" || c.type === "attribute";

/** A selector's compounds, split at its combinators. */
const compounds = (selector) => {
  const out = [[]];
  for (const c of selector) {
    if (c.type === "combinator") out.push([]);
    else out[out.length - 1].push(c);
  }
  return out;
};

/** The selectors whose `:has()` is on a box above the element they style, which they name only by its place. */
const wideHas = (text, filename) => {
  const found = [];
  transform({
    filename,
    code: Buffer.from(text),
    errorRecovery: true,
    visitor: {
      Selector(selector) {
        const parts = compounds(selector);
        const subject = parts[parts.length - 1];
        const above = parts.slice(0, -1);
        const anchored = above.some((p) => p.some((c) => c.type === "pseudo-class" && c.kind === "has"));
        if (anchored && !subject.some(NAMED)) found.push(JSON.stringify(selector).slice(0, 160));
      },
    },
  });
  return found;
};

test("the reader finds a :has() over an element named only by its place, and passes one named by its class or tag", () => {
  assert.equal(wideHas(".main:has(.x) .crumbs > :not(:first-child) { color: red }", "t.css").length, 1);
  assert.equal(wideHas(":root:has(.x) * { color: red }", "t.css").length, 1);
  assert.equal(wideHas(".main:has(.x) .crumbs > span:not(:first-child) { color: red }", "t.css").length, 0);
  assert.equal(wideHas(".main:has(.x) .pg-slot { color: red }", "t.css").length, 0);
  assert.equal(
    wideHas(".pg-slot:has(> nav) > nav > * { color: red }", "t.css").length,
    1,
    "a small box's :has() too: Chrome keeps one set",
  );
  assert.equal(wideHas(".pg-slot:has(> nav) > nav > a { color: red }", "t.css").length, 0);
  assert.equal(
    wideHas(".row:has(.x:focus-visible) { color: red }", "t.css").length,
    0,
    "a :has() on the element itself styles only it",
  );
});

test("no stylesheet puts a :has() above an element it names only by its place", () => {
  const files = [...sheets("apps/dashboard/src"), ...sheets("apps/dashboard/app")];
  assert.ok(files.length > 20, "the stylesheets were found");
  const offenders = files.flatMap((f) =>
    wideHas(fs.readFileSync(path.join(ROOT, f), "utf8"), f).map((s) => `${f.replace(/\\/g, "/")}: ${s}`),
  );
  assert.deepEqual(offenders, [], "name the element by a class, a tag or an attribute");
});
