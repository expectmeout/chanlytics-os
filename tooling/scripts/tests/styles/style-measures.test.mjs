/**
 * The interface kit's measures on stylesheets and modules written for them, small enough to count by hand
 * (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.7): a literal style value (_css.mjs), a class that
 * draws a primitive (_css.mjs, the kit's registry of names among them), and a style prop (_ast.mjs). Each branch of a
 * definition has a case that fails when the branch is taken away. And a guard that each measure sees the dashboard's
 * own files, so a parser that stopped reading them fails here instead of banking a zero.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { cssFacts, cssOf, isPrimitiveClass, isPrimitiveClassFor, strictFacts } from "../_css.mjs";
import { inlineStyles } from "../_ast.mjs";
import { MEASURES, TOKENS_CSS } from "../_measures.mjs";

const NONE = { font: 0, radius: 0, shadow: 0, colour: 0, blur: 0 };
const values = (css) => cssFacts(css).values;
const only = (field, n) => ({ ...NONE, [field]: n });

test("a font size written as a number counts once per declaration; one read from a token does not", () => {
  assert.deepEqual(values(".a { font-size: 12px; }"), only("font", 1));
  assert.deepEqual(values(".a { font-size: 0.9em; } .b { font-size: 90%; }"), only("font", 2));
  assert.deepEqual(values(".a { font: 500 13px/1.4 var(--font-sans); }"), only("font", 1));
  assert.deepEqual(values(".a { font-size: var(--text-sm); } .b { font-size: inherit; }"), NONE);
  assert.deepEqual(values("/* .a { font-size: 12px } */ .b { color: var(--ink); }"), NONE, "a comment is not a size");
});

test("a radius other than zero counts, on any corner; a reset and a token do not", () => {
  assert.deepEqual(values(".a { border-radius: 6px; }"), only("radius", 1));
  assert.deepEqual(values(".a { border-top-left-radius: 50%; }"), only("radius", 1));
  assert.deepEqual(values(".a { border-start-start-radius: 4px; }"), only("radius", 1));
  assert.deepEqual(values(".a { border-radius: 0; }"), NONE);
  assert.deepEqual(values(".a { border-radius: var(--radius-sm) 0 0 var(--radius-sm); }"), NONE);
});

test("a literal beside a token or as its fallback counts; a length in a page's own custom property is not seen", () => {
  assert.deepEqual(values(".a { border-radius: var(--radius-md, 8px); }"), only("radius", 1));
  assert.deepEqual(values(".a { border-radius: calc(var(--radius-md) - 1px); }"), only("radius", 1));
  assert.deepEqual(values(".a { --r: 6px; border-radius: var(--r); }"), NONE);
});

test("a shadow that holds a length or a colour counts; none and one token alone do not", () => {
  assert.deepEqual(values(".a { box-shadow: none; } .b { box-shadow: var(--shadow-md); }"), NONE);
  assert.deepEqual(values(".a { box-shadow: 0 0 0 1px var(--line); }"), only("shadow", 1));
  assert.deepEqual(values(".a { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); }"), { ...NONE, shadow: 1, colour: 1 });
  assert.deepEqual(values(".a { box-shadow: 0 0 0 0 #fff; }"), { ...NONE, shadow: 1, colour: 1 }, "a colour alone");
  assert.deepEqual(values(".a { text-shadow: 0 1px 0 #fff; }"), { ...NONE, shadow: 1, colour: 1 });
});

test("a colour written as a value counts wherever it is; currentColor, transparent and a colour made from a token do not", () => {
  assert.deepEqual(values(".a { color: #fff; } .b { color: white; }"), only("colour", 2));
  assert.deepEqual(values(".a { --plate: #123456; }"), only("colour", 1), "a custom property's literal is a literal");
  assert.deepEqual(values(".a { --plate: white; }"), only("colour", 1), "a named colour kept as a word");
  assert.deepEqual(values(".a { color: var(--ink, white); }"), only("colour", 1), "a named colour as a fallback");
  assert.deepEqual(values(".a { background: linear-gradient(#fff, #000); }"), only("colour", 2));
  assert.deepEqual(values(".a { color: currentColor; } .b { background: transparent; }"), NONE);
  assert.deepEqual(values(".a { background: oklch(from var(--ink) l c h / 0.3); }"), NONE);
  assert.deepEqual(values(".a { background: color-mix(in oklch, var(--ink) 20%, transparent); }"), NONE);
  assert.deepEqual(values(".a { border: 1px solid var(--line); outline: none; }"), NONE);
  assert.deepEqual(
    values(".a { transition: background var(--duration-fast) linear; }"),
    NONE,
    "a word is not a colour",
  );
});

test("a side shorthand counts each colour it names once, and a mask's colours are not counted", () => {
  assert.deepEqual(values(".a { border-color: #ddd; }"), only("colour", 1));
  assert.deepEqual(values(".a { border-color: #ddd #eee; }"), only("colour", 2));
  assert.deepEqual(values(".a { border-inline-color: #ddd; }"), only("colour", 1));
  assert.deepEqual(values(".a { mask-image: linear-gradient(#000, transparent); }"), NONE);
  assert.deepEqual(values(".a { -webkit-mask-image: linear-gradient(to bottom, #000 80%, transparent); }"), NONE);
});

test("a blur other than zero counts in filter and backdrop-filter, prefixed or not; blur(0) and a token do not", () => {
  assert.deepEqual(values(".a { backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }"), only("blur", 2));
  assert.deepEqual(values(".a { filter: blur(2px); }"), only("blur", 1));
  assert.deepEqual(values(".a { backdrop-filter: blur(12px) saturate(var(--glass-sat)); }"), only("blur", 1));
  assert.deepEqual(values(".a { filter: blur(0); } .b { backdrop-filter: blur(var(--blur-md)); }"), NONE);
});

test("a stylesheet the parser cannot read whole is refused, not measured in part", () => {
  assert.ok(cssFacts(".a { color: var(--ink); } } .b { font-size: 12px; }").warnings.length > 0);
  assert.throws(() => strictFacts(".a { color: var(--ink); } } .b { font-size: 12px; }", "broken.css"), /broken\.css/);
  assert.doesNotThrow(() => strictFacts(".a { color: var(--ink); }", "whole.css"));
});

test("a class draws a primitive when one of its words names one or it is a kit name, and a class in a comment is none", () => {
  const { classes } = cssFacts(
    "/* .fake-chip { } */ .pl-peek .btn, .x:is(.pl-chip) { color: var(--ink); } .cl-row { }",
  );
  assert.deepEqual(classes, { "pl-peek": 1, btn: 1, x: 1, "pl-chip": 1, "cl-row": 1 });
  assert.deepEqual(Object.keys(classes).filter(isPrimitiveClass).sort(), ["btn", "pl-chip", "pl-peek"]);
  const primitives = ["rec-seg", "rec-fold", "more-item", "live-dot", "stabs-settings", "confirm-block", "mark"];
  for (const name of [...primitives, "ix-thread-avatar", "cl-search-wrap", "pp-toast-x", "ui-tip", "tbn-backdrop"]) {
    assert.ok(isPrimitiveClass(name), `${name} draws a primitive`);
  }
  for (const name of ["cl-row", "chiptune", "pipe-track", "main-scroll", "record-row"]) {
    assert.ok(!isPrimitiveClass(name), `${name} draws none: a word counts whole, never a part of one`);
  }
  for (const name of ["cl-seg-card", "ld-search-row", "maplibregl-ctrl-attrib-button"]) {
    assert.ok(!isPrimitiveClass(name), `${name} is a homonym: its words say primitive, its job is not one`);
  }
});

test("a class the kit's registry lists is a primitive whatever its words", () => {
  // The registry's names are all primitives by their words today (styles/kit-css.test.mjs holds the list), so the
  // branch is shown on a name of its own.
  const withKit = isPrimitiveClassFor(new Set(["frame-rim"]));
  assert.ok(withKit("frame-rim"), "a name the registry lists, though no word of it names a primitive");
  assert.ok(!withKit("frame-top"), "a name it does not list is read by its words");
});

test("a style prop counts on an element or a component; another prop, a style key or the word in a string does not", () => {
  const sf = ts.createSourceFile(
    "fixture.jsx",
    [
      'const a = <div className="x" style={{ color: "var(--ink)" }} />;',
      'const b = <Card title="t" style={held} />;',
      'const c = <p className="y" data-x="1" />;',
      "const d = { style: 1 };",
      'const e = "style={x}";',
    ].join("\n"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );
  assert.equal(inlineStyles(sf), 2);
});

test("the measures see the dashboard's stylesheets and the shell's markup, and leave the tokens alone", () => {
  const components = "apps/dashboard/src/legacy/styles/components.css";
  const { values: v, classes } = cssOf(components);
  assert.ok(v.font > 0 && v.radius > 0, "components.css parsed, and its written sizes were found");
  assert.ok(classes.btn > 0, "its selectors were read");
  const measure = (name) => MEASURES.find((m) => m.name === name).measure();
  const styleValues = measure("literal style values");
  assert.ok(styleValues[components], "the shared stylesheet is measured");
  assert.equal(styleValues[TOKENS_CSS], undefined, "the tokens are where a literal belongs");
  const primitives = measure("primitives outside the kit");
  assert.ok(primitives[`${components}::btn`] > 0, "the button is a primitive outside the kit");
  assert.ok(primitives["apps/dashboard/src/legacy/styles/leads.css::btn"] > 0, "a page that restyles it is counted");
  const inline = Object.keys(measure("inline style props"));
  assert.ok(
    inline.some((f) => f.startsWith("apps/dashboard/src/legacy/pages/")),
    "the pages' markup is measured",
  );
  assert.ok(
    inline.every((f) => /^apps\/dashboard\/src\/(legacy|surfaces)\//.test(f)),
    "and only the shell's: the app's error screens are not held",
  );
});
