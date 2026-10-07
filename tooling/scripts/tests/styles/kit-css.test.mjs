/**
 * The kit's stylesheet and the registry of its names (apps/dashboard/src/surfaces/kit/kit.css and classes.json;
 * docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.3 and §3.4), read as CSS by the parser the build uses.
 *
 * - The registry and the stylesheet agree. Every class kit.css declares is listed, and every listed name is a class a
 *   stylesheet of the dashboard names and a primitive by its own words, or else one kit.css declares: the measures
 *   count a listed name as a primitive whatever its words (_css.mjs), so a name only the registry makes a primitive
 *   must be the kit's. A class kit.css names that draws nothing of its own (a state such as .btn.danger, the Icon's
 *   .icon inside a button) is listed apart, as a modifier, which the measures never read: a page's own .danger or
 *   .active is not a primitive. A modifier is one kit.css declares, and no primitive by its words.
 * - One phone breakpoint. Every width an @media in kit.css names is 900px, the phone as (max-width: 900px) and the
 *   desk as (width > 900px). A query that names no width (reduced motion, reduced transparency: §3.1) is no breakpoint.
 * - The pages outside the shell load the kit when one of them draws it (§3.3). A module of theirs (app/ but its (os)
 *   group, which the shell draws; src/auth; src/yes) that writes a kit class in a className, or imports the kit's
 *   components, which write them, needs kit.css among app/globals.css's imports. None draws it yet, and
 *   repo/legacy-harness.test.mjs holds globals.css to the tokens alone until one does.
 *
 * Each check also runs on fixtures, where it must find what it looks for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { transform } from "lightningcss";
import ts from "typescript";
import { cssOf, isPrimitiveClassFor, KIT_REGISTRY } from "../_css.mjs";
import { parse, repoFiles } from "../_ast.mjs";
import { ROOT } from "../_source.mjs";

const KIT_CSS = "apps/dashboard/src/surfaces/kit/kit.css";
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, KIT_REGISTRY), "utf8"));
const listed = registry.classes;
const modifiers = registry.modifiers;

/** A primitive by its words and the house's kit prefixes, the registry left out. */
const byItsWords = isPrimitiveClassFor(new Set());

/** Where the registry and the kit's stylesheet disagree: a class kit.css declares and neither list has; a listed name
 *  that is a primitive only because it is listed, though kit.css does not declare it; and a modifier kit.css does not
 *  declare, or one that is a primitive by its words or listed as one too. */
const disagreements = (names, declared, apart = []) => ({
  unlisted: declared.filter((name) => !names.includes(name) && !apart.includes(name)),
  unearned: names.filter((name) => !byItsWords(name) && !declared.includes(name)),
  misfiled: apart.filter((name) => !declared.includes(name) || byItsWords(name) || names.includes(name)),
});

test("the registry lists each name once, and each is a class a stylesheet of the dashboard names", () => {
  assert.ok(listed.length > 0 && Array.isArray(modifiers), `${KIT_REGISTRY} was read`);
  const all = [...listed, ...modifiers];
  assert.equal(new Set(all).size, all.length, "each name once");
  const named = new Set(
    repoFiles(["apps/dashboard"], { keep: /\.css$/ }).flatMap((f) => Object.keys(cssOf(f).classes)),
  );
  assert.deepEqual(
    all.filter((name) => !named.has(name)),
    [],
    "a name no stylesheet of the dashboard names is a slip in the list",
  );
});

test("the registry and kit.css agree: a class kit.css declares is listed, and a listed name is a primitive by its words or kit.css's", () => {
  const none = { unlisted: [], unearned: [], misfiled: [] };
  assert.deepEqual(disagreements(listed, Object.keys(cssOf(KIT_CSS).classes), modifiers), none);
  // The checks, where each must find something: a kit class left out of the list, a name only the list makes one, a
  // state kit.css names that no list has, and a modifier that is a primitive, listed twice, or named by no rule.
  assert.deepEqual(disagreements(["btn"], ["btn", "btn-glass"]), { ...none, unlisted: ["btn-glass"] });
  assert.deepEqual(disagreements(["btn", "frame-rim"], ["btn"]), { ...none, unearned: ["frame-rim"] });
  assert.deepEqual(disagreements(["btn", "frame-rim"], ["btn", "frame-rim"]), none);
  assert.deepEqual(disagreements(["btn"], ["btn", "danger"]), { ...none, unlisted: ["danger"] });
  assert.deepEqual(disagreements(["btn"], ["btn", "danger"], ["danger"]), none);
  assert.deepEqual(disagreements(["btn"], ["btn", "chip"], ["chip"]), { ...none, misfiled: ["chip"] });
  assert.deepEqual(disagreements(["btn"], ["btn"], ["btn"]), { ...none, misfiled: ["btn"] });
  assert.deepEqual(disagreements(["btn"], ["btn"], ["danger"]), { ...none, misfiled: ["danger"] });
});

const isObject = (n) => n !== null && typeof n === "object";

/** Every node under `n` for which `pick` is true, not looking inside a node it picked. */
function find(n, pick, out = []) {
  if (Array.isArray(n)) for (const m of n) find(m, pick, out);
  else if (isObject(n)) {
    if (pick(n)) out.push(n);
    else for (const v of Object.values(n)) find(v, pick, out);
  }
  return out;
}

/** The widths one @media query names, as the parser reads them ("900px"): every length in a width feature. */
const widthsIn = (query) =>
  find(query, (n) => n.type === "feature" && /(^|-)width$/.test(String(n.value?.name)))
    .flatMap((feature) => find(feature.value, (n) => typeof n.unit === "string" && typeof n.value === "number"))
    .map((length) => `${length.value}${length.unit}`);

/** The widths each @media rule of a stylesheet names, one list per rule, in order. */
function mediaWidths(css, filename) {
  const rules = [];
  transform({
    filename,
    code: Buffer.from(css),
    visitor: { Rule: { media: (rule) => void rules.push(widthsIn(rule.value.query)) } },
  });
  return rules;
}

test("kit.css has one phone breakpoint: every width an @media there names is 900px", () => {
  const rule = "{ .a { color: var(--ink); } }";
  const fixtures = [
    [`@media (max-width: 900px) ${rule}`, [["900px"]]],
    [`@media (width > 900px) ${rule}`, [["900px"]]],
    [`@media (prefers-reduced-motion: reduce) ${rule}`, [[]]],
    [`@media (max-width: 900px) and (max-height: 700px) ${rule}`, [["900px"]]],
    [`@media (max-width: 760px) ${rule}`, [["760px"]]],
    [`@media (min-width: 901px) ${rule}`, [["901px"]]],
    [`@media (600px < width <= 900px) ${rule}`, [["600px", "900px"]]],
  ];
  for (const [css, widths] of fixtures) assert.deepEqual(mediaWidths(css, "fixture.css"), widths, css);
  const kit = fs.readFileSync(path.join(ROOT, KIT_CSS), "utf8");
  assert.deepEqual(
    mediaWidths(kit, KIT_CSS)
      .flat()
      .filter((width) => width !== "900px"),
    [],
    "the kit's one breakpoint is 900px: (max-width: 900px) for the phone, (width > 900px) for the desk",
  );
});

/* ---- §3.3: a page outside the shell loads the kit when it draws it ---- */

/** The pages outside the shell, as modules: app/ but the (os) group, which the shell draws; sign-in's; the opt-in's. */
const OUTSIDE = repoFiles(["apps/dashboard/app", "apps/dashboard/src/auth", "apps/dashboard/src/yes"], {
  keep: /\.tsx?$/,
}).filter((f) => !f.startsWith("apps/dashboard/app/(os)/"));
const GLOBALS_CSS = "apps/dashboard/app/globals.css";

/** The strings a node holds, itself and anything under it: a string, and the words of a template around its holes. */
function stringsIn(node, out = []) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
  if (ts.isTemplateExpression(node)) out.push(node.head.text, ...node.templateSpans.map((s) => s.literal.text));
  ts.forEachChild(node, (child) => void stringsIn(child, out));
  return out;
}

/**
 * What of the kit a module draws: the kit's classes its className props write (any string in what a className holds,
 * a condition's or a join's), and whether it imports the kit's components, which write them. A kit word anywhere else
 * (a field's name, a label) is no class.
 */
function kitDrawnBy(sf, classes) {
  const drawn = new Set();
  let imports = false;
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && /(^|\/)surfaces\/kit(\/|$)/.test(node.moduleSpecifier.text)) imports = true;
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "className" && node.initializer) {
      for (const name of stringsIn(node.initializer).flatMap((s) => s.split(/\s+/)))
        if (classes.has(name)) drawn.add(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { drawn: [...drawn].sort(), imports };
}

/** Whether a stylesheet imports the kit's: an @import whose path ends surfaces/kit/kit.css. */
function importsKit(css, filename) {
  const urls = [];
  transform({
    filename,
    code: Buffer.from(css),
    visitor: { Rule: { import: (rule) => void urls.push(rule.value.url) } },
  });
  return urls.some((url) => /(^|\/)surfaces\/kit\/kit\.css$/.test(url));
}

/** The modules that draw the kit while globals.css imports none of it, each with what it draws. */
const unloaded = (uses, kitImported) =>
  kitImported
    ? []
    : uses
        .filter(([, use]) => use.drawn.length > 0 || use.imports)
        .map(
          ([file, use]) => `${file}: ${[...use.drawn, ...(use.imports ? ["the kit's components"] : [])].join(", ")}`,
        );

test("a page outside the shell that draws the kit has app/globals.css import it (§3.3); none draws it yet", () => {
  const classes = new Set(listed);
  assert.ok(OUTSIDE.some((f) => f.endsWith("/login/page.tsx")) && OUTSIDE.every((f) => !f.includes("/(os)/")), "read");
  const uses = OUTSIDE.map((file) => [file, kitDrawnBy(parse(file), classes)]);
  const globals = fs.readFileSync(path.join(ROOT, GLOBALS_CSS), "utf8");
  assert.deepEqual(
    unloaded(uses, importsKit(globals, GLOBALS_CSS)),
    [],
    "import kit.css in globals.css, right after the tokens, and let repo/legacy-harness.test.mjs say so too",
  );
  // The checks, where each must find what it looks for.
  const fixture = (code) =>
    kitDrawnBy(ts.createSourceFile("fixture.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), classes);
  const none = { drawn: [], imports: false };
  assert.deepEqual(fixture('export const A = () => <button className="btn btn-primary auth-go">Go</button>;'), {
    drawn: ["btn", "btn-primary"],
    imports: false,
  });
  assert.deepEqual(
    fixture("export const A = ({ on }) => <div className={`panel ${on ? 'panel-pop' : ''}`} />;").drawn,
    ["panel", "panel-pop"],
  );
  assert.deepEqual(
    fixture('export const A = ({ on }) => <i className={on ? "auth-card" : cx("auth-card", "face")} />;').drawn,
    ["face"],
  );
  assert.deepEqual(fixture('import { Button } from "@/surfaces/kit";\nexport const A = () => <Button>Go</Button>;'), {
    drawn: [],
    imports: true,
  });
  assert.deepEqual(
    fixture('export const A = () => <input name="panel" aria-label="btn" className="auth-field" />;'),
    none,
    "a kit word outside a className is no class",
  );
  const drawing = [["apps/dashboard/app/login/page.tsx", { drawn: ["btn"], imports: false }]];
  assert.deepEqual(unloaded(drawing, false), ["apps/dashboard/app/login/page.tsx: btn"]);
  assert.deepEqual(unloaded(drawing, true), []);
  assert.deepEqual(unloaded([["apps/dashboard/src/yes/DeskSign.tsx", none]], false), []);
  const tokens = '@import "../src/legacy/styles/tokens.css";';
  assert.equal(importsKit(`${tokens}\n@import "../src/surfaces/kit/kit.css";`, GLOBALS_CSS), true);
  assert.equal(importsKit(tokens, GLOBALS_CSS), false);
});
