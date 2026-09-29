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
 *
 * Each check also runs on fixtures, where it must find what it looks for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { transform } from "lightningcss";
import { cssOf, isPrimitiveClassFor, KIT_REGISTRY } from "../_css.mjs";
import { repoFiles } from "../_ast.mjs";
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
