/**
 * The kit's stylesheet and the registry of its names (apps/dashboard/src/surfaces/kit/kit.css and classes.json;
 * docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.3 and §3.4), read as CSS by the parser the build uses.
 *
 * - The registry and the stylesheet agree. Every class kit.css declares is listed, and every listed name is a class a
 *   stylesheet of the dashboard names and a primitive by its own words, or else one kit.css declares: the measures
 *   count a listed name as a primitive whatever its words (_css.mjs), so a name only the registry makes a primitive
 *   must be the kit's.
 * - One phone breakpoint. Every width an @media in kit.css names is 900px, the phone as (max-width: 900px) and the
 *   desk as (width > 900px). A query that names no width (reduced motion, reduced transparency: §3.1) is no breakpoint.
 *
 * kit.css holds no rules until step 2.1, so each check also runs on fixtures, where it must find what it looks for.
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
const listed = JSON.parse(fs.readFileSync(path.join(ROOT, KIT_REGISTRY), "utf8")).classes;

/** A primitive by its words and the house's kit prefixes, the registry left out. */
const byItsWords = isPrimitiveClassFor(new Set());

/** Where the registry and the kit's stylesheet disagree: a class kit.css declares and the list lacks, and a listed name
 *  that is a primitive only because it is listed, though kit.css does not declare it. */
const disagreements = (names, declared) => ({
  unlisted: declared.filter((name) => !names.includes(name)),
  unearned: names.filter((name) => !byItsWords(name) && !declared.includes(name)),
});

test("the registry lists each name once, and each is a class a stylesheet of the dashboard names", () => {
  assert.ok(listed.length > 0, `${KIT_REGISTRY} was read`);
  assert.equal(new Set(listed).size, listed.length, "each name once");
  const named = new Set(
    repoFiles(["apps/dashboard"], { keep: /\.css$/ }).flatMap((f) => Object.keys(cssOf(f).classes)),
  );
  assert.deepEqual(
    listed.filter((name) => !named.has(name)),
    [],
    "a name no stylesheet of the dashboard names is a slip in the list",
  );
});

test("the registry and kit.css agree: a class kit.css declares is listed, and a listed name is a primitive by its words or kit.css's", () => {
  assert.deepEqual(disagreements(listed, Object.keys(cssOf(KIT_CSS).classes)), { unlisted: [], unearned: [] });
  // The checks, where each must find something: a kit class left out of the list, and a name only the list makes one.
  assert.deepEqual(disagreements(["btn"], ["btn", "btn-glass"]), { unlisted: ["btn-glass"], unearned: [] });
  assert.deepEqual(disagreements(["btn", "frame-rim"], ["btn"]), { unlisted: [], unearned: ["frame-rim"] });
  assert.deepEqual(disagreements(["btn", "frame-rim"], ["btn", "frame-rim"]), { unlisted: [], unearned: [] });
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
