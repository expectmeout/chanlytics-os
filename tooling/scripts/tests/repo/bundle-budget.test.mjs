/**
 * What a workspace loads grows only on purpose: each change argues what it adds past a line, and nothing crosses a
 * ceiling.
 *
 * checks/bundle-budget.mjs runs in CI after the dashboard's build. Here it runs against a build written by hand, in
 * the shape Next writes (a build manifest, each page's client manifest, the route's loadable manifest, the chunks), so
 * what it counts and when it fails are proved without a build: the runtime, every segment's chunks and stylesheets and
 * the shell `next/dynamic` loads are the route's; each other page's own chunks beyond the route are that page's, a
 * shared chunk counted for each page that loads it; the polyfills and a chunk nothing names at load are not counted;
 * a build missing a manifest or a file fails rather than measuring less.
 *
 * Against the record of the main commit a change stands on, a sum grown past its line fails until the pull request's
 * description says why (`Bundle: <why>`, read from PR_BODY); a record of another commit, or none, is compared and not
 * held. Every build is held to its ceiling, which only `--ceiling` moves; near it the check warns. The week reads two
 * records of main and exits 3 when a sum grew past its week's line. The decisions are pure (`compareWith`,
 * `unargued`, `reasonIn`, `judge`, `weekOf`), held here case by case and then through the script.
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
  GROWTH_LINE,
  NEAR,
  WEEK_LINE,
  compareWith,
  judge,
  measureBuild,
  numbersIn,
  pageKey,
  reasonIn,
  summaryOf,
  sumsOf,
  unargued,
  weekOf,
  weekReport,
} from "../../checks/bundle-budget.mjs";

const SCRIPT = path.join(ROOT, "tooling/scripts/checks/bundle-budget.mjs");
/** Ceilings well clear of the fixtures' sums, unless a test sets its own. */
const CEILING = { js: 10_000_000, css: 10_000_000, page: 10_000_000 };
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

/** Runs the script over a build, its ceiling beside it; the pull request's description, where one is given, in PR_BODY. */
function run(dir, ...extra) {
  const ceiling = path.join(dir, "ceiling.json");
  if (!fs.existsSync(ceiling)) fs.writeFileSync(ceiling, JSON.stringify(CEILING));
  const body = extra.find((a) => typeof a === "object");
  const args = extra.filter((a) => typeof a === "string");
  const r = spawnSync(process.execPath, [SCRIPT, "--next", dir, "--baseline", ceiling, ...args], {
    encoding: "utf8",
    env: { ...process.env, PR_BODY: body?.body ?? "" },
  });
  return { status: r.status, out: r.stdout + r.stderr, ceiling: () => JSON.parse(fs.readFileSync(ceiling, "utf8")) };
}

/** The base's record: a build of main, recorded under its sha. */
function recordOf(dir, sha = "base1") {
  const file = path.join(dir, `record-${sha}.json`);
  const r = run(dir, "--record", file, "--sha", sha);
  assert.equal(r.status, 0, r.out);
  return file;
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
/** A chunk grown by a little, under its line, or by a lot, past it; the test checks which it got. */
const grown = (rel, by, chunks = CHUNKS) => ({ ...chunks, [rel]: chunks[rel] + noise(`more-${by}`, by) });

/* ----------------------------------- counting ----------------------------------- */

test("it counts the runtime, every segment's chunks once, the shell and the stylesheets for the route, each page's own chunks beyond it, a shared chunk for each page; not the polyfills or a chunk loaded later", () => {
  const dir = writeBuild();
  const r = run(dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /page inbox .* bytes gzipped/);
  assert.match(r.out, /within its lines and under its ceilings/);
  // The measure a test or a comparison of two builds reads is the script's own.
  assert.deepEqual(sumsOf(measureBuild(dir)), seeded());
  assert.equal(measureBuild(dir).js.files, 4);
});

test("a page is named by its path under the workspace, its dynamic segment, a group and `page` dropped", () => {
  assert.equal(pageKey("(os)/w/[workspace]/inbox/[[...thread]]/page"), "inbox");
  assert.equal(pageKey("(os)/w/[workspace]/templates/page"), "templates");
  assert.equal(pageKey("(os)/w/[workspace]/reports/(lens)/export/[[...x]]/page"), "reports/export");
});

/* ------------------------- what this change adds, against its base ------------------------- */

test("--record writes main's build under its sha; a change grown past its line fails against it until its pull request says why", () => {
  const base = writeBuild();
  const recordFile = recordOf(base);
  const record = JSON.parse(fs.readFileSync(recordFile, "utf8"));
  assert.equal(record.sha, "base1");
  assert.deepEqual(record.sums, seeded());
  assert.deepEqual(record.ceiling, CEILING);
  assert.ok(record.files.js["static/chunks/shell.js"].gzip > 0, "each file's size, for what grew");

  const chunks = grown("static/chunks/inbox.js", 20_000);
  const change = writeBuild({ chunks });
  const growth = gz(chunks, "static/chunks/inbox.js") - gz(CHUNKS, "static/chunks/inbox.js");
  assert.ok(growth > GROWTH_LINE.page, `the fixture grows the page past its line (${growth})`);
  const held = run(change, "--against", recordFile, "--base", "base1");
  assert.equal(held.status, 1, held.out);
  assert.match(held.out, /against main's own build base1, the base of this change/);
  assert.match(
    held.out,
    new RegExp(`page inbox \\+${growth.toLocaleString("en-US")} bytes gzipped \\(its line 2,048\\)`),
  );
  assert.match(held.out, /Bundle: <what grew it/, "it says how to argue it, in the pull request");
  assert.doesNotMatch(held.out, /route JS \+/, "the route did not grow");

  const said = run(change, "--against", recordFile, "--base", "base1", {
    body: "## What changes\n\nBundle: the composer's picker, drawn at once on every thread\n",
  });
  assert.equal(said.status, 0, said.out);
  assert.match(said.out, /grown past its line, and the pull request says why: the composer's picker/);

  const small = writeBuild({ chunks: grown("static/chunks/shell.js", 300) });
  const under = run(small, "--against", recordFile, "--base", "base1");
  assert.equal(under.status, 0, under.out);
  assert.match(under.out, /route JS \+\d+ bytes gzipped/, "growth under the line is said, and passes");
});

test("REGRESSION (#1534): growth other changes added under their lines is never this change's to pay for", () => {
  // Main grew under the line, merge after merge; its record is the base, so what this change is held to is its own.
  const main = writeBuild({ chunks: grown("static/chunks/inbox.js", 3_000, grown("static/chunks/shell.js", 3_000)) });
  const recordFile = recordOf(main, "main2");
  const change = writeBuild({
    chunks: grown(
      "static/chunks/inbox.js",
      3_000,
      grown("static/chunks/shell.js", 3_000, grown("static/chunks/kit.js", 100)),
    ),
  });
  const r = run(change, "--against", recordFile, "--base", "main2");
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /past its line/);
});

test("a base's record of another commit, or none, is compared and said, not held: the ceiling still holds", () => {
  const base = writeBuild();
  const recordFile = recordOf(base);
  const change = writeBuild({ chunks: grown("static/chunks/inbox.js", 20_000) });
  const other = run(change, "--against", recordFile, "--base", "someone-else");
  assert.equal(other.status, 0, other.out);
  assert.match(other.out, /compared, not held/);
  const summary = path.join(change, "summary.md");
  const missing = run(change, "--against", path.join(base, "nowhere.json"), "--base", "base1", "--summary", summary);
  assert.equal(missing.status, 0, missing.out);
  assert.match(missing.out, /no record of the base to compare with .*held to the ceiling alone/);
  const table = fs.readFileSync(summary, "utf8");
  assert.match(table, /No record of the base to compare with: held to the ceiling alone\./);
  assert.match(
    table,
    /\| route JS \| {2}\| [\d,]+ \| {2}\| 1,024 \| 10,000,000 \|/,
    "this build's sums, its line, its ceiling",
  );
});

test("the comparison's rows: what each sum adds, a new page from nothing, a page gone adding nothing; past its line by kind", () => {
  const rows = compareWith(
    { js: 2_000, css: 10, page: { inbox: 50, reports: 3_000 } },
    { js: 500, css: 10, page: { inbox: 50, people: 700 } },
  );
  assert.deepEqual(
    rows.map((r) => [r.key, r.growth, r.gone]),
    [
      ["js", 1_500, false],
      ["css", 0, false],
      ["inbox", 0, false],
      ["people", 0, true],
      ["reports", 3_000, false],
    ],
  );
  assert.deepEqual(
    unargued(rows).map((r) => r.key),
    ["js", "reports"],
    "1,500 past the route's 1,024; a new page's 3,000 past a page's 2,048",
  );
});

test("the reason is a line of the description, `Bundle: <why>`, in a few words at least", () => {
  assert.equal(reasonIn("Bundle: the map's tiles load with the page"), "the map's tiles load with the page");
  assert.equal(
    reasonIn("intro\n- **Bundle:** Base UI's popover on the Calendar\nmore"),
    "Base UI's popover on the Calendar",
  );
  assert.equal(reasonIn("bundle: lower case is a line too, said fully"), "lower case is a line too, said fully");
  assert.equal(reasonIn("Bundle: ok"), null, "a word or two is not a reason");
  assert.equal(reasonIn("The bundle grew, see the summary"), null, "only a line that starts with it");
  assert.equal(reasonIn(undefined), null);
});

/* ------------------------------------ the ceiling ------------------------------------ */

test("a build over its ceiling fails whatever its pull request says; near it the check warns; --ceiling sets it with no build", () => {
  const dir = writeBuild();
  const sums = seeded();
  fs.writeFileSync(
    path.join(dir, "ceiling.json"),
    JSON.stringify({ js: sums.js - 1, css: Math.ceil(sums.css / NEAR) - 1, page: 10_000_000 }),
  );
  const r = run(dir, { body: "Bundle: a reason that is long enough to read" });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /over the ceiling, which no pull request crosses:\n {2}route JS/);
  assert.match(r.out, /near a ceiling \(over 90%\):\n {2}route CSS/);
  assert.equal(
    judge(sums, { js: sums.js, css: sums.css, page: 1 })
      .over.map((r) => r.key)
      .join(),
    "inbox,people",
  );

  const set = run(dir, "--ceiling", "js=999999", "css=888888");
  assert.equal(set.status, 0, set.out);
  assert.deepEqual(set.ceiling(), { js: 999_999, css: 888_888, page: 10_000_000 });
  assert.deepEqual(numbersIn(["js=1", "page=2", "inbox=3", "--x"]), { js: 1, page: 2 });
  const bare = run(dir, "--ceiling");
  assert.equal(bare.status, 2, bare.out);
});

test("--summary appends the table CI shows: every sum beside the base's, its line and its ceiling, and the reason given", () => {
  const base = writeBuild();
  const recordFile = recordOf(base);
  const summary = path.join(base, "summary.md");
  fs.writeFileSync(summary, "# before\n");
  const small = writeBuild({ chunks: grown("static/chunks/shell.js", 300) });
  const r = run(small, "--against", recordFile, "--base", "base1", "--summary", summary, {
    body: "Bundle: nothing past a line, said anyway",
  });
  assert.equal(r.status, 0, r.out);
  const text = fs.readFileSync(summary, "utf8");
  assert.match(text, /^# before\n### What a workspace loads/);
  assert.match(text, /Against main's own build `base1`\./);
  assert.match(text, /\| route JS \| [\d,]+ \| [\d,]+ \| \+\d+ \| 1,024 \| 10,000,000 \|/);
  assert.match(text, /\| page inbox \| [\d,]+ \| [\d,]+ \| \+0 \| 2,048 \| 10,000,000 \|/);
  assert.match(text, /The pull request says why it grows: nothing past a line, said anyway/);
  const alone = summaryOf({ measured: measureBuild(base), ceiling: CEILING, compared: null });
  assert.match(alone, /held to the ceiling alone/);
});

/* ------------------------------------- the week ------------------------------------- */

test("the week: main beside main a week before, a sum past its week's line exits 3 with the merges named; under it exits 0", () => {
  const older = { sha: "old", sums: { js: 1_000, css: 100, page: { inbox: 500 } } };
  const newer = { sha: "new", sums: { js: 1_000 + WEEK_LINE.js + 1, css: 100, page: { inbox: 500 + WEEK_LINE.page } } };
  const week = weekOf(older, newer);
  assert.deepEqual(
    week.past.map((r) => r.key),
    ["js"],
    "past by a byte; the page exactly at its line is not",
  );
  const report = weekReport({ older, newer, week, commits: "abc1234 A change (#1)\ndef5678 Another (#2)" });
  assert.match(report, /the week from `old` to `new`/);
  assert.match(report, /Grew past the week's line: route JS \+4,097/);
  assert.match(report, /- abc1234 A change \(#1\)\n- def5678 Another \(#2\)/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-week-"));
  const put = (name, v) => (fs.writeFileSync(path.join(dir, name), JSON.stringify(v)), path.join(dir, name));
  const reportFile = path.join(dir, "week.md");
  const past = spawnSync(
    process.execPath,
    [SCRIPT, "--week", put("old.json", older), put("new.json", newer), "--report", reportFile],
    { encoding: "utf8" },
  );
  assert.equal(past.status, 3, past.stdout + past.stderr);
  assert.match(fs.readFileSync(reportFile, "utf8"), /Grew past the week's line/);
  const calm = spawnSync(process.execPath, [SCRIPT, "--week", put("a.json", older), put("b.json", older)], {
    encoding: "utf8",
  });
  assert.equal(calm.status, 0, calm.stdout + calm.stderr);
  assert.match(calm.stdout, /Nothing grew past the week's line\./);
});

/* ----------------------------- the build's shape ----------------------------- */

test("a build with no loadable manifest, or one naming nothing, fails rather than leaving the shell out", () => {
  for (const loadable of [null, {}]) {
    const r = run(writeBuild({ loadable }));
    assert.equal(r.status, 2, r.out);
  }
});

test("a manifest naming a file the build did not write fails", () => {
  const chunks = { ...CHUNKS };
  delete chunks["static/chunks/page.js"];
  const r = run(writeBuild({ chunks }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /static\/chunks\/page\.js/);
});
