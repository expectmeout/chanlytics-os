/**
 * Could this change have changed the phone app?
 *
 * The phone app is paused (7 October 2026: nothing is built, updated or submitted). Its check in ci.yml installs,
 * builds every package, typechecks, lints, runs Expo's doctor and bundles both platforms: a little over two minutes of
 * a runner on every pull request and again on every push to main, for an app that 3 of main's last 60 merges touched
 * (measured 9 October 2026). So the check's work runs only when a change touches something the app is built from. The
 * job itself still reports on every pull request: one that leaves the app alone gets one sentence and a pass.
 *
 * What the app is built from:
 *
 *   its own tree         apps/mobile
 *   its one door         `@chanlytics/contracts/phone-app` (packages/contracts/src/mobile/phone-app.ts; the app's lint
 *                        refuses any other import from the workspace), and every module that door reaches, followed
 *                        through its imports HERE, at run time, so the list cannot fall behind the modules. The walk
 *                        reads `from "./x"`, `import "./x"` and `import("./x")` as text, because it runs before
 *                        anything is installed; repo/settings/mobile-paths-changed.test.mjs holds it to what the
 *                        compiler's own reading of the same files finds.
 *   what an install      the lockfile, the workspace file, the root's and contracts' package.json, and the compiler
 *   resolves             options the app's tsconfig extends
 *   this decision        the workflow and this script
 *
 * Usage: git diff --name-only HEAD^1 HEAD | node tooling/scripts/checks/mobile-paths-changed.mjs
 * Prints mobile=true or mobile=false on stdout, for $GITHUB_OUTPUT, and the reason on stderr, for the log. The answer
 * is never an exit code: a crash exits non-zero too, and a crash read as "not needed" would skip the check it exists
 * to run. An import that opens no file is a crash, for the same reason.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The one module of the workspace the app imports: contracts' `./phone-app` export. */
export const PHONE_APP_DOOR = "packages/contracts/src/mobile/phone-app.ts";

/** What the app is built from whatever it imports: a path ending in `/` is everything under it. */
export const MOBILE_PATHS = [
  "apps/mobile/",
  "packages/contracts/package.json",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  ".github/workflows/ci.yml",
  "tooling/scripts/checks/mobile-paths-changed.mjs",
];

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g;

/** The repository path a relative import in `from` opens, or null. */
function opened(root, from, specifier) {
  const base = path.posix.join(path.posix.dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    const at = path.join(root, candidate);
    if (fs.existsSync(at) && fs.statSync(at).isFile()) return candidate;
  }
  return null;
}

/** Every module the app's door reaches, the door included, as repository paths. */
export function phoneAppModules(root = ROOT) {
  const seen = new Set([PHONE_APP_DOOR]);
  const queue = [PHONE_APP_DOOR];
  while (queue.length) {
    const file = queue.pop();
    const text = fs.readFileSync(path.join(root, file), "utf8");
    for (const [, specifier] of text.matchAll(SPECIFIER)) {
      const next = opened(root, file, specifier);
      if (!next) throw new Error(`${file} imports ${specifier}, which opens no file`);
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** The first of these repository paths the app is built from, or null. */
export function firstMobilePath(files, root = ROOT) {
  const modules = phoneAppModules(root);
  return (
    files.find(
      (file) => MOBILE_PATHS.some((p) => (p.endsWith("/") ? file.startsWith(p) : file === p)) || modules.has(file),
    ) ?? null
  );
}

/** Whether any of these repository paths could change what the phone app's check proves. */
export function couldThePhoneAppHaveChanged(files, root = ROOT) {
  return firstMobilePath(files, root) !== null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  const files = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const hit = firstMobilePath(files);
  if (hit) {
    console.error(`${hit} is something the phone app is built from, so its check runs.`);
    console.log("mobile=true");
  } else {
    console.error(`None of the ${files.length} changed files reaches the phone app, so its check is not needed.`);
    console.log("mobile=false");
  }
}
