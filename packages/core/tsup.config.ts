import { defineConfig } from "tsup";
import { siblingsByPath } from "../../tooling/scripts/package-siblings.mjs";
export default defineConfig({
  // A sibling is imported by its built file's relative path, never inlined and never by name: the edge executes this
  // file by path, and Vercel's function bundler follows no pnpm link (docs/decisions/0024-how-the-packages-ship.md,
  // step 2; tooling/scripts/package-siblings.mjs). noExternal stops tsup naming a declared sibling external first, so
  // the plugin is the one that answers for it.
  noExternal: [/^@chanlytics\//],
  esbuildPlugins: [siblingsByPath],
  // Third-party code is never inlined: every other bare import stays an import, resolved from the hoisted
  // node_modules and declared in package.json (shipping/package-dependencies.test.mjs holds both).
  skipNodeModulesBundle: true,
  // tsup's declaration build passes TypeScript `baseUrl: "."` whatever tsconfig.json says (egoist/tsup#1388),
  // which 6.0 refuses (TS5101). No --dts in the build script: tsup's flag replaces this object.
  dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
});
