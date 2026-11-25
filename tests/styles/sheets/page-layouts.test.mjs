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
 *
 * The bundle's lines are written out, a line a layout, so the run that picks a change's tests can read which modules
 * this test draws (tooling/scripts/tests-of.mjs reads a bundle's lines only as strings). A page added to the frame
 * takes a line here, and the first test says so by the page's name.
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
const WITHOUT_A_LAYOUT = PAGES.filter(({ layout }) => !fs.existsSync(layout)).map(({ key }) => key);

/** A list in which every page has one file, named for it. */
const LIST = {
  files: PAGES.map(({ key }, at) => [`s${String(at).padStart(2, "0")}`, `/sheets/${key}.css`]),
  pages: Object.fromEntries(PAGES.map(({ key }, at) => [key, [at]])),
  apart: {},
};

/** The layouts, drawn: nothing where a page has none yet (the first test says which), since its line could not be bundled. */
async function layoutsDrawn() {
  if (WITHOUT_A_LAYOUT.length) return {};
  const out = await build({
    stdin: {
      contents:
        'export { default as at_route } from "../../../apps/dashboard/app/(os)/w/[workspace]/[[...route]]/layout.tsx";\n' +
        'export { default as at_broadcasts } from "../../../apps/dashboard/app/(os)/w/[workspace]/broadcasts/[[...param]]/layout.tsx";\n' +
        'export { default as at_calendar } from "../../../apps/dashboard/app/(os)/w/[workspace]/calendar/[[...param]]/layout.tsx";\n' +
        'export { default as at_campaigns } from "../../../apps/dashboard/app/(os)/w/[workspace]/campaigns/[[...param]]/layout.tsx";\n' +
        'export { default as at_conversations } from "../../../apps/dashboard/app/(os)/w/[workspace]/conversations/[[...tab]]/layout.tsx";\n' +
        'export { default as at_inbox } from "../../../apps/dashboard/app/(os)/w/[workspace]/inbox/[[...thread]]/layout.tsx";\n' +
        'export { default as at_lists } from "../../../apps/dashboard/app/(os)/w/[workspace]/lists/[[...param]]/layout.tsx";\n' +
        'export { default as at_live } from "../../../apps/dashboard/app/(os)/w/[workspace]/live/[[...param]]/layout.tsx";\n' +
        'export { default as at_people } from "../../../apps/dashboard/app/(os)/w/[workspace]/people/[[...param]]/layout.tsx";\n' +
        'export { default as at_playbooks } from "../../../apps/dashboard/app/(os)/w/[workspace]/playbooks/[[...param]]/layout.tsx";\n' +
        'export { default as at_reports } from "../../../apps/dashboard/app/(os)/w/[workspace]/reports/[[...lens]]/layout.tsx";\n' +
        'export { default as at_settings } from "../../../apps/dashboard/app/(os)/w/[workspace]/settings/[[...param]]/layout.tsx";\n' +
        'export { default as at_start } from "../../../apps/dashboard/app/(os)/w/[workspace]/start/[[...param]]/layout.tsx";\n' +
        'export { default as at_templates } from "../../../apps/dashboard/app/(os)/w/[workspace]/templates/layout.tsx";\n' +
        'export { default as at_today } from "../../../apps/dashboard/app/(os)/w/[workspace]/today/layout.tsx";\n' +
        'export { default as at_console } from "../../../apps/dashboard/app/(os)/console/layout.tsx";\n' +
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
  const bundled = createRequire(import.meta.url)(file);
  fs.rmSync(file, { force: true });
  return bundled;
}
const drawn = await layoutsDrawn();

/** The files a draw links, by their addresses. */
const linked = (markup) =>
  [...markup.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map((link) => /href="([^"]+)"/.exec(link[0])?.[1]);

test("every page of the frame has a layout of its own, and it links the page's own files and no other page's", () => {
  assert.ok(PAGES.length >= 15, "the frame's pages were found");
  assert.deepEqual(
    WITHOUT_A_LAYOUT,
    [],
    'a page takes a layout.tsx beside it: `export default sheetsLayout("<its key>")`',
  );
  assert.deepEqual(
    PAGES.map(({ key }) => key).filter((key) => !drawn[`at_${key}`]),
    [],
    "a page's layout takes a line in this test's bundle: `export { default as at_<its key> } from \"<its layout>\"`",
  );
  for (const { key } of PAGES) {
    const markup = drawn.renderToStaticMarkup(drawn.createElement(drawn[`at_${key}`], null, "the page"));
    assert.deepEqual(linked(markup), [`/sheets/${key}.css`], `${key}'s layout links ${key}'s`);
    assert.ok(markup.includes("the page"), `${key}'s layout draws its page`);
  }
});

test("drawn for its links alone, a page's layout links its files and draws no page; the order is said for every file", () => {
  const { key } = PAGES[0];
  const alone = drawn.renderToStaticMarkup(
    drawn.createElement(drawn.SheetsAlone, null, drawn.createElement(drawn[`at_${key}`], null, "the page")),
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
