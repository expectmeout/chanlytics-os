/**
 * A button that is only an icon has a name a screen reader can say.
 *
 * A `title` is shown on hover and read by some readers, never by a phone's touch, and a `data-tip` is not a name at all;
 * `aria-label` is. The rule is held on the markup a workspace draws (the shell's pages and components, the bridge's own
 * screens, the surfaces that left the shell); the mockup's demo pages are not a workspace's. Measured on the syntax
 * tree, never the text, and it holds at none: a new icon-only button without a label is a red build.
 *
 * jsx-a11y's own rules cannot say it (its recommended set has no rule for a name), so the lint baseline never sees it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { parse, repoFiles } from "../../_ast.mjs";

const TREES = ["apps/dashboard/src/legacy", "apps/dashboard/src/legacy-bridge", "apps/dashboard/src/surfaces"];
const files = repoFiles(TREES, { keep: /\.(jsx|tsx)$/ }).filter((f) => !f.includes("/legacy/demo/"));

const hasAttr = (open, name) =>
  open.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText() === name);
/** A spread may carry the label (`{...props}`): it is not judged here, only what is written out. */
const hasSpread = (open) => open.attributes.properties.some((a) => ts.isJsxSpreadAttribute(a));
const isIcon = (child) => ts.isJsxSelfClosingElement(child) && /^(Icon|Glyph)/.test(child.tagName.getText());
const blank = (child) => ts.isJsxText(child) && child.getText().trim() === "";

/** The buttons and links in a source file whose only content is an icon, and that name themselves by nothing written out. */
function unnamedIconControls(sf, file) {
  const found = [];
  const visit = (n) => {
    if (ts.isJsxElement(n)) {
      const open = n.openingElement;
      const tag = open.tagName.getText();
      const content = n.children.filter((c) => !blank(c));
      if (
        (tag === "button" || tag === "a") &&
        content.length > 0 &&
        content.every(isIcon) &&
        !hasAttr(open, "aria-label") &&
        !hasAttr(open, "aria-labelledby") &&
        !hasSpread(open)
      ) {
        found.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

test("every icon-only button in what a workspace draws carries an aria-label", () => {
  // The count is not the point; a scan that found no markup would pass vacuously.
  assert.ok(files.length >= 100, `found only ${files.length} markup files; the scan has stopped seeing them`);
  assert.deepEqual(
    files.flatMap((f) => unnamedIconControls(parse(f), f)),
    [],
    "name it: aria-label={…}, beside its title",
  );
});

test("the scan sees an unnamed icon button, and a named one is not one", () => {
  const probe = (code) =>
    unnamedIconControls(
      ts.createSourceFile("probe.jsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX),
      "probe",
    ).length;
  assert.equal(probe(`const a = <button title="Menu"><Icon name="menu" /></button>;`), 1);
  assert.equal(probe(`const a = <a href="/x" title="Menu"><Icon name="menu" /></a>;`), 1);
  assert.equal(probe(`const a = <button aria-label="Menu"><Icon name="menu" /></button>;`), 0);
  assert.equal(
    probe(`const a = <button title="Menu"><Icon name="menu" /> Menu</button>;`),
    0,
    "it says its name in words",
  );
});
