/**
 * Package indirection: the edge imports the BUILT workspace package by relative path
 * so Vercel's function bundler traces real files — pnpm workspace symlinks
 * never survive into the lambda. dist/ is committed; rebuild via
 * `pnpm --filter "./packages/*" build`. Third-party deps (supabase-js) stay
 * external and resolve from the hoisted real node_modules.
 */
export * from "../../../../packages/db/dist/index.js";
