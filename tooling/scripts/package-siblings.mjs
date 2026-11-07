/**
 * How a workspace package's build reaches its siblings (docs/decisions/0024-how-the-packages-ship.md, step 2): an
 * import of `@chanlytics/<p>` becomes an import of `../../<p>/dist/index.js`, left external, so each package's dist
 * carries its own code and no sibling's. The path is the same file whichever way the dist is reached: in the
 * repository (packages/core/dist reaches packages/contracts/dist, the file the edge's facades name) and in an
 * installed layout (node_modules/@chanlytics/core/dist reaches node_modules/@chanlytics/contracts/dist, beside it,
 * since every project that declares a package declares the siblings it imports). One module per package per
 * process: one `AppError`, one provider breaker, one logger context; a contracts change rewrites contracts' dist alone.
 *
 * An entry of the package's own `exports` is the file its bundle writes: `@chanlytics/db/people` is `../../db/dist/people.js`, and a package's root `dist/index.js`
 * (decision 0110: db and channels have no root, each domain is an entry).
 */

/** The esbuild plugin each package's tsup.config.ts hands its build. */
export const siblingsByPath = {
  name: "siblings-by-path",
  setup(build) {
    build.onResolve({ filter: /^@chanlytics\// }, (args) => {
      const match = /^@chanlytics\/([a-z]+)(?:\/([a-z-]+))?$/.exec(args.path);
      if (!match) return { errors: [{ text: `${args.path}: a sibling is imported by a named entry (decision 0110)` }] };
      return { path: `../../${match[1]}/dist/${match[2] ?? "index"}.js`, external: true };
    });
  },
};
