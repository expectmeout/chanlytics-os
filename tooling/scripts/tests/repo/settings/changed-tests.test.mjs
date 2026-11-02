/**
 * What a pull request's change runs (tooling/scripts/checks/changed-tests.mjs, which ci.yml runs on every pull request
 * and database.yml for its database suites): a source file its domain's tests and every test its imports reach, a test
 * file itself, the rules and ratchets always, and never past the budget (Ruben, 10 Oct 2026: under ten minutes). The
 * graph (checks/test-reach.mjs) is proved on a small tree of its own, then on the repository's: the five tests main left
 * red on 28 Oct 2026, and the links the hand-kept TESTED_IN said before it. Executed over the real folder names, so a
 * folder renamed under tests is seen here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  ALWAYS,
  BUDGET,
  READ_BY,
  changeTargets,
  databaseSuitesOf,
  holds,
  isDatabaseSuite,
  partsOf,
  testTargets,
  withReached,
} from "../../../checks/changed-tests.mjs";
import { reachOf } from "../../../checks/test-reach.mjs";
import { ROOT } from "../../_source.mjs";

const FOLDERS = new Set(
  execFileSync("git", ["ls-files", "tooling/scripts/tests/*/**.test.mjs"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((f) => f.split("/")[3]),
);
const run = (...changed) => testTargets(changed, FOLDERS);

/** The repository's own graph, built once: what every test imports and reads by name. */
const TRACKED = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const REACH = reachOf({
  files: TRACKED,
  read: (file) => (fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file), "utf8") : ""),
});
/** What a change runs: the targets its paths name and the tests its imports reach, within the budget. */
const picked = (...changed) => changeTargets(changed, TRACKED, REACH);
const T = "tooling/scripts/tests";

/**
 * A tree of its own: a package whose barrel names its domains' barrels, a dashboard page that imports it by name and a
 * module beside it by `@/`, and tests that import, run by path and read by name.
 */
const KIT_MANIFEST = JSON.stringify({
  name: "@chanlytics/kit",
  exports: {
    ".": { bundled: "./dist/index.js", import: "./src/index.ts" },
    "./extra": { bundled: "./dist/extra.js", import: "./src/extra.ts" },
  },
});
const TREE = {
  "packages/kit/package.json": KIT_MANIFEST,
  "packages/kit/src/index.ts": 'import "./setup";\nexport * from "./words";\nexport * from "./clock";',
  "packages/kit/src/setup.ts": "export const ready = true;",
  "packages/kit/src/words/index.ts":
    'export { greet, LINES } from "./greet";\nexport { farewell } from "./farewell";\nexport { PATH } from "./says";',
  "packages/kit/src/words/greet.ts":
    'import { today } from "../clock/today";\nexport const greet = () => `hi ${today()}`;\nexport const LINES = [];',
  "packages/kit/src/words/farewell.ts": 'export const farewell = () => "bye";',
  // Shipped code: a string in it is no path it reads.
  "packages/kit/src/words/says.ts": 'export const PATH = "apps/dashboard/src/shout.ts";',
  "packages/kit/src/clock/index.ts": 'export { today } from "./today";',
  "packages/kit/src/clock/today.ts": 'import type { Zone } from "./zone";\nexport const today = (): Zone => "monday";',
  "packages/kit/src/clock/zone.ts": "export type Zone = string;",
  "packages/kit/src/extra.ts": "export const extra = 1;",
  "apps/dashboard/src/page.ts":
    'import { greet } from "@chanlytics/kit";\nimport { shout } from "@/shout";\nexport const page = () => shout(greet());',
  "apps/dashboard/src/shout.ts": "export const shout = (s) => s.toUpperCase();",
  "supabase/schema.sql": "create table t ();",
  [`${T}/_at.mjs`]: "export const at = (p) => p;",
  // Runs the page by its path, through a helper of its own.
  [`${T}/web/page.test.mjs`]:
    'import { at } from "../_at.mjs";\nconst { page } = await import(at("apps/dashboard/src/page.ts"));',
  [`${T}/web/words.test.mjs`]: 'import { farewell } from "@chanlytics/kit";',
  [`${T}/web/says.test.mjs`]: 'import { PATH } from "@chanlytics/kit";',
  [`${T}/web/everything.test.mjs`]: 'import * as kit from "@chanlytics/kit";',
  // Reads by name: a template of the file's constant, the schema, a bundle by its path, and a tree, which is not followed.
  [`${T}/web/reads.test.mjs`]: [
    'const S = "apps/dashboard/src";',
    "textOf(`${S}/shout.ts`);",
    'textOf("supabase/schema.sql");',
    'load(path.join(here, "../../../../packages/kit/dist/extra.js"));',
    'walk("apps/dashboard");',
  ].join("\n"),
  // Still imports a module the change deleted.
  [`${T}/web/gone.test.mjs`]: 'import { old } from "../../../../apps/web/src/old.ts";\nimport { aid } from "../_aid";',
};
const KIT = reachOf({ files: Object.keys(TREE), read: (f) => TREE[f] ?? "" });
/** What a change reaches in the tree, each test by its name in tests/web and its distance. */
const reaches = (...changed) =>
  Object.fromEntries(
    [...KIT.testsReaching(changed)]
      .map(([t, d]) => [t.slice(`${T}/web/`.length), d])
      .sort(([a], [b]) => a.localeCompare(b)),
  );

test("a test reaches what it imports and what that imports, through a package by name, its barrels by the names asked", () => {
  // page → @chanlytics/kit's greet → greet.ts, which imports the clock; the barrels on the way cost nothing.
  assert.deepEqual(reaches("packages/kit/src/clock/today.ts"), { "everything.test.mjs": 1, "page.test.mjs": 3 });
  // farewell is its own module: the page, which asks the barrel for greet, does not reach it.
  assert.deepEqual(reaches("packages/kit/src/words/farewell.ts"), { "everything.test.mjs": 1, "words.test.mjs": 1 });
  // A barrel and its manifest are reached by every test that asks it for anything, and so is what it runs as it loads.
  const kitUsers = { "everything.test.mjs": 1, "page.test.mjs": 2, "says.test.mjs": 1, "words.test.mjs": 1 };
  for (const f of ["packages/kit/src/index.ts", "packages/kit/package.json"]) assert.deepEqual(reaches(f), kitUsers, f);
  assert.deepEqual(reaches("packages/kit/src/setup.ts"), {
    "everything.test.mjs": 2,
    "page.test.mjs": 3,
    "says.test.mjs": 2,
    "words.test.mjs": 2,
  });
  assert.deepEqual(reaches("packages/kit/src/clock/zone.ts"), {}, "a type-only import reaches nothing");
});

test("a test reaches the paths it reads by name, a bundle as its sources; a tree, a deleted module still imported, and a changed test", () => {
  // The page by `@/`, and the template `${S}/shout.ts` folded; the string in shipped code is no read.
  assert.deepEqual(reaches("apps/dashboard/src/shout.ts"), { "page.test.mjs": 2, "reads.test.mjs": 1 });
  assert.deepEqual(reaches("supabase/schema.sql"), { "reads.test.mjs": 1 });
  assert.deepEqual(reaches("packages/kit/src/extra.ts"), { "reads.test.mjs": 1 }, "dist/extra.js is built from it");
  assert.deepEqual(reaches("apps/web/src/old.ts"), { "gone.test.mjs": 1 }, "deleted, and the test still imports it");
  assert.deepEqual(reaches(`${T}/_aid.mjs`), { "gone.test.mjs": 1 }, "asked for without its extension");
  assert.deepEqual(reaches("apps/dashboard/index.ts"), {}, "a folder said as a string is no import of its index");
  assert.deepEqual(reaches("apps/dashboard/README.md"), {}, "a directory named is not followed");
  assert.deepEqual(reaches(`${T}/web/words.test.mjs`), { "words.test.mjs": 0 });
  assert.deepEqual(reaches(`${T}/_at.mjs`), { "page.test.mjs": 1 });
});

test("the tests the imports reach join a distance at a time, nearest first, until the next would pass the budget", () => {
  const tests = ["t/a/1", "t/a/2", "t/b/1", "t/b/2", "t/c/1", "t/c/2"];
  const reached = new Map([
    ["t/a/1", 1],
    ["t/b/2", 2],
    ["t/b/1", 1],
    ["t/c/1", 3],
    ["t/c/2", 3],
  ]);
  // t/a holds two; the first distance brings it to three, the second to four; the third, two more, would pass five.
  assert.deepEqual(withReached(["t/a"], reached, tests, 5), {
    targets: ["t/a", "t/b/1", "t/b/2"],
    added: ["t/b/1", "t/b/2"],
    left: { count: 2, from: 3 },
  });
  assert.deepEqual(withReached(["t/a"], reached, tests, 6).left, { count: 0, from: null }, "all of it fits");
  assert.deepEqual(
    withReached(["t/a", "t/b", "t/c"], reached, tests, 1).added,
    [],
    "what the folders cover is not added",
  );
});

test("the runner's arguments go in parts a Windows command line holds, every target once and in order", () => {
  assert.deepEqual(partsOf(["aaaa", "bbbb", "cc", "d"], 10), [
    ["aaaa", "bbbb"],
    ["cc", "d"],
  ]);
  const files = Array.from({ length: BUDGET }, (_, i) => `${T}/a-folder-of-tests/the-test-of-a-rule-${i}.test.mjs`);
  const parts = partsOf(files);
  assert.ok(parts.length > 1 && parts.every((p) => p.join(" ").length < 32_767), "each part under Windows' limit");
  assert.deepEqual(parts.flat(), files);
});

test("REGRESSION: the five tests main left red on 28 Oct 2026 run for the module each pull request changed", () => {
  // Each imported, directly or through a package, what its pull request changed, in a folder its paths did not name.
  const RED = {
    // #1882
    "apps/dashboard/src/server/readers/campaign-report.ts": ["ask/readers.test.mjs"],
    // #1895
    "packages/contracts/src/today/notification-kinds.ts": [
      "links/every-alert-mail-ends-with-the-link-to-its-page.test.mjs",
    ],
    // #1890
    "apps/dashboard/src/legacy-bridge/surface-registry.ts": [
      "platform/back-office.test.mjs",
      "reports/headline/on-demand-boot.test.mjs",
    ],
    // #1900: a new write route, written into the routes the test reads
    "apps/dashboard/src/client/routes.generated.ts": ["shell/surfaces/refresh-coverage.test.mjs"],
  };
  const covers = (targets, t) => targets.some((x) => t === x || t.startsWith(`${x}/`));
  for (const [changed, broke] of Object.entries(RED)) {
    const { targets } = picked(changed);
    for (const t of broke) {
      assert.ok(!covers(run(changed), `${T}/${t}`), `${changed}: the folders its path names never held ${t}`);
      assert.ok(targets.includes(`${T}/${t}`), `${changed}: ${t}`);
    }
  }
});

test("the composer, the answer verb, the campaign runner, a list rule, Ask's effort, the gateway and People's table reach the tests that prove them", () => {
  // TESTED_IN said each of these by hand until 29 Oct 2026 (11-27 Oct: each had selected no test of them).
  const reachedIn = (file, folder) =>
    [...REACH.testsReaching([file]).keys()].filter((t) => t.startsWith(`${T}/${folder}/`)).length;
  const PROVED = {
    "packages/contracts/src/config/workspace-config/compose.ts": [
      "receptionist",
      "whatsapp",
      "voice",
      "calendar",
      "sms",
    ],
    "packages/core/src/inbound/answer.ts": ["whatsapp", "sms", "email", "intake", "conversations"],
    "packages/core/src/campaigns/run-playbook.ts": ["playbooks", "broadcasts"],
    "apps/dashboard/src/surfaces/kit/table/columns.ts": ["leads", "deals"],
    "apps/dashboard/src/surfaces/people/hooks/use-controls.ts": ["leads", "deals"],
    "apps/dashboard/src/surfaces/people/rail/people-rail.tsx": ["leads", "deals"],
  };
  for (const [file, folders] of Object.entries(PROVED))
    for (const folder of folders) assert.ok(reachedIn(file, folder) > 0, `${file}: tests/${folder}`);
  const ONE = {
    // #1612 reworded a list field's line, and nothing ran the freeze of Ask's tools (16 Oct 2026).
    "packages/contracts/src/people/lists/list-fields.ts": "ask/ask-registry.test.mjs",
    "apps/dashboard/src/server/ask/effort.ts": "ai/ask-effort.test.mjs",
    // #1675's change to the gateway never ran the lead drafts' rules (17 Oct 2026).
    "apps/edge/lib/ask-gateway.ts": "leads/engine/lead-gateway.test.mjs",
  };
  for (const [file, t] of Object.entries(ONE)) assert.ok(REACH.testsReaching([file]).has(`${T}/${t}`), `${file}: ${t}`);
});

test("a source file runs the tests of every folder its path names, and the rules and ratchets always", () => {
  const targets = run("packages/core/src/leads/cards.ts", "apps/edge/lib/receptionist/steer.ts");
  for (const t of ALWAYS) assert.ok(targets.includes(t), t);
  for (const t of ["tooling/scripts/tests/leads", "tooling/scripts/tests/edge", "tooling/scripts/tests/receptionist"])
    assert.ok(targets.includes(t), t);
  assert.ok(!targets.includes("tooling/scripts/tests/people"), "nothing the change does not name");
});

test("every path READ_BY names holds files, and every test it names is one", () => {
  for (const [target, reads] of Object.entries(READ_BY)) {
    assert.ok(
      TRACKED.some((f) => (f === target || f.startsWith(`${target}/`)) && f.endsWith(".test.mjs")),
      `${target} is no test and holds none: move the entry with the test`,
    );
    for (const read of reads)
      assert.ok(
        TRACKED.some((f) => holds(read, f)),
        `${target}: ${read} holds no file: move it with the code`,
      );
  }
});

test("a change the hearing tests trace or run runs them, which no such path names; a doc and the phone app do not", () => {
  // 15 Oct 2026: the refresh map, the registry, db's realtime and the surfaces' values each ran no hearing test, though
  // both its ratchets (reads-not-heard.json, on-demand-reads.json) read them.
  const hearing = "tooling/scripts/tests/shell/hearing";
  for (const f of [
    "apps/dashboard/src/legacy-bridge/refresh-map.ts",
    "apps/dashboard/src/legacy-bridge/surface-registry.ts",
    "packages/db/src/realtime.ts",
    "apps/dashboard/src/surfaces/surface-values.ts",
    "apps/dashboard/app/api/v1/contacts/route.ts",
    "apps/edge/api/inbound-sms.ts",
    "packages/contracts/src/activity/record-kinds.ts",
    "supabase/schema.sql",
    "tooling/scripts/trace-routes.mjs",
    "tooling/scripts/tests/baselines/reads-not-heard.json",
    "tooling/scripts/tests/baselines/on-demand-reads.json",
    "tooling/scripts/tests/baselines/hearing/inbox.json",
  ])
    assert.ok(run(f).includes(hearing), f);
  for (const f of ["docs/decisions/README.md", "apps/mobile/src/app/index.tsx"])
    assert.ok(!run(f).includes(hearing), f);
  // A folder already asked for covers a folder inside it, as it does a file.
  const shell = run("packages/contracts/src/shell/route-prefetch.ts");
  assert.ok(
    shell.includes("tooling/scripts/tests/shell") && !shell.includes(hearing),
    "tests/shell covers its hearing",
  );
});

test("a stylesheet anywhere in the dashboard runs the style tests, which no such path names; the code beside it does not", () => {
  // 1 Nov 2026: #2018's two rules in today/phone/phone.css broke styles/has-subjects.test.mjs, and its path named no
  // `styles`, so the red waited for #2019, which touched legacy/styles/.
  const styles = `${T}/styles`;
  for (const f of [
    "apps/dashboard/src/surfaces/today/phone/phone.css",
    "apps/dashboard/src/surfaces/kit/kit.css",
    "apps/dashboard/src/legacy-bridge/legacy.css",
    "apps/dashboard/app/globals.css",
  ])
    assert.ok(run(f).includes(styles), f);
  for (const f of ["apps/dashboard/src/surfaces/today/phone/end.tsx", "apps/dashboard/package.json"])
    assert.ok(!run(f).includes(styles), f);
  const { targets } = picked("apps/dashboard/src/surfaces/today/phone/phone.css");
  const runs = REACH.tests.filter((t) => targets.some((x) => t === x || t.startsWith(`${x}/`)));
  assert.ok(runs.length <= BUDGET, `${runs.length} of ${REACH.tests.length}`);
});

test("a stylesheet of legacy/styles runs layout-measure, which walks that folder; one outside it does not", () => {
  const measure = `${T}/shell/layout-measure.test.mjs`;
  assert.ok(run("apps/dashboard/src/legacy/styles/leads.css").includes(measure));
  assert.ok(!run("apps/dashboard/src/surfaces/today/phone/phone.css").includes(measure));
});

test("a graph already built is the one the change is read against, since building it takes seconds", () => {
  const reached = `${T}/ai/ask-effort.test.mjs`;
  const graph = { tests: [reached], testsReaching: () => new Map([[reached, 1]]) };
  assert.ok(changeTargets(["a-file-nothing-imports.txt"], TRACKED, graph).targets.includes(reached));
});

test("a change to contracts' sources runs the browser entry's test, which no such path names; an app's file does not", () => {
  // 17 Oct 2026: an export added to a barrel changed the browser's entry (gen/contracts-browser-entry.mjs), and the picker
  // ran tests/ask alone, never shipping/browser-entry.test.mjs.
  const entry = "tooling/scripts/tests/shipping/browser-entry.test.mjs";
  for (const f of ["packages/contracts/src/ask/index.ts", "packages/contracts/src/browser.generated.ts"])
    assert.ok(run(f).includes(entry), f);
  assert.ok(!run("apps/dashboard/src/server/ask/loop.ts").includes(entry), "a dashboard file reads no barrel of it");
});

test("a changed test runs itself; a folder already asked for covers it; a helper of a folder runs the folder", () => {
  assert.ok(
    run("tooling/scripts/tests/calendar/calendar-vm.test.mjs").includes(
      "tooling/scripts/tests/calendar/calendar-vm.test.mjs",
    ),
  );
  const both = run(
    "tooling/scripts/tests/calendar/calendar-vm.test.mjs",
    "apps/dashboard/src/surfaces/calendar/surface.ts",
  );
  assert.ok(both.includes("tooling/scripts/tests/calendar"));
  assert.ok(!both.includes("tooling/scripts/tests/calendar/calendar-vm.test.mjs"), "the folder covers the file");
  assert.ok(run("tooling/scripts/tests/leads/_mark-images.mjs").includes("tooling/scripts/tests/leads"));
});

test("the runner, a shared helper at the tests' root or a stand-in runs the rules and ratchets and what imports it, never past the budget", () => {
  // 10 Oct 2026: one line in tests/_legacy-react.mjs ran #1539's whole suite, 21 to 40 minutes, past CI's cap. The
  // nightly runs everything; a pull request that wants it asks with the `suite` label.
  for (const f of ["tooling/scripts/tests/_fake-db.mjs", "tooling/scripts/tests/_legacy-react.mjs"]) {
    assert.deepEqual(run(f), ALWAYS, f);
    const { targets, added } = picked(f);
    const runs = REACH.tests.filter((t) => targets.some((x) => t === x || t.startsWith(`${x}/`)));
    assert.ok(added.length > 0 && runs.length <= BUDGET, `${f}: ${runs.length} of ${REACH.tests.length}`);
  }
  for (const f of ["tooling/scripts/checks/test.mjs", "tooling/scripts/checks/coverage.mjs"])
    assert.deepEqual(run(f), [...ALWAYS, "tooling/scripts/tests/checks"], `${f}: the runner's own tests`);
  assert.ok(run("tooling/scripts/tests/shared/_stand-in-base-ui.mjs").includes("tooling/scripts/tests/shared"));
});

test("a test the change deleted is no target to run", () => {
  const gone = `${T}/calendar/a-test-renamed-away.test.mjs`;
  assert.ok(run(gone).includes(gone), "its path names it");
  assert.ok(!picked(gone).targets.includes(gone), "the checkout has no such file");
});

test("a migration runs the database folder, the phone app its own tests, a doc the history too, and a bump the rules alone", () => {
  assert.ok(run("supabase/migrations/00300_x.sql").includes("tooling/scripts/tests/database"));
  assert.ok(run("apps/mobile/src/shell/Surface.tsx").includes("apps/mobile/test"));
  assert.deepEqual(run("pnpm-lock.yaml", "package.json"), ALWAYS);
  assert.deepEqual(run("docs/decisions/README.md"), [...ALWAYS, "tooling/scripts/tests/history"]);
});

test("--db runs the database suites that lie where the change names, and nothing for a change that names none", () => {
  const suites = execFileSync("git", ["ls-files", "tooling/scripts/tests/**.test.mjs"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(isDatabaseSuite);
  assert.ok(suites.length > 50, "the repository's database suites were read");
  assert.ok(
    suites.every((f) => /\.(db|integration)\.test\.mjs$/.test(f)),
    "only `pnpm test:db`'s two globs",
  );
  const migration = databaseSuitesOf(run("supabase/migrations/00300_x.sql"), suites);
  assert.ok(migration.length > 0 && migration.some((f) => f.startsWith("tooling/scripts/tests/database/")));
  assert.ok(
    migration.every((f) => [...ALWAYS, "tooling/scripts/tests/database"].some((t) => f.startsWith(`${t}/`))),
    "nothing outside what the change names",
  );
  const reports = databaseSuitesOf(run("packages/db/src/repositories/reports/report-series.ts"), suites);
  assert.ok(
    reports.some((f) => f.startsWith("tooling/scripts/tests/reports/")),
    "the domain's own suites",
  );
  const one = "tooling/scripts/tests/reports/report-series.db.test.mjs";
  assert.deepEqual(databaseSuitesOf([one, "tooling/scripts/tests/reports/reports-vm.test.mjs"], suites), [one]);
});
