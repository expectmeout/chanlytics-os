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
 *   node tooling/scripts/checks/bundle-budget.mjs            # after a build: compare
 *   node tooling/scripts/checks/bundle-budget.mjs --update   # bank a fall, or raise it with a reason
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
const BAND = 0.01;

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback;
};
const NEXT = option("--next", path.join(ROOT, "apps/dashboard/.next"));
const BASELINE = option("--baseline", path.join(ROOT, "tooling/scripts/tests/baselines/bundle-budget.json"));
const update = args.includes("--update");

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function readJson(rel) {
  const p = path.join(NEXT, rel);
  if (!fs.existsSync(p)) fail(`no ${rel} under ${NEXT}: build the dashboard first, or the build has changed shape`, 2);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** The client reference manifest is a script that assigns to a global; it runs in a context of its own. */
function clientManifest() {
  const rel = `server/app/${PAGE}_client-reference-manifest.js`;
  const p = path.join(NEXT, rel);
  if (!fs.existsSync(p)) fail(`no ${rel} under ${NEXT}: build the dashboard first, or the build has changed shape`, 2);
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
if (update) {
  fs.writeFileSync(BASELINE, JSON.stringify(measured, null, 2) + "\n");
  console.log(`budget written to ${path.relative(ROOT, BASELINE)}`);
  process.exit(0);
}
if (!fs.existsSync(BASELINE)) fail(`no budget at ${BASELINE}: seed it with --update`, 2);
const budget = JSON.parse(fs.readFileSync(BASELINE, "utf8"));

const rose = [];
const fell = [];
for (const k of ["js", "css"]) {
  const was = budget[k];
  if (typeof was !== "number") fail(`the budget names no ${k}`, 2);
  const change = `${k.toUpperCase()} ${kb(was)} -> ${kb(measured[k])} gzipped`;
  if (measured[k] > was * (1 + BAND)) rose.push(change);
  else if (measured[k] < was * (1 - BAND)) fell.push(change);
}
const write = `write ${JSON.stringify(measured)} to baselines/bundle-budget.json, or run this with --update after a build`;
if (rose.length) {
  fail(
    `the workspace route grew past its budget (${BAND * 100}% band):\n  ${rose.join("\n  ")}\n\n` +
      `Find what grew it, and keep it off the route (a dynamic import, a lighter module). A budget that must ` +
      `rise is raised in the same diff, with the reason in the pull request: ${write}.`,
  );
}
if (fell.length) fail(`good, now bank it:\n  ${fell.join("\n  ")}\n\n${write}.`);
console.log(`within ${BAND * 100}% of the budget: JS ${kb(budget.js)}, CSS ${kb(budget.css)} gzipped`);
