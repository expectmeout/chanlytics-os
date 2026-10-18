#!/usr/bin/env node
/**
 * What a browser loads to open a workspace grows only on purpose: each change says why it grows it past a line, and
 * nothing crosses a ceiling.
 *
 * Run after the dashboard's production build (the Typecheck job builds it the way Vercel does). It reads what Next
 * wrote about the workspace route, /w/[workspace], and about every other workspace page:
 *
 *   build-manifest.json           the runtime every page loads (its root main files; the polyfills are left out, a
 *                                 current browser never fetches them)
 *   a page's client manifest      the chunks and stylesheets of every segment on the page, from the root layout down:
 *                                 the workspace's layout's carry the shell, which LegacyHost imports (until 17 Oct
 *                                 2026 by `import()`, and the loadable manifest named it)
 *   a page's loadable manifest    what `next/dynamic` loads when the page draws, where it names anything
 *
 * gzips each file once, at level 9, and sums three things: the route's JavaScript, the route's CSS, and each other
 * page's own JavaScript beyond the route (its segments' chunks and its loadable's, less the route's; a chunk two pages
 * share counts for each, since each page's visitor downloads it). A chunk fetched later, on demand (the map, a
 * refresh), is not counted: it is not what a person waits for. A build that no longer writes one of the manifests,
 * or whose frame loads less than SHELL_SHARE of the route at once, fails the check rather than measuring less. The build is deterministic to the byte (6 Oct 2026).
 *
 * Three holds, none of them a number the repository keeps in step with every merge:
 *
 *   1. What this change adds. A push to main records its measurement under its own sha (the Actions cache, and an
 *      artifact the weekly reading finds); a pull request is compared with the record of the main commit its merge
 *      stands on, so the difference is this change's alone. A sum it grows past its line (GROWTH_LINE: the route's JS
 *      and CSS 1 KB, a page 2 KB, gzipped) fails until the pull request says why, in a line of its description:
 *      `Bundle: <why>`. The description is read when the check runs, so after editing it, run the job again.
 *   2. The ceiling (baselines/bundle-ceiling.json): what a visitor may be asked to wait for. Every build is held to
 *      it, a pull request's and main's; within NEAR of it the summary warns. Over it is a split or a lighter module,
 *      never a line in a pull request: the ceiling moves only by a decision on what a visitor may wait for
 *      (docs/runbook.md, "See how fast the pages are"), `--ceiling js=<bytes> css=<bytes> page=<bytes>`.
 *   3. The week. Growth under the line sums over merges; once a week the reading compares main with main a week
 *      before, and a sum that grew past its WEEK_LINE keeps an issue open naming the merges (.github/workflows/
 *      bundle-week.yml): the creep is read on a day, not paid for by whichever change crosses a line next.
 *
 * Until 10 Oct 2026 the repository kept a budget per sum, to the byte, with a tolerance per change and a drift per
 * merge: 47 of 165 merges in ten days edited it, its rows and the register, and a change that grew a page by 393 bytes
 * failed for 813 bytes that fifteen merges before it had added (docs/debt.md, "Rises"). What a change adds is still
 * held to the byte, and argued where it is made, in its pull request.
 *
 *   corepack pnpm check:bundle                                        # after a build: measure, and hold the ceiling
 *   corepack pnpm check:bundle -- --ceiling js=819200 page=262144     # no build: set a ceiling (page: each page's own)
 *   node tooling/scripts/checks/bundle-budget.mjs --week <older> <newer> [--commits <file>] [--report <file>]
 *
 * `--next <dir>`, `--baseline <file>`, `--sha <sha>`, `--record <file>`, `--against <file>`, `--base <sha>` and
 * `--summary <file>` point it elsewhere, for CI and its test; the pull request's description comes in `PR_BODY`.
 * repo/bundle-budget.test.mjs holds the decisions (`compareWith`, `unargued`, `reasonIn`, `judge`, `weekOf`).
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
/** The frame's segment, as the route's client manifest names it: its chunks carry the shell. */
const FRAME = "[project]/apps/dashboard/app/(os)/w/[workspace]/layout";
/** The root layout's segment: the frame's own chunks are what it loads beyond these and the runtime. */
const ROOT_LAYOUT = "[project]/apps/dashboard/app/layout";
/**
 * The least share of the route's JavaScript the frame loads at once: its layout's own chunks, and what `next/dynamic`
 * loads under it. That is the shell, most of what a workspace waits for, whichever of the two brings it; a shell
 * loaded some other way (an `import()` no manifest names) leaves the frame light, and the route's sum without it.
 */
const SHELL_SHARE = 0.5;
/** What one change may add to a sum, gzipped bytes, before its pull request says why: the route's two, and a page's. */
export const GROWTH_LINE = { js: 1024, css: 1024, page: 2048 };
/** What main may add to a sum in a week before the weekly reading keeps an issue open about it. */
export const WEEK_LINE = { js: 4096, css: 2048, page: 8192 };
/** How near its ceiling a sum comes before the summary warns. */
export const NEAR = 0.9;
/** The route's two sums; every other key is a page's own JavaScript. */
const KINDS = ["js", "css"];
const LABELS = { js: "route JS", css: "route CSS" };
/** How a person runs this, for the messages that name a flag. */
const COMMAND = "corepack pnpm check:bundle";
const BASELINE = "tooling/scripts/tests/baselines/bundle-ceiling.json";

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
  const dynamic = loadableOf(next, PAGE) ?? [];
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
  const below = new Set([...(build.rootMainFiles ?? []), ...(client.entryJSFiles[ROOT_LAYOUT] ?? [])]);
  const frame = new Set([...(client.entryJSFiles[FRAME] ?? []), ...dynamic]);
  const shell = [...frame].filter((f) => f.endsWith(".js") && !below.has(f)).reduce((a, f) => a + files.js[f].gzip, 0);
  if (shell < SHELL_SHARE * total(files.js, "gzip")) {
    throw new BuildShape(
      `the frame loads ${shell} of the route's ${total(files.js, "gzip")} bytes gzipped at once, under ` +
        `${SHELL_SHARE * 100}%: the shell arrives some way this check does not read, and would go uncounted`,
    );
  }
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

/* ---------------------------------- the holds ---------------------------------- */

/** A sum's line: the route's two by kind, a page's for every other key. */
const lineOf = (key, lines = GROWTH_LINE) => (KINDS.includes(key) ? lines[key] : lines.page);
const labelOf = (key) => (KINDS.includes(key) ? LABELS[key] : `page ${key}`);

/**
 * Every sum beside another build's (null: beside nothing): what it adds. A page the other build lacks counts from
 * nothing; a page this build no longer has is said as gone, and adds nothing.
 */
export function compareWith(sums, other) {
  const pages = new Set([...Object.keys(sums.page ?? {}), ...Object.keys(other?.page ?? {})]);
  return [...KINDS, ...[...pages].sort()].map((key) => {
    const now = KINDS.includes(key) ? sums[key] : sums.page?.[key];
    const base = KINDS.includes(key) ? other?.[key] : other?.page?.[key];
    const gone = typeof now !== "number";
    return { key, label: labelOf(key), base: base ?? 0, now: now ?? 0, growth: gone ? 0 : now - (base ?? 0), gone };
  });
}

/** The rows a change grew past their line. */
export const unargued = (rows) => rows.filter((r) => r.growth > lineOf(r.key));

/**
 * Why the pull request grows what a page loads: a line of its description, `Bundle: <why>`, in a few words at least
 * (marks of emphasis and a list's bullet around it are its own business); null where it says none.
 */
export function reasonIn(body) {
  const m = /^[ \t>*-]*\**Bundle:\**[ \t]*(.+?)[ \t]*$/im.exec(String(body ?? ""));
  if (!m) return null;
  const why = m[1].replace(/[*_`]/g, "").trim();
  return why.length >= 12 ? why : null;
}

/** What the ceiling says of a build: the sums over it, and the sums within NEAR of it. */
export function judge(sums, ceiling) {
  const out = { over: [], near: [] };
  for (const row of compareWith(sums, null)) {
    const cap = KINDS.includes(row.key) ? ceiling?.[row.key] : ceiling?.page;
    if (row.gone || typeof cap !== "number") continue;
    if (row.now > cap) out.over.push({ ...row, ceiling: cap });
    else if (row.now > cap * NEAR) out.near.push({ ...row, ceiling: cap });
  }
  return out;
}

/** A week of main, from two of its records: each sum beside the older one's, and the sums grown past WEEK_LINE. */
export function weekOf(older, newer) {
  const rows = compareWith(newer.sums, older.sums);
  return { rows, past: rows.filter((r) => r.growth > lineOf(r.key, WEEK_LINE)) };
}

/** The numbers after a flag, `js=819200 css=163840 page=262144`. */
export function numbersIn(args) {
  const out = {};
  for (const a of args) {
    const m = /^(js|css|page)=(\d+)$/.exec(a);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

/* ----------------------------------- words ----------------------------------- */

const bytes = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const signed = (n) => (n >= 0 ? `+${bytes(n)}` : `-${bytes(-n)}`);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const share = (n, of) => `${Math.round((n / of) * 100)}%`;
const sumLine = (label, m) =>
  `${label} ${bytes(m.gzip)} bytes gzipped (${kb(m.gzip)}; ${bytes(m.raw)} raw, ${m.files} files)`;

function describe(measured) {
  const lines = [`/w/[workspace]: ${sumLine(LABELS.js, measured.js)}; ${sumLine(LABELS.css, measured.css)}`];
  for (const [key, m] of Object.entries(measured.page)) lines.push(`  ${sumLine(`page ${key}`, m)}`);
  return lines.join("\n");
}

function describeComparison({ record, rows, held, why }) {
  if (!record) return `no record of the base to compare with (${why}): held to the ceiling alone.`;
  const moved = rows.filter((r) => r.growth !== 0 || r.gone);
  const head = held
    ? `against main's own build ${record.sha}, the base of this change:`
    : `against the record of ${record.sha} (${why}): compared, not held.`;
  const body = moved.length
    ? moved.map((r) => (r.gone ? `  ${r.label} is gone` : `  ${r.label} ${signed(r.growth)} bytes gzipped`))
    : ["  nothing moved"];
  return [head, ...body].join("\n");
}

const unarguedMessage = (rows, sha) =>
  `this change grows what a page loads past its line, against main's own build ${sha}:\n` +
  rows.map((r) => `  ${r.label} ${signed(r.growth)} bytes gzipped (its line ${bytes(lineOf(r.key))})`).join("\n") +
  `\n\nKeep it off the page's first load (a dynamic import, a lighter module), or say why in the pull request's ` +
  `description, on a line of its own:\n\n  Bundle: <what grew it, and why it is worth what a visitor waits for>\n\n` +
  `then run the job again: the description is read when the check runs. Nothing in the repository changes.`;

const ceilingMessage = (rows) =>
  `over the ceiling, which no pull request crosses:\n` +
  rows.map((r) => `  ${r.label} ${bytes(r.now)} bytes gzipped against ${bytes(r.ceiling)}`).join("\n") +
  `\n\nSplit what grew it, or load it where it is drawn. A ceiling moves only by a decision on what a visitor may wait for ` +
  `(docs/runbook.md, "See how fast the pages are"): \`${COMMAND} -- --ceiling js=<bytes> css=<bytes> page=<bytes>\`.`;

const nearLines = (rows) =>
  rows.map((r) => `  ${r.label} ${bytes(r.now)} of ${bytes(r.ceiling)} bytes gzipped (${share(r.now, r.ceiling)})`);

/**
 * The job summary: every sum beside the base's, its line and its ceiling, what is near a ceiling, and the reason the
 * pull request gave where it gave one. With no record of the base the table still lists this build's sums.
 */
export function summaryOf({ measured, ceiling, compared, reason = null }) {
  const sums = sumsOf(measured);
  const rows = compared?.record ? compared.rows : compareWith(sums, null);
  const capOf = (key) => (KINDS.includes(key) ? ceiling?.[key] : ceiling?.page);
  const cell = (n) => (typeof n === "number" ? bytes(n) : "");
  const header = compared?.record
    ? `Against main's own build \`${compared.record.sha}\`${compared.held ? "" : ` (${compared.why}: compared, not held)`}.`
    : "No record of the base to compare with: held to the ceiling alone.";
  const table = [
    "| | base | this build | change | line | ceiling |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((r) => {
      const change = compared?.record ? (r.gone ? "gone" : signed(r.growth)) : "";
      return `| ${r.label} | ${compared?.record ? cell(r.base) : ""} | ${r.gone ? "" : bytes(r.now)} | ${change} | ${bytes(lineOf(r.key))} | ${cell(capOf(r.key))} |`;
    }),
  ];
  const near = judge(sums, ceiling).near;
  const notes = [
    reason ? `The pull request says why it grows: ${reason}` : "",
    near.length ? `Near a ceiling (over ${share(NEAR, 1)}):\n\n${nearLines(near).join("\n")}` : "",
  ].filter(Boolean);
  return `### What a workspace loads, gzipped bytes\n\n${header}\n\n${table.join("\n")}\n\n${notes.map((n) => `${n}\n\n`).join("")}`;
}

/** The weekly reading, as the issue says it: each sum's week, the ones past their line, and the merges between. */
export function weekReport({ older, newer, week, commits = "" }) {
  const lines = [
    `### What a workspace loads: the week from \`${older.sha}\` to \`${newer.sha}\``,
    "",
    "| | a week before | now | grew | the week's line |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...week.rows.map(
      (r) =>
        `| ${r.label} | ${bytes(r.base)} | ${r.gone ? "gone" : bytes(r.now)} | ${r.gone ? "" : signed(r.growth)} | ${bytes(lineOf(r.key, WEEK_LINE))} |`,
    ),
    "",
    week.past.length
      ? `Grew past the week's line: ${week.past.map((r) => `${r.label} ${signed(r.growth)}`).join(", ")}. Each merge ` +
        `below was under its own line; together they are what a visitor now waits for. Read what grew (the record's ` +
        `\`files\` name each chunk), and keep it off the first load, or let it stand, here, on purpose.`
      : "Nothing grew past the week's line.",
  ];
  if (commits.trim())
    lines.push(
      "",
      "The merges of the week:",
      "",
      ...commits
        .trim()
        .split("\n")
        .map((c) => `- ${c}`),
    );
  return lines.join("\n") + "\n";
}

/* ------------------------------------ main ------------------------------------ */

function parseArgs(args) {
  const value = (name, at = 1) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + at] && !args[i + at].startsWith("--") ? args[i + at] : undefined;
  };
  const resolved = (name, fallback) => (value(name) ? path.resolve(value(name)) : fallback);
  return {
    next: resolved("--next", path.join(ROOT, "apps/dashboard/.next")),
    baseline: resolved("--baseline", path.join(ROOT, BASELINE)),
    record: resolved("--record"),
    against: resolved("--against"),
    summary: resolved("--summary"),
    report: resolved("--report"),
    commits: resolved("--commits"),
    week: args.includes("--week") ? [value("--week", 1), value("--week", 2)] : null,
    base: value("--base"),
    sha: value("--sha") ?? process.env.GITHUB_SHA ?? "unknown",
    ceiling: args.includes("--ceiling"),
    numbers: numbersIn(args),
  };
}

const readJsonFile = (file) => (file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

/** A ceiling given its numbers: written beside the others, and no build is read. */
function setCeiling(opts) {
  if (Object.keys(opts.numbers).length === 0)
    fail(`a ceiling says its numbers: ${COMMAND} -- --ceiling js=<bytes> css=<bytes> page=<bytes>`, 2);
  const ceiling = { ...(readJsonFile(opts.baseline) ?? {}), ...opts.numbers };
  fs.writeFileSync(opts.baseline, JSON.stringify(ceiling, null, 2) + "\n");
  console.log(`ceiling written to ${path.relative(ROOT, opts.baseline)}`);
}

/** The weekly reading: exit 3 when a sum grew past its line in the week, so the workflow keeps its issue open. */
function readWeek(opts) {
  const [olderFile, newerFile] = opts.week;
  const older = readJsonFile(olderFile && path.resolve(olderFile));
  const newer = readJsonFile(newerFile && path.resolve(newerFile));
  if (!older || !newer) fail(`the week reads two records of main: --week <older> <newer>`, 2);
  const week = weekOf(older, newer);
  const commits = opts.commits && fs.existsSync(opts.commits) ? fs.readFileSync(opts.commits, "utf8") : "";
  const report = weekReport({ older, newer, week, commits });
  console.log(report);
  if (opts.report) fs.writeFileSync(opts.report, report);
  if (opts.summary) fs.appendFileSync(opts.summary, report);
  if (week.past.length) process.exit(3);
}

/** The base's record read for `--against`: held only when it is the build of the commit this change stands on. */
function comparison(opts, sums) {
  if (!opts.against) return null;
  if (!fs.existsSync(opts.against))
    return { record: null, rows: [], held: false, why: "the base's record was not found" };
  const record = JSON.parse(fs.readFileSync(opts.against, "utf8"));
  const rows = compareWith(sums, record.sums);
  if (!opts.base) return { record, rows, held: false, why: "no base was named" };
  if (record.sha !== opts.base) return { record, rows, held: false, why: `the base is ${opts.base}` };
  return { record, rows, held: true, why: "" };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.week) return readWeek(opts);
  if (opts.ceiling) return setCeiling(opts);
  let measured;
  try {
    measured = measureBuild(opts.next);
  } catch (e) {
    if (e instanceof BuildShape) fail(e.message, 2);
    throw e;
  }
  const sums = sumsOf(measured);
  console.log(describe(measured));
  const ceiling = readJsonFile(opts.baseline);
  if (!ceiling) fail(`no ceiling at ${opts.baseline}: ${COMMAND} -- --ceiling js=<bytes> css=<bytes> page=<bytes>`, 2);
  if (opts.record) {
    fs.mkdirSync(path.dirname(opts.record), { recursive: true });
    fs.writeFileSync(
      opts.record,
      JSON.stringify({ sha: opts.sha, at: new Date().toISOString(), sums, ceiling, files: measured.files }, null, 1) +
        "\n",
    );
    console.log(`record of ${opts.sha} written to ${path.relative(ROOT, opts.record)}`);
  }
  const compared = comparison(opts, sums);
  if (compared) console.log(describeComparison(compared));
  const reason = reasonIn(process.env.PR_BODY);
  if (opts.summary) fs.appendFileSync(opts.summary, summaryOf({ measured, ceiling, compared, reason }));
  const verdict = judge(sums, ceiling);
  const grown = compared?.held ? unargued(compared.rows) : [];
  const problems = [];
  if (grown.length && !reason) problems.push(unarguedMessage(grown, compared.record.sha));
  if (verdict.over.length) problems.push(ceilingMessage(verdict.over));
  if (verdict.near.length)
    console.log(`near a ceiling (over ${share(NEAR, 1)}):\n${nearLines(verdict.near).join("\n")}`);
  if (problems.length) fail(problems.join("\n\n"), 1);
  if (grown.length) console.log(`grown past its line, and the pull request says why: ${reason}`);
  console.log(
    `within its lines and under its ceilings (${LABELS.js} ${bytes(ceiling.js)}, ${LABELS.css} ${bytes(ceiling.css)}, ` +
      `each page ${bytes(ceiling.page)} gzipped)`,
  );
}

// Run as a script, not when a test imports its decisions.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main();
