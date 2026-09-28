import { defineConfig } from "tsup";
// Workspace-internal deps are bundled INTO dist (the edge imports dist by
// relative path — nothing may resolve through node_modules symlinks there).
export default defineConfig({
  noExternal: [/^@chanlytics\//],
  // tsup's declaration build passes TypeScript `baseUrl: "."` whatever tsconfig.json says (egoist/tsup#1388),
  // which 6.0 refuses (TS5101). No --dts in the build script: tsup's flag replaces this object.
  dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
});
