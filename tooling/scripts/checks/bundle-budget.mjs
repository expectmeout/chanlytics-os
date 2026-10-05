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
 *   corepack pnpm check:bundle                          # after a build: compare
 *   corepack pnpm check:bundle -- --update              # bank what fell, nothing else
 *   corepack pnpm check:bundle -- --raise js=2300       # raise a budget by the growth argued, in gzipped bytes
 *   corepack pnpm check:bundle -- --raise               # seed a missing budget, as measured
 *
 * `--update` banks only what fell, by the ratchets' rule (_ratchet.mjs, `UPDATE_BASELINES=1`), the JavaScript and
 * the CSS each on its own: a sum that fell is banked at its new number, inside the band too, and one that rose keeps
 * its budget, so a rise past the band stays a red build. `--raise` is the one way a budget goes up
 * (`UPDATE_BASELINES=raise` for the ratchets), in the same diff as its row under "Rises" in docs/debt.md, with the
 * reason in the pull request, and it raises by the growth the row argues (`js=<bytes>`, `css=<bytes>`), never to the
 * sums as measured: a build passes within the band, so a raise to what was measured banked every growth that had crept
 * in under it, argued by nobody (about 12 of the 21 KB regained after #1210). With no budget it seeds one as measured:
 * each sum is new, which is a rise. `bankBudget` is the decision, and repo/bundle-budget.test.mjs holds it.
 *
 * `--next <dir>` and `--baseline <file>` point it elsewhere, for its test.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
// The route's one page, the catch-all every workspace address is served by; the frame itself is its layout's (decision
// 0015, "The address first"), so the segments above it are counted with it, and a surface that gets a page of its own
// is counted where it lives.
const PAGE = "(os)/w/[workspace]/[[...route]]/page";
/** How far a build may sit from the budget, either way, before it must be banked or raised. */
export const BAND = 0.01;
/**
 * The sums a budget holds, each banked on its own: the route's JavaScript and CSS, and `pages`, the JavaScript every
 * other workspace page adds on top of them when it is opened (its own segments' chunks, less what the route already
 * counts). The route alone let a page's chunk grow unseen: Base UI's 156 KB raw reached the Inbox's, People's and
 * Conversations' pages before it reached the route (2 Oct 2026). `pages` is held once a build has pages and the budget
 * names it.
 */
const KINDS = ["js", "css", "pages"];
const LABELS = { js: "JS", css: "CSS", pages: "PAGES' OWN JS" };
/** How a person runs this, for the messages that name a flag. */
const COMMAND = "corepack pnpm check:bundle";

/**
 * The budget a bank writes, from the sums measured now and the budget (null when there is none). Plainly: the
 * JavaScript and the CSS each on its own, a sum that fell banked as measured and any other kept at its budget, so a
 * rise, within the band or past it, never moves it; a sum the budget does not name is not written. `argued` raises a
 * sum by the growth its row argues, and nothing more: the budget plus the argument, whatever was measured. A missing
 * budget is seeded only by `raise` (null otherwise: write nothing), as _ratchet.mjs's `bank` seeds one. Banking what
 * was just banked changes nothing.
 */
export function bankBudget(measured, budget, { raise = false, argued = {} } = {}) {
  const held = KINDS.filter((k) => typeof measured[k] === "number");
  if (!budget) return raise ? Object.fromEntries(held.map((k) => [k, measured[k]])) : null;
  const out = {};
  for (const k of KINDS) {
    const was = budget[k];
    // A sum this build does not measure (a build with no pages of their own) keeps what the budget says of it.
    if (!held.includes(k)) {
      if (typeof was === "number") out[k] = was;
      continue;
    }
    // A sum the budget does not name is new: a raise seeds it, as it seeds a missing budget.
    if (typeof was !== "number") {
      if (raise) out[k] = measured[k];
      continue;
    }
    out[k] = typeof argued[k] === "number" ? was + argued[k] : Math.min(was, measured[k]);
  }
  return out;
}

/** The growth `--raise` argues, from the words after it: `js=2300`, `css=410` (gzipped bytes). */
export function arguedGrowth(args) {
  const out = {};
  for (const a of args) {
    const m = /^(js|css|pages)=(\d+)$/.exec(a);
    if (m) out[m[1]] = Number(m[2]);
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

  // Every other workspace page, as it loads when opened: its segments' chunks and what `next/dynamic` loads under it,
  // each counted once across the pages, less what the route above already counts.
  const pages = new Set();
  const PAGES_DIR = path.join(NEXT, "server/app/(os)/w/[workspace]");
  const manifests = [];
  (function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "page_client-reference-manifest.js") manifests.push(p);
    }
  })(PAGES_DIR);
  for (const p of manifests) {
    const page = path
      .relative(path.join(NEXT, "server/app"), p)
      .split(path.sep)
      .join("/")
      .replace(/_client-reference-manifest\.js$/, "");
    if (page === PAGE) continue;
    const context = {};
    vm.runInNewContext(fs.readFileSync(p, "utf8"), context);
    const m = context.__RSC_MANIFEST?.[`/${page}`];
    if (!m?.entryJSFiles) fail(`${path.relative(NEXT, p)} names no entry files for /${page}`, 2);
    for (const files of Object.values(m.entryJSFiles)) for (const f of files) pages.add(f);
    for (const mod of Object.values(m.clientModules ?? {}))
      for (const chunk of mod.chunks ?? []) pages.add(chunk.replace(/^\/_next\//, ""));
    const own = path.join(NEXT, `server/app/${page}/react-loadable-manifest.json`);
    if (fs.existsSync(own))
      for (const entry of Object.values(JSON.parse(fs.readFileSync(own, "utf8"))))
        for (const f of entry.files ?? []) if (f.endsWith(".js")) pages.add(f);
  }
  for (const f of js) pages.delete(f);
  for (const f of [...pages]) if (!f.endsWith(".js")) pages.delete(f);

  const now = { js: measure(js), css: measure(css), ...(manifests.length > 1 ? { pages: measure(pages) } : {}) };
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const line = (k) => `${LABELS[k]} ${kb(now[k].gzip)} gzipped (${kb(now[k].raw)} raw, ${now[k].files} files)`;
  console.log(
    `/w/[workspace]: ${KINDS.filter((k) => now[k])
      .map(line)
      .join("; ")}`,
  );

  const measured = Object.fromEntries(KINDS.filter((k) => now[k]).map((k) => [k, now[k].gzip]));
  if (update || raise) {
    const was = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : null;
    const argued = arguedGrowth(args);
    // A raise with nothing argued may only seed a sum the budget does not name yet; what it names rises by argument.
    const seedsOnly = was && Object.keys(measured).some((k) => typeof was[k] !== "number");
    if (raise && was && Object.keys(argued).length === 0 && !seedsOnly)
      fail(
        `a raise says by how much: ${COMMAND} -- --raise js=<bytes> css=<bytes>, the gzipped growth its row under ` +
          `"Rises" in docs/debt.md argues (measured now: ${JSON.stringify(measured)}, budget: ${JSON.stringify(was)})`,
        2,
      );
    const banked = bankBudget(measured, was, { raise, argued });
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
    if (typeof measured[k] !== "number") continue;
    const was = budget[k];
    if (typeof was !== "number") fail(`the budget names no ${k}: write it with ${COMMAND} -- --raise after a build`, 2);
    const change = `${LABELS[k]} ${kb(was)} -> ${kb(measured[k])} gzipped`;
    if (measured[k] > was * (1 + BAND)) rose.push(change);
    else if (measured[k] < was * (1 - BAND)) fell.push(change);
  }
  if (rose.length) {
    fail(
      `the workspace route or its pages grew past its budget (${BAND * 100}% band):\n  ${rose.join("\n  ")}\n\n` +
        `Find what grew it, and keep it off the route (a dynamic import, a lighter module). A budget that must ` +
        `rise is raised by the growth it argues, ${COMMAND} -- --raise js=<bytes> css=<bytes> pages=<bytes> after a build, in the ` +
        `same diff as its row under "Rises" in docs/debt.md, with the reason in the pull request.`,
    );
  }
  if (fell.length) {
    fail(
      `good, now bank it (${COMMAND} -- --update after a build, or write ` +
        `${JSON.stringify(bankBudget(measured, budget))} to baselines/bundle-budget.json):\n  ${fell.join("\n  ")}`,
    );
  }
  console.log(
    `within ${BAND * 100}% of the budget: ${KINDS.filter((k) => typeof measured[k] === "number")
      .map((k) => `${LABELS[k]} ${kb(budget[k])}`)
      .join(", ")} gzipped`,
  );
}

// Run as a script, not when a test imports bankBudget.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main();
