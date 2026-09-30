/**
 * What the suite ran of the code is measured on a full run (tooling/scripts/checks/test.mjs) and held at a floor for
 * three areas: core, the edge's doors and the dashboard's routes (tooling/scripts/checks/coverage.mjs). A floor can be
 * held only if the report is read right, so each step is run here over a report and a tree made for the test: the lcov
 * as Node writes it, a bundle read back to its modules, an area's percent, a floor's verdict and what a bank writes;
 * and the reporter and the lcov are run once for real, through Node's own runner.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AREAS,
  FLOORS,
  SLACK,
  bankedFloors,
  finish,
  judge,
  modulesOfBundle,
  parseLcov,
  summarize,
  tableOf,
  underFloors,
} from "../../checks/coverage.mjs";
import { withoutCoverage } from "../../checks/tap-reporter.mjs";
import { ROOT } from "../_source.mjs";

const made = [];
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

/** A repository in a temp directory: a core bundle, a doors tree of two files (one no test loaded), one route. */
function world() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-world-"));
  made.push(root);
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  // core's bundle: lines 2-5 are src/a.ts, 7-8 are another package's, 10-12 an inlined json, 14-15 src/b.ts
  put(
    "packages/core/dist/index.js",
    [
      "// src/a.ts",
      "const a = 1;",
      "const b = 2;",
      "const c = 3;",
      "const d = 4;",
      "// ../contracts/src/x.ts",
      "const x = 1;",
      "const y = 2;",
      "// src/data.json",
      "const data = [",
      "  1, 2, 3",
      "];",
      "// src/b.ts",
      "const e = 5;",
      "const f = 6;",
    ].join("\n"),
  );
  put("apps/edge/api/ran.ts", "export const a = 1;\nexport const b = 2;\n\nexport const c = 3;\nexport const d = 4;\n");
  put("apps/edge/api/never.ts", "export const a = 1;\n\nexport const b = 2;\n");
  put("apps/edge/api/types.d.ts", "export type T = 1;\n");
  put("apps/dashboard/app/api/v1/x/route.ts", "export const GET = 1;\nexport const POST = 2;\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

const lcov = (root) =>
  [
    // core's bundle, read from `dist`: a.ts runs 3 of 4 lines, b.ts 1 of 2; nothing of the json or contracts counts
    `SF:${path.join(root, "packages/core/dist/index.js")}`,
    ...[2, 3, 4, 5, 7, 8, 10, 11, 12].map((l, i) => `DA:${l},${i === 3 ? 0 : 1}`),
    ...[14, 15].map((l, i) => `DA:${l},${i === 0 ? 1 : 0}`),
    "end_of_record",
    // a door a test ran: 4 of its 4 code lines (the report has no line for a blank one)
    `SF:${path.join(root, "apps/edge/api/ran.ts")}`,
    ...[1, 2, 4, 5].map((l) => `DA:${l},2`),
    "end_of_record",
    "",
  ].join("\n");

test("an lcov report is read to files, their lines and how often each ran; a relative path and a repeated line are kept", () => {
  const text =
    "SF:apps\\edge\\api\\a.ts\nDA:1,3\nDA:2,0\nDA:2,4\nend_of_record\nSF:apps/edge/api/b.ts\nDA:9,0\nend_of_record\n";
  const files = parseLcov(text, ROOT);
  assert.deepEqual([...files.keys()].sort(), ["apps/edge/api/a.ts", "apps/edge/api/b.ts"].sort());
  assert.deepEqual(
    [...files.get("apps/edge/api/a.ts")],
    [
      [1, 3],
      [2, 4],
    ],
  );
});

test("a bundle is read back to the modules its own package wrote: another package's lines and inlined data do not count", () => {
  const root = world();
  const modules = modulesOfBundle(fs.readFileSync(path.join(root, "packages/core/dist/index.js"), "utf8"));
  assert.deepEqual([...modules.keys()], ["src/a.ts", "src/b.ts"]);
  assert.deepEqual(modules.get("src/a.ts"), [2, 3, 4, 5]);
  assert.deepEqual(modules.get("src/b.ts"), [14, 15]);
});

test("an area's coverage: a package from its bundle's own modules, a tree from its tracked files, one no test loaded counting in full", () => {
  const root = world();
  const by = Object.fromEntries(summarize(lcov(root), root).map((s) => [s.key, s]));
  // a.ts: lines 2, 3, 4 ran, 5 did not; b.ts: line 14 ran, 15 did not: 4 of 6
  assert.equal(by.core.pct, 66.7);
  assert.equal(by.core.modules, 2);
  // ran.ts: 4 of 4; never.ts: 2 code lines, none run; types.d.ts is no module: 4 of 6
  assert.equal(by.doors.pct, 66.7);
  assert.equal(by.doors.modules, 2);
  // a route no test loaded is all unrun
  assert.equal(by.routes.pct, 0);
  assert.equal(by.jobs.pct, 0, "a package with no bundle in the tree reports nothing, as zero");
});

test("a floor is held for the three areas and no other; a floor is a verdict on the measure, not on the last run", () => {
  assert.deepEqual(
    AREAS.filter((a) => a.floor).map((a) => a.key),
    ["core", "doors", "routes"],
  );
  const summary = [
    { key: "core", label: "core", pct: 70.4 },
    { key: "doors", label: "doors", pct: 55 },
    { key: "jobs", label: "jobs", pct: 1 },
  ];
  assert.deepEqual(underFloors(summary, { core: 70.5, doors: 55, jobs: 90 }), [
    { key: "core", label: "core", pct: 70.4, floor: 70.5 },
  ]);
  assert.deepEqual(underFloors(summary, {}), [], "an area with no floor yet is not judged");
});

test("a bank raises a floor to the measure less the slack, and lowers one only when told to", () => {
  const summary = [
    { key: "core", label: "core", pct: 72.34 },
    { key: "doors", label: "doors", pct: 50 },
    { key: "routes", label: "routes", pct: 40 },
    { key: "jobs", label: "jobs", pct: 5 },
  ];
  const floors = { core: 70, doors: 60 };
  assert.equal(SLACK, 1);
  assert.deepEqual(bankedFloors(summary, floors), { core: 71.3, doors: 60, routes: 39 });
  assert.deepEqual(bankedFloors(summary, floors, { lower: true }), { core: 71.3, doors: 49, routes: 39 });
  assert.deepEqual(floors, { core: 70, doors: 60 }, "the floors it was given are not changed");
});

test("the table names every area with its measure, and a held one's floor", () => {
  const table = tableOf(
    [
      { key: "core", label: "core", pct: 72.34 },
      { key: "jobs", label: "jobs", pct: 5 },
    ],
    { core: 71.3 },
  ).split("\n");
  assert.match(table[0], /^core\s+72\.3%\s+floor 71\.3%$/);
  assert.match(table[1], /^jobs\s+5\.0%$/);
});

test("a run ends red under a floor, keeps its own failure, fails without a report, and banks only a run that passed", () => {
  const root = world();
  const at = { lcov: lcov(root), root };
  const held = { core: 66, doors: 66, routes: 0 };
  const green = judge({ ...at, floors: held, status: 0 });
  assert.equal(green.status, 0);
  assert.equal(green.banked, null);
  assert.match(green.lines[0], /^# what the suite ran of the code/);
  const red = judge({ ...at, floors: { ...held, core: 80 }, status: 0 });
  assert.equal(red.status, 1);
  assert.match(red.lines.at(-1), /^coverage: core is at 66\.7%, under its floor of 80\.0%.*COVERAGE_FLOORS=lower/);
  // a test that failed keeps its status, and the floor is still said
  assert.equal(judge({ ...at, floors: { ...held, core: 80 }, status: 1 }).status, 1);
  assert.equal(judge({ ...at, floors: held, status: 3 }).status, 3);
  // a report that never came is a failure, not a pass
  assert.equal(judge({ lcov: null, root, floors: held, status: 0 }).status, 1);
  // the bank raises a floor the suite cleared, for `1` and for `raise`, and never lowers one: a floor it is under is red
  for (const bank of ["1", "raise"]) {
    assert.deepEqual(judge({ ...at, floors: { ...held, core: 50 }, status: 0, bank }).banked, {
      core: 65.7,
      doors: 66,
      routes: 0,
    });
    const still = judge({ ...at, floors: { ...held, core: 80 }, status: 0, bank });
    assert.deepEqual([still.status, still.banked.core], [1, 80], `${bank}: a bank does not lower, and does not hide`);
  }
  // and banks nothing from a run that did not pass
  assert.equal(judge({ ...at, floors: { ...held, core: 50 }, status: 1, bank: "1" }).banked, null);
  // lowering is its own switch: every held floor to the measure less the slack, none judged
  const lowered = judge({ ...at, floors: { ...held, core: 80 }, status: 0, lower: true });
  assert.deepEqual([lowered.status, lowered.banked.core], [0, 65.7]);
  assert.equal(judge({ ...at, floors: { ...held, core: 80 }, status: 1, lower: true }).banked, null);
  // a run of some files is not the suite: the table, and no floor
  const some = judge({ ...at, floors: { ...held, core: 80 }, status: 0, held: false, bank: "1" });
  assert.deepEqual([some.status, some.banked], [0, null]);
  assert.ok(!some.lines.join("\n").includes("floor"));
});

/** The end of a measured run in a temp repository: what it prints, what it returns, and what it writes. */
function ended(t, { floors, status = 0, env = {}, held = true, report = true }) {
  const root = world();
  const floorsFile = path.join(root, FLOORS);
  if (floors) {
    fs.mkdirSync(path.dirname(floorsFile), { recursive: true });
    fs.writeFileSync(floorsFile, JSON.stringify(floors));
  }
  const coverage = path.join(root, "run.lcov");
  if (report) fs.writeFileSync(coverage, lcov(root));
  const said = [];
  t.mock.method(console, "error", (line) => said.push(String(line)));
  const code = finish({ coverage, status, env, held, root });
  return {
    code,
    said: said.join("\n"),
    kept: fs.existsSync(coverage),
    floors: fs.existsSync(floorsFile) ? JSON.parse(fs.readFileSync(floorsFile, "utf8")) : null,
  };
}

test("the end of a measured run, from its report: the table, the floor missed, the report removed, and a bank written only when asked", (t) => {
  const held = { core: 66, doors: 66, routes: 0 };
  const green = ended(t, { floors: held });
  assert.deepEqual([green.code, green.kept, green.floors], [0, false, held], "the report goes, the floors stay");
  assert.match(green.said, /core\s+66\.7%\s+floor 66\.0%/);

  const red = ended(t, { floors: { ...held, core: 80 } });
  assert.equal(red.code, 1);
  assert.match(red.said, /core is at 66\.7%, under its floor of 80\.0%/);

  const raised = ended(t, { floors: { ...held, core: 50 }, env: { UPDATE_BASELINES: "1" } });
  assert.deepEqual([raised.code, raised.floors], [0, { core: 65.7, doors: 66, routes: 0 }]);
  assert.match(raised.said, /floors written to tooling\/scripts\/tests\/baselines\/coverage\.json/);

  // `raise` is for the other ratchets: it neither lowers a coverage floor nor hides one missed
  const raise = ended(t, { floors: { ...held, core: 80 }, env: { UPDATE_BASELINES: "raise" } });
  assert.deepEqual([raise.code, raise.floors.core], [1, 80]);

  const lowered = ended(t, { floors: { ...held, core: 80 }, env: { COVERAGE_FLOORS: "lower" } });
  assert.deepEqual([lowered.code, lowered.floors.core], [0, 65.7]);

  const failed = ended(t, { floors: { ...held, core: 50 }, status: 1, env: { UPDATE_BASELINES: "1" } });
  assert.deepEqual([failed.code, failed.floors.core], [1, 50], "a run that failed banks nothing");

  const some = ended(t, { floors: { ...held, core: 80 }, held: false });
  assert.deepEqual([some.code, some.floors.core], [0, 80], "a run of some files is judged by no floor");

  const none = ended(t, { floors: held, report: false });
  assert.equal(none.code, 1, "no report is a red run");
  assert.match(none.said, /wrote no report/);
});

test("through the launcher, a measured run prints the table and ends with the runner's own status", () => {
  const env = { ...process.env, TEST_COVERAGE: "1" };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(
    process.execPath,
    ["tooling/scripts/checks/test.mjs", "tooling/scripts/tests/fixtures/coverage-probe.mjs"],
    {
      cwd: ROOT,
      env,
      encoding: "utf8",
    },
  );
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /^ok 1 - the probe runs the code it names/m);
  assert.match(run.stderr, /# what the suite ran of the code/);
  assert.match(run.stderr, /the edge's doors \(apps\/edge\/api\)\s+\d+\.\d%\n/, "a run of one file holds no floor");
  assert.ok(!run.stderr.includes("under its floor"));
});

test("the floors the repository holds are numbers for the three areas, each under what the area could be", () => {
  const floors = JSON.parse(fs.readFileSync(path.join(ROOT, FLOORS), "utf8"));
  assert.deepEqual(Object.keys(floors).sort(), ["core", "doors", "routes"]);
  for (const [key, floor] of Object.entries(floors)) {
    assert.equal(typeof floor, "number", key);
    assert.ok(floor > 0 && floor < 100, `${key}: ${floor}`);
  }
});

test("the reporter drops the runner's coverage table and keeps everything else", async () => {
  const events = [{ type: "test:pass" }, { type: "test:coverage" }, { type: "test:diagnostic" }];
  const kept = [];
  for await (const e of withoutCoverage(events)) kept.push(e.type);
  assert.deepEqual(kept, ["test:pass", "test:diagnostic"]);
});

test("through Node's own runner, the reporter prints TAP with no coverage table and the lcov file names the code it ran", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-run-"));
  made.push(dir);
  const report = path.join(dir, "run.lcov");
  const env = { ...process.env, TZ: "UTC" };
  // a child of the suite's own runner is told so; a runner started inside it must not be
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "--experimental-test-coverage",
      "--test-reporter=./tooling/scripts/checks/tap-reporter.mjs",
      "--test-reporter-destination=stdout",
      "--test-reporter=lcov",
      `--test-reporter-destination=${report}`,
      "tooling/scripts/tests/fixtures/coverage-probe.mjs",
    ],
    { cwd: ROOT, env, encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /^ok 1 - the probe runs the code it names/m);
  assert.doesNotMatch(run.stdout, /start of coverage report|all files/);
  const files = parseLcov(fs.readFileSync(report, "utf8"), ROOT);
  const ran = files.get("tooling/scripts/checks/coverage.mjs");
  assert.ok(ran && [...ran.values()].some((n) => n > 0), [...files.keys()].join(", "));
});
