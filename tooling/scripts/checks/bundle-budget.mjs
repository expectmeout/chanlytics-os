#!/usr/bin/env node
/**
 * What a browser loads to open a workspace may only grow on purpose, and each change is held to what it adds.
 *
 * Run after the dashboard's production build (the Typecheck job builds it the way Vercel does). It reads what Next
 * wrote about the workspace route, /w/[workspace], and about every other workspace page:
 *
 *   build-manifest.json           the runtime every page loads (its root main files; the polyfills are left out, a
 *                                 current browser never fetches them)
 *   a page's client manifest      the chunks and stylesheets of every segment on the page, from the root layout down
 *   a page's loadable manifest    what `next/dynamic` loads when the page draws: the shell, which LegacyHost imports
 *                                 at once
 *
 * gzips each file once, at level 9, and sums three things: the route's JavaScript, the route's CSS, and each other
 * page's own JavaScript beyond the route (its segments' chunks and its loadable's, less the route's; a chunk two pages
 * share counts for each, since each page's visitor downloads it). A chunk fetched later, on demand (the map, a
 * refresh), is not counted: it is not what a person waits for. A build that no longer writes one of the manifests
 * fails the check rather than measuring less.
 *
 * The build is deterministic: three builds of one commit measured the same byte in every file, Node 22 and Node 24
 * gzip the same, two machines read one commit 6 bytes apart, and a small change moved one chunk by 54 bytes and no
 * other (6 Oct 2026). So the sums are held to the byte, with two allowances in bytes, never a share:
 *
 *   TOLERANCE  what one change may add to a sum without a row, and a fall worth banking
 *   DRIFT      how far main may sit above its budget, so growth under the tolerance cannot sum unseen
 *
 * Under a 1% band the band was the allowance, and it filled: 21 merges of 5 Oct 2026 grew the route by 6,238 bytes,
 * none past the band, none with a row, and the next change of 953 bytes paid for them all (docs/debt.md, "Rises").
 *
 * Three readings of a build, in this order:
 *
 *   1. Against the base's own build (`--against <record> --base <sha>`, CI). A push to main records its measurement
 *      (`--record <file>`), and a pull request reads the record of the commit its merge stands on: the difference is
 *      what this change adds, whatever main carries. A sum that grew by more than the tolerance beyond what the change
 *      raised its budget by fails, naming the exact bytes to argue. A record of another commit is compared and said,
 *      not held.
 *   2. Against the budget (baselines/bundle-budget.json): a sum more than DRIFT over fails until the growth is raised,
 *      a sum more than TOLERANCE under fails until the fall is banked, so the budget follows the route down and does
 *      not drift back up.
 *   3. Against the ceiling (`ceiling` in the same file): what a visitor may be asked to wait for, whatever the rows
 *      say. Over it is a split or a lighter module, never a raise; the ceiling itself moves only by a decision on the
 *      field data (docs/runbook.md, "See how fast the pages are").
 *
 *   corepack pnpm check:bundle                                   # after a build: measure and compare
 *   corepack pnpm check:bundle -- --update                       # after a build: bank what fell, drop a page gone
 *   corepack pnpm check:bundle -- --raise                        # after a build: seed a missing budget, or a new page
 *   corepack pnpm check:bundle -- --raise js=953 inbox=1557      # no build: raise each by the growth argued, in bytes
 *   corepack pnpm check:bundle -- --update css=147499            # no build: bank a sum as CI measured it
 *   corepack pnpm check:bundle -- --ceiling js=768000 page=262144   # no build: set a ceiling (page: each page's own)
 *
 * The numbers to pass are what CI prints in the job summary and the log, so a raise or a bank needs no build on a
 * laptop. A raise adds the growth argued, never writes the sums measured: a build passes within its allowances, so a
 * raise to what was measured banked every growth that had crept in under them, argued by nobody (G:2, #1206). The
 * budget's keys are `js`, `css` and `page.<name>`, a page named by its path under the workspace without its dynamic
 * segment (`inbox`, `reports`); `bankBudget`, `moveBudget` and `judge` are the decisions, and
 * repo/bundle-budget.test.mjs holds them.
 *
 * `--next <dir>`, `--baseline <file>`, `--sha <sha>` and `--summary <file>` point it elsewhere, for CI and its test.
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
const PAGES_DIR = "server/app/(os)/w/[workspace]";
/** What one change may add to a sum, gzipped bytes, without a row; and a fall worth banking. */
export const TOLERANCE = 512;
/** How far main may sit above its budget: growth under the tolerance, summed over merges, before it is banked. */
export const DRIFT = 1024;
/** The route's two sums; every other key of the budget is a page's own JavaScript, under `page`. */
const KINDS = ["js", "css"];
const LABELS = { js: "route JS", css: "route CSS" };
/** How a person runs this, for the messages that name a flag. */
const COMMAND = "corepack pnpm check:bundle";
const BASELINE = "tooling/scripts/tests/baselines/bundle-budget.json";

/** A build that is not the shape this reads: fails with exit 2, rather than measuring less. */
class BuildShape extends Error {}

/* --------------------------------- measuring --------------------------------- */

/** A page's budget key: its path under the workspace, the dynamic segments, a group and `page` dropped (`inbox`). */
export function pageKey(page) {
  return page
    .replace(/^\(os\)\/w\/\[workspace\]\//, "")
    .split("/")
    .filter((s) => s !== "page" && !/^\[.*\]$/.test(s) && !/^\(.*\)$/.test(s))
    .join("/");
}

function readJson(next, rel) {
  const p = path.join(next, rel);
  if (!fs.existsSync(p))
    throw new BuildShape(`no ${rel} under ${next}: build the dashboard first, or the build has changed shape`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** The client reference manifest is a script that assigns to a global; it runs in a context of its own. */
function manifestOf(next, page) {
  const rel = `server/app/${page}_client-reference-manifest.js`;
  const p = path.join(next, rel);
  if (!fs.existsSync(p))
    throw new BuildShape(`no ${rel} under ${next}: build the dashboard first, or the build has changed shape`);
  const context = {};
  vm.runInNewContext(fs.readFileSync(p, "utf8"), context);
  const manifest = context.__RSC_MANIFEST?.[`/${page}`];
  if (!manifest?.entryJSFiles) throw new BuildShape(`${rel} names no entry files for /${page}`);
  return manifest;
}

/** Every chunk a page's manifest names: its segments' entry files and its client modules'. */
function chunksOf(manifest) {
  const out = new Set();
  for (const files of Object.values(manifest.entryJSFiles)) for (const f of files) out.add(f);
  for (const mod of Object.values(manifest.clientModules ?? {})) {
    for (const chunk of mod.chunks ?? []) out.add(chunk.replace(/^\/_next\//, ""));
  }
  return out;
}

/** What `next/dynamic` loads under a page, or null when the build wrote no loadable manifest for it. */
function loadableOf(next, page) {
  const p = path.join(next, `server/app/${page}/react-loadable-manifest.json`);
  if (!fs.existsSync(p)) return null;
  return Object.values(JSON.parse(fs.readFileSync(p, "utf8"))).flatMap((entry) => entry.files ?? []);
}

/** Every workspace page the build wrote a client manifest for, named as Next names it. */
function pagesOf(next) {
  const out = [];
  (function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "page_client-reference-manifest.js") {
        const rel = path.relative(path.join(next, "server/app"), p).split(path.sep).join("/");
        out.push(rel.replace(/_client-reference-manifest\.js$/, ""));
      }
    }
  })(path.join(next, PAGES_DIR));
  return out.sort();
}

/** Each file's raw and gzipped size, under its path. */
function sizesOf(next, files) {
  const out = {};
  for (const f of [...files].sort()) {
    const p = path.join(next, f);
    if (!fs.existsSync(p)) throw new BuildShape(`a manifest names ${f}, which the build did not write`);
    const bytes = fs.readFileSync(p);
    out[f] = { raw: bytes.length, gzip: zlib.gzipSync(bytes, { level: 9 }).length };
  }
  return out;
}

const total = (files, field) => Object.values(files).reduce((a, v) => a + v[field], 0);
const summed = (files) => ({ files: Object.keys(files).length, raw: total(files, "raw"), gzip: total(files, "gzip") });

/**
 * Measures a build: the route's JavaScript and CSS, and each other workspace page's own JavaScript beyond the route,
 * each as its files' sizes (`files`) and their sums. Exported so a test, or a comparison of two builds, measures as
 * the check does.
 */
export function measureBuild(next) {
  const build = readJson(next, "build-manifest.json");
  const client = manifestOf(next, PAGE);
  const dynamic = loadableOf(next, PAGE);
  if (!dynamic || dynamic.length === 0) {
    throw new BuildShape(`the loadable manifest names no files: the shell's chunks would go uncounted`);
  }
  const js = new Set(build.rootMainFiles ?? []);
  for (const f of chunksOf(client)) js.add(f);
  const css = new Set();
  for (const files of Object.values(client.entryCSSFiles ?? {})) {
    for (const f of files) css.add(typeof f === "string" ? f : f.path);
  }
  for (const f of dynamic) (f.endsWith(".css") ? css : js).add(f);
  const page = {};
  for (const name of pagesOf(next)) {
    if (name === PAGE) continue;
    const own = chunksOf(manifestOf(next, name));
    for (const f of loadableOf(next, name) ?? []) own.add(f);
    for (const f of [...own]) if (js.has(f) || !f.endsWith(".js")) own.delete(f);
    const key = pageKey(name) in page ? name : pageKey(name);
    page[key] = sizesOf(next, own);
  }
  const files = { js: sizesOf(next, js), css: sizesOf(next, css), page };
  return {
    js: summed(files.js),
    css: summed(files.css),
    page: Object.fromEntries(Object.entries(page).map(([k, v]) => [k, summed(v)])),
    files,
  };
}

/** The gzipped sums a budget holds, from a measurement: `{ js, css, page: { <name>: bytes } }`. */
export const sumsOf = (measured) => ({
  js: measured.js.gzip,
  css: measured.css.gzip,
  page: Object.fromEntries(Object.entries(measured.page).map(([k, v]) => [k, v.gzip])),
});

/* --------------------------------- the budget --------------------------------- */

/**
 * One sum banked: a fall as measured, a rise kept at its budget, an argued growth added to the budget whatever was
 * measured, a sum the budget does not name seeded by a raise alone, and a page the build no longer has dropped.
 */
function bankOne(measured, was, raise, argued) {
  if (typeof was !== "number") return raise ? measured : undefined;
  if (typeof measured !== "number") return undefined;
  if (typeof argued === "number") return was + argued;
  return Math.min(was, measured);
}

/**
 * The budget a bank writes after a build, from the sums measured and the budget (null when there is none): each sum
 * by `bankOne`, the ceiling kept as it was. A missing budget is seeded only by `raise` (null otherwise: write
 * nothing), as _ratchet.mjs's `bank` seeds one. Banking what was just banked changes nothing.
 */
export function bankBudget(sums, budget, { raise = false, argued = {} } = {}) {
  if (!budget) return raise ? { js: sums.js, css: sums.css, page: { ...sums.page } } : null;
  const out = {};
  for (const k of KINDS) out[k] = bankOne(sums[k], budget[k], raise, argued[k]);
  out.page = {};
  for (const key of [...new Set([...Object.keys(budget.page ?? {}), ...Object.keys(sums.page ?? {})])].sort()) {
    const n = bankOne(sums.page?.[key], budget.page?.[key], raise, argued.page?.[key]);
    if (typeof n === "number") out.page[key] = n;
  }
  if (budget.ceiling) out.ceiling = { ...budget.ceiling };
  return out;
}

/**
 * The budget moved by numbers alone, with no build: a raise adds each growth argued (a key the budget does not name is
 * seeded at the number given), an update banks each sum as measured elsewhere, which is CI's summary.
 */
export function moveBudget(budget, numbers, { raise }) {
  const move = (was, n) => {
    if (typeof was !== "number") return n;
    return raise ? was + n : Math.min(was, n);
  };
  const out = { ...budget, page: { ...(budget.page ?? {}) } };
  for (const k of KINDS) if (typeof numbers[k] === "number") out[k] = move(out[k], numbers[k]);
  for (const [key, n] of Object.entries(numbers.page ?? {})) out.page[key] = move(out.page[key], n);
  return out;
}

/** The numbers after a flag, `js=953 css=40 inbox=1557`: the route's by kind, `page=` the ceiling of each page, every other name a page's. */
export function numbersIn(args) {
  const out = { page: {} };
  for (const a of args) {
    const m = /^([A-Za-z][\w./-]*)=(\d+)$/.exec(a);
    if (!m) continue;
    if (KINDS.includes(m[1])) out[m[1]] = Number(m[2]);
    else if (m[1] === "page") out.each = Number(m[2]);
    else out.page[m[1]] = Number(m[2]);
  }
  return out;
}

/* ----------------------------------- judging ----------------------------------- */

/** Every sum beside the base's record: what this build adds, and what the budget was raised by for it. */
export function compareWith(sums, budget, record) {
  const rows = [];
  const row = (key, label, now, base, was, wasBase) =>
    rows.push({
      key,
      label,
      base: base ?? 0,
      now: now ?? 0,
      growth: (now ?? 0) - (base ?? 0),
      raised: (was ?? 0) - (wasBase ?? 0),
    });
  for (const k of KINDS) row(k, LABELS[k], sums[k], record.sums?.[k], budget?.[k], record.budget?.[k]);
  const keys = new Set([...Object.keys(sums.page), ...Object.keys(record.sums?.page ?? {})]);
  for (const key of [...keys].sort()) {
    row(key, `page ${key}`, sums.page[key], record.sums?.page?.[key], budget?.page?.[key], record.budget?.page?.[key]);
  }
  return rows;
}

/** The rows a change grew by more than the tolerance beyond what it raised its budget by. */
export const unargued = (rows) => rows.filter((r) => r.growth - r.raised > TOLERANCE);

/**
 * What the budget says of a build's sums: rises past the drift, falls past the tolerance, sums over the ceiling, pages
 * the budget does not name, and budget pages the build no longer has.
 */
export function judge(sums, budget) {
  const out = { rose: [], fell: [], over: [], unnamed: [], gone: [] };
  const one = (key, label, now, was, ceiling) => {
    if (typeof was !== "number") {
      out.unnamed.push(label);
      return;
    }
    if (now > was + DRIFT) out.rose.push({ key, label, now, was });
    else if (now < was - TOLERANCE) out.fell.push({ key, label, now, was });
    if (typeof ceiling === "number" && now > ceiling) out.over.push({ key, label, now, ceiling });
  };
  for (const k of KINDS) one(k, LABELS[k], sums[k], budget[k], budget.ceiling?.[k]);
  for (const [key, now] of Object.entries(sums.page))
    one(key, `page ${key}`, now, budget.page?.[key], budget.ceiling?.page);
  for (const key of Object.keys(budget.page ?? {})) if (!(key in sums.page)) out.gone.push(key);
  return out;
}

/* ----------------------------------- words ----------------------------------- */

const bytes = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const signed = (n) => (n >= 0 ? `+${bytes(n)}` : `-${bytes(-n)}`);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const raiseCommand = (rows, by) => `${COMMAND} -- --raise ${rows.map((r) => `${r.key}=${by(r)}`).join(" ")}`;
const sumLine = (label, m) =>
  `${label} ${bytes(m.gzip)} bytes gzipped (${kb(m.gzip)}; ${bytes(m.raw)} raw, ${m.files} files)`;

function describe(measured) {
  const lines = [`/w/[workspace]: ${sumLine(LABELS.js, measured.js)}; ${sumLine(LABELS.css, measured.css)}`];
  for (const [key, m] of Object.entries(measured.page)) lines.push(`  ${sumLine(`page ${key}`, m)}`);
  return lines.join("\n");
}

function describeComparison({ record, rows, held, why }) {
  if (!record) return `no record of the base to compare with (${why}): held to the budget alone.`;
  const moved = rows.filter((r) => r.growth !== 0);
  const head = held
    ? `against main's own build ${record.sha}, the base of this change:`
    : `against the record of ${record.sha} (${why}): compared, not held.`;
  const body = moved.length
    ? moved.map((r) => `  ${r.label} ${signed(r.growth)} bytes gzipped (raised ${signed(r.raised)})`)
    : ["  nothing moved"];
  return [head, ...body].join("\n");
}

const unarguedMessage = (rows, sha) =>
  `this change grows what a page loads by more than the tolerance (${TOLERANCE} bytes gzipped) beyond what it raised, against main's own build ${sha}:\n` +
  rows.map((r) => `  ${r.label} ${signed(r.growth)} bytes, raised ${signed(r.raised)}`).join("\n") +
  `\n\nKeep it off the page (a dynamic import, a lighter module), or argue it by exactly that growth, with no build: ` +
  `\`${raiseCommand(rows, (r) => r.growth - r.raised)}\`, in the same change as its row under "Rises" in docs/debt.md, with the reason in the pull request.`;

/** A sum the budget does not name: seeded at what this build measured, by numbers, with its row. */
function unnamedMessage(labels, sums, budget) {
  const seeds = [
    ...KINDS.filter((k) => typeof budget[k] !== "number").map((k) => `${k}=${sums[k]}`),
    ...Object.entries(sums.page)
      .filter(([key]) => typeof budget.page?.[key] !== "number")
      .map(([key, n]) => `${key}=${n}`),
  ];
  return (
    `the budget names no ${labels.join(", ")}: seed it at what this build measures, with no build, ` +
    `\`${COMMAND} -- --raise ${seeds.join(" ")}\` (or \`${COMMAND} -- --raise\` after a build), in the same change as ` +
    `its row under "Rises" in docs/debt.md.`
  );
}

const ceilingMessage = (rows) =>
  `over the ceiling, which no row crosses:\n` +
  rows.map((r) => `  ${r.label} ${bytes(r.now)} bytes gzipped against ${bytes(r.ceiling)}`).join("\n") +
  `\n\nSplit what grew it, or load it where it is drawn. A ceiling moves only by a decision on what a visitor may wait for ` +
  `(docs/runbook.md, "See how fast the pages are"): \`${COMMAND} -- --ceiling js=<bytes> css=<bytes> page=<bytes>\`.`;

function roseMessage(rows, compared) {
  const list = rows
    .map((r) => `  ${r.label} ${bytes(r.now)} bytes gzipped against a budget of ${bytes(r.was)}`)
    .join("\n");
  if (compared?.held) {
    return (
      `growth under the tolerance has summed past the drift (${DRIFT} bytes gzipped); none of it is this change's beyond what it raised:\n${list}\n\n` +
      `Bank it with a row naming the merges since the budget was last set: \`${raiseCommand(rows, (r) => r.now - r.was)}\`.`
    );
  }
  return (
    `grew past its budget (${DRIFT} bytes gzipped over it):\n${list}\n\n` +
    `Find what grew it and keep it off the page (a dynamic import, a lighter module). A growth argued is raised by the growth, ` +
    `in bytes, which CI's summary says against main's own build: \`${COMMAND} -- --raise js=<bytes> css=<bytes> <page>=<bytes>\`, ` +
    `in the same change as its row under "Rises" in docs/debt.md, with the reason in the pull request.`
  );
}

function bankMessage(fell, gone) {
  const lines = fell.map((r) => `  ${r.label} ${bytes(r.now)} bytes gzipped against a budget of ${bytes(r.was)}`);
  for (const key of gone) lines.push(`  page ${key} is gone`);
  const given = fell.map((r) => `${r.key}=${r.now}`).join(" ");
  return (
    `good, now bank it (${TOLERANCE} bytes gzipped under its budget, or a page gone):\n${lines.join("\n")}\n\n` +
    `\`${COMMAND} -- --update\` after a build` +
    (given && gone.length === 0
      ? `, or with the numbers as measured, with no build: \`${COMMAND} -- --update ${given}\`.`
      : ".")
  );
}

/**
 * The job summary's table: every sum beside the base's, the budget and the ceiling. With no record of the base (none
 * found, or none asked for) the table still lists this build's sums: they are the numbers a raise or a bank takes.
 */
export function summaryOf({ measured, budget, compared }) {
  const rows = compared?.record ? compared.rows : compareWith(sumsOf(measured), budget, { sums: null, budget: null });
  const ceilingOf = (key) => (KINDS.includes(key) ? budget.ceiling?.[key] : budget.ceiling?.page);
  const cell = (n) => (typeof n === "number" ? bytes(n) : "");
  const header = compared?.record
    ? `Against main's own build \`${compared.record.sha}\`${compared.held ? "" : ` (${compared.why}: compared, not held)`}.`
    : "No record of the base to compare with: held to the budget alone.";
  const table = [
    "| | base | this build | change | budget | ceiling |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((r) => {
      const was = KINDS.includes(r.key) ? budget[r.key] : budget.page?.[r.key];
      return `| ${r.label} | ${compared?.record ? cell(r.base) : ""} | ${bytes(r.now)} | ${compared?.record ? signed(r.growth) : ""} | ${cell(was)} | ${cell(ceilingOf(r.key))} |`;
    }),
  ];
  return `### What a workspace loads, gzipped bytes\n\n${header}\n\n${table.join("\n")}\n\n`;
}

/* ------------------------------------ main ------------------------------------ */

function parseArgs(args) {
  const value = (name) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
  };
  const resolved = (name, fallback) => (value(name) ? path.resolve(value(name)) : fallback);
  return {
    next: resolved("--next", path.join(ROOT, "apps/dashboard/.next")),
    baseline: resolved("--baseline", path.join(ROOT, BASELINE)),
    record: resolved("--record"),
    against: resolved("--against"),
    summary: resolved("--summary"),
    base: value("--base"),
    sha: value("--sha") ?? process.env.GITHUB_SHA ?? "unknown",
    update: args.includes("--update"),
    raise: args.includes("--raise"),
    ceiling: args.includes("--ceiling"),
    numbers: numbersIn(args),
  };
}

const readBudget = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);

function writeBudget(file, budget) {
  fs.writeFileSync(file, JSON.stringify(budget, null, 2) + "\n");
  console.log(`budget written to ${path.relative(ROOT, file)}`);
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

const hasNumbers = (n) =>
  KINDS.some((k) => typeof n[k] === "number") || typeof n.each === "number" || Object.keys(n.page).length > 0;

/** A raise, an update or a ceiling given its numbers: the budget moves by arithmetic, and no build is read. */
function moveByNumbers(opts) {
  const was = readBudget(opts.baseline);
  if (!was) fail(`no budget at ${opts.baseline}: seed it with ${COMMAND} -- --raise after a build`, 2);
  if (opts.ceiling) {
    const given = {};
    for (const k of KINDS) if (typeof opts.numbers[k] === "number") given[k] = opts.numbers[k];
    if (typeof opts.numbers.each === "number") given.page = opts.numbers.each;
    writeBudget(opts.baseline, { ...was, ceiling: { ...(was.ceiling ?? {}), ...given } });
    return;
  }
  writeBudget(opts.baseline, moveBudget(was, opts.numbers, { raise: opts.raise }));
}

/** The base's record read for `--against`: held only when it is the build of the commit this change stands on. */
function comparison(opts, sums, budget) {
  if (!opts.against) return null;
  if (!fs.existsSync(opts.against))
    return { record: null, rows: [], held: false, why: "the base's record was not found" };
  const record = JSON.parse(fs.readFileSync(opts.against, "utf8"));
  const rows = compareWith(sums, budget ?? {}, record);
  if (!opts.base) return { record, rows, held: false, why: "no base was named" };
  if (record.sha !== opts.base) return { record, rows, held: false, why: `the base is ${opts.base}` };
  return { record, rows, held: true, why: "" };
}

function bankAfterBuild(opts, sums) {
  const was = readBudget(opts.baseline);
  if (opts.raise && was && hasNumbers(opts.numbers)) {
    return writeBudget(opts.baseline, moveBudget(was, opts.numbers, { raise: true }));
  }
  const banked = bankBudget(sums, was, { raise: opts.raise });
  if (banked) writeBudget(opts.baseline, banked);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.ceiling) {
    if (!hasNumbers(opts.numbers))
      fail(`a ceiling says its numbers: ${COMMAND} -- --ceiling js=<bytes> css=<bytes> page=<bytes>`, 2);
    return moveByNumbers(opts);
  }
  const built = fs.existsSync(path.join(opts.next, "build-manifest.json"));
  if ((opts.raise || opts.update) && hasNumbers(opts.numbers) && !built) return moveByNumbers(opts);
  let measured;
  try {
    measured = measureBuild(opts.next);
  } catch (e) {
    if (e instanceof BuildShape) fail(e.message, 2);
    throw e;
  }
  const sums = sumsOf(measured);
  console.log(describe(measured));
  if (opts.update || opts.raise) bankAfterBuild(opts, sums);
  const budget = readBudget(opts.baseline);
  if (!budget) fail(`no budget at ${opts.baseline}: seed it with ${COMMAND} -- --raise after a build`, 2);
  if (opts.record) {
    fs.mkdirSync(path.dirname(opts.record), { recursive: true });
    fs.writeFileSync(
      opts.record,
      JSON.stringify({ sha: opts.sha, at: new Date().toISOString(), sums, budget, files: measured.files }, null, 1) +
        "\n",
    );
    console.log(`record of ${opts.sha} written to ${path.relative(ROOT, opts.record)}`);
  }
  const compared = comparison(opts, sums, budget);
  if (compared) console.log(describeComparison(compared));
  if (opts.summary) fs.appendFileSync(opts.summary, summaryOf({ measured, budget, compared }));
  const verdict = judge(sums, budget);
  if (verdict.unnamed.length) fail(unnamedMessage(verdict.unnamed, sums, budget), 2);
  const problems = [];
  if (compared?.held && unargued(compared.rows).length)
    problems.push(unarguedMessage(unargued(compared.rows), compared.record.sha));
  if (verdict.over.length) problems.push(ceilingMessage(verdict.over));
  if (verdict.rose.length) problems.push(roseMessage(verdict.rose, compared));
  if (verdict.fell.length || verdict.gone.length) problems.push(bankMessage(verdict.fell, verdict.gone));
  if (problems.length) fail(problems.join("\n\n"), 1);
  const held = [
    `${LABELS.js} ${bytes(budget.js)}`,
    `${LABELS.css} ${bytes(budget.css)}`,
    `${Object.keys(budget.page ?? {}).length} pages`,
  ];
  console.log(`within its budget (${TOLERANCE} bytes under, ${DRIFT} over): ${held.join(", ")} gzipped`);
}

// Run as a script, not when a test imports its decisions.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main();
