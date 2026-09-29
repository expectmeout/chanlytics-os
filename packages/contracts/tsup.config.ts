import { defineConfig } from "tsup";
export default defineConfig({
  // Third-party code is never inlined: every other bare import stays an import, resolved from the hoisted
  // node_modules and declared in package.json (repo/package-dependencies.test.mjs holds both).
  skipNodeModulesBundle: true,
  // tsup's declaration build passes TypeScript `baseUrl: "."` whatever tsconfig.json says (egoist/tsup#1388),
  // which 6.0 refuses (TS5101). No --dts in the build script: tsup's flag replaces this object.
  dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
});
