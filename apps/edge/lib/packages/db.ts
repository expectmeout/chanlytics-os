/**
 * The edge's door to a package: the edge's modules import a package through one of these five files, which name it as
 * every other project does. esbuild bundles each function with the package's sources (tooling/scripts/edge-functions.mjs),
 * and the node suite reads its bundle by the `bundled` condition (decision 0074). Third-party modules stay imports,
 * resolved from the hoisted node_modules.
 */
export * from "@chanlytics/db";
