/**
 * The kit's gallery (tooling/scripts/e2e-harness/kit-gallery.mjs), held without a browser. No workflow runs a browser
 * spec on a pull request (ci.yml names none, and the nightly runs against production, where there is no gallery), so
 * what can be held here is: e2e/kit/kit.spec.ts holds the rest when it runs on the harness.
 *
 * - Every name in classes.json, a class or a modifier, is drawn by a kit entry, and a kit entry names only the
 *   registry's names, the gallery's own layout (gx-*) and the names UNLISTED says it carries: one there that the
 *   registry lists now, or that no entry draws, is a stale line. A pull request that adds a kit class without its entry
 *   is red here.
 * - Each entry's id is its own; a twin names a source entry; every source entry is some entry's twin, and the
 *   stylesheets its `source` names declare the classes it draws, but the kit's own (read with _css.mjs; the line is
 *   for the reader); a width, a stage and a list of exceptions are ones the spec knows.
 * - The page links the fonts, then the stylesheets the app imports in the app's order, then the app's own rules, and
 *   loads no script by its src (repo/legacy-harness.test.mjs holds Chanlytics.html to the same list).
 * Each check runs on fixtures too, where it must find what it looks for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { transform } from "lightningcss";
import { cssOf, KIT_REGISTRY } from "../_css.mjs";
import { ROOT } from "../_source.mjs";
import { FAMILIES, galleryDocument, UNLISTED } from "../../e2e-harness/kit-gallery.mjs";

/** Every name classes.json holds: the kit's classes, and the modifiers kit.css names beside them (.active, .icon…). */
const json = JSON.parse(fs.readFileSync(path.join(ROOT, KIT_REGISTRY), "utf8"));
const registry = [...json.classes, ...(json.modifiers ?? [])];
const LEGACY = "apps/dashboard/src/legacy";

/** The classes an entry's markup names, as a browser reads its class attributes. */
const classesOf = (html) => [...html.matchAll(/\bclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/).filter(Boolean));
const entriesOf = (families) => families.flatMap((f) => f.entries);

/** Where the registry and the kit entries part: a name drawn by none, a name no list allows, an unlisted line gone stale. */
function coverage(families, names, unlisted) {
  const drawn = new Set(entriesOf(families).flatMap((e) => (e.source ? [] : classesOf(e.html))));
  const listed = new Set(names);
  return {
    undrawn: names.filter((n) => !drawn.has(n)),
    foreign: [...drawn].filter((c) => !listed.has(c) && !Object.hasOwn(unlisted, c) && !c.startsWith("gx-")).sort(),
    stale: Object.keys(unlisted)
      .filter((c) => listed.has(c) || !drawn.has(c))
      .sort(),
  };
}

/** A source's stylesheets, from its `file:line` list: the legacy tree's and the kit's are written from the dashboard's
 *  src (styles/…, surfaces/…), anything else from the repository's root. */
const sheetsOf = (source) =>
  source.split(/,\s*/).map((at) => {
    const file = at.replace(/:\d+(-\d+)?$/, "");
    if (file.startsWith("styles/")) return `${LEGACY}/${file}`;
    return file.startsWith("surfaces/") ? `apps/dashboard/src/${file}` : file;
  });

/** What is wrong with the entries as data: their ids, their twins, their sources and the fields the spec reads. */
function shape(families, names) {
  const entries = entriesOf(families);
  const ids = entries.map((e) => e.id);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const kit = new Set(names);
  const declares = (file) => (fs.existsSync(path.join(ROOT, file)) ? Object.keys(cssOf(file).classes) : []);
  return {
    twice: ids.filter((id, i) => ids.indexOf(id) !== i),
    twins: entries.filter((e) => e.twin && (e.source || !byId.get(e.twin)?.source)).map((e) => e.id),
    orphans: entries.filter((e) => e.source && !entries.some((x) => x.twin === e.id)).map((e) => e.id),
    undeclared: entries
      .filter((e) => e.source)
      .flatMap((e) => {
        const declared = new Set(sheetsOf(e.source).flatMap(declares));
        return classesOf(e.html)
          .filter((c) => !declared.has(c) && !kit.has(c) && !c.startsWith("gx-"))
          .map((c) => `${e.id}: ${e.source} declares no .${c}`);
      }),
    fields: entries
      .filter(
        (e) =>
          (e.width !== undefined && !["desk", "phone"].includes(e.width)) ||
          (e.stage !== undefined && !["sheet", "pop"].includes(e.stage)) ||
          (e.except !== undefined && (!e.twin || !e.except.every((p) => /^[a-z-]+$/.test(p)))) ||
          (e.boxes !== undefined && (!e.twin || e.boxes !== true)),
      )
      .map((e) => e.id),
  };
}

test("every class in classes.json is drawn by a kit entry, and a kit entry names the registry's, the gallery's or an unlisted name", () => {
  assert.ok(registry.length > 0 && FAMILIES.length > 0, "the registry and the gallery were read");
  assert.deepEqual(coverage(FAMILIES, registry, UNLISTED), { undrawn: [], foreign: [], stale: [] });
  // The checks, where each must find what it looks for.
  const one = (entries) => [{ family: "Fixture", about: "", entries }];
  const btn = { id: "btn", html: '<button class="btn">Save</button>' };
  assert.deepEqual(coverage(one([btn]), ["btn", "btn-sm"], {}).undrawn, ["btn-sm"], "a class with no entry");
  assert.deepEqual(
    coverage(one([btn, { id: "card", html: '<section class="fl-card gx-narrow">…</section>' }]), ["btn"], {}).foreign,
    ["fl-card"],
    "a page's class in a kit entry; the gallery's own layout is not one",
  );
  assert.deepEqual(
    coverage(
      one([btn, { id: "src", source: "styles/fleet.css:170", html: '<section class="fl-card">…</section>' }]),
      ["btn"],
      {},
    ).foreign,
    [],
    "a source entry names its page's classes",
  );
  assert.deepEqual(
    coverage(one([{ id: "tab", html: '<button class="stabs-tab active">Live</button>' }]), ["stabs-tab"], {
      active: "the picked tab",
      show: "the tooltip shown",
    }).stale,
    ["show"],
    "an unlisted name no entry draws",
  );
  assert.deepEqual(
    coverage(one([{ id: "tab", html: '<button class="stabs-tab active">Live</button>' }]), ["stabs-tab", "active"], {
      active: "the picked tab",
    }).stale,
    ["active"],
    "an unlisted name the registry now lists",
  );
});

test("each entry is its own, a twin names a source, a source is a twin's and draws what its stylesheets declare", () => {
  assert.deepEqual(shape(FAMILIES, registry), { twice: [], twins: [], orphans: [], undeclared: [], fields: [] });
  // The checks, on a family of twins where each must find what it looks for.
  const one = (entries) => [{ family: "Fixture", about: "", entries }];
  const panel = { id: "panel", html: '<section class="panel">…</section>', twin: "src-fl-card" };
  const source = { id: "src-fl-card", source: "styles/fleet.css:170", html: '<section class="fl-card">…</section>' };
  assert.deepEqual(shape(one([panel, source]), ["panel"]), {
    twice: [],
    twins: [],
    orphans: [],
    undeclared: [],
    fields: [],
  });
  const found = shape(
    one([
      panel,
      { ...source, html: '<section class="fl-card pl-card"><span class="pill">Live</span></section>' },
      { id: "panel", html: "" },
      { id: "face", html: "", twin: "panel" },
      { id: "src-lonely", source: "styles/fleet.css:170", html: "" },
      { id: "meter", html: "", twin: "src-lonely", width: "tablet", except: ["display"], boxes: true },
      { id: "sheet", html: "", stage: "modal" },
    ]),
    ["panel", "pill"],
  );
  assert.deepEqual(found.twice, ["panel"], "an id twice");
  assert.deepEqual(found.twins, ["face"], "a twin that names a kit entry");
  assert.deepEqual(found.orphans, [], "src-lonely is meter's twin");
  assert.deepEqual(
    found.undeclared,
    ["src-fl-card: styles/fleet.css:170 declares no .pl-card"],
    "a class its sheet lacks",
  );
  assert.deepEqual(found.fields, ["meter", "sheet"], "a width and a stage the spec does not know");
  assert.deepEqual(shape(one([source]), []).orphans, ["src-fl-card"], "a source no entry compares with");
  assert.deepEqual(
    shape(
      one([
        { ...panel, twin: "src-two" },
        {
          ...source,
          id: "src-two",
          source: "styles/inbox.css:276, styles/clients.css:2466",
          html: '<div class="ix-thread-avatar pl-card-face">AR</div>',
        },
      ]),
      [],
    ).undeclared,
    [],
    "a source drawn by two stylesheets names both",
  );
});

/** The stylesheets a stylesheet @imports, from the repository's root (repo/legacy-harness.test.mjs reads them so too). */
function cssImports(sheet) {
  const urls = [];
  transform({
    filename: sheet,
    code: fs.readFileSync(path.join(ROOT, sheet)),
    visitor: { Rule: { import: (rule) => void urls.push(rule.value.url) } },
  });
  return urls.map((url) => path.posix.join(path.posix.dirname(sheet), url));
}

/** The stylesheets the app imports (legacy-bridge/legacy.css), each where the harness serves it (serve-legacy.mjs). */
const APP_SHEETS = cssImports("apps/dashboard/src/legacy-bridge/legacy.css").map((p) =>
  p.replace(/^apps\/dashboard\/src\/(legacy\/)?/, ""),
);

/** What is wrong with a page's head: its stylesheets not the app's in the app's order then the app's rules, the fonts
 *  not first, or a script loaded by its src. */
function linkProblems(page, sheets = APP_SHEETS) {
  const head = page.slice(page.indexOf("<head>"), page.indexOf("</head>"));
  const links = [...head.matchAll(/<link rel="stylesheet" href="([^"?:]+)[^"]*"/g)].map((m) => m[1]);
  const wanted = [...sheets, "/_hx/app.css"];
  const problems = [];
  if (JSON.stringify(links) !== JSON.stringify(wanted)) problems.push(`links ${links.join(", ")}`);
  const fonts = head.indexOf("https://fonts.googleapis.com/css2?family=Geist");
  if (!(fonts > 0 && fonts < head.indexOf(`href="${sheets[0]}`))) problems.push("the fonts are not first");
  if (/<script\b[^>]*\bsrc=/i.test(page)) problems.push("a script is loaded by its src");
  return problems;
}

test("the gallery links the fonts, the stylesheets the app imports in its order, then the app's own rules, and loads no script by its src", () => {
  assert.deepEqual(APP_SHEETS.slice(0, 2), ["styles/tokens.css", "surfaces/kit/kit.css"], "the tokens, then the kit");
  const page = galleryDocument();
  assert.deepEqual(linkProblems(page), []);
  // Every family's entries are drawn, each in its stage.
  assert.equal([...page.matchAll(/<figure class="gx-entry" data-entry="/g)].length, entriesOf(FAMILIES).length);
  assert.equal([...page.matchAll(/<section class="gx-family" data-family="/g)].length, FAMILIES.length);
  // The checks, where each must find what it looks for: two stylesheets swapped, the app's rules before the others,
  // the fonts after the tokens, and React loaded by its src.
  const [tokens, kit] = APP_SHEETS;
  const swap = (a, b) =>
    page.replace(`href="${a}`, "href=\u0000").replace(`href="${b}`, `href="${a}`).replace("href=\u0000", `href="${b}`);
  const swapped = linkProblems(swap(tokens, kit));
  assert.equal(swapped.length, 1, "the kit before the tokens");
  assert.match(swapped[0], /^links surfaces\/kit\/kit\.css, styles\/tokens\.css,/);
  const early = page
    .replace('  <link rel="stylesheet" href="/_hx/app.css" />\n', "")
    .replace("<head>", '<head><link rel="stylesheet" href="/_hx/app.css" />');
  assert.match(linkProblems(early).join(" "), /^links \/_hx\/app\.css, styles\/tokens\.css/);
  const fontsLate = page.replace(
    /(<link href="https:\/\/fonts\.googleapis\.com\/css2[^>]*>)([\s\S]*?)(<link rel="stylesheet" href="\/_hx\/app\.css" \/>)/,
    "$2$1$3",
  );
  assert.deepEqual(linkProblems(fontsLate), ["the fonts are not first"]);
  const react = page.replace(
    "</head>",
    '<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script></head>',
  );
  assert.deepEqual(linkProblems(react), ["a script is loaded by its src"]);
});
