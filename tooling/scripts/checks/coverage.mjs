/**
 * What the node suite ran of the code, per package and per tree, from the lcov report Node's own coverage writes
 * (`--experimental-test-coverage`, turned on by tooling/scripts/checks/test.mjs for a full run), and the floors three
 * areas are held to: core, the edge's doors and the dashboard's routes.
 *
 * A package's code runs mostly from its committed dist, one bundle, so its lines are read back to the module that
 * wrote them by the bundler's own markers (`// src/campaigns/run.ts`): a package's coverage is its own modules, in its
 * own bundle, or read directly from source by a test that imports the file, whichever ran more of each module. Code a
 * bundle inlines from another package counts for that package only in that package's own bundle. A tree (apps/edge/api)
 * is its tracked files; one no test loaded counts every line, none run.
 *
 * Line coverage, in the lines V8 reports: close to the source's, never equal to it (a transpiled file has the loader's
 * lines too). The floors hold it from falling; they are not a target.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** What is reported, in order: a package by its name, a tree by its path. `floor` marks the three that are held. */
export const AREAS = [
  { key: "core", label: "core", pkg: "core", floor: true },
  { key: "jobs", label: "jobs", pkg: "jobs" },
  { key: "db", label: "db", pkg: "db" },
  { key: "channels", label: "channels", pkg: "channels" },
  { key: "contracts", label: "contracts", pkg: "contracts" },
  { key: "doors", label: "the edge's doors (apps/edge/api)", tree: "apps/edge/api", floor: true },
  { key: "edge-lib", label: "the edge's lib (apps/edge/lib)", tree: "apps/edge/lib" },
  {
    key: "routes",
    label: "the dashboard's routes (apps/dashboard/app/api)",
    tree: "apps/dashboard/app/api",
    floor: true,
  },
  { key: "server", label: "the dashboard's server (apps/dashboard/src/server)", tree: "apps/dashboard/src/server" },
];

export const FLOORS = "tooling/scripts/tests/baselines/coverage.json";
/** How far under the last measure a floor sits, in points: V8 on another platform or version counts a line differently. */
export const SLACK = 1;

/** A path with forward slashes: an lcov written on Windows names a file with backslashes, whatever machine reads it. */
const slash = (p) => p.replaceAll("\\", "/");

/** An lcov report, read: each file (repo-relative) with its lines and how often each ran. */
export function parseLcov(text, root) {
  const files = new Map();
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith("SF:")) {
      const abs = raw.slice(3);
      const rel = slash(path.isAbsolute(abs) ? path.relative(root, abs) : abs);
      cur = new Map();
      files.set(rel, cur);
    } else if (raw.startsWith("DA:") && cur) {
      const [line, count] = raw.slice(3).split(",").map(Number);
      cur.set(line, Math.max(cur.get(line) ?? 0, count));
    } else if (raw === "end_of_record") cur = null;
  }
  return files;
}

/** A bundle's lines by the module that wrote them: `// src/x.ts` opens a module of the package's own code, any other marker (another package's, or inlined data such as a `.json`) ends it. */
export function modulesOfBundle(text) {
  const out = new Map();
  let mod = null;
  text.split(/\r?\n/).forEach((l, i) => {
    const m = /^\/\/ (\S+)$/.exec(l);
    if (m) mod = /^src\/.+\.tsx?$/.test(m[1]) ? m[1] : null;
    else if (mod) (out.get(mod) ?? out.set(mod, []).get(mod)).push(i + 1);
  });
  return out;
}

const ratio = ({ found, hit }) => (found ? hit / found : 0);

/** A package's own modules: each read from its bundle and from its source, whichever ran more of it. */
function packageArea(pkg, report, root) {
  const bundlePath = `packages/${pkg}/dist/index.js`;
  const bundle = fs.existsSync(path.join(root, bundlePath))
    ? modulesOfBundle(fs.readFileSync(path.join(root, bundlePath), "utf8"))
    : new Map();
  const ran = report.get(bundlePath);
  const byModule = new Map();
  for (const [mod, lines] of bundle) {
    const counted = ran ? lines.filter((l) => ran.has(l)) : lines;
    byModule.set(mod, { found: counted.length, hit: ran ? counted.filter((l) => ran.get(l) > 0).length : 0 });
  }
  const prefix = `packages/${pkg}/`;
  for (const [file, lines] of report) {
    if (!file.startsWith(`${prefix}src/`)) continue;
    const mod = file.slice(prefix.length);
    const direct = { found: lines.size, hit: [...lines.values()].filter((n) => n > 0).length };
    const was = byModule.get(mod);
    if (!was || ratio(direct) > ratio(was)) byModule.set(mod, direct);
  }
  let found = 0;
  let hit = 0;
  for (const m of byModule.values()) {
    found += m.found;
    hit += m.hit;
  }
  return { found, hit, modules: byModule.size };
}

/** A tree's tracked files: each as the report ran it, or every line unrun when no test loaded it. */
function treeArea(tree, report, root) {
  let files;
  try {
    files = execFileSync("git", ["ls-files", "--", tree], { cwd: root, encoding: "utf8" }).split("\n");
  } catch {
    files = [...report.keys()].filter((f) => f.startsWith(`${tree}/`));
  }
  let found = 0;
  let hit = 0;
  let n = 0;
  for (const f of files.map((l) => l.trim()).filter((l) => /\.(ts|tsx)$/.test(l) && !/\.(d|type-test)\.ts$/.test(l))) {
    n++;
    const ran = report.get(f);
    if (ran) {
      found += ran.size;
      hit += [...ran.values()].filter((c) => c > 0).length;
    } else {
      found += fs
        .readFileSync(path.join(root, f), "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim()).length;
    }
  }
  return { found, hit, modules: n };
}

/** Every area's coverage, in AREAS' order: `{ key, label, pct, modules }`, pct to one decimal. */
export function summarize(lcovText, root) {
  const report = parseLcov(lcovText, root);
  return AREAS.map((a) => {
    const { found, hit, modules } = a.pkg ? packageArea(a.pkg, report, root) : treeArea(a.tree, report, root);
    return { key: a.key, label: a.label, pct: found ? Math.round((1000 * hit) / found) / 10 : 0, modules };
  });
}

/** The areas under their floor: `[{ key, label, pct, floor }]`. An area with no floor yet is not judged. */
export function underFloors(summary, floors) {
  return summary
    .filter((s) => AREAS.find((a) => a.key === s.key)?.floor && floors[s.key] != null && s.pct < floors[s.key])
    .map((s) => ({ ...s, floor: floors[s.key] }));
}

/** The floors a bank writes: each held area's, raised to its measure less the slack, never lowered unless raised. */
export function bankedFloors(summary, floors, { lower = false } = {}) {
  const out = { ...floors };
  for (const s of summary) {
    if (!AREAS.find((a) => a.key === s.key)?.floor) continue;
    const at = Math.max(0, Math.floor((s.pct - SLACK) * 10) / 10);
    if (out[s.key] == null || at > out[s.key] || lower) out[s.key] = at;
  }
  return out;
}

/** The table the suite prints at its end: every area, and a held one's floor. */
export function tableOf(summary, floors) {
  return summary
    .map(
      (s) =>
        `${s.label.padEnd(52)}${`${s.pct.toFixed(1)}%`.padStart(7)}${floors[s.key] != null ? `   floor ${floors[s.key].toFixed(1)}%` : ""}`,
    )
    .join("\n");
}

/**
 * What a measured run ends with: the exit status, the lines to print on stderr, and the floors a bank would write.
 *
 * A run that failed keeps its own status (the table still prints, for whoever is reading why) and banks nothing: the
 * numbers of a run that did not finish are not a measure. A run that passed fails on a floor it is under, or on a
 * report that never came. `held` is false for a run of some files, which is not the suite and is judged by no floor.
 * `bank` is null for a plain run and "1" or "raise" for `UPDATE_BASELINES`: a floor the suite has cleared with room to
 * spare is raised, and a floor it is under is still a red run. `lower` (COVERAGE_FLOORS=lower) is the one way a floor
 * falls: every held floor is set to the measure less the slack, and none is judged.
 */
export function judge({ lcov, root, floors, status, bank = null, lower = false, held = true }) {
  if (lcov === null)
    return { status: status || 1, lines: ["coverage: the run wrote no report (Node's lcov reporter)"], banked: null };
  const summary = summarize(lcov, root);
  const shown = held ? floors : {};
  const under = held && !lower ? underFloors(summary, floors) : [];
  const lines = ["# what the suite ran of the code (line coverage)", ...tableOf(summary, shown).split("\n")];
  for (const u of under)
    lines.push(
      `coverage: ${u.label} is at ${u.pct.toFixed(1)}%, under its floor of ${u.floor.toFixed(1)}%: a test that ran it ` +
        `was removed, or code came with none. Test it; a floor lowered on purpose is COVERAGE_FLOORS=lower pnpm test, ` +
        `argued under "Rises" in docs/debt.md`,
    );
  const bankable = held && !status && (bank || lower);
  return {
    status: status || (under.length ? 1 : 0),
    lines,
    banked: bankable ? bankedFloors(summary, floors, { lower }) : null,
  };
}

/**
 * The end of a measured run, from its lcov file: read the report and the floors, print the table and any floor missed
 * on stderr, write the floors a bank asked for, and return the status the launcher exits with. The report is removed.
 */
export function finish({ coverage, status, env, held, root }) {
  const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
  const floorsFile = path.join(root, FLOORS);
  const floors = JSON.parse(read(floorsFile) ?? "{}");
  const lcov = read(coverage);
  fs.rmSync(coverage, { force: true });
  const bank = env.UPDATE_BASELINES === "raise" ? "raise" : env.UPDATE_BASELINES === "1" ? "1" : null;
  const judged = judge({ lcov, root, floors, status, bank, lower: env.COVERAGE_FLOORS === "lower", held });
  for (const line of judged.lines) console.error(line);
  if (judged.banked && JSON.stringify(judged.banked) !== JSON.stringify(floors)) {
    fs.mkdirSync(path.dirname(floorsFile), { recursive: true });
    fs.writeFileSync(floorsFile, JSON.stringify(judged.banked, null, 2) + "\n");
    console.error(`coverage: floors written to ${FLOORS}: ${JSON.stringify(judged.banked)}`);
  }
  return judged.status;
}
