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

// Seven entries, as seven builds so no declaration is shared between them: the index the server, the edge, the packages
// and the tests read; the classic schemas a page asks for by import()
// (write-rules.ts); the words of Reports' date control (reports/report-window.ts), which only Reports' page draws;
// what Reports' lenses say (reports/report-lens.ts), which only Reports' page draws either; what Campaigns › Ads draws
// with, its models, rules, money and words (ads/ads-page.ts), which only that page does; what Settings ›
// Notifications draws with (alert-pane.ts), which only that pane does; and the cards only Ask proposes
// (ask-proposals/ask-only.ts), which the browser loads when Ask is installed. The browser's entry is not built here:
// tooling/scripts/contracts-browser.mjs writes it after these, a file per module under dist/browser, so a page's bundle
// takes the modules it imports and no others (decision 0024); it has no declarations of its own, since a page is typed
// by the index's and shipping/browser-entry.test.mjs holds its imports to the entry.
// No entries on the command line: they would replace these.
export default defineConfig([
  {
    ...each,
    entry: { index: "src/index.ts" },
    dts: { ...dts, entry: "src/index.ts" },
  },
  { ...each, entry: { "write-rules": "src/write-rules.ts" }, dts },
  { ...each, entry: { "report-window": "src/reports/report-window.ts" }, dts },
  { ...each, entry: { "report-lens": "src/reports/report-lens.ts" }, dts },
  { ...each, entry: { "ads-page": "src/ads/ads-page.ts" }, dts },
  { ...each, entry: { "alert-pane": "src/alert-pane.ts" }, dts },
  { ...each, entry: { "ask-only": "src/ask-proposals/ask-only.ts" }, dts },
]);
