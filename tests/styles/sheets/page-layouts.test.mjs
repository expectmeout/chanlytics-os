/**
 * Every page of the frame links its own stylesheets: a `layout.tsx` beside each `page.tsx` under app/(os)/w/[workspace],
 * and the Console's, each naming the page by the key the build writes its files under (apps/dashboard/src/styles/
 * page-sheets.ts pageKeyOf). A page with no layout of its own, or one that names another page, would be drawn in the
 * frame's styles alone, or in another page's.
 *
 * The layouts are bundled for node with the dashboard's own React and drawn over a list in which every page has one
 * file of its own name: each must link that file, and no other page's. The workspace's own layout draws its children
 * twice, the second time for their links alone (styles/sheet-links.tsx SheetsAlone), so that a prerendered
 * page's head holds them: drawn here the same way, a layout inside it links its file and draws no page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { ROOT } from "../../_source.mjs";
import { pageKeyOf } from "../../../apps/dashboard/src/styles/page-sheets.ts";

const APP = path.join(ROOT, "apps/dashboard");
const OS = path.join(APP, "app/(os)");
const DASHBOARD_MODULES = path.join(APP, "node_modules");

/** Every `page.tsx` under a folder, by its whole path. */
const pagesUnder = (folder) =>
  fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const whole = path.join(folder, entry.name);
    if (entry.isDirectory()) return pagesUnder(whole);
    return entry.name === "page.tsx" ? [whole] : [];
  });

/** The pages that take a layout of their own: every one under the workspace, and the Console's. The home links its own in its page. */
const PAGES = pagesUnder(OS)
  .filter((page) => path.dirname(page) !== OS)
  .map((page) => {
    const key = pageKeyOf(path.relative(OS, page));
    // The Console's layout stands over its catch-all, a folder up; a workspace page's stands beside it.
    const layout =
      key === "console" ? path.join(OS, "console/layout.tsx") : path.join(path.dirname(page), "layout.tsx");
    return { key, layout };
  });

/** A list in which every page has one file, named for it. */
const LIST = {
  files: PAGES.map(({ key }, at) => [`s${String(at).padStart(2, "0")}`, `/sheets/${key}.css`]),
  pages: Object.fromEntries(PAGES.map(({ key }, at) => [key, [at]])),
  apart: {},
};

const forNode = (file) => path.relative(path.join(ROOT, "tests/styles/sheets"), file).split(path.sep).join("/");
const out = await build({
  stdin: {
    contents:
      PAGES.filter(({ layout }) => fs.existsSync(layout))
        .map(({ layout }, at) => `export { default as layout${at} } from ${JSON.stringify(forNode(layout))};\n`)
        .join("") +
      'export { SheetsAlone, SheetSlots } from "../../../apps/dashboard/src/styles/sheet-links.tsx";\n' +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n',
    resolveDir: path.join(ROOT, "tests/styles/sheets"),
    sourcefile: "page-layouts.ts",
    loader: "ts",
  },
  absWorkingDir: ROOT,
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node24",
  jsx: "automatic",
  write: false,
  logLevel: "error",
  alias: {
    react: path.join(DASHBOARD_MODULES, "react"),
    "react-dom": path.join(DASHBOARD_MODULES, "react-dom"),
    "@": path.join(APP, "src"),
  },
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_SHEETS": JSON.stringify(JSON.stringify(LIST)),
  },
});
const file = path.join(os.tmpdir(), `page-layouts-${process.pid}-${Date.now()}.cjs`);
fs.writeFileSync(file, out.outputFiles[0].text);
const drawn = createRequire(import.meta.url)(file);
fs.rmSync(file, { force: true });

/** The files a draw links, by their addresses. */
const linked = (markup) =>
  [...markup.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map((link) => /href="([^"]+)"/.exec(link[0])?.[1]);

test("every page of the frame has a layout of its own, and it links the page's own files and no other page's", () => {
  assert.ok(PAGES.length >= 15, "the frame's pages were found");
  assert.deepEqual(
    PAGES.filter(({ layout }) => !fs.existsSync(layout)).map(({ key }) => key),
    [],
    'a page takes a layout.tsx beside it: `export default sheetsLayout("<its key>")`',
  );
  PAGES.forEach(({ key }, at) => {
    const markup = drawn.renderToStaticMarkup(drawn.createElement(drawn[`layout${at}`], null, "the page"));
    assert.deepEqual(linked(markup), [`/sheets/${key}.css`], `${key}'s layout links ${key}'s`);
    assert.ok(markup.includes("the page"), `${key}'s layout draws its page`);
  });
});

test("drawn for its links alone, a page's layout links its files and draws no page; the order is said for every file", () => {
  const { key } = PAGES[0];
  const alone = drawn.renderToStaticMarkup(
    drawn.createElement(drawn.SheetsAlone, null, drawn.createElement(drawn.layout0, null, "the page")),
  );
  assert.deepEqual(linked(alone), [`/sheets/${key}.css`]);
  assert.ok(!alone.includes("the page"), "the page is the frame's to draw");
  const slots = drawn.renderToStaticMarkup(drawn.createElement(drawn.SheetSlots));
  assert.deepEqual(
    [...slots.matchAll(/data-precedence="([^"]+)"/g)].map((slot) => slot[1]),
    LIST.files.map(([slot]) => slot),
    "every file's precedence, in the list's order",
  );
});
