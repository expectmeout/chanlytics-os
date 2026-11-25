/**
 * A rule whose `:has()` stands on a box above the element it styles (`.main:has(.inbox) .crumbs > …`) makes the browser
 * look again at the elements it styles whenever something might change what the `:has()` matches. Chrome keeps those
 * rules' elements in one set for the whole document, and where any of them names its element only by its place
 * (`> :first-child`, `> :not(:first-child)`, `> *`), it cannot narrow the set and styles the whole page again: a press
 * on People's tab restyled 6,693 elements before the page had moved, 0.3 s of a 4x-slowed CPU (5 Oct 2026), and 24 ms
 * over 183 once the nine such rules named their elements. So each names its element by a class, a tag or an attribute.
 *
 * Two more were found on 24 November 2026, which the reader then missed: their `:has()` stood inside a `:where()` and
 * a `:not()` on the box above (`.rec-sheet-foot:where(:has(.rec-foot)) > :where(:not(…))`,
 * `.calm-fold > :first-child:not(:has(> :nth-child(4))) > :first-child`), and every change to any page had the whole
 * document styled again: a tenth to a fifth of a press's style time on a slow phone. A `:has()` is read wherever in
 * the box's own words it stands. And an element is named, too, by a `:where()` or an `:is()` whose every alternative
 * names it (`:where(div, p, span)`): the browser narrows by those (seen in its own trace that day), and a `:where()`
 * adds nothing to what the rule weighs, so a rule can name its element and outrank nothing it did not before.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { transform } from "lightningcss";
import ts from "typescript";
import { parse, repoFiles } from "../_ast.mjs";
import { ROOT } from "../_source.mjs";

/** Every stylesheet of the dashboard's. */
const sheets = (dir) =>
  fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? e.name === "node_modules" || (dir.endsWith("public") && e.name === "sheets")
          ? []
          : sheets(path.join(dir, e.name))
        : e.name.endsWith(".css")
          ? [path.join(dir, e.name)]
          : [],
    );

/** A selector's compounds, split at its combinators. */
const compounds = (selector) => {
  const out = [[]];
  for (const c of selector) {
    if (c.type === "combinator") out.push([]);
    else out[out.length - 1].push(c);
  }
  return out;
};

/**
 * Whether a compound names its element by something a browser can look it up by: a class, a tag, an id or an attribute,
 * or a `:where()` or `:is()` each of whose alternatives ends on a compound that does.
 */
const named = (compound) =>
  compound.some(
    (c) =>
      c.type === "class" ||
      c.type === "type" ||
      c.type === "id" ||
      c.type === "attribute" ||
      (c.type === "pseudo-class" &&
        (c.kind === "where" || c.kind === "is") &&
        c.selectors.length > 0 &&
        c.selectors.every((alternative) => named(compounds(alternative).at(-1)))),
  );

/** Whether a compound holds a `:has()`, itself or inside a pseudo-class that takes selectors (`:where()`, `:not()`, `:is()`). */
const hasHas = (compound) =>
  compound.some(
    (c) =>
      c.type === "pseudo-class" &&
      (c.kind === "has" || (Array.isArray(c.selectors) && c.selectors.some((inner) => compounds(inner).some(hasHas)))),
  );

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
        if (above.some(hasHas) && !named(subject)) found.push(JSON.stringify(selector).slice(0, 160));
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
  // A :has() inside the box's :where() or :not() is a :has() on the box (the two of 24 Nov 2026, as they were written).
  assert.equal(
    wideHas(".foot:where(:has(.pair)) > :where(:not(.pair, :has(.pair))) { color: red }", "t.css").length,
    1,
  );
  assert.equal(
    wideHas(".fold > :first-child:not(:has(> :nth-child(4))) > :first-child { color: red }", "t.css").length,
    1,
  );
  assert.equal(wideHas(".fold > :first-child:not(:has(> :nth-child(4))) > .mark { color: red }", "t.css").length, 0);
  // Named inside a :where(): every alternative a tag or a class; one alternative that names nothing leaves it unnamed.
  assert.equal(
    wideHas(".foot:where(:has(.pair)) > :where(div, p):where(:not(.pair)) { color: red }", "t.css").length,
    0,
  );
  assert.equal(wideHas(".foot:where(:has(.pair)) > :where(div, :first-child) { color: red }", "t.css").length, 1);
});

test("no stylesheet puts a :has() above an element it names only by its place", () => {
  const files = [...sheets("apps/dashboard/src"), ...sheets("apps/dashboard/app")];
  assert.ok(files.length > 20, "the stylesheets were found");
  const offenders = files.flatMap((f) =>
    wideHas(fs.readFileSync(path.join(ROOT, f), "utf8"), f).map((s) => `${f.replace(/\\/g, "/")}: ${s}`),
  );
  assert.deepEqual(offenders, [], "name the element by a class, a tag or an attribute");
});

/* ---- the foot's lines: named by every tag the app draws ---- */

/**
 * The tags that are never a foot's line: the document's own, and those that stand only inside another element of their
 * own kind (a drawing, a table, a list, a choice).
 */
const INSIDE_ONLY = new Set(
  "html head body script link style path circle rect g text line stop defs linearGradient td th tr tbody thead col colgroup li option dd dt summary figcaption".split(
    " ",
  ),
);

/** The tags a selector's last compound names inside its `:where()`s. */
function tagsNamed(css, opens) {
  const tags = new Set();
  transform({
    filename: "kit.css",
    code: Buffer.from(css),
    errorRecovery: true,
    visitor: {
      Selector(selector) {
        const parts = compounds(selector);
        if (!parts[0].some((c) => c.type === "class" && c.name === opens) || parts.length < 2 || !hasHas(parts[0]))
          return;
        for (const c of parts.at(-1)) {
          if (c.type !== "pseudo-class" || c.kind !== "where") continue;
          for (const alternative of c.selectors)
            for (const inner of alternative) if (inner.type === "type") tags.add(inner.name);
        }
      },
    },
  });
  return tags;
}

/** Every tag the dashboard's own markup draws. */
function tagsDrawn() {
  const drawn = new Set();
  for (const file of repoFiles(["apps/dashboard/src", "apps/dashboard/app"], { keep: /\.tsx$/ })) {
    const visit = (node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        ts.isIdentifier(node.tagName) &&
        /^[a-z]/.test(node.tagName.text)
      )
        drawn.add(node.tagName.text);
      ts.forEachChild(node, visit);
    };
    visit(parse(file));
  }
  return drawn;
}

test("a sheet's foot names its lines by every tag the app draws: a tag left out would lose its inset on a phone", () => {
  // The rule styled "whatever in the foot is not the pair"; named by tag it styles only the tags it lists, so the list
  // is every tag a page could put there. A tag the app starts to draw is added to the rule (kit.css, .rec-sheet-foot).
  const kit = fs.readFileSync(path.join(ROOT, "apps/dashboard/src/surfaces/kit/kit.css"), "utf8");
  const listed = tagsNamed(kit, "rec-sheet-foot");
  assert.ok(listed.has("div") && listed.has("p") && listed.size > 20, "the rule's tags were read");
  const drawn = [...tagsDrawn()].filter((tag) => !INSIDE_ONLY.has(tag));
  assert.ok(drawn.includes("span") && drawn.length > 30, "the app's tags were read");
  assert.deepEqual(
    drawn.filter((tag) => !listed.has(tag)).sort(),
    [],
    "add the tag to the foot's rule in kit.css (.rec-sheet-foot:where(:has(.rec-foot)) > :where(…))",
  );
  // The check, where it must find something: a rule that leaves a tag out.
  const short = tagsNamed(
    ".rec-sheet-foot:where(:has(.rec-foot)) > :where(div, p):where(:not(.x)) { color: red }",
    "rec-sheet-foot",
  );
  assert.deepEqual([...short].sort(), ["div", "p"]);
});
