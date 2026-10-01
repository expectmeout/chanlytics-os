/**
 * The workspace route's budget counts what a person waits for, and holds it.
 *
 * checks/bundle-budget.mjs runs in CI after the dashboard's build. Here it runs
 * against a build written by hand, in the shape Next writes (a build manifest, the
 * page's client manifest, its loadable manifest, the chunks), so what it counts
 * and when it fails are proved without a four-minute build: the runtime, every
 * segment's chunks and stylesheets and the shell `next/dynamic` loads are counted;
 * the polyfills and a chunk nothing names at load are not; a rise past the band
 * fails, a fall past it fails until banked, and a build missing a manifest or a
 * file fails rather than measuring less.
 *
 * `--update` banks only what fell, the JavaScript and the CSS each on its own, inside
 * the band too; a rise stays red until `--raise js=<bytes>` raises the budget by the
 * growth argued, never to the sums as measured, and a missing budget is seeded by
 * `--raise` alone, as _ratchet.mjs seeds a baseline. The decision is `bankBudget`, a
 * pure function, held here case by case and then through the script.
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
import { BAND, arguedGrowth, bankBudget } from "../../checks/bundle-budget.mjs";

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
};

function writeBuild({ loadable = { 33959: { id: 33959, files: ["static/chunks/shell.js"] } }, chunks = CHUNKS } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-budget-"));
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  put(
    "build-manifest.json",
    JSON.stringify({ rootMainFiles: ["static/chunks/runtime.js"], polyfillFiles: ["static/chunks/polyfills.js"] }),
  );
  const client = {
    clientModules: { "[project]/layout-router.js": { chunks: ["/_next/static/chunks/layout.js"] } },
    entryJSFiles: {
      "[project]/apps/dashboard/app/layout": ["static/chunks/layout.js"],
      "[project]/apps/dashboard/app/(os)/w/[workspace]/[[...route]]/page": [
        "static/chunks/layout.js",
        "static/chunks/page.js",
      ],
    },
    entryCSSFiles: { "[project]/apps/dashboard/app/layout": [{ path: "static/chunks/app.css", inlined: false }] },
  };
  put(
    `${PAGE_DIR}/page_client-reference-manifest.js`,
    "globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n" +
      `globalThis.__RSC_MANIFEST["/(os)/w/[workspace]/[[...route]]/page"] = ${JSON.stringify(client)};\n`,
  );
  if (loadable) put(`${PAGE_DIR}/page/react-loadable-manifest.json`, JSON.stringify(loadable));
  for (const [rel, text] of Object.entries(chunks)) put(rel, text);
  return dir;
}

function run(dir, ...extra) {
  const baseline = path.join(dir, "budget.json");
  const r = spawnSync(process.execPath, [SCRIPT, "--next", dir, "--baseline", baseline, ...extra], {
    encoding: "utf8",
  });
  return { status: r.status, out: r.stdout + r.stderr, budget: () => JSON.parse(fs.readFileSync(baseline, "utf8")) };
}

const gzText = (text) => zlib.gzipSync(Buffer.from(text), { level: 9 }).length;
const gz = (...rels) => rels.reduce((a, rel) => a + gzText(CHUNKS[rel]), 0);

test("it counts the runtime, every segment's chunks once, the shell and the stylesheets; not the polyfills or a chunk loaded later", () => {
  const dir = writeBuild();
  const seeded = run(dir, "--raise");
  assert.equal(seeded.status, 0, seeded.out);
  assert.deepEqual(seeded.budget(), {
    js: gz("static/chunks/runtime.js", "static/chunks/layout.js", "static/chunks/page.js", "static/chunks/shell.js"),
    css: gz("static/chunks/app.css"),
  });
  const again = run(dir);
  assert.equal(again.status, 0, again.out);
  assert.match(again.out, /within 1% of the budget/);
});

test("a route that grows past the band fails until its budget is raised", () => {
  const dir = writeBuild();
  run(dir, "--raise");
  const grown = writeBuild({
    chunks: { ...CHUNKS, "static/chunks/shell.js": CHUNKS["static/chunks/shell.js"] + noise("more", 20_000) },
  });
  fs.copyFileSync(path.join(dir, "budget.json"), path.join(grown, "budget.json"));
  const r = run(grown);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /grew past its budget/);
  assert.match(r.out, /JS .* gzipped/);
  assert.doesNotMatch(r.out, /CSS .* ->/, "only what grew is named");
});

test("a route that sheds more than the band fails until the fall is banked", () => {
  const dir = writeBuild();
  run(dir, "--raise");
  const shed = writeBuild({ chunks: { ...CHUNKS, "static/chunks/shell.js": noise("shell", 120_000) } });
  fs.copyFileSync(path.join(dir, "budget.json"), path.join(shed, "budget.json"));
  const r = run(shed);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /good, now bank it/);
});

test("the bank takes each sum on its own: a fall is banked, inside the band too, and anything else keeps its budget", () => {
  const budget = { js: 100_000, css: 10_000 };
  assert.equal(BAND, 0.01, "the cases below sit either side of a 1% band");
  assert.deepEqual(bankBudget({ js: 98_000, css: 9_800 }, budget), { js: 98_000, css: 9_800 }, "both fell past it");
  assert.deepEqual(
    bankBudget({ js: 99_500, css: 9_950 }, budget),
    { js: 99_500, css: 9_950 },
    "REGRESSION (G:2): a fall within the band was never banked, and the next growth rode into it",
  );
  assert.deepEqual(bankBudget({ js: 100_500, css: 10_050 }, budget), budget, "a rise within the band");
  assert.deepEqual(bankBudget({ js: 120_000, css: 12_000 }, budget), budget, "a rise past the band stays red");
  assert.deepEqual(bankBudget({ js: 90_000, css: 12_000 }, budget), { js: 90_000, css: 10_000 }, "one fell, one rose");
  assert.deepEqual(bankBudget({ js: 120_000, css: 9_000 }, budget), { js: 100_000, css: 9_000 }, "one rose, one fell");
});

test("a sum the budget does not name is not written but by --raise, and a name the check does not hold leaves", () => {
  assert.deepEqual(bankBudget({ js: 90_000, css: 9_000 }, { js: 100_000 }), { js: 90_000 }, "css is new");
  assert.deepEqual(bankBudget({ js: 90_000, css: 9_000 }, { js: 100_000, css: 10_000, total: 1 }), {
    js: 90_000,
    css: 9_000,
  });
  const raised = bankBudget({ js: 120_000, css: 9_000 }, { js: 100_000 }, { raise: true, argued: { js: 20_000 } });
  assert.deepEqual(raised, { js: 120_000, css: 9_000 }, "the argued JS, and the CSS the budget did not name, seeded");
});

test("REGRESSION (G:2): a raise writes the budget plus the growth its row argues, not the sums as measured", () => {
  // Main measured 970.1 KB inside the 1% band of a 962.0 KB budget; #1206 argued 2.3 KB and banked 972.4, the 8.1 KB
  // that had crept in under the band with it. The budget is now what was argued.
  const budget = { js: 962_000, css: 123_100 };
  const measured = { js: 972_400, css: 123_100 };
  assert.deepEqual(bankBudget(measured, budget, { raise: true, argued: { js: 2_300 } }), { js: 964_300, css: 123_100 });
  assert.deepEqual(bankBudget(measured, budget, { raise: true, argued: { css: 2_700 } }), {
    js: 962_000,
    css: 125_800,
  });
  assert.deepEqual(arguedGrowth(["--raise", "js=2300", "css=40", "js=x", "--next", "dir"]), { js: 2_300, css: 40 });
});

test("a missing budget is seeded by --raise alone, which writes the sums whatever the budget held", () => {
  // With no budget each sum is new, which is a rise: the bank writes nothing, as _ratchet.mjs's does.
  assert.equal(bankBudget({ js: 120_000, css: 12_000 }, null), null);
  assert.deepEqual(bankBudget({ js: 120_000, css: 12_000 }, null, { raise: true }), { js: 120_000, css: 12_000 });
  assert.deepEqual(
    bankBudget({ js: 120_000, css: 9_000 }, { js: 100_000, css: 10_000 }, { raise: true }),
    { js: 100_000, css: 9_000 },
    "a raise that argues nothing raises nothing",
  );
  const once = bankBudget({ js: 90_000, css: 12_000 }, { js: 100_000, css: 10_000 });
  assert.deepEqual(bankBudget({ js: 90_000, css: 12_000 }, once), once, "banking twice is banking once");
});

test("--update seeds no budget and banks only the sum that fell, so a missing budget and a rise stay red until --raise", () => {
  const dir = writeBuild();
  for (const flags of [["--update"], []]) {
    const none = run(dir, ...flags);
    assert.equal(none.status, 2, none.out);
    assert.match(none.out, /seed it with corepack pnpm check:bundle -- --raise after a build/);
    assert.ok(!fs.existsSync(path.join(dir, "budget.json")), `${flags[0] ?? "a plain run"} writes no budget`);
  }
  const seeding = run(dir, "--raise");
  assert.equal(seeding.status, 0, seeding.out);
  const seeded = seeding.budget();
  const shell = CHUNKS["static/chunks/shell.js"] + noise("more", 20_000);
  const css = noise("css", 20_000);
  const moved = writeBuild({ chunks: { ...CHUNKS, "static/chunks/shell.js": shell, "static/chunks/app.css": css } });
  fs.copyFileSync(path.join(dir, "budget.json"), path.join(moved, "budget.json"));

  const banked = run(moved, "--update");
  assert.equal(banked.status, 1, banked.out);
  assert.match(banked.out, /grew past its budget/);
  assert.match(banked.out, /check:bundle -- --raise/, "the message names the flag that raises");
  assert.deepEqual(banked.budget(), { js: seeded.js, css: gzText(css) }, "the CSS fell and is banked; the JS is not");

  const unargued = run(moved, "--raise");
  assert.equal(unargued.status, 2, unargued.out);
  assert.match(unargued.out, /a raise says by how much: corepack pnpm check:bundle -- --raise js=<bytes>/);
  const js = gz("static/chunks/runtime.js", "static/chunks/layout.js", "static/chunks/page.js") + gzText(shell);
  const raised = run(moved, "--raise", `js=${js - seeded.js}`);
  assert.equal(raised.status, 0, raised.out);
  assert.deepEqual(raised.budget(), { js, css: gzText(css) });
  const again = run(moved);
  assert.equal(again.status, 0, again.out);
});

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
