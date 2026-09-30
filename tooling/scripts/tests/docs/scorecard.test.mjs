/**
 * The scorecard is data, and a re-score reads again only what changed.
 *
 * Each scoring under docs/scorecard/ used to live only in the page the reviewers handed over, so nothing in the tree
 * could say which of its marks the code had since overtaken, and docs/takeover.md drifted from it within a day. Kept
 * here, its shape is held (every bullet marked from the closed set, its facts adding up to its bullets), and
 * tooling/scripts/scorecard.mjs sorts each mark by its citations: carried forward, to re-judge, uncited, or external.
 * That sorting is proved on a small scoring over a made-up tree, and the committed scoring is held to cite files the
 * tree has.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "../_source.mjs";
import {
  BULLET_STATUSES,
  FATES,
  SCORECARDS_DIR,
  citedPathsOf,
  latestScorecard,
  partition,
  resolveCited,
  scoredCommitOf,
  tally,
} from "../../scorecard.mjs";

const tracked = new Set(
  execFileSync("git", ["-C", ROOT, "ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean),
);

test("the scored commit is read from the snapshot line", () => {
  assert.equal(scoredCommitOf("origin/main 1388f2cc6 · 29 Sep 2026 · after #1332 · third scoring"), "1388f2cc6");
  assert.equal(scoredCommitOf("a scoring with no commit"), null);
});

test("a sentence of evidence cites files, with or without lines, and migrations by number", () => {
  assert.deepEqual(
    citedPathsOf(
      "Verbs take ports (`inbound/ports.ts:192`, `server/ports/core-ports.ts:128`), but `deliver.ts` makes 6 calls; `00260:19-31` adds `media is null`; `lint-boundaries.test.mjs` (19 pass).",
    ),
    ["inbound/ports.ts", "server/ports/core-ports.ts", "deliver.ts", "00260", "lint-boundaries.test.mjs"],
  );
  assert.deepEqual(citedPathsOf("a `table_name` and a `ROLE_PERMS` are words"), []);
  assert.deepEqual(citedPathsOf("`a.ts` twice: `a.ts:1` and `a.ts:2`"), ["a.ts"]);
});

test("a cited name resolves as written, under the dashboard, by migration number, or by its one tracked file", () => {
  const fake = new Set([
    "CLAUDE.md",
    "apps/dashboard/src/server/route.ts",
    "apps/dashboard/app/api/v1/me/route.ts",
    "supabase/migrations/00260_a_message_s_media_is_the_edge_s_to_write.sql",
    "packages/core/src/deliver.ts",
    "tooling/scripts/tests/repo/lint-boundaries.test.mjs",
  ]);
  assert.equal(resolveCited("CLAUDE.md", fake), "CLAUDE.md");
  assert.equal(resolveCited("src/server/route.ts", fake), "apps/dashboard/src/server/route.ts");
  assert.equal(resolveCited("app/api/v1/me/route.ts", fake), "apps/dashboard/app/api/v1/me/route.ts");
  assert.equal(resolveCited("00260", fake), "supabase/migrations/00260_a_message_s_media_is_the_edge_s_to_write.sql");
  assert.equal(resolveCited("deliver.ts", fake), "packages/core/src/deliver.ts");
  assert.equal(resolveCited("lint-boundaries.test.mjs", fake), "tooling/scripts/tests/repo/lint-boundaries.test.mjs");
  assert.equal(resolveCited("review3/A/probe.mjs", fake), null);
  assert.equal(resolveCited("00999", fake), null);
});

test("each mark is carried, re-judged, uncited or external by what happened to the files it cites", () => {
  const scoring = {
    pillars: [
      {
        name: "A pillar",
        cats: [
          {
            n: 1,
            name: "A category",
            bullets: [
              { b: "Stands", s: "holds", e: "Held by `packages/core/src/deliver.ts:10`." },
              { b: "Moved", s: "partly", e: "`src/server/route.ts:5` and `packages/core/src/deliver.ts` both." },
              { b: "Bare", s: "absent", e: "Nothing does this; 302 SQL functions hold rules." },
              { b: "Probe", s: "partly", e: "Measured by `review3/B/probe.mjs`." },
              { b: "Migration", s: "holds", e: "`00260:19-31` adds the clause." },
            ],
          },
        ],
      },
    ],
    defects: [
      {
        sev: "med",
        status: "open",
        what: "**A defect.** With a second sentence.",
        where: "`src/server/route.ts:5`",
        note: "",
      },
      {
        sev: "low",
        status: "fixed",
        what: "Fixed one.",
        where: "`packages/core/src/deliver.ts`",
        note: "Closed at `00260:1`.",
      },
    ],
  };
  const fake = new Set([
    "apps/dashboard/src/server/route.ts",
    "packages/core/src/deliver.ts",
    "supabase/migrations/00260_a_message_s_media_is_the_edge_s_to_write.sql",
  ]);
  const changed = new Set(["apps/dashboard/src/server/route.ts"]);
  const { bullets, defects } = partition(scoring, { tracked: fake, changed });
  assert.deepEqual(
    bullets.map((b) => [b.bullet, b.fate, b.files]),
    [
      ["Stands", "carried", ["packages/core/src/deliver.ts"]],
      ["Moved", "rejudge", ["apps/dashboard/src/server/route.ts"]],
      ["Bare", "uncited", []],
      ["Probe", "external", []],
      ["Migration", "carried", ["supabase/migrations/00260_a_message_s_media_is_the_edge_s_to_write.sql"]],
    ],
  );
  assert.equal(bullets[1].category, "1 A category");
  assert.deepEqual(
    defects.map((d) => [d.what, d.fate]),
    [
      ["A defect.", "rejudge"],
      ["Fixed one.", "carried"],
    ],
  );
  assert.deepEqual(tally(bullets), { carried: 2, rejudge: 1, uncited: 1, external: 1 });
  assert.deepEqual(Object.keys(tally([])), FATES);
});

test("the committed scoring names its commit, marks every bullet from the closed set, and its facts add up", () => {
  const file = latestScorecard(ROOT);
  const scoring = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  assert.match(
    scoredCommitOf(scoring.meta.snapshot) ?? "",
    /^[0-9a-f]{7,40}$/,
    `${file}: meta.snapshot names no commit`,
  );
  const bullets = partition(scoring, { tracked, changed: new Set() }).bullets;
  assert.ok(bullets.length > 0, `${file} has no bullets`);
  for (const b of bullets)
    assert.ok(BULLET_STATUSES.includes(b.status), `${file}: ${b.category} / ${b.bullet} is marked "${b.status}"`);
  // The lede states the count of each mark ("197 of 694 bullets hold outright, 477 partly, 20 are absent"); the
  // bullets are what it counts.
  const counts = { hold: 0, partly: 0, absent: 0 };
  for (const b of bullets) {
    const stem = b.status === "holds" ? "hold" : b.status;
    if (stem in counts) counts[stem] += 1;
  }
  for (const [stem, n] of Object.entries(counts)) {
    assert.match(
      scoring.meta.lede,
      new RegExp(`\\b${n}\\b[^.]{0,30}\\b${stem}`),
      `${file}: the lede does not say ${n} ${stem}`,
    );
  }
});

test("the committed scoring's marks mostly cite the tree, and the script sorts the rest for a reviewer", () => {
  // A defect's `where` is where it was found, and files move; a reviewer's probes live outside the tree. Those are
  // external or uncited, never an error: the script names them, and the next scoring cites what the tree has.
  const file = latestScorecard(ROOT);
  const scoring = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  const { bullets, defects } = partition(scoring, { tracked, changed: new Set() });
  const cited = (rows) => rows.filter((r) => r.fate === "carried").length / rows.length;
  assert.ok(cited(bullets) > 0.5, `${file}: fewer than half the bullets cite a file the tree has`);
  assert.ok(cited(defects) > 0.5, `${file}: fewer than half the defects cite a file the tree has`);
  for (const r of [...bullets, ...defects]) assert.ok(FATES.includes(r.fate));
});

test("the scorings live under docs/scorecard, named by date", () => {
  const names = fs.readdirSync(path.join(ROOT, SCORECARDS_DIR)).filter((n) => n.endsWith(".json"));
  for (const n of names)
    assert.match(n, /^\d{4}-\d{2}-\d{2}\.json$/, `${SCORECARDS_DIR}/${n}: name a scoring by its day`);
});
