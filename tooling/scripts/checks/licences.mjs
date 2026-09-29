#!/usr/bin/env node
/**
 * Every production dependency's licence is one the product may ship under.
 *
 * Read from pnpm's own list, on stdin, the way CI runs it:
 *
 *   corepack pnpm licenses list --prod --json | node tooling/scripts/checks/licences.mjs
 *
 * A licence is judged by its SPDX expression: an OR is kept when one side is, an AND when both are. Kept are the
 * permissive licences the tree already holds, and the weak copyleft that binds only the file or the library itself
 * (MPL-2.0: lightningcss, the CSS build's; LGPL: sharp's prebuilt libvips binary, an optional dependency Next loads
 * when it resizes an image). GPL and AGPL are refused, and so is anything else, an unknown or missing licence among
 * them: a new licence is read by a person before it joins ALLOWED. Measured 29 Sep 2026 on Windows: 608 production
 * packages, every one kept (node-forge's is "BSD-3-Clause OR GPL-2.0").
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** The licences a production dependency may carry, by SPDX identifier. */
export const ALLOWED = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "LGPL-2.1-only",
  "LGPL-2.1-or-later",
  "LGPL-3.0-only",
  "LGPL-3.0-or-later",
  "MIT",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
  "Zlib",
]);

/** Whether an SPDX expression is kept: an OR when one side is, an AND when both are, WITH judged by its licence. */
export function licenceKept(expression) {
  const tokens = String(expression ?? "").match(/\(|\)|[^\s()]+/g) ?? [];
  let at = 0;
  const peek = () => tokens[at];
  function primary() {
    const t = tokens[at++];
    if (t === "(") {
      const kept = or();
      if (tokens[at++] !== ")") throw new Error("unbalanced");
      return kept;
    }
    if (t === undefined || t === ")" || /^(AND|OR|WITH)$/i.test(t)) throw new Error("no licence");
    if (/^WITH$/i.test(peek() ?? "")) at += 2;
    return ALLOWED.has(t.replace(/\+$/, ""));
  }
  function and() {
    let kept = primary();
    while (/^AND$/i.test(peek() ?? "")) {
      at++;
      kept = primary() && kept;
    }
    return kept;
  }
  function or() {
    let kept = and();
    while (/^OR$/i.test(peek() ?? "")) {
      at++;
      kept = and() || kept;
    }
    return kept;
  }
  try {
    const kept = or();
    return at === tokens.length && kept;
  } catch {
    return false;
  }
}

/** Each package whose licence is not kept, as a sentence; none when all are. `list` is pnpm's JSON. */
export function licenceProblems(list) {
  const problems = [];
  for (const [licence, packages] of Object.entries(list)) {
    if (licenceKept(licence)) continue;
    const why = /\bA?GPL/.test(licence.replace(/\bLGPL/g, ""))
      ? "a copyleft licence the product may not ship under"
      : "a licence nobody has read: read it, then add it to ALLOWED in tooling/scripts/checks/licences.mjs";
    for (const p of packages) problems.push(`${p.name}@${(p.versions ?? [p.version]).join(",")}: "${licence}", ${why}`);
  }
  return problems;
}

function main() {
  const list = JSON.parse(fs.readFileSync(0, "utf8"));
  const problems = licenceProblems(list);
  const count = Object.values(list).reduce((n, packages) => n + packages.length, 0);
  if (problems.length) {
    console.error(`Production dependencies under a licence that is not kept (${problems.length} of ${count}):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`licences: ${count} production packages, every one under a kept licence`);
}

// Run as a script, not when a test imports it.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main();
