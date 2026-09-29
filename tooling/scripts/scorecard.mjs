#!/usr/bin/env node
/**
 * The scorecard, and what a re-score has to read again.
 *
 * A scoring (docs/scorecard/<date>.json, the data behind the page the reviewers hand over) marks every bullet of the
 * forty-category checklist holds, partly, absent or n/a, with a sentence of evidence that cites the files it read, and
 * re-checks every known defect by the files it names. Each is a judgment about the code at one commit, the one the
 * scoring's `meta.snapshot` names. Before the next scoring re-reads all of them, this script asks the one question
 * code can answer exactly: has any file a mark cites changed since? A mark whose cited files are byte-identical is
 * carried forward; a mark whose cited files changed is the one to read again; a mark that cites nothing goes to a
 * reviewer with a request for a citation.
 *
 *   node tooling/scripts/scorecard.mjs                       # the latest scoring against HEAD
 *   node tooling/scripts/scorecard.mjs --since <commit>      # against another commit
 *   node tooling/scripts/scorecard.mjs --all                 # every row, not only the ones to re-judge
 *   node tooling/scripts/scorecard.mjs --json                # the partition as JSON, for a tool
 *
 * Reads the repository and writes nothing. The rules (`scoredCommitOf`, `citedPathsOf`, `resolveCited`, `partition`)
 * are pure and held by tests/docs/scorecard.test.mjs; `main` binds them to git.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SCORECARDS_DIR = "docs/scorecard";

/** The marks a bullet may carry. */
export const BULLET_STATUSES = ["holds", "partly", "absent", "n/a"];

/** The scored commit, as `meta.snapshot` writes it ("origin/main 1388f2cc6 · 29 Sep 2026 · …"); null when it names none. */
export function scoredCommitOf(snapshot) {
  const m = /\b[0-9a-f]{7,40}\b/.exec(String(snapshot ?? ""));
  return m ? m[0] : null;
}

const CITED =
  /`([\w./[\]@-]+\.(?:ts|tsx|js|jsx|mjs|cjs|sql|md|json|ya?ml|css|toml|html))(?::[\d,\-–]+)?`|`(\d{5})(?::[\d,\-–]+)?`/g;

/**
 * The paths a sentence of evidence cites, as written: a backticked file, with or without its `:line`, and a bare
 * five-digit migration number (`00260:19-31`). Each once, in order.
 */
export function citedPathsOf(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(CITED)) {
    const name = m[1] ?? m[2];
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * The tracked file a cited name means, or null. As written from the root; the dashboard's `src/` and `app/` as the
 * takeover page writes them; a migration by its number; a bare name by its one tracked file, or the first when the
 * name is not unique (a test's name in a sentence is a name, not a path).
 */
export function resolveCited(name, tracked) {
  if (tracked.has(name)) return name;
  if (/^(src|app)\//.test(name) && tracked.has(`apps/dashboard/${name}`)) return `apps/dashboard/${name}`;
  if (/^\d{5}$/.test(name)) {
    for (const t of tracked) if (t.startsWith(`supabase/migrations/${name}_`)) return t;
    return null;
  }
  const suffix = `/${name}`;
  let found = null;
  for (const t of tracked) {
    if (!t.endsWith(suffix)) continue;
    if (found) return found;
    found = t;
  }
  return found;
}

/** Where a mark stands against the diff: what code can say before anyone reads it again. */
export const FATES = ["carried", "rejudge", "uncited", "external"];

/**
 * Sorts every bullet and defect of a scoring by what happened to the files it cites.
 *
 *   carried   cites tracked files, none of which changed: the mark stands
 *   rejudge   cites a tracked file that changed: read it again
 *   uncited   cites no path a reader could open: a reviewer, and a citation next time
 *   external  cites only files the tree does not have: a reviewer's own probes, or a file that has since moved
 *
 * `tracked` is the set of tracked paths, `changed` the set of paths that differ between the scored commit and now.
 */
export function partition(scorecard, { tracked, changed }) {
  const fateOf = (text) => {
    const cited = citedPathsOf(text);
    if (cited.length === 0) return { fate: "uncited", files: [] };
    const files = [...new Set(cited.map((c) => resolveCited(c, tracked)).filter(Boolean))];
    if (files.length === 0) return { fate: "external", files: [] };
    const moved = files.filter((f) => changed.has(f));
    return moved.length ? { fate: "rejudge", files: moved } : { fate: "carried", files };
  };
  const bullets = [];
  for (const pillar of scorecard.pillars ?? []) {
    for (const cat of pillar.cats ?? []) {
      for (const b of cat.bullets ?? []) {
        bullets.push({ category: `${cat.n} ${cat.name}`, bullet: b.b, status: b.s, ...fateOf(b.e) });
      }
    }
  }
  const defects = (scorecard.defects ?? []).map((d) => ({
    severity: d.sev,
    status: d.status,
    what: firstSentence(d.what),
    ...fateOf(`${d.where ?? ""} ${d.note ?? ""}`),
  }));
  return { bullets, defects };
}

function firstSentence(text) {
  return String(text ?? "")
    .replace(/\*\*/g, "")
    .split(/(?<=\.)\s/)[0]
    .trim();
}

/** How many of each fate, in FATES' order. */
export function tally(rows) {
  const counts = Object.fromEntries(FATES.map((f) => [f, 0]));
  for (const r of rows) counts[r.fate] += 1;
  return counts;
}

/** The newest scoring in docs/scorecard, by name. */
export function latestScorecard(root) {
  const dir = path.join(root, SCORECARDS_DIR);
  const names = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort();
  if (names.length === 0) throw new Error(`no scoring in ${SCORECARDS_DIR}`);
  return path.join(SCORECARDS_DIR, names[names.length - 1]);
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 1 << 27 });
}

function main() {
  const args = process.argv.slice(2);
  const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const flag = (name) => args.includes(name);
  const sinceAt = args.indexOf("--since");
  const file = latestScorecard(root);
  const scorecard = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  const scored = sinceAt >= 0 ? args[sinceAt + 1] : scoredCommitOf(scorecard.meta?.snapshot);
  if (!scored) throw new Error(`${file} names no scored commit in meta.snapshot; pass --since <commit>`);
  const head = git(root, ["rev-parse", "--short", "HEAD"]).trim();
  const tracked = new Set(git(root, ["ls-files"]).split("\n").filter(Boolean));
  const changed = new Set(
    git(root, ["diff", "--name-only", `${scored}..HEAD`])
      .split("\n")
      .filter(Boolean),
  );
  const parts = partition(scorecard, { tracked, changed });

  if (flag("--json")) {
    process.stdout.write(JSON.stringify({ file, scored, head, changed: changed.size, ...parts }, null, 2) + "\n");
    return;
  }
  const line = (name, rows) => {
    const t = tally(rows);
    return `${name} ${rows.length}: ${t.carried} carried forward · ${t.rejudge} to re-judge · ${t.uncited} uncited, for a reviewer · ${t.external} cite files outside the tree`;
  };
  console.log(`${file}, scored at ${scored}; HEAD is ${head}, ${changed.size} files changed since.`);
  console.log(line("Bullets", parts.bullets));
  console.log(line("Defects", parts.defects));
  const show = flag("--all") ? FATES : ["rejudge"];
  for (const fate of show) {
    const bullets = parts.bullets.filter((b) => b.fate === fate);
    const defects = parts.defects.filter((d) => d.fate === fate);
    if (bullets.length) {
      console.log(`\nBullets, ${fate}:`);
      for (const b of bullets)
        console.log(`  [${b.status}] ${b.category} / ${b.bullet}${b.files.length ? ` — ${b.files.join(", ")}` : ""}`);
    }
    if (defects.length) {
      console.log(`\nDefects, ${fate}:`);
      for (const d of defects)
        console.log(`  [${d.severity} ${d.status}] ${d.what}${d.files.length ? ` — ${d.files.join(", ")}` : ""}`);
    }
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
