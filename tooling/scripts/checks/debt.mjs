#!/usr/bin/env node
/**
 * What a change owes: every number the build holds, measured on the change's base and on its head, and the change held
 * to what it adds (decision 0074, step 3).
 *
 * Until 28 October 2026 each number was a baseline in git that a change banked when it fell and raised, with a row
 * under "Rises" in docs/debt.md, when it rose: 275 of the 590 changes of the month before touched a baseline or the
 * register's printed numbers, and those files were where parallel lanes met. The bundle check had shown the other way
 * since 10 October (checks/bundle-budget.mjs): hold a change to what it adds against the main it stands on, argue a
 * growth in the pull request, and keep nothing in the repository. This is that rule for every other number.
 *
 * A record is every part's measure of one tree: `measures` (each ratchet of tests/_measures.mjs, by its key), `lint`
 * (the warnings, `<file>::<rule>`) and `knip` (dead exports, by file). Against a base's record, an entry that is new,
 * or a number that rose ("count" mode; in "set" mode only a new key), is what the change adds: it fails unless the
 * pull request's description carries a line `Debt: <why>`, read from PR_BODY as the bundle check reads `Bundle:`. A
 * fall needs nothing: there is no file to bank it in, and the next change is held to the main it stands on.
 *
 * The base is measured by its own code. In CI the change's first parent is checked out where the head was (`--base
 * HEAD^1 --in-place`), measured, and the head checked out again; on a laptop it is a worktree beside this one, its
 * node_modules lent from here. A base from before this file is read from the baselines it committed.
 *
 *   corepack pnpm check:debt                                       this tree against origin/main (its merge base)
 *   corepack pnpm check:debt -- --parts measures                   the measures alone: seconds, not lint's minutes
 *   corepack pnpm check:debt -- --totals                           the register's numbers, measured on this tree
 *   corepack pnpm check:debt -- --record <file> [--parts a,b]      this tree's record
 *   corepack pnpm check:debt -- --base <ref> --out <file> [--in-place]   a base's record (CI checks it out in place)
 *   corepack pnpm check:debt -- --against <file> [--summary <file>]      this tree held to a record
 *   corepack pnpm check:debt -- --totals --from <record> [--summary <file>]   the register's numbers, from a record
 *   corepack pnpm check:debt -- --week <older> <newer> [--report <file>] [--commits <file>]   what a week of main added
 *
 * It runs under tsx (the measures read the packages' sources), with the lint's heap: `check:debt` in package.json.
 * repo/debt-check.test.mjs holds the decisions (`judge`, `reasonIn`, `recordFromBaselines`, `totalsOf`, `weekOf`).
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compare } from "../tests/_ratchet.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SELF = "tooling/scripts/checks/debt.mjs";
export const PARTS = ["measures", "lint", "knip"];
/** How the base's own copy of this file is run: as `check:debt` runs it. */
export const LOADER = ["--max-old-space-size=5120", "--conditions=react-server", "--import", "tsx"];
/** Where the numbers lived until 28 October 2026, and where a base from before then is read from. */
const BASELINES = "tooling/scripts/tests/baselines";
const SOURCE_SCAN_BASELINE = "tooling/scripts/tests/source-scan-baseline.json";

const git = (args, cwd = ROOT) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const sortedKeys = (o) =>
  Object.fromEntries(
    Object.keys(o ?? {})
      .sort()
      .map((k) => [k, o[k]]),
  );

/* --------------------------------- measuring --------------------------------- */

/** One part of a record, measured on this tree. */
export async function measurePart(part) {
  if (part === "measures") {
    const { RATCHETS } = await import("../tests/_measures.mjs");
    return Object.fromEntries(
      RATCHETS.map((r) => [r.key, { name: r.name, mode: r.mode, advice: r.advice, entries: sortedKeys(r.measure()) }]),
    );
  }
  if (part === "lint") {
    const { lintTree, flatWarnings } = await import("./lint.mjs");
    return sortedKeys(flatWarnings((await lintTree()).warnings));
  }
  if (part === "knip") {
    const { deadExports } = await import("./dead-exports.mjs");
    return deadExports();
  }
  throw new Error(`no part "${part}": the parts are ${PARTS.join(", ")}`);
}

/** This tree's record: each part asked for, measured, with the commit it was measured on. */
export async function recordOf(parts = PARTS) {
  const out = { sha: git(["rev-parse", "HEAD"]), at: new Date().toISOString(), parts: {} };
  for (const part of parts) out.parts[part] = await measurePart(part);
  return out;
}

/**
 * A record read from the baselines a commit from before 28 October 2026 kept: what that main held, since a baseline
 * that was not current failed its own build. `show` reads a file at that commit (null when it has none), and
 * `ratchets` names each measure and the file it was kept in.
 */
export function recordFromBaselines(show, ratchets, parts = PARTS) {
  const read = (rel) => {
    const text = show(rel);
    return text === null ? null : JSON.parse(text);
  };
  const out = { sha: null, at: null, parts: {}, from: "baselines" };
  if (parts.includes("measures")) {
    out.parts.measures = {};
    for (const r of ratchets) {
      let entries;
      if (r.key === "source-scan") {
        const scan = read(SOURCE_SCAN_BASELINE);
        entries = scan ? Object.fromEntries(Object.entries(scan.counts).filter(([f]) => !scan.lint.includes(f))) : {};
      } else entries = read(`${BASELINES}/${r.file}`) ?? {};
      out.parts.measures[r.key] = { name: r.name, mode: r.mode, advice: r.advice, entries: sortedKeys(entries) };
    }
  }
  if (parts.includes("lint")) {
    const lint = read(`${BASELINES}/lint-warnings.json`) ?? {};
    out.parts.lint = sortedKeys(
      Object.fromEntries(
        Object.entries(lint).flatMap(([file, rules]) =>
          Object.entries(rules).map(([rule, n]) => [`${file}::${rule}`, n]),
        ),
      ),
    );
  }
  if (parts.includes("knip")) out.parts.knip = sortedKeys(read(`${BASELINES}/dead-exports.json`) ?? {});
  return out;
}

/** Whether a commit holds a file. */
const holds = (sha, rel) => spawnSync("git", ["cat-file", "-e", `${sha}:${rel}`], { cwd: ROOT }).status === 0;

/**
 * Lend this checkout's installs to a worktree: each node_modules of this one, made again there, every entry a link to
 * this checkout's but the workspace's own packages, which are linked as they are here (relatively), so the worktree's
 * tooling reads the worktree's packages.
 */
function lendInstalls(tree) {
  const dirs = [
    ".",
    ...git(["ls-files", "--", "*package.json"])
      .split("\n")
      .map((f) => path.dirname(f)),
  ];
  for (const dir of [...new Set(dirs)]) {
    const from = path.join(ROOT, dir, "node_modules");
    if (!fs.existsSync(from)) continue;
    const to = path.join(tree, dir, "node_modules");
    fs.mkdirSync(to, { recursive: true });
    const lend = (src, dst) => {
      for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name);
        const d = path.join(dst, e.name);
        if (e.name.startsWith("@") && e.isDirectory()) {
          fs.mkdirSync(d, { recursive: true });
          lend(s, d);
        } else if (e.isSymbolicLink() && !path.isAbsolute(fs.readlinkSync(s))) fs.symlinkSync(fs.readlinkSync(s), d);
        else fs.symlinkSync(s, d);
      }
    };
    lend(from, to);
  }
}

/**
 * A base's record, written to `out`. A base that holds this file measures itself with its own code: checked out here
 * (`inPlace`, CI's: the tree must be clean, and the head is checked out again whatever happens), or in a worktree beside
 * this one. A base from before it is read from its baselines.
 */
export async function baseRecord(ref, { out, parts = PARTS, inPlace = false } = {}) {
  const sha = git(["rev-parse", `${ref}^{commit}`]);
  if (!holds(sha, SELF)) {
    const { RATCHETS } = await import("../tests/_measures.mjs");
    const show = (rel) => (holds(sha, rel) ? git(["show", `${sha}:${rel}`]) : null);
    const record = { ...recordFromBaselines(show, RATCHETS, parts), sha };
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
    return "baselines";
  }
  const args = (self) => [...LOADER, self, "--record", path.resolve(out), "--parts", parts.join(",")];
  if (inPlace) {
    if (git(["status", "--porcelain", "--untracked-files=no"]))
      throw new Error("the tree holds uncommitted changes: a base is checked out in place only on a clean one");
    const head = git(["rev-parse", "HEAD"]);
    git(["checkout", "-q", "--detach", sha]);
    try {
      const run = spawnSync(process.execPath, args(SELF), { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
      if (run.status !== 0) throw new Error(`measuring the base ${sha.slice(0, 9)} failed`);
    } finally {
      git(["checkout", "-q", "--detach", head]);
    }
    return "checked out";
  }
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), "chanlytics-base-"));
  git(["worktree", "add", "-q", "--detach", tree, sha]);
  try {
    lendInstalls(tree);
    const run = spawnSync(process.execPath, args(path.join(tree, SELF)), {
      cwd: tree,
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (run.status !== 0) throw new Error(`measuring the base ${sha.slice(0, 9)} failed`);
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", tree], { cwd: ROOT });
  }
  return "worktree";
}

/* --------------------------------- judging --------------------------------- */

/** The reason a pull request gives for what it adds, in a line `Debt: <why>` of its description; null with none. */
export function reasonIn(body) {
  const m = /^[ \t>*-]*\**Debt:\**[ \t]*(.+?)[ \t]*$/im.exec(String(body ?? ""));
  if (!m) return null;
  const why = m[1].replace(/[*_`]/g, "").trim();
  return why.length >= 12 ? why : null;
}

/**
 * What a head adds to a base, part by part: `worse` (each entry new, or each number that rose, as `<part> <key>:
 * <line>`) and `better` (each that fell or went). A measure the base did not have adds every entry it holds; one the
 * head no longer has is said, not judged.
 */
export function judge(base, head) {
  const worse = [];
  const better = [];
  const notes = [];
  for (const part of Object.keys(head.parts)) {
    const was = base.parts?.[part];
    if (!was) {
      notes.push(`${part}: the base has no ${part} record, so nothing of it is judged`);
      continue;
    }
    const pairs =
      part === "measures"
        ? Object.entries(head.parts.measures).map(([key, m]) => [key, m.entries, was[key]?.entries, m.mode, !was[key]])
        : [[part, head.parts[part], was, "count", false]];
    for (const [key, now, before, mode, added] of pairs) {
      const label = part === "measures" ? key : part;
      if (added) notes.push(`${label}: a measure the base did not have`);
      const { worse: w, better: b } = compare(now, before ?? {}, mode);
      worse.push(...w.map((line) => `${label} ${line}`));
      better.push(...b.map((line) => `${label} ${line}`));
    }
    if (part === "measures")
      for (const key of Object.keys(was))
        if (!(key in head.parts.measures)) notes.push(`${key}: a measure the head no longer has`);
  }
  return { worse, better, notes };
}

/* --------------------------------- the register's numbers --------------------------------- */

const total = (o) => Object.values(o ?? {}).reduce((a, v) => a + (typeof v === "number" ? v : 1), 0);
const keys = (o) => Object.keys(o ?? {}).length;
/** How many files a `file::…` measure names, each counted once however many of its keys it holds. */
const files = (o) => new Set(Object.keys(o ?? {}).map((k) => k.split("::")[0])).size;
/** Every field of every entry, summed: a stylesheet's literal values are counted by kind. */
const fieldsTotal = (o) => Object.values(o ?? {}).reduce((a, v) => a + Object.values(v).reduce((b, n) => b + n, 0), 0);
/** One field of every entry, summed: casts holds each module's casts by family. */
const fieldTotal = (o, field) => Object.values(o ?? {}).reduce((a, v) => a + (v[field] ?? 0), 0);
/** tables' entries: a file's `.from("…")` count under its path, its `.rpc("…")` count under `<path>::rpc`. */
const tableCalls = (o, rpc) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => k.endsWith("::rpc") === rpc));
/** The wire's two numbers: how many distinct names are not snake_case, and in how many routes. */
function wireCounts(held) {
  const parts = Object.keys(held ?? {}).map((k) => /^(.*) (?:takes|answers) (\S+)$/.exec(k) ?? [k, k, k]);
  return { names: new Set(parts.map((p) => p[2])).size, routes: new Set(parts.map((p) => p[1])).size };
}

/**
 * The register's numbers, from a record, as rows of `[label, number, note]`: what docs/debt.md and docs/takeover.md
 * printed between their markers until 28 October 2026, and now each night's reading of main says (register.yml).
 * `ceiling` is the bundle's (baselines/bundle-ceiling.json, a decision); `trees` and `wide` the lint's held trees.
 */
export function totalsOf(record, { ceiling = {}, trees = [], wide = [] } = {}) {
  const by = Object.fromEntries(Object.entries(record.parts.measures ?? {}).map(([k, m]) => [k, m.entries]));
  const lint = record.parts.lint ?? {};
  const complexity = by.complexity ?? {};
  const publishers = by["window-publishers"] ?? {};
  const copies = by.copies ?? {};
  const casts = by.casts ?? {};
  const unchecked = by["unchecked-index"] ?? {};
  const wire = wireCounts(by["wire-casing"]);
  const effects = Object.entries(lint)
    .filter(([k]) => k.endsWith("::react-hooks/exhaustive-deps"))
    .reduce((a, [, n]) => a + n, 0);
  const tables = by["erasure-strategies"] ?? {};
  const tablesOfColumns = new Set(Object.keys(tables).map((c) => c.split(".")[0])).size;
  return [
    [
      "functions over the limit",
      keys(complexity),
      `of which over 200 lines: ${Object.values(complexity).filter((v) => v.lines > 200).length}`,
    ],
    ["files over 800 lines", keys(by["file-length"]), ""],
    ["test files over 1600 lines", keys(by["test-length"]), ""],
    ["directories over 20 modules", keys(by["tree-shape"]), ""],
    ["window globals", keys(by["window-globals"]), "names"],
    ["window publishers", total(publishers), `sites in ${keys(publishers)} files`],
    ["copies", total(copies), `of ${keys(copies)} names`],
    ["as unknown as", fieldTotal(casts, "unknownAs"), ""],
    ["as never", fieldTotal(casts, "never"), ""],
    ["non-null assertions, x!", fieldTotal(casts, "nonNull"), ""],
    ["index reads the compiler lets pass", total(unchecked), `in ${keys(unchecked)} files`],
    ["table names outside packages/db", total(tableCalls(by.tables, false)), ""],
    ["SQL functions outside packages/db", total(tableCalls(by.tables, true)), "called by .rpc"],
    ["edge statements naming no workspace", total(by.workspaceless), `in ${keys(by.workspaceless)} files`],
    ["service-role reaches, dashboard", total(by["service-role"]), `in ${keys(by["service-role"])} files`],
    ["doors importing db or channels", total(by["route-doors"]), `imports in ${keys(by["route-doors"])} files`],
    ["unnamed durations", total(by.durations), `in ${keys(by.durations)} files`],
    ["event-shaped clocks", keys(by["event-shaped-clocks"]), "of the registered clocks (invariant 6)"],
    ["tables with more than one writer", keys(by.writers), `${total(by.writers)} writers among them`],
    [
      "doors writing a record with no event",
      keys(by["doors-without-events"]),
      `writing ${total(by["doors-without-events"])} tables (invariant 2)`,
    ],
    ["event kinds written only from TypeScript", keys(by["ts-only-events"]), ""],
    [
      "personal columns with no erasure strategy",
      keys(tables),
      `in ${tablesOfColumns} ${tablesOfColumns === 1 ? "table" : "tables"}`,
    ],
    ["breakpoints outside the set", total(by.breakpoints), `in ${files(by.breakpoints)} files`],
    ["literal style values", fieldsTotal(by["style-values"]), `in ${keys(by["style-values"])} stylesheets`],
    [
      "primitives outside the kit",
      total(by["kit-primitives"]),
      `selectors naming ${keys(by["kit-primitives"])} classes`,
    ],
    ["inline style props", total(by["inline-styles"]), `in ${keys(by["inline-styles"])} files`],
    ["appointment words written in", total(by["appointment-words"]), `in ${keys(by["appointment-words"])} files`],
    ["wire names not in snake_case", wire.names, `in ${wire.routes} routes`],
    ["dead exports, types and modules", total(record.parts.knip), ""],
    ["source-text reads in tests", total(by["source-scan"]), ""],
    ["lint warnings", total(lint), `in ${files(lint)} files, ${effects} of them exhaustive-deps`],
    // Not a debt: what a workspace may load, which only a decision moves; what it does load is CI's summary.
    ["route JS ceiling, KB gzipped", Math.round((ceiling.js ?? 0) / 1024), "the shell included"],
    ["route CSS ceiling, KB gzipped", Math.round((ceiling.css ?? 0) / 1024), ""],
    ["each page's own JS ceiling, KB", Math.round((ceiling.page ?? 0) / 1024), "gzipped, beyond the route"],
    // Not a debt: the trees the complexity measure has emptied, which the lint's limits hold (eslint.config.mjs).
    ["trees the lint's limits hold", trees.length, `${wide.length} of them with max-params waiting`],
  ];
}

/** The rows as the register printed them: a text block a person reads. */
export const totalsText = (rows) =>
  "```text\n" +
  rows.map(([label, n, note]) => `${label.padEnd(42)}${String(n).padStart(5)}${note ? "   " + note : ""}`).join("\n") +
  "\n```";

async function totalsContext() {
  const { LIMITED_TREES, WIDE_PARAMS } = await import("../../../eslint.config.mjs");
  const at = path.join(ROOT, BASELINES, "bundle-ceiling.json");
  return {
    ceiling: fs.existsSync(at) ? JSON.parse(fs.readFileSync(at, "utf8")) : {},
    trees: LIMITED_TREES,
    wide: WIDE_PARAMS,
  };
}

/* --------------------------------- the week --------------------------------- */

/** A part's or a measure's one number: its entries' total, or for a set its keys. */
function sizeOf(entries, mode) {
  if (mode === "set") return keys(entries);
  return Object.values(entries ?? {}).reduce(
    (a, v) => a + (typeof v === "number" ? v : Object.values(v).reduce((b, n) => b + n, 0)),
    0,
  );
}

/** Each measure's one number on two records of main, a week apart, and what grew: `{ rows, grew }`. */
export function weekOf(older, newer) {
  const rows = [];
  const sizes = (record) => ({
    ...Object.fromEntries(Object.entries(record.parts.measures ?? {}).map(([k, m]) => [k, sizeOf(m.entries, m.mode)])),
    ...(record.parts.lint ? { lint: sizeOf(record.parts.lint) } : {}),
    ...(record.parts.knip ? { knip: sizeOf(record.parts.knip) } : {}),
  });
  const a = sizes(older);
  const b = sizes(newer);
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort())
    rows.push({ key, older: a[key] ?? 0, newer: b[key] ?? 0, grew: (b[key] ?? 0) - (a[key] ?? 0) });
  return { rows, grew: rows.filter((r) => r.grew > 0) };
}

/* --------------------------------- the command --------------------------------- */

const readRecord = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
function writeRecord(file, record) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
}
const say = (line) => console.error(`check:debt: ${line}`);

/** What a judgement says, for a person and for a step's summary. */
function verdictText({ worse, better, notes }, reason, base) {
  const lines = [`### What this change owes`, ""];
  lines.push(
    `Held to ${base.from === "baselines" ? "the baselines" : "the record"} of \`${String(base.sha ?? "").slice(0, 9)}\`.`,
    "",
  );
  if (!worse.length) lines.push("Nothing rose and nothing is new.");
  else {
    lines.push(
      reason
        ? `What it adds, argued: ${reason}`
        : "What it adds, and no line `Debt: <why>` in the description says why:",
      "",
    );
    lines.push("```text", ...worse, "```");
  }
  if (better.length)
    lines.push("", `What it takes away (${better.length}):`, "", "```text", ...better.slice(0, 200), "```");
  if (notes.length) lines.push("", ...notes.map((n) => `- ${n}`));
  return lines.join("\n");
}

async function main() {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const value = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null);
  const parts = (value("--parts") ?? PARTS.join(",")).split(",").filter(Boolean);
  for (const p of parts) if (!PARTS.includes(p)) throw new Error(`no part "${p}": the parts are ${PARTS.join(", ")}`);
  const summary = value("--summary");
  const tell = (text) => {
    console.log(text);
    if (summary) fs.appendFileSync(summary, `${text}\n`);
  };

  if (argv.includes("--week")) {
    const [older, newer] = argv.slice(argv.indexOf("--week") + 1, argv.indexOf("--week") + 3);
    const { rows, grew } = weekOf(readRecord(older), readRecord(newer));
    const commits = value("--commits") ? fs.readFileSync(value("--commits"), "utf8").trim() : "";
    const table = [
      "| measure | a week before | now | grew |",
      "| --- | ---: | ---: | ---: |",
      ...rows
        .filter((r) => r.grew !== 0)
        .map((r) => `| ${r.key} | ${r.older} | ${r.newer} | ${r.grew > 0 ? "+" : ""}${r.grew} |`),
    ];
    const text = [
      "### What the code owes: the week",
      "",
      grew.length
        ? `Grew over the week: ${grew.map((r) => `${r.key} +${r.grew}`).join(", ")}.`
        : "Nothing grew over the week.",
      "",
      ...(rows.some((r) => r.grew !== 0) ? table : []),
      ...(commits ? ["", "The merges of the week:", "", "```text", commits, "```"] : []),
    ].join("\n");
    if (value("--report")) fs.writeFileSync(value("--report"), `${text}\n`);
    tell(text);
    process.exit(grew.length ? 3 : 0);
  }

  if (argv.includes("--totals")) {
    const record = value("--from") ? readRecord(value("--from")) : await recordOf(parts);
    tell(
      `### The register's numbers, at \`${String(record.sha ?? "").slice(0, 9)}\`\n\n${totalsText(totalsOf(record, await totalsContext()))}`,
    );
    return;
  }

  if (value("--base")) {
    const out = value("--out");
    if (!out) throw new Error("--base names where its record goes: --out <file>");
    const how = await baseRecord(value("--base"), { out, parts, inPlace: argv.includes("--in-place") });
    say(`the base's record, ${how === "baselines" ? "read from its baselines" : `measured (${how})`}, is in ${out}`);
    return;
  }

  if (value("--record")) {
    writeRecord(value("--record"), await recordOf(parts));
    say(`this tree's record is in ${value("--record")}`);
    return;
  }

  let base;
  if (value("--against")) base = readRecord(value("--against"));
  else {
    const at = git(["merge-base", "HEAD", "origin/main"]);
    const out = path.join(os.tmpdir(), `chanlytics-debt-base-${process.pid}.json`);
    say(`measuring the base, origin/main's ${at.slice(0, 9)}, in a worktree beside this one`);
    await baseRecord(at, { out, parts });
    base = readRecord(out);
    fs.rmSync(out, { force: true });
  }
  const head = await recordOf(parts.filter((p) => base.parts?.[p]));
  const judged = judge(base, head);
  const reason = reasonIn(process.env.PR_BODY);
  tell(verdictText(judged, reason, base));
  if (judged.worse.length && !reason) {
    say(
      "a number rose, or an offender is new: fix it, or say why in the pull request's description, in a line " +
        "`Debt: <why>` (locally: PR_BODY='Debt: <why>' corepack pnpm check:debt)",
    );
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  });
}
