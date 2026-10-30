/**
 * Every import a test makes, slow: `TEST_SLOW_IMPORTS=1 node tooling/scripts/checks/test.mjs <file>` loads this
 * before every test file, and each module the loader resolves waits 20 to 80 ms first.
 *
 * An import() goes through tsx's loader, off the main thread, and takes anything from one turn of the loop to some
 * hundreds, more on a busy machine; every write the bridge makes reads its refresh map that way. A test that waits a
 * count of turns for such work passes alone and fails once in a while beside another heavy job: two did on 29 Oct 2026.
 * Here such a test fails every time, and a test that waits for what it asserts (shared/_until.mjs) passes, only
 * slower. Nothing else changes: an import may always take this long.
 *
 * The one file is both sides of the hooks: on the main thread it registers itself as it loads, after tsx's own (the
 * launcher loads it after tsx), so this one runs before them; on the loader's thread it is the hook. A turn late was too
 * late on Node 24: a small test file's first import ran before it.
 */
import { register } from "node:module";
import { isMainThread } from "node:worker_threads";

const SLOWEST_MS = 80;
const QUICKEST_MS = 20;

if (isMainThread) register(import.meta.url);

export async function resolve(specifier, context, next) {
  await new Promise((r) => setTimeout(r, QUICKEST_MS + Math.random() * (SLOWEST_MS - QUICKEST_MS)));
  return next(specifier, context);
}
