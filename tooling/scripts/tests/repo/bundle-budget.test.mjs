/**
 * What a workspace loads is held to the byte, and each change to what it adds.
 *
 * checks/bundle-budget.mjs runs in CI after the dashboard's build. Here it runs against a build written by hand, in
 * the shape Next writes (a build manifest, each page's client manifest, the route's loadable manifest, the chunks), so
 * what it counts and when it fails are proved without a build: the runtime, every segment's chunks and stylesheets and
 * the shell `next/dynamic` loads are the route's; each other page's own chunks beyond the route are that page's, a
 * shared chunk counted for each page that loads it; the polyfills and a chunk nothing names at load are not counted;
 * a build missing a manifest or a file fails rather than measuring less.
 *
 * The allowances are bytes: a sum more than DRIFT over its budget fails until the growth is raised, more than TOLERANCE
 * under fails until the fall is banked, over the ceiling fails whatever the budget says. Against the base's own record
 * a change is held to what it adds: growth past the tolerance beyond what it raised fails, naming the bytes to argue.
 * `--update` banks only what fell and drops a page gone; `--raise js=<bytes>` raises by the growth argued, never to
 * the sums measured, and needs no build; a missing budget or a new page is seeded by `--raise` alone after a build.
 * The decisions are pure (`bankBudget`, `moveBudget`, `judge`, `compareWith`), held here case by case and then
 * through the script.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { ROOT } from "../_source.mjs";
import {
  DRIFT,
  TOLERANCE,
  bankBudget,
  compareWith,
  judge,
  measureBuild,
  moveBudget,
  numbersIn,
  pageKey,
  summaryOf,
  sumsOf,
  unargued,
} from "../../checks/bundle-budget.mjs";

const SCRIPT = path.join(ROOT, "tooling/scripts/checks/bundle-budget.mjs");
const PAGE_DIR = "server/app/(os)/w/[workspace]/[[...route]]";

/** Text that compresses like code, not like a run of one letter: deterministic, so every run measures the same. */
function noise(seed, bytes) {
  let out = "";
  let h = seed;
  while (out.length < bytes) {
    h = crypto.createHash("sha256").update(h).digest("hex");
    out += `var ${h.slice(0, 6)}=${h.slice(6, 30)};\n`;
  }
  return out.slice(0, bytes);
}

const CHUNKS = {
  "static/chunks/runtime.js": noise("runtime", 20_000),
  "static/chunks/layout.js": noise("layout", 30_000),
  "static/chunks/page.js": noise("page", 10_000),
  "static/chunks/shell.js": noise("shell", 200_000),
  "static/chunks/polyfills.js": noise("polyfills", 40_000),
  "static/chunks/map.js": noise("map", 90_000),
  "static/chunks/app.css": noise("css", 25_000),
  "static/chunks/inbox.js": noise("inbox", 60_000),
  "static/chunks/people.js": noise("people", 40_000),
  "static/chunks/kit.js": noise("kit", 30_000),
};
/** Each page's chunks as its own client manifest names them: the layout the route already counts, and its own. */
const PAGES = {
  "inbox/[[...thread]]": ["static/chunks/layout.js", "static/chunks/inbox.js", "static/chunks/kit.js"],
  "people/[[...param]]": ["static/chunks/layout.js", "static/chunks/people.js", "static/chunks/kit.js"],
};

function writeBuild({
  loadable = { 33959: { id: 33959, files: ["static/chunks/shell.js"] } },
  chunks = CHUNKS,
  pages = PAGES,
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-budget-"));
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  put(
    "build-manifest.json",
    JSON.stringify({ rootMainFiles: ["static/chunks/runtime.js"], polyfillFiles: ["static/chunks/polyfills.js"] }),
  );
  const manifest = (name, body) =>
    put(
      `server/app/${name}_client-reference-manifest.js`,
      "globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n" +
        `globalThis.__RSC_MANIFEST["/${name}"] = ${JSON.stringify(body)};\n`,
    );
  manifest("(os)/w/[workspace]/[[...route]]/page", {
    clientModules: { "[project]/layout-router.js": { chunks: ["/_next/static/chunks/layout.js"] } },
    entryJSFiles: {
      "[project]/apps/dashboard/app/layout": ["static/chunks/layout.js"],
      "[project]/apps/dashboard/app/(os)/w/[workspace]/[[...route]]/page": [
        "static/chunks/layout.js",
        "static/chunks/page.js",
      ],
    },
    entryCSSFiles: { "[project]/apps/dashboard/app/layout": [{ path: "static/chunks/app.css", inlined: false }] },
  });
  if (loadable) put(`${PAGE_DIR}/page/react-loadable-manifest.json`, JSON.stringify(loadable));
  for (const [route, files] of Object.entries(pages)) {
    const name = `(os)/w/[workspace]/${route}/page`;
    manifest(name, { clientModules: {}, entryJSFiles: { [`[project]/apps/dashboard/app/${name}`]: files } });
  }
  for (const [rel, text] of Object.entries(chunks)) put(rel, text);
  return dir;
}

/** Runs the script over a build, its budget beside it; `budget()` reads what it wrote. */
function run(dir, ...extra) {
  const baseline = path.join(dir, "budget.json");
  const r = spawnSync(process.execPath, [SCRIPT, "--next", dir, "--baseline", baseline, ...extra], {
    encoding: "utf8",
  });
  return { status: r.status, out: r.stdout + r.stderr, budget: () => JSON.parse(fs.readFileSync(baseline, "utf8")) };
}

/** A later build of the same tree, judged against the budget the first one wrote. */
function later(from, options) {
  const dir = writeBuild(options);
  fs.copyFileSync(path.join(from, "budget.json"), path.join(dir, "budget.json"));
  return dir;
}

const gzText = (text) => zlib.gzipSync(Buffer.from(text), { level: 9 }).length;
const gz = (chunks, ...rels) => rels.reduce((a, rel) => a + gzText(chunks[rel]), 0);
const ROUTE_JS = [
  "static/chunks/runtime.js",
  "static/chunks/layout.js",
  "static/chunks/page.js",
  "static/chunks/shell.js",
];
const seeded = (chunks = CHUNKS) => ({
  js: gz(chunks, ...ROUTE_JS),
  css: gz(chunks, "static/chunks/app.css"),
  page: {
    inbox: gz(chunks, "static/chunks/inbox.js", "static/chunks/kit.js"),
    people: gz(chunks, "static/chunks/people.js", "static/chunks/kit.js"),
  },
});
/** A chunk grown by a little, under the tolerance, or by a lot, past the drift; the test checks which it got. */
const grown = (rel, by, chunks = CHUNKS) => ({ ...chunks, [rel]: chunks[rel] + noise(`more-${by}`, by) });

/* ----------------------------------- counting ----------------------------------- */

test("it counts the runtime, every segment's chunks once, the shell and the stylesheets for the route, each page's own chunks beyond it, a shared chunk for each page; not the polyfills or a chunk loaded later", () => {
  const dir = writeBuild();
  const first = run(dir, "--raise");
  assert.equal(first.status, 0, first.out);
  assert.deepEqual(first.budget(), seeded());
  assert.match(first.out, /page inbox .* bytes gzipped/);
  const again = run(dir);
  assert.equal(again.status, 0, again.out);
  assert.match(again.out, /within its budget/);
  // The measure a test or a comparison of two builds reads is the script's own.
  assert.deepEqual(sumsOf(measureBuild(dir)), seeded());
  assert.equal(measureBuild(dir).js.files, 4);
});

test("a page is named by its path under the workspace, its dynamic segment, a group and `page` dropped", () => {
  assert.equal(pageKey("(os)/w/[workspace]/inbox/[[...thread]]/page"), "inbox");
  assert.equal(pageKey("(os)/w/[workspace]/templates/page"), "templates");
  assert.equal(pageKey("(os)/w/[workspace]/reports/(lens)/export/[[...x]]/page"), "reports/export");
});

/* ------------------------------- the budget's allowances ------------------------------- */

test("a sum that grows past the drift fails until its budget is raised; growth under the tolerance passes", () => {
  const dir = writeBuild();
  run(dir, "--raise");
  const big = later(dir, { chunks: grown("static/chunks/shell.js", 20_000) });
  assert.ok(sumsOf(measureBuild(big)).js - seeded().js > DRIFT, "the fixture grows past the drift");
  const r = run(big);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /grew past its budget/);
  assert.match(r.out, /route JS .* against a budget of/);
  assert.doesNotMatch(r.out, /route CSS .* against/, "only what grew is named");
  const small = later(dir, { chunks: grown("static/chunks/shell.js", 300) });
  const growth = sumsOf(measureBuild(small)).js - seeded().js;
  assert.ok(growth > 0 && growth <= TOLERANCE, `the fixture grows under the tolerance (${growth})`);
  const ok = run(small);
  assert.equal(ok.status, 0, ok.out);
});

test("a sum that falls past the tolerance fails until the fall is banked, and --update banks it, inside the tolerance too", () => {
  const dir = writeBuild();
  run(dir, "--raise");
  const shed = later(dir, { chunks: { ...CHUNKS, "static/chunks/shell.js": noise("shell", 120_000) } });
  const r = run(shed);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /good, now bank it/);
  assert.match(r.out, /--update js=\d+/, "the numbers to bank with, with no build");
  const banked = run(shed, "--update");
  assert.equal(banked.status, 0, banked.out);
  assert.equal(banked.budget().js, sumsOf(measureBuild(shed)).js);
  assert.deepEqual(bankBudget({ js: 99_900, css: 10_000, page: {} }, { js: 100_000, css: 10_000, page: {} }), {
    js: 99_900,
    css: 10_000,
    page: {},
  });
});

test("the bank takes each sum on its own: a fall banked, a rise kept, a page gone dropped, a new page seeded by a raise alone, the ceiling kept", () => {
  const budget = { js: 100_000, css: 10_000, page: { inbox: 5_000, people: 4_000 }, ceiling: { js: 200_000 } };
  const sums = { js: 120_000, css: 9_000, page: { inbox: 4_500, reports: 7_000 } };
  assert.deepEqual(bankBudget(sums, budget), {
    js: 100_000,
    css: 9_000,
    page: { inbox: 4_500 },
    ceiling: { js: 200_000 },
  });
  assert.deepEqual(bankBudget(sums, budget, { raise: true }).page, { inbox: 4_500, reports: 7_000 }, "seeded");
  assert.deepEqual(bankBudget(sums, budget, { raise: true, argued: { js: 2_300, page: { inbox: 100 } } }), {
    js: 102_300,
    css: 9_000,
    page: { inbox: 5_100, reports: 7_000 },
    ceiling: { js: 200_000 },
  });
  assert.equal(bankBudget(sums, null), null, "no budget: nothing written but by a raise");
  assert.deepEqual(bankBudget(sums, null, { raise: true }), { js: 120_000, css: 9_000, page: sums.page });
  const once = bankBudget(sums, budget);
  assert.deepEqual(bankBudget(sums, once), once, "banking twice is banking once");
});

test("REGRESSION (G:2): a raise writes the budget plus the growth its row argues, not the sums as measured", () => {
  // Main measured 970.1 KB inside the band of a 962.0 KB budget; #1206 argued 2.3 KB and banked 972.4, the 8.1 KB
  // that had crept in under the band with it. The budget is now what was argued.
  const budget = { js: 962_000, css: 123_100, page: {} };
  const measured = { js: 972_400, css: 123_100, page: {} };
  assert.deepEqual(bankBudget(measured, budget, { raise: true, argued: { js: 2_300 } }), {
    js: 964_300,
    css: 123_100,
    page: {},
  });
  assert.deepEqual(numbersIn(["--raise", "js=2300", "css=40", "inbox=12", "page=7", "js=x", "--next", "dir"]), {
    js: 2_300,
    css: 40,
    each: 7,
    page: { inbox: 12 },
  });
});

/* --------------------------- by numbers, with no build --------------------------- */

test("a raise or an update given its numbers moves the budget by arithmetic and reads no build; a bare raise needs one", () => {
  const dir = writeBuild();
  run(dir, "--raise");
  const was = seeded();
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "no-build-"));
  fs.copyFileSync(path.join(dir, "budget.json"), path.join(empty, "budget.json"));
  const raised = run(empty, "--raise", "js=953", "inbox=1557", "reports=85458");
  assert.equal(raised.status, 0, raised.out);
  assert.deepEqual(raised.budget(), {
    ...was,
    js: was.js + 953,
    page: { ...was.page, inbox: was.page.inbox + 1557, reports: 85458 },
  });
  const banked = run(empty, "--update", `css=${was.css - 335}`, "js=999999999");
  assert.equal(banked.status, 0, banked.out);
  assert.equal(banked.budget().css, was.css - 335, "banked as measured elsewhere");
  assert.equal(banked.budget().js, was.js + 953, "an update never raises");
  const bare = run(empty, "--raise");
  assert.equal(bare.status, 2, bare.out);
  assert.match(bare.out, /build the dashboard first/);
  assert.deepEqual(moveBudget({ js: 1, css: 2, page: {} }, { js: 5, page: { a: 3 } }, { raise: true }), {
    js: 6,
    css: 2,
    page: { a: 3 },
  });
});

test("a ceiling is set by numbers, and a build over it fails whatever the budget says", () => {
  const dir = writeBuild();
  run(dir, "--raise");
  const set = run(dir, "--ceiling", `js=${seeded().js + 100}`, "page=400000");
  assert.equal(set.status, 0, set.out);
  assert.deepEqual(set.budget().ceiling, { js: seeded().js + 100, page: 400_000 });
  const none = run(dir, "--ceiling");
  assert.equal(none.status, 2, none.out);
  const big = later(dir, { chunks: grown("static/chunks/shell.js", 20_000) });
  const growth = sumsOf(measureBuild(big)).js - seeded().js;
  run(big, "--raise", `js=${growth}`);
  const r = run(big);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /over the ceiling, which no row crosses/);
  assert.doesNotMatch(r.out, /grew past its budget/, "the budget was raised; the ceiling alone holds");
  assert.deepEqual(
    judge({ js: 10, css: 5, page: { inbox: 9 } }, { js: 10, css: 5, page: { inbox: 1 }, ceiling: { page: 8 } }).over,
    [{ key: "inbox", label: "page inbox", now: 9, ceiling: 8 }],
  );
});

/* ------------------------- against the base's own record ------------------------- */

test("--record writes the build's record, and --against the base's record holds a change to what it adds, by the byte", () => {
  const base = writeBuild();
  run(base, "--raise");
  const recordFile = path.join(base, "record.json");
  const recorded = run(base, "--record", recordFile, "--sha", "base1");
  assert.equal(recorded.status, 0, recorded.out);
  const record = JSON.parse(fs.readFileSync(recordFile, "utf8"));
  assert.equal(record.sha, "base1");
  assert.deepEqual(record.sums, seeded());
  assert.deepEqual(record.budget, seeded());
  assert.ok(record.files.js["static/chunks/shell.js"].gzip > 0, "each file's size, for what grew");

  const chunks = grown("static/chunks/inbox.js", 20_000, grown("static/chunks/shell.js", 20_000));
  const change = later(base, { chunks });
  const growth = {
    js: sumsOf(measureBuild(change)).js - seeded().js,
    inbox: gz(chunks, "static/chunks/inbox.js") - gz(CHUNKS, "static/chunks/inbox.js"),
  };
  const held = run(change, "--against", recordFile, "--base", "base1");
  assert.equal(held.status, 1, held.out);
  assert.match(held.out, /against main's own build base1, the base of this change/);
  assert.match(held.out, /this change grows what a page loads by more than the tolerance/);
  assert.match(
    held.out,
    new RegExp(`--raise js=${growth.js} inbox=${growth.inbox}`),
    "the exact bytes to argue, route and page",
  );
  assert.doesNotMatch(held.out, /people=\d+/, "a page that did not move is not argued");

  const argued = run(change, "--raise", `js=${growth.js}`, `inbox=${growth.inbox}`);
  assert.equal(argued.status, 0, argued.out);
  const covered = run(change, "--against", recordFile, "--base", "base1");
  assert.equal(covered.status, 0, covered.out);
  assert.match(covered.out, /within its budget/);

  const other = run(change, "--against", recordFile, "--base", "someone-else");
  assert.equal(other.status, 0, other.out);
  assert.match(other.out, /compared, not held/);
  const summary = path.join(base, "missing-summary.md");
  const missing = run(change, "--against", path.join(base, "nowhere.json"), "--base", "base1", "--summary", summary);
  assert.equal(missing.status, 0, missing.out);
  assert.match(missing.out, /no record of the base to compare with/);
  // The first changes after the check lands find no record at all: the table still says this build's sums, the
  // numbers a raise or a bank takes.
  const table = fs.readFileSync(summary, "utf8");
  assert.match(table, /No record of the base to compare with: held to the budget alone\./);
  assert.match(table, /\| route JS \| {2}\| [\d,]+ \| {2}\| [\d,]+ \|/, "the route's row, with no base and no change");
  assert.match(table, /\| page inbox \| {2}\| [\d,]+ \| {2}\|/, "and each page's");
});

test("the comparison's rows: what each sum adds and what the change raised for it, a new page covered by its seed", () => {
  const record = {
    sha: "b",
    sums: { js: 100, css: 10, page: { inbox: 50 } },
    budget: { js: 100, css: 10, page: { inbox: 50 } },
  };
  const sums = { js: 1_000, css: 10, page: { inbox: 50, reports: 900 } };
  const budget = { js: 300, css: 10, page: { inbox: 50, reports: 900 } };
  const rows = compareWith(sums, budget, record);
  assert.deepEqual(
    rows.map((r) => [r.key, r.growth, r.raised]),
    [
      ["js", 900, 200],
      ["css", 0, 0],
      ["inbox", 0, 0],
      ["reports", 900, 900],
    ],
  );
  assert.deepEqual(
    unargued(rows).map((r) => r.key),
    ["js"],
    "900 grown, 200 raised: 700 unargued, past the tolerance; the new page's seed covers it",
  );
});

test("growth under the tolerance that has summed past the drift is named as drift, not as this change's", () => {
  const base = writeBuild();
  run(base, "--raise");
  const recordFile = path.join(base, "record.json");
  // Main sits DRIFT bytes over its budget, carried there by earlier changes; its record says so.
  const budget = JSON.parse(fs.readFileSync(path.join(base, "budget.json"), "utf8"));
  fs.writeFileSync(path.join(base, "budget.json"), JSON.stringify({ ...budget, js: budget.js - DRIFT }));
  run(base, "--record", recordFile, "--sha", "base1");
  const change = later(base, { chunks: grown("static/chunks/shell.js", 300) });
  const r = run(change, "--against", recordFile, "--base", "base1");
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /summed past the drift/);
  assert.doesNotMatch(r.out, /this change grows/, "its own growth is under the tolerance");
  assert.match(r.out, /--raise js=\d+/, "banked by a row naming the merges");
});

test("--summary appends the table CI shows: every sum beside the base's, the budget and the ceiling", () => {
  const base = writeBuild();
  run(base, "--raise");
  run(base, "--ceiling", "js=999999");
  const recordFile = path.join(base, "record.json");
  run(base, "--record", recordFile, "--sha", "base1");
  const summary = path.join(base, "summary.md");
  fs.writeFileSync(summary, "# before\n");
  const small = later(base, { chunks: grown("static/chunks/shell.js", 300) });
  const r = run(small, "--against", recordFile, "--base", "base1", "--summary", summary);
  assert.equal(r.status, 0, r.out);
  const text = fs.readFileSync(summary, "utf8");
  assert.match(text, /^# before\n### What a workspace loads/);
  assert.match(text, /Against main's own build `base1`\./);
  assert.match(text, /\| route JS \| [\d,]+ \| [\d,]+ \| \+\d+ \| [\d,]+ \| 999,999 \|/);
  assert.match(text, /\| page inbox \| [\d,]+ \| [\d,]+ \| \+0 \| [\d,]+ \| {2}\|/);
  const alone = summaryOf({
    measured: measureBuild(base),
    budget: JSON.parse(fs.readFileSync(path.join(base, "budget.json"), "utf8")),
    compared: null,
  });
  assert.match(alone, /held to the budget alone/);
});

/* ----------------------------- the pages' own ----------------------------- */

test("a page's chunk that grows past the drift fails though the route is unchanged: Base UI reached the pages before the route", () => {
  const dir = writeBuild();
  run(dir, "--raise");
  const bigger = later(dir, { chunks: grown("static/chunks/inbox.js", 40_000) });
  const r = run(bigger);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /grew past its budget/);
  assert.match(r.out, /page inbox .* against a budget of/);
  assert.doesNotMatch(r.out, /\n {2}route JS .* against/, "the route's own JS is not named");
  assert.doesNotMatch(r.out, /page people .* against/, "the kit chunk both pages share did not grow");
});

test("a new page fails until seeded by --raise, its budget and the others' kept; a page gone fails until --update drops it", () => {
  const dir = writeBuild();
  run(dir, "--raise");
  const was = seeded();
  const more = later(dir, {
    pages: { ...PAGES, "reports/[[...lens]]": ["static/chunks/layout.js", "static/chunks/kit.js"] },
  });
  const plain = run(more);
  assert.equal(plain.status, 2, plain.out);
  assert.match(plain.out, /the budget names no page reports/);
  // The message seeds it by the bytes this build measured, which CI prints, so no laptop builds it.
  const seed = gz(CHUNKS, "static/chunks/kit.js");
  assert.match(plain.out, new RegExp(`--raise reports=${seed}\\b`));
  const byNumbers = run(more, "--raise", `reports=${seed}`);
  assert.equal(byNumbers.status, 0, byNumbers.out);
  assert.deepEqual(byNumbers.budget(), { ...was, page: { ...was.page, reports: seed } });
  fs.writeFileSync(path.join(more, "budget.json"), JSON.stringify(was));
  const seededMore = run(more, "--raise");
  assert.equal(seededMore.status, 0, seededMore.out);
  assert.deepEqual(seededMore.budget(), { ...was, page: { ...was.page, reports: gz(CHUNKS, "static/chunks/kit.js") } });
  const fewer = later(more, { pages: { "inbox/[[...thread]]": PAGES["inbox/[[...thread]]"] } });
  const gone = run(fewer);
  assert.equal(gone.status, 1, gone.out);
  assert.match(gone.out, /page people is gone/);
  const dropped = run(fewer, "--update");
  assert.equal(dropped.status, 0, dropped.out);
  assert.deepEqual(Object.keys(dropped.budget().page), ["inbox"]);
});

/* ----------------------------- the build's shape ----------------------------- */

test("a build with no loadable manifest, or one naming nothing, fails rather than leaving the shell out", () => {
  for (const loadable of [null, {}]) {
    const r = run(writeBuild({ loadable }), "--raise");
    assert.equal(r.status, 2, r.out);
  }
});

test("a manifest naming a file the build did not write fails", () => {
  const chunks = { ...CHUNKS };
  delete chunks["static/chunks/page.js"];
  const r = run(writeBuild({ chunks }), "--raise");
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /static\/chunks\/page\.js/);
});
