#!/usr/bin/env node
/**
 * Dead exports may only fall.
 *
 * knip (knip.json declares the doors, the routes, the manifest and the tests as
 * entries) lists every export, type and module nothing imports. This holds that
 * list at its current size per file, the way the ratchets in
 * tooling/scripts/tests do for the numbers they hold, and by their rule
 * (`compare` and `bank` are theirs, from _ratchet.mjs). It runs as its own CI
 * step rather than inside `pnpm test`, because a whole-repository import graph
 * takes a minute the node suite should not.
 *
 *   node tooling/scripts/checks/dead-exports.mjs            # compare with the baseline
 *   node tooling/scripts/checks/dead-exports.mjs --update   # bank a fall or a removal, nothing else
 *   node tooling/scripts/checks/dead-exports.mjs --raise    # write the list as measured, rises included
 *
 * A rise is raised only with `--raise`, argued under "Rises" in docs/debt.md and
 * in the pull request, as `UPDATE_BASELINES=raise` is for the other ratchets.
 *
 * knip runs from its own bin under the node running this, never through `pnpm`:
 * pnpm is corepack's here, and a bare `pnpm` is not on every machine's PATH.
 *
 * A finding is a bug report, not an instruction: an export knip cannot see a
 * use of may be read through a string, a dynamic import or a test double. Look
 * before deleting; hold the count without looking.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bank, compare, writeBaseline } from "../tests/_ratchet.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BASELINE = path.join(ROOT, "tooling/scripts/tests/baselines/dead-exports.json");

/**
 * `[node, [knip's bin, ...args]]`: the `bin` of the knip the repository installed, found
 * as node finds a package, in the nearest `node_modules` up from the root. Not through
 * `require.resolve`: under the test runner's loader, tsconfig's `baseUrl` answers
 * "knip" with the root's knip.json.
 */
export function knipCommand(args) {
  for (let dir = ROOT; ; dir = path.dirname(dir)) {
    const pkg = path.join(dir, "node_modules", "knip", "package.json");
    if (fs.existsSync(pkg)) {
      const { bin } = JSON.parse(fs.readFileSync(pkg, "utf8"));
      return [process.execPath, [path.join(path.dirname(pkg), typeof bin === "string" ? bin : bin.knip), ...args]];
    }
    if (path.dirname(dir) === dir) throw new Error("knip is not installed: corepack pnpm install");
  }
}

function main() {
  const update = process.argv.includes("--update");
  const raise = process.argv.includes("--raise");

  let raw;
  try {
    const [exe, args] = knipCommand(["--reporter", "json", "--no-progress"]);
    raw = execFileSync(exe, args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    // knip exits 1 when it has findings; the JSON is still on stdout.
    raw = e.stdout;
    if (!raw) {
      console.error("knip did not run");
      process.exit(2);
    }
  }
  const report = JSON.parse(raw);
  const now = {};
  for (const f of report.files ?? []) now[`${f} (unreferenced module)`] = 1;
  for (const issue of report.issues ?? []) {
    const n = (issue.exports?.length ?? 0) + (issue.types?.length ?? 0);
    if (n > 0) now[issue.file] = n;
  }

  const was = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : null;
  if (update || raise) {
    const banked = bank(now, was, { raise });
    if (banked) writeBaseline(BASELINE, banked);
  }
  if (!fs.existsSync(BASELINE)) {
    console.error(`no baseline at ${path.relative(ROOT, BASELINE)} — seed it with --raise`);
    process.exit(2);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const { worse, better } = compare(now, baseline);
  const total = Object.values(now).reduce((a, b) => a + b, 0);
  if (worse.length) {
    console.error(
      `dead exports rose:\n  ${worse.join("\n  ")}\n\nDelete the export, or import it where it is meant to be used. A number that must rise is raised with --raise, in the same diff as its row under "Rises" in docs/debt.md, with the reason in the pull request.`,
    );
    process.exit(1);
  }
  if (better.length) {
    console.error(
      `good — now bank it (node tooling/scripts/checks/dead-exports.mjs --update):\n  ${better.join("\n  ")}`,
    );
    process.exit(1);
  }
  console.log(`dead exports: ${total}, unchanged`);
}

// Run as a script, not when a test imports knipCommand.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main();
