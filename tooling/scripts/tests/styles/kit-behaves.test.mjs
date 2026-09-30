/**
 * The kit's components with behaviour of their own, on Base UI (docs/plans/2026-09-28-the-interface-kit-and-its-
 * looks.md, step 2.5), held in the node suite as far as a server can draw them. e2e/kit/kit-behaves.spec.ts holds each
 * in a browser, in every state a person brings it to; no workflow runs it on a pull request, so what a server can draw
 * is held here too:
 *
 * - The running page (tooling/scripts/e2e-harness/kit-behaves-entries.tsx) draws the static gallery's entries of the
 *   kit's Base UI families, one for one, so a family gained or lost on one side alone is red.
 * - Each entry the page draws closed, with nothing portaled (the switch, the segmented control, the field), a server
 *   draws as its gallery entry draws it, element for element, by the browser hold's own reading (kit-shared.mjs,
 *   MARKUP_READ, but a roving tab stop, which Base UI sets in an effect): a Base UI part that carries no class gives
 *   way to what it holds, and a glyph is the Icon's. The
 *   popups (the sheet, the menu, the popover, the tooltip, the select's and the combobox's lists, the toasts) a server
 *   cannot draw: Base UI portals them after the page mounts, and wires a label or a description to its control in an
 *   effect, which a server does not run. The browser holds those.
 * - The bundle that draws them holds one React, the dashboard's, and the Base UI the dashboard pins: two Reacts would
 *   run Base UI's hooks against a React that is not rendering.
 *
 * Why not the stub React the page tests use (kit-components.test.mjs): Base UI's parts run React's own hooks and
 * contexts, which the stub does not have; and why not the React this suite imports: it runs under the react-server
 * condition, where React has no client hooks and no createContext, so a Base UI module fails as it loads. So esbuild
 * bundles the entries with react-dom/server and the dashboard's React for node, the condition left out, and the test
 * draws them with the bundle's own React. Each check runs on fixtures too, where it must find what it looks for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { ROOT } from "../_source.mjs";
import { FAMILIES } from "../../e2e-harness/kit-gallery.mjs";
import { MARKUP_PRESENT, MARKUP_READ } from "../../e2e-harness/kit-shared.mjs";

const HARNESS = path.join(ROOT, "tooling/scripts/e2e-harness");
const DASHBOARD_MODULES = path.join(ROOT, "apps/dashboard/node_modules");
/** The families of the kit's Base UI components, and the entry the running page draws inside another's. */
const ON_BASE_UI = /, on Base UI$/;
const DRAWN_BY_THE_SHEET = "toast-kit";

/** The running page's entries and a server's renderer, bundled for node with the dashboard's React, and loaded. */
async function serverBundle() {
  const out = await build({
    stdin: {
      contents:
        'export { ENTRIES } from "./kit-behaves-entries.tsx";\n' +
        'export { renderToStaticMarkup } from "react-dom/server";\n' +
        'export { createElement } from "react";\n',
      resolveDir: HARNESS,
      sourcefile: "kit-behaves-server.ts",
      loader: "ts",
    },
    absWorkingDir: ROOT,
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node22",
    jsx: "automatic",
    write: false,
    metafile: true,
    logLevel: "warning",
    alias: {
      react: path.join(DASHBOARD_MODULES, "react"),
      "react-dom": path.join(DASHBOARD_MODULES, "react-dom"),
    },
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const file = path.join(os.tmpdir(), `kit-behaves-${process.pid}-${Date.now()}.cjs`);
  fs.writeFileSync(file, out.outputFiles[0].text);
  try {
    return { page: createRequire(import.meta.url)(file), inputs: Object.keys(out.metafile.inputs) };
  } finally {
    fs.rmSync(file, { force: true });
  }
}
const bundled = serverBundle();

/* ---- the skeleton, read as the browser hold reads it (e2e/kit/kit-behaves-checks.ts, kitSkeleton) ---- */

/** Elements that hold nothing, and so close themselves. */
const VOID_TAGS = new Set(["img", "input", "br", "hr", "wbr", "source", "meta", "link"]);
/** A tag, opening or closing, with its attributes: each a name alone, or a name and a value in double quotes. */
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'=<>/]+(?:="[^"]*")?)*)\s*(\/?)>/g;
const ATTRIBUTE_RE = /\s([^\s"'=<>/]+)(?:="([^"]*)")?/g;

/** The markup as a tree of elements: a tag, its attributes, what it holds. Every element it opens, it closes. */
function htmlTree(html) {
  const top = { tag: "#top", attributes: new Map(), children: [] };
  const open = [top];
  for (const [, closing, name, source, closed] of html.matchAll(TAG_RE)) {
    const tag = name.toLowerCase();
    if (closing) {
      if (open.at(-1).tag !== tag) throw new Error(`</${tag}> closes <${open.at(-1).tag}>`);
      open.pop();
      continue;
    }
    const node = {
      tag,
      attributes: new Map([...source.matchAll(ATTRIBUTE_RE)].map(([, n, v]) => [n.toLowerCase(), v ?? ""])),
      children: [],
    };
    open.at(-1).children.push(node);
    if (!closed && !VOID_TAGS.has(tag)) open.push(node);
  }
  if (open.length > 1) throw new Error(`<${open.at(-1).tag}> is never closed`);
  return top.children;
}

/**
 * The kit's markup of a tree, spelled: `tag.class[attribute …](what it holds)`. An element with no class, or with the
 * gallery's own (gx-*) alone, gives way to what it holds; a glyph (an <svg>) is drawn without its attributes or paths.
 */
function skeleton(nodes, read = MARKUP_READ) {
  const present = new Set(MARKUP_PRESENT);
  const walk = (list) =>
    list.flatMap((n) => {
      const classes = [...new Set((n.attributes.get("class") ?? "").split(/\s+/).filter(Boolean))].sort();
      if (classes.length === 0 || classes.every((c) => c.startsWith("gx-"))) return walk(n.children);
      if (n.tag === "svg") return [`svg${classes.map((c) => `.${c}`).join("")}`];
      const attributes = read
        .filter((a) => n.attributes.has(a))
        .map((a) => (present.has(a) ? a : `${a}=${n.attributes.get(a)}`))
        .sort();
      const held = walk(n.children);
      return [
        `${n.tag}${classes.map((c) => `.${c}`).join("")}` +
          `${attributes.length > 0 ? `[${attributes.join(" ")}]` : ""}` +
          `${held.length > 0 ? `(${held.join(" ")})` : ""}`,
      ];
    });
  return walk(nodes).join(" ");
}

/** The stage of the figure a server drew for an entry: the figure's first element. */
const stageOf = (html) => {
  const [figure] = htmlTree(html);
  const [stage] = figure.children;
  assert.ok(stage && /\bgx-stage\b/.test(stage.attributes.get("class") ?? ""), "a figure holds its stage first");
  return stage.children;
};

const galleryEntries = FAMILIES.filter((f) => ON_BASE_UI.test(f.family)).flatMap((f) => f.entries);

/**
 * What a server can draw of them: all the browser reads but the roving tab stop, which Base UI's composite (a radio
 * group's one stop, on the option chosen) sets in an effect a server does not run. The browser holds it.
 */
const SERVER_READ = MARKUP_READ.filter((a) => a !== "tabindex");

test("the skeleton reads a tag, a class, an attribute read and an element, gives way to what carries no class, and reads no words", () => {
  const a =
    `<div class="rec-field"><label for="x"><span class="rec-field-label">Website</span></label>` +
    `<input class="rec-input" type="text" aria-invalid="true" value="northside"></div>`;
  assert.equal(
    skeleton(htmlTree(a)),
    "div.rec-field(span.rec-field-label input.rec-input[aria-invalid=true type=text])",
    "the label, which carries no class, gives way to its words' span; a value is not read",
  );
  assert.equal(
    skeleton(htmlTree(a.replace('aria-invalid="true" ', ""))),
    "div.rec-field(span.rec-field-label input.rec-input[type=text])",
    "an attribute read, gone",
  );
  assert.equal(
    skeleton(
      htmlTree(
        `<span data-base-ui-focus-guard tabindex="0"></span><button class="btn" data-highlighted="" tabindex="0">` +
          `<svg class="icon" width="12"><path d="M3 8h10"/></svg>Save</button><input tabindex="-1" aria-hidden="true">`,
      ),
    ),
    "button.btn[data-highlighted tabindex=0](svg.icon)",
    "a focus guard and a hidden input carry no class; a present attribute is read as there; a glyph is the Icon's",
  );
  assert.throws(() => htmlTree(`<div class="panel"><p>Hours</div>`), /<\/div> closes <p>/);
});

test("the running page draws the gallery's entries of the kit's Base UI components, one for one", async () => {
  const { page } = await bundled;
  const drawn = page.ENTRIES.map((e) => e.id).sort();
  const written = galleryEntries
    .map((e) => e.id)
    .filter((id) => id !== DRAWN_BY_THE_SHEET)
    .sort();
  assert.ok(written.length >= 12, `the gallery's Base UI entries were read: ${written.join(", ")}`);
  assert.deepEqual(drawn, written, "an entry on one side alone");
});

test("a server draws each entry the page draws closed as its gallery entry draws it: the switch, the segmented control, the field", async () => {
  const { page } = await bundled;
  const closed = page.ENTRIES.filter((e) => e.closed);
  assert.deepEqual(
    closed.map((e) => e.id),
    ["switch-kit", "segmented-kit", "segmented-kit-hints", "field-kit", "field-kit-wrong"],
    "the entries a server can draw",
  );
  const apart = [];
  for (const entry of closed) {
    const html = page.renderToStaticMarkup(page.createElement(entry.Draw));
    const drawn = skeleton(stageOf(html), SERVER_READ);
    const written = skeleton(htmlTree(galleryEntries.find((e) => e.id === entry.id).html), SERVER_READ);
    if (drawn !== written) apart.push(`${entry.id}: the gallery draws ${written}\n  the component ${drawn}`);
  }
  assert.deepEqual(apart, [], "a component and its gallery entry that part");
});

test("a component changed alone parts from its gallery entry, and the check says where", async () => {
  const { page } = await bundled;
  const entry = page.ENTRIES.find((e) => e.id === "switch-kit");
  const html = page.renderToStaticMarkup(page.createElement(entry.Draw));
  const written = galleryEntries.find((e) => e.id === "switch-kit").html;
  assert.equal(skeleton(stageOf(html)), skeleton(htmlTree(written)), "held as drawn");
  // The switch drawn as a checkbox: its role, changed on the component's side alone.
  const planted = html.replace('role="switch"', 'role="checkbox"');
  assert.notEqual(planted, html, "the fault was planted");
  assert.match(skeleton(stageOf(planted)), /role=checkbox/);
  assert.notEqual(skeleton(stageOf(planted)), skeleton(htmlTree(written)));
  // The gallery's entry drawn without the knob: an element, on the gallery's side alone.
  const knobless = written.replace('<span aria-hidden="true" class="rec-knob"></span>', "");
  assert.notEqual(knobless, written, "the fault was planted");
  assert.notEqual(skeleton(stageOf(html)), skeleton(htmlTree(knobless)));
});

test("the page's bundle holds one React, the dashboard's, and the Base UI the dashboard pins", async () => {
  const { inputs } = await bundled;
  const reacts = [
    ...new Set(inputs.map((i) => /^(.*node_modules\/react)\/cjs\/react\.production\.js$/.exec(i)?.[1]).filter(Boolean)),
  ];
  assert.deepEqual(reacts, ["apps/dashboard/node_modules/react"], `one React, the dashboard's: ${reacts.join(", ")}`);
  const pinned = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/dashboard/package.json"), "utf8")).dependencies[
    "@base-ui/react"
  ];
  const baseUi = [...new Set(inputs.map((i) => /^(.*node_modules\/@base-ui\/react)\//.exec(i)?.[1]).filter(Boolean))];
  assert.equal(baseUi.length, 1, `one Base UI: ${baseUi.join(", ")}`);
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, baseUi[0], "package.json"), "utf8")).version;
  assert.equal(version, pinned, "the Base UI bundled is the one pinned");
});
