import { defineConfig, type Options } from "tsup";

const each: Options = {
  format: ["esm"],
  // Each entry whole, sharing no chunk with another.
  splitting: false,
  // Third-party code is never inlined: every other bare import stays an import, resolved from the hoisted
  // node_modules and declared in package.json (shipping/package-dependencies.test.mjs holds both).
  skipNodeModulesBundle: true,
};
// tsup's declaration build passes TypeScript `baseUrl: "."` whatever tsconfig.json says (egoist/tsup#1388),
// which 6.0 refuses (TS5101). No --dts in the build script: tsup's flag replaces this object.
const dts = { compilerOptions: { ignoreDeprecations: "6.0" } };

// Six entries, as five builds so no declaration is shared between them: the index the server, the edge, the packages
// and the tests read, with the browser's (browser.generated.ts), which package.json's `browser` condition hands a
// page's bundle (decision 0024) and which has no declarations of its own, since a page is typed by the index's and
// shipping/browser-entry.test.mjs holds its imports to the entry; the classic schemas a page asks for by import()
// (write-rules.ts); the words of Reports' date control (reports/report-window.ts), which only Reports' page draws;
// what Reports' lenses say (reports/report-lens.ts), which only Reports' page draws either; and what Settings ›
// Notifications draws with (alert-pane.ts), which only that pane does: the browser entry is one module every page's
// route loads, so a value any page imports from it is on every page.
// No entries on the command line: they would replace these.
export default defineConfig([
  {
    ...each,
    entry: { index: "src/index.ts", browser: "src/browser.generated.ts" },
    dts: { ...dts, entry: "src/index.ts" },
  },
  { ...each, entry: { "write-rules": "src/write-rules.ts" }, dts },
  { ...each, entry: { "report-window": "src/reports/report-window.ts" }, dts },
  { ...each, entry: { "report-lens": "src/reports/report-lens.ts" }, dts },
  { ...each, entry: { "alert-pane": "src/alert-pane.ts" }, dts },
]);
