#!/usr/bin/env node
/**
 * Dead exports may only fall.
 *
 * knip (knip.json declares the doors, the routes, the manifest and the tests as
 * entries) lists every export, type and module nothing imports. This holds that
 * list at its current size per file, the way the ratchets in
 * tooling/scripts/tests do for the numbers they hold, and runs as its own CI
 * step rather than inside `pnpm test`, because a whole-repository import graph
 * takes a minute the node suite should not.
 *
 *   node tooling/scripts/check-dead-exports.mjs            # compare with the baseline
 *   node tooling/scripts/check-dead-exports.mjs --update   # bank a reduction, or seed
 *
 * A finding is a bug report, not an instruction: an export knip cannot see a
 * use of may be read through a string, a dynamic import or a test double. Look
 * before deleting; hold the count without looking.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASELINE = path.join(ROOT, "tooling/scripts/tests/baselines/dead-exports.json");
const update = process.argv.includes("--update");

let raw;
try {
  raw = execFileSync("pnpm", ["exec", "knip", "--reporter", "json", "--no-progress"], {
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
const sorted = Object.fromEntries(
  Object.keys(now)
    .sort()
    .map((k) => [k, now[k]]),
);

if (update) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n");
}
if (!fs.existsSync(BASELINE)) {
  console.error(`no baseline at ${path.relative(ROOT, BASELINE)} — seed it with --update`);
  process.exit(2);
}
const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
const worse = [];
const better = [];
for (const [k, n] of Object.entries(sorted)) {
  if (!(k in baseline)) worse.push(`${k}: new (${n})`);
  else if (n > baseline[k]) worse.push(`${k}: now ${n}, baseline ${baseline[k]}`);
}
for (const [k, n] of Object.entries(baseline)) {
  if (!(k in sorted)) better.push(`${k}: gone (baseline ${n})`);
  else if (sorted[k] < n) better.push(`${k}: now ${sorted[k]}, baseline ${n}`);
}
const total = Object.values(sorted).reduce((a, b) => a + b, 0);
if (worse.length) {
  console.error(
    `dead exports rose:\n  ${worse.join("\n  ")}\n\nDelete the export, or import it where it is meant to be used. A number that must rise is raised in the baseline in the same diff, with the reason in the pull request.`,
  );
  process.exit(1);
}
if (better.length) {
  console.error(`good — now bank it (node tooling/scripts/check-dead-exports.mjs --update):\n  ${better.join("\n  ")}`);
  process.exit(1);
}
console.log(`dead exports: ${total}, unchanged`);
