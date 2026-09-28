#!/usr/bin/env node
/**
 * What a browser loads to open a workspace may only grow on purpose.
 *
 * Run after the dashboard's production build (the Typecheck job builds it the way
 * Vercel does). It reads what Next wrote about the workspace route, /w/[workspace]:
 *
 *   build-manifest.json           the runtime every page loads (its root main files;
 *                                 the polyfills are left out, a current browser never
 *                                 fetches them)
 *   the page's client manifest    the chunks and stylesheets of every segment on the
 *                                 route, from the root layout down
 *   the page's loadable manifest  what `next/dynamic` loads when the page draws: the
 *                                 shell, which LegacyHost imports at once
 *
 * gzips each file once, at level 9, and sums the JavaScript and the CSS. A chunk
 * fetched later, on demand (the map, a refresh), is not counted: it is not what a
 * person waits for. A build that no longer writes one of the three fails the check
 * rather than measuring less.
 *
 * The two sums are held against baselines/bundle-budget.json with a band for what
 * one build carries against another (the public values inlined, a hash): within 1%
 * passes. Above it fails until the budget is raised in the same diff, with the
 * reason in the pull request; below it fails until the fall is banked, so the budget
 * follows the route down and does not drift back up.
 *
 *   corepack pnpm check:bundle                 # after a build: compare
 *   corepack pnpm check:bundle -- --update     # bank what fell, nothing else
 *   corepack pnpm check:bundle -- --raise      # write the sums as measured, a rise included; or seed
 *
 * `--update` banks only what fell, by the ratchets' rule (_ratchet.mjs, `UPDATE_BASELINES=1`), the JavaScript and
 * the CSS each on its own: a sum that fell past the band is banked at its new number, and one that rose keeps its
 * budget, so it stays a red build. `--raise` is the one way a budget goes up (`UPDATE_BASELINES=raise` for the
 * ratchets), in the same diff as its row under "Rises" in docs/debt.md, with the reason in the pull request, and the
 * one way a missing budget is seeded: with none, each sum is new, which is a rise. `bankBudget` is the decision, and
 * repo/bundle-budget.test.mjs holds it.
 *
 * `--next <dir>` and `--baseline <file>` point it elsewhere, for its test.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE = "(os)/w/[workspace]/page";
/** How far a build may sit from the budget, either way, before it must be banked or raised. */
export const BAND = 0.01;
/** The sums a budget holds, each banked on its own. */
const KINDS = ["js", "css"];
/** How a person runs this, for the messages that name a flag. */
const COMMAND = "corepack pnpm check:bundle";

/**
 * The budget a bank writes, from the sums measured now and the budget (null when there is none). Plainly: the
 * JavaScript and the CSS each on its own, a sum below the band banked as measured and any other kept at its budget,
 * so a rise, within the band or past it, never moves it; a sum the budget does not name is not written. With
 * `raise`: the sums as measured. A missing budget is seeded only by a raise (null otherwise: write nothing), as
 * _ratchet.mjs's `bank` seeds one. Banking what was just banked changes nothing.
 */
export function bankBudget(measured, budget, { raise = false, band = BAND } = {}) {
  if (raise) return Object.fromEntries(KINDS.map((k) => [k, measured[k]]));
  if (!budget) return null;
  const out = {};
  for (const k of KINDS) {
    const was = budget[k];
    if (typeof was === "number") out[k] = measured[k] < was * (1 - band) ? measured[k] : was;
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback;
  };
  const NEXT = option("--next", path.join(ROOT, "apps/dashboard/.next"));
  const BASELINE = option("--baseline", path.join(ROOT, "tooling/scripts/tests/baselines/bundle-budget.json"));
  const update = args.includes("--update");
  const raise = args.includes("--raise");

  function fail(message, code = 1) {
    console.error(message);
    process.exit(code);
  }

  function readJson(rel) {
    const p = path.join(NEXT, rel);
    if (!fs.existsSync(p))
      fail(`no ${rel} under ${NEXT}: build the dashboard first, or the build has changed shape`, 2);
    return JSON.parse(fs.readFileSync(p, "utf8"));
  }

  /** The client reference manifest is a script that assigns to a global; it runs in a context of its own. */
  function clientManifest() {
    const rel = `server/app/${PAGE}_client-reference-manifest.js`;
    const p = path.join(NEXT, rel);
    if (!fs.existsSync(p))
      fail(`no ${rel} under ${NEXT}: build the dashboard first, or the build has changed shape`, 2);
    const context = {};
    vm.runInNewContext(fs.readFileSync(p, "utf8"), context);
    const manifest = context.__RSC_MANIFEST?.[`/${PAGE}`];
    if (!manifest?.entryJSFiles) fail(`${rel} names no entry files for /${PAGE}`, 2);
    return manifest;
  }

  const build = readJson("build-manifest.json");
  const client = clientManifest();
  const loadable = readJson(`server/app/${PAGE}/react-loadable-manifest.json`);

  const js = new Set(build.rootMainFiles ?? []);
  const css = new Set();
  for (const files of Object.values(client.entryJSFiles)) for (const f of files) js.add(f);
  for (const mod of Object.values(client.clientModules ?? {})) {
    for (const chunk of mod.chunks ?? []) js.add(chunk.replace(/^\/_next\//, ""));
  }
  for (const files of Object.values(client.entryCSSFiles ?? {})) {
    for (const f of files) css.add(typeof f === "string" ? f : f.path);
  }
  const dynamic = Object.values(loadable).flatMap((entry) => entry.files ?? []);
  if (dynamic.length === 0) fail(`the loadable manifest names no files: the shell's chunks would go uncounted`, 2);
  for (const f of dynamic) (f.endsWith(".css") ? css : js).add(f);

  function measure(files) {
    let raw = 0;
    let gzip = 0;
    for (const f of files) {
      const p = path.join(NEXT, f);
      if (!fs.existsSync(p)) fail(`a manifest names ${f}, which the build did not write`, 2);
      const bytes = fs.readFileSync(p);
      raw += bytes.length;
      gzip += zlib.gzipSync(bytes, { level: 9 }).length;
    }
    return { files: files.size, raw, gzip };
  }

  const now = { js: measure(js), css: measure(css) };
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const line = (k) => `${k.toUpperCase()} ${kb(now[k].gzip)} gzipped (${kb(now[k].raw)} raw, ${now[k].files} files)`;
  console.log(`/w/[workspace]: ${line("js")}; ${line("css")}`);

  const measured = { js: now.js.gzip, css: now.css.gzip };
  if (update || raise) {
    const was = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : null;
    const banked = bankBudget(measured, was, { raise });
    if (banked) {
      fs.writeFileSync(BASELINE, JSON.stringify(banked, null, 2) + "\n");
      console.log(`budget written to ${path.relative(ROOT, BASELINE)}`);
    }
  }
  if (!fs.existsSync(BASELINE)) fail(`no budget at ${BASELINE}: seed it with ${COMMAND} -- --raise after a build`, 2);
  const budget = JSON.parse(fs.readFileSync(BASELINE, "utf8"));

  const rose = [];
  const fell = [];
  for (const k of KINDS) {
    const was = budget[k];
    if (typeof was !== "number") fail(`the budget names no ${k}: write it with ${COMMAND} -- --raise after a build`, 2);
    const change = `${k.toUpperCase()} ${kb(was)} -> ${kb(measured[k])} gzipped`;
    if (measured[k] > was * (1 + BAND)) rose.push(change);
    else if (measured[k] < was * (1 - BAND)) fell.push(change);
  }
  if (rose.length) {
    fail(
      `the workspace route grew past its budget (${BAND * 100}% band):\n  ${rose.join("\n  ")}\n\n` +
        `Find what grew it, and keep it off the route (a dynamic import, a lighter module). A budget that must ` +
        `rise is raised with ${COMMAND} -- --raise after a build (or by writing ${JSON.stringify(measured)} to ` +
        `baselines/bundle-budget.json), in the same diff as its row under "Rises" in docs/debt.md, with the ` +
        `reason in the pull request.`,
    );
  }
  if (fell.length) {
    fail(
      `good, now bank it (${COMMAND} -- --update after a build, or write ` +
        `${JSON.stringify(bankBudget(measured, budget))} to baselines/bundle-budget.json):\n  ${fell.join("\n  ")}`,
    );
  }
  console.log(`within ${BAND * 100}% of the budget: JS ${kb(budget.js)}, CSS ${kb(budget.css)} gzipped`);
}

// Run as a script, not when a test imports bankBudget.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main();
