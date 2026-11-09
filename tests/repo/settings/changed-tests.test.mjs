/**
 * What a pull request's change runs (tooling/scripts/checks/changed-tests.mjs, which ci.yml runs on every pull request
 * and database.yml for its database suites): a source file its domain's tests and every test its imports reach, a test
 * file itself, the rules and ratchets always, and never past the budget (Ruben, 10 Oct 2026: under ten minutes). The
 * graph (checks/test-reach.mjs) is proved on a small tree of its own, then on the repository's: the five tests main left
 * red on 28 Oct 2026, and the links the hand-kept TESTED_IN said before it. Executed over the real folder names, so a
 * folder renamed under tests is seen here. A migration's own text reaches the database suites that read what it changes,
 * proved on the migrations behind main's Database reds of 3 to 5 Nov 2026.
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
  databaseRunOf,
  databaseSuitesOf,
  namesWrittenIn,
  holds,
  isDatabaseSuite,
  migrationReaders,
  partsOf,
  testTargets,
  walksTheCatalog,
  withReached,
} from "../../../tooling/scripts/checks/changed-tests.mjs";
import { isTest, reachOf } from "../../../tooling/scripts/checks/test-reach.mjs";
import { ROOT } from "../../_source.mjs";

const FOLDERS = new Set(
  execFileSync("git", ["ls-files", "tests/*/**.test.mjs"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((f) => f.split("/")[1]),
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
const T = "tests";

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
    'load(path.join(here, "../../packages/kit/dist/extra.js"));',
    'walk("apps/dashboard");',
  ].join("\n"),
  // Still imports a module the change deleted.
  [`${T}/web/gone.test.mjs`]: 'import { old } from "../../apps/web/src/old.ts";\nimport { aid } from "../_aid";',
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
    "apps/dashboard/src/bridge/surface-registry.ts": [
      "console/back-office/back-office.test.mjs",
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
    "packages/contracts/src/people/lists/fields.ts": "ask/ask-registry.test.mjs",
    "apps/dashboard/src/server/ask/effort.ts": "ai/ask-effort.test.mjs",
    // #1675's change to the gateway never ran the lead drafts' rules (17 Oct 2026).
    "apps/edge/lib/ai/ask-gateway.ts": "leads/engine/lead-gateway.test.mjs",
  };
  for (const [file, t] of Object.entries(ONE)) assert.ok(REACH.testsReaching([file]).has(`${T}/${t}`), `${file}: ${t}`);
});

test("a source file runs the tests of every folder its path names, and the rules and ratchets always", () => {
  const targets = run("packages/core/src/leads/cards.ts", "apps/edge/lib/receptionist/steer.ts");
  for (const t of ALWAYS) assert.ok(targets.includes(t), t);
  for (const t of ["tests/leads", "tests/edge", "tests/receptionist"]) assert.ok(targets.includes(t), t);
  assert.ok(!targets.includes("tests/people"), "nothing the change does not name");
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
  const hearing = "tests/shell/hearing";
  for (const f of [
    "apps/dashboard/src/bridge/refresh-map.ts",
    "apps/dashboard/src/bridge/surface-registry.ts",
    "packages/db/src/realtime.ts",
    "apps/dashboard/src/surfaces/surface-values.ts",
    "apps/dashboard/app/api/v1/contacts/route.ts",
    "apps/edge/api/inbound-sms.ts",
    "packages/contracts/src/activity/record-kinds.ts",
    "supabase/schema.sql",
    "tooling/scripts/trace-routes.mjs",
    "tests/baselines/reads-not-heard.json",
    "tests/baselines/on-demand-reads.json",
    "tests/baselines/hearing/inbox.json",
  ])
    assert.ok(run(f).includes(hearing), f);
  for (const f of ["docs/decisions/README.md", "apps/mobile/src/app/index.tsx"])
    assert.ok(!run(f).includes(hearing), f);
  // A folder already asked for covers a folder inside it, as it does a file.
  const shell = run("packages/contracts/src/shell/route-prefetch.ts");
  assert.ok(shell.includes("tests/shell") && !shell.includes(hearing), "tests/shell covers its hearing");
});

test("a stylesheet anywhere in the dashboard runs the style tests, which no such path names; the code beside it does not", () => {
  // 1 Nov 2026: #2018's two rules in today/phone/phone.css broke styles/has-subjects.test.mjs, and its path named no
  // `styles`, so the red waited for #2019, which touched styles/.
  const styles = `${T}/styles`;
  for (const f of [
    "apps/dashboard/src/surfaces/today/phone/phone.css",
    "apps/dashboard/src/surfaces/kit/kit.css",
    "apps/dashboard/src/bridge/frame.css",
    "apps/dashboard/app/globals.css",
  ])
    assert.ok(run(f).includes(styles), f);
  for (const f of ["apps/dashboard/src/surfaces/today/zones/foot.tsx", "apps/dashboard/package.json"])
    assert.ok(!run(f).includes(styles), f);
  const { targets } = picked("apps/dashboard/src/surfaces/today/phone/phone.css");
  const runs = REACH.tests.filter((t) => targets.some((x) => t === x || t.startsWith(`${x}/`)));
  assert.ok(runs.length <= BUDGET, `${runs.length} of ${REACH.tests.length}`);
});

test("a stylesheet of styles runs layout-measure, which walks that folder; one outside it does not", () => {
  const measure = `${T}/shell/layout-measure.test.mjs`;
  assert.ok(run("apps/dashboard/src/styles/leads.css").includes(measure));
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
  const entry = "tests/shipping/browser-entry.test.mjs";
  for (const f of ["packages/contracts/src/ask/index.ts", "packages/contracts/src/browser.generated.ts"])
    assert.ok(run(f).includes(entry), f);
  assert.ok(
    !run("apps/dashboard/src/server/ask/loop/loop.ts").includes(entry),
    "a dashboard file reads no barrel of it",
  );
});

test("a changed test runs itself; a folder already asked for covers it; a helper of a folder runs the folder", () => {
  assert.ok(run("tests/calendar/calendar-vm.test.mjs").includes("tests/calendar/calendar-vm.test.mjs"));
  const both = run("tests/calendar/calendar-vm.test.mjs", "apps/dashboard/src/surfaces/calendar/surface.ts");
  assert.ok(both.includes("tests/calendar"));
  assert.ok(!both.includes("tests/calendar/calendar-vm.test.mjs"), "the folder covers the file");
  assert.ok(run("tests/leads/_mark-images.mjs").includes("tests/leads"));
});

test("the runner, a shared helper at the tests' root or a stand-in runs the rules and ratchets and what imports it, never past the budget", () => {
  // 10 Oct 2026: one line in tests/_stub-react.mjs ran #1539's whole suite, 21 to 40 minutes, past CI's cap. The
  // nightly runs everything; a pull request that wants it asks with the `suite` label.
  for (const f of ["tests/_fake-db.mjs", "tests/_stub-react.mjs"]) {
    assert.deepEqual(run(f), ALWAYS, f);
    const { targets, added } = picked(f);
    const runs = REACH.tests.filter((t) => targets.some((x) => t === x || t.startsWith(`${x}/`)));
    assert.ok(added.length > 0 && runs.length <= BUDGET, `${f}: ${runs.length} of ${REACH.tests.length}`);
  }
  for (const f of ["tooling/scripts/checks/test.mjs", "tooling/scripts/checks/coverage.mjs"])
    assert.deepEqual(run(f), [...ALWAYS, "tests/checks"], `${f}: the runner's own tests`);
  assert.ok(run("tests/shared/_stand-in-base-ui.mjs").includes("tests/shared"));
});

test("a test the change deleted is no target to run", () => {
  const gone = `${T}/calendar/a-test-renamed-away.test.mjs`;
  assert.ok(run(gone).includes(gone), "its path names it");
  assert.ok(!picked(gone).targets.includes(gone), "the checkout has no such file");
});

test("a migration runs the database folder, the phone app its own tests, a doc the history too, and a bump the rules alone", () => {
  assert.ok(run("supabase/migrations/00300_x.sql").includes("tests/database"));
  assert.ok(run("apps/mobile/src/shell/Surface.tsx").includes("apps/mobile/test"));
  assert.deepEqual(run("pnpm-lock.yaml", "package.json"), ALWAYS);
  assert.deepEqual(run("docs/decisions/README.md"), [...ALWAYS, "tests/history"]);
});

test("--db runs the database suites that lie where the change names, and nothing for a change that names none", () => {
  const suites = execFileSync("git", ["ls-files", "tests/**.test.mjs"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(isDatabaseSuite);
  assert.ok(suites.length > 50, "the repository's database suites were read");
  assert.ok(
    suites.every((f) => /\.(db|integration)\.test\.mjs$/.test(f)),
    "only `pnpm test:db`'s two globs",
  );
  const migration = databaseSuitesOf(run("supabase/migrations/00300_x.sql"), suites);
  assert.ok(migration.length > 0 && migration.some((f) => f.startsWith("tests/database/")));
  assert.ok(
    migration.every((f) => [...ALWAYS, "tests/database"].some((t) => f.startsWith(`${t}/`))),
    "nothing outside what the change names",
  );
  const reports = databaseSuitesOf(run("packages/db/src/repositories/reports/series.ts"), suites);
  assert.ok(
    reports.some((f) => f.startsWith("tests/reports/")),
    "the domain's own suites",
  );
  const one = "tests/reports/report-series.db.test.mjs";
  assert.deepEqual(databaseSuitesOf([one, "tests/reports/reports-vm.test.mjs"], suites), [one]);
});

/* ---- What a migration reaches: the suites outside its folders that read what it changes (5 Nov 2026) ---- */

const SUITES = TRACKED.filter((f) => isTest(f) && isDatabaseSuite(f));
/** The repository's files as they stand, and a migration that is not one of them. */
const readWith = (written) => (f) =>
  written[f] ?? (fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), "utf8") : "");
const MIGRATION = "supabase/migrations/00900_a_change.sql";
/** What `--db` runs for a pull request that adds this one migration, as its paths and its text say. */
const dbRun = (sql) => databaseRunOf([MIGRATION], run(MIGRATION), SUITES, readWith({ [MIGRATION]: sql }));
const recreates = (fn) =>
  `create or replace function public.${fn}(p_id uuid) returns void language sql as $$ select 1 $$;`;
const CATALOG_WALK = `${T}/partners/second-factor-catalog.db.test.mjs`;

test("a migration that adds a definer door runs the catalog's walk, which no path of its names", () => {
  const door = `create function public.a_new_door(p_tenant uuid) returns boolean language plpgsql security definer as $$
begin
  return exists (select 1 from public.memberships m where m.tenant_id = p_tenant and m.user_id = auth.uid());
end $$;
grant execute on function public.a_new_door(uuid) to authenticated;`;
  assert.ok(!databaseSuitesOf(run(MIGRATION), SUITES).includes(CATALOG_WALK), "its path names tests/database alone");
  const { targets, readers } = dbRun(door);
  assert.ok(targets.includes(CATALOG_WALK));
  assert.match(readers.get(CATALOG_WALK), /walks the catalog/);
});

test("a migration that re-creates a pinned function runs the suite that pins it, by body or by signature", () => {
  const PINNED = {
    // liveBody("lead_rounds_notify") against the migration that last wrote it
    lead_rounds_notify: `${T}/leads/lists/lead-lists.db.test.mjs`,
    // "sequence_unchecked(integer, integer, integer, uuid, uuid[])", asked of has_function_privilege
    sequence_unchecked: `${T}/leads/workbench/reach-out-add.db.test.mjs`,
    // md5(pg_get_functiondef('public.change_playbook(…)'::regprocedure))
    change_playbook: `${T}/playbooks/change/change-playbook-keys.db.test.mjs`,
  };
  for (const [fn, suite] of Object.entries(PINNED)) {
    assert.ok(!databaseSuitesOf(run(MIGRATION), SUITES).includes(suite), `${suite}: no path of the migration names it`);
    const { targets, readers } = dbRun(recreates(fn));
    assert.ok(targets.includes(suite), `${fn}: ${suite}`);
    assert.match(readers.get(suite), new RegExp(`says ${fn}`), suite);
  }
});

test("a migration that drops a function, or the signature a suite names, runs that suite", () => {
  const { targets } = dbRun("drop function if exists public.sequence_unchecked(integer, integer, integer, uuid);");
  assert.ok(targets.includes(`${T}/leads/workbench/reach-out-add.db.test.mjs`));
});

test("a migration that adds a clock runs the suite that holds the register, which no function of its names", () => {
  // ops/sweep-registry holds every row of sweep_status as a closed list, and a clock is a row a migration writes.
  const clock = `select cron.schedule('a-new-clock', '*/5 * * * *', $$select 1$$);
insert into public.sweep_status (sweep, jobname, judged_by, max_silence)
values ('a_new', 'a-new-clock', 'run', interval '1 hour') on conflict (sweep) do nothing;`;
  const suite = `${T}/ops/sweep-registry.db.test.mjs`;
  assert.ok(!databaseSuitesOf(run(MIGRATION), SUITES).includes(suite), "no path of the migration names it");
  const { targets, readers } = dbRun(clock);
  assert.ok(targets.includes(suite));
  assert.match(readers.get(suite), /says sweep_status/);
  // 00538 did this for the drafts' clock, and a job kind's row beside it.
  const real = "supabase/migrations/00538_a_reply_is_drafted_when_it_is_owed.sql";
  const reached = databaseRunOf([real], run(real), SUITES, readWith({})).targets;
  assert.ok(reached.includes(suite), "00538's clock");
  assert.ok(reached.includes(`${T}/jobs/the-ledger-holds-its-rules.db.test.mjs`), "00538's job kind");
});

test("the rows a migration adds or removes name their table; a backfill's update and a function's own body do not", () => {
  const named = (sql) => [...namesWrittenIn(sql).names].sort();
  assert.deepEqual(named("insert into public.job_kinds (kind) values ('a_kind');"), ["job_kinds"]);
  assert.deepEqual(named("delete from public.sweep_status where sweep = 'gone';"), ["sweep_status"]);
  assert.deepEqual(named("do $$ begin insert into public.event_subscriptions (a) values (1); end $$;"), [
    "event_subscriptions",
  ]);
  assert.deepEqual(
    named("update public.contacts set consent = 'unknown' where consent is null;"),
    [],
    "a backfill's update would reach every suite that says the table",
  );
  assert.deepEqual(
    named("create function public.a() returns void language sql as $$ insert into public.b (c) values (1) $$;"),
    ["a"],
    "a body runs when it is called",
  );
  assert.deepEqual(named("insert into vault.secrets (name) values ('a');"), [], "another schema's");
  assert.deepEqual(
    named("insert into public.decisions (a) select a from public.b; delete from public.events where a;"),
    [],
    "a table of one word cannot be told from the word: 00532's rows would run every suite that says `decisions`",
  );
  assert.deepEqual(
    named("create function public.merge() returns void language sql as $$ select 1 $$;"),
    ["merge"],
    "a function of one word stays: too many suites cost minutes on one pull request, a pin missed turns main red",
  );
});

test("REGRESSION: each migration behind main's Database reds of 3 to 5 Nov 2026 runs the suite it turned red", () => {
  // Of main's 60 runs in those days 38 were red, and 33 held one of the first three suites here. Each stood in no folder
  // its pull request's paths named, so each pull request's own Database job was green.
  const RED = {
    // dropped sequence_unchecked(integer, integer, integer, uuid), made again with p_send_ids: 31 red runs
    "00505_an_opening_is_written_again_as_its_owner_says.sql": ["leads/workbench/reach-out-add"],
    // sequence_queued_why_not, a door that reads the seat: 16 red runs, ended by 00542
    "00533_a_lead_on_a_list_says_why_no_batch_takes_it.sql": ["partners/second-factor-catalog"],
    // people_erase_begin, the same: #2107
    "00547_a_press_of_delete_is_one_write.sql": ["partners/second-factor-catalog"],
    // reach_out_lead_timeline again: the body lead-lists pins, 4 red runs
    "00540_a_lead_s_own_email_is_a_send_with_no_sequence.sql": ["leads/lists/lead-lists"],
    // claim_due_jobs again, and a kind's check becomes a key: 3 and 1 red runs
    "00526_the_ledger_knows_its_kinds.sql": [
      "broadcasts/a-broadcast-runs-to-its-end-through-both-guards",
      "lines/line-provision",
    ],
    // ingest_call again: the body never-again pins, 3 red runs
    "00530_a_call_tells_its_owner_once_and_keeps_only_what_it_needs.sql": ["reach-out/replies/never-again"],
  };
  for (const [file, suites] of Object.entries(RED)) {
    const migration = `supabase/migrations/${file}`;
    assert.ok(TRACKED.includes(migration), `${file} is no migration: name it as the folder does`);
    const named = databaseSuitesOf(run(migration), SUITES);
    const { targets } = databaseRunOf([migration], run(migration), SUITES, readWith({}));
    for (const suite of suites) {
      const f = `${T}/${suite}.db.test.mjs`;
      assert.ok(!named.includes(f), `${file}: its paths never named ${suite}`);
      assert.ok(targets.includes(f), `${file}: ${suite}`);
    }
  }
});

test("a suite runs for the function it says as a word, in a key or a comment too: a longer name is another function, and a suite naming none stays out", () => {
  const TINY = {
    "supabase/migrations/00901_the_rule.sql": recreates("the_rule"),
    [`${T}/rules/body.db.test.mjs`]: 'assert.equal(liveBody("the_rule"), bodyIn(migration("00800"), HEADER));',
    [`${T}/rules/call.integration.test.mjs`]: 'await db.rpc("the_rule", { p_id });',
    // As never-again holds its bodies: by the function's name, with no string that says it.
    [`${T}/rules/key.db.test.mjs`]: 'const LATER = { the_rule: "00800" };',
    // As the broadcast's walk runs claim_due_jobs: through the package that calls it, saying so in a comment alone.
    [`${T}/rules/said.db.test.mjs`]: "// the_rule runs when the tick does.\nawait tick();",
    [`${T}/rules/longer.db.test.mjs`]: 'await db.rpc("the_rule_again"); await db.rpc("not_the_rule");',
    [`${T}/rules/other.db.test.mjs`]: 'await db.rpc("another_rule");',
  };
  const suites = Object.keys(TINY).filter(isDatabaseSuite);
  assert.deepEqual(
    [...migrationReaders(["supabase/migrations/00901_the_rule.sql"], suites, (f) => TINY[f]).keys()],
    [
      `${T}/rules/body.db.test.mjs`,
      `${T}/rules/call.integration.test.mjs`,
      `${T}/rules/key.db.test.mjs`,
      `${T}/rules/said.db.test.mjs`,
    ],
  );
});

test("a real migration runs the suites that pin what it wrote, however they hold the pin", () => {
  const PINS = {
    // never-again holds its bodies in a table, by the function's name as a key.
    "00484_a_thread_keeps_when_each_wire_last_heard_from_its_person.sql": "reach-out/replies/never-again",
    // lead_rounds_notify's body, the pin of the first such red (13 Oct 2026, #1581).
    "00506_a_search_never_stalls_and_every_spend_is_counted.sql": "leads/lists/lead-lists",
    // Dropped and made again, under the signature reach-out-add names.
    "00546_a_line_is_written_when_its_email_is_planned.sql": "leads/workbench/reach-out-add",
  };
  for (const [file, suite] of Object.entries(PINS)) {
    const migration = `supabase/migrations/${file}`;
    assert.ok(TRACKED.includes(migration), `${file} is no migration: name it as the folder does`);
    const { targets } = databaseRunOf([migration], run(migration), SUITES, readWith({}));
    assert.ok(targets.includes(`${T}/${suite}.db.test.mjs`), `${file}: ${suite}`);
  }
});

test("a change with no migration in it reaches no suite this way: a doc, the seed, the snapshot, a suite, the ledger", () => {
  for (const f of [
    "docs/runbook.md",
    "supabase/seed.sql",
    "supabase/config.toml",
    "supabase/schema.sql",
    "supabase/migrations-ledger.json",
    CATALOG_WALK,
    "packages/db/src/repositories/voice/calls.ts",
  ])
    assert.equal(migrationReaders([f], SUITES, readWith({})).size, 0, f);
});

test("a suite its folder already runs is not said twice", () => {
  const suite = `${T}/database/privileges.db.test.mjs`;
  const { targets, readers } = dbRun(recreates("a_rule"));
  assert.equal(targets.filter((t) => t === suite).length, 1);
  assert.ok(!readers.has(suite), "tests/database is what the path names");
});

test("the suites that walk the catalog outside tests/database are these: each runs on every migration's pull request", () => {
  const walks = SUITES.filter((f) => !f.startsWith(`${T}/database/`) && walksTheCatalog(readWith({})(f), f));
  assert.deepEqual(
    walks,
    [
      `${T}/consent/consent-paths.db.test.mjs`,
      `${T}/inbound/a-reply-window-reads-its-own-wire.db.test.mjs`,
      CATALOG_WALK,
    ],
    "a suite that asks the catalog of everything runs on every migration's pull request: if this one should, keep it quick and name it here; if it asks of one object, name the object in its query",
  );
});

test("a query that walks the catalog names nothing; one that names what it asks of, or only mentions pg_proc, does not walk", () => {
  const WALKS = [
    "query(`select p.oid::regprocedure::text as fn from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef`)",
    "query(`select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc ~ 'x'`)",
    "query(\"select policyname from pg_policies where schemaname = 'public'\")",
    "query(`select viewname as name from pg_views where schemaname = 'public' and definition ~ 'x'`)",
    "query(`select c.relname from pg_class c where c.relkind = 'r'`)",
    "query(`select column_name from information_schema.columns where table_schema = 'public'`)",
    // One part of a union walks, whatever another names.
    "query(`select 1 from pg_proc p where p.proname = 'a' union all select 2 from pg_proc p where p.prosecdef`)",
    // Leaving a few out by name is still a walk of the rest.
    "query(`select p.proname from pg_proc p where p.proname not in ('a', 'b')`)",
  ];
  const NOT = [
    "query(`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${name}'`)",
    "query(`select prosrc from pg_proc where oid = '${signature}'::regprocedure`)",
    "query(`select p.prosecdef from pg_proc p where p.oid = f::regprocedure`)",
    "query(\"select p.proname from pg_proc p where p.proname in ('a', 'b')\")",
    "query(`select 1 from pg_proc p where p.oid in ('public.a(uuid)'::regprocedure, 'public.b()'::regprocedure)`)",
    "query(\"select cmd from pg_policies where schemaname = 'public' and tablename = 'contacts'\")",
    "query(\"select polname from pg_policy where polrelid = 'public.sequence_replies'::regclass\")",
    "query(\"select column_name from information_schema.columns where table_name = 'x'\")",
    // Said, not asked.
    "/** One SQL read, for what PostgREST does not serve (from pg_proc). */ const a = 1;",
    'assert.equal(a, b, "and pg_proc runs what 00451 wrote");',
    "query(`select pg_stat_get_xact_function_calls('public.a()'::regprocedure)`)",
  ];
  for (const text of WALKS) assert.equal(walksTheCatalog(text, "w.db.test.mjs"), true, text);
  for (const text of NOT) assert.equal(walksTheCatalog(text, "n.db.test.mjs"), false, text);
});

test("a migration's functions are read from its statements, whatever they do to one", () => {
  const named = (sql) => [...namesWrittenIn(sql).names].sort();
  assert.deepEqual(named("create or replace function public.a(p uuid) returns void as $$ select 1 $$ language sql;"), [
    "a",
  ]);
  assert.deepEqual(named('CREATE FUNCTION "b"() RETURNS void AS $x$ select 1 $x$ LANGUAGE sql;'), ["b"]);
  assert.deepEqual(named("create function c() returns void as 'select 1' language sql;"), ["c"]);
  assert.deepEqual(named("create or replace procedure public.d() language sql as $$ select 1 $$;"), ["d"]);
  assert.deepEqual(named("drop function if exists public.e(integer), public.f(uuid) cascade;"), ["e", "f"]);
  assert.deepEqual(named("drop function public.g;"), ["g"]);
  assert.deepEqual(named("alter function public.h(uuid) rename to h_again;"), ["h"]);
  assert.deepEqual(named("alter function public.i() set search_path = '';"), ["i"]);
  assert.deepEqual(named("grant execute on function public.j(uuid) to authenticated;"), ["j"]);
  assert.deepEqual(named("revoke all on function public.k() from public, anon;"), ["k"]);
  assert.deepEqual(named("comment on function public.l() is 'what it does';"), ["l"]);
  assert.deepEqual(
    named("create trigger t after insert on public.x for each row execute function public.m();"),
    ["m"],
    "a new trigger changes what runs it",
  );
});

test("what a `do` block does to a function is read too; a function's own body and a comment are not", () => {
  const named = (sql) => [...namesWrittenIn(sql).names].sort();
  assert.deepEqual(named("do $$ begin if true then drop function public.a(); end if; end $$;"), ["a"]);
  assert.deepEqual(named("do $$ begin execute 'drop function public.b()'; end $$;"), ["b"]);
  assert.deepEqual(named("do language plpgsql $body$ begin revoke all on function public.c() from anon; end $body$;"), [
    "c",
  ]);
  assert.deepEqual(
    named(`create function public.d() returns void language plpgsql as $$
      begin execute 'drop function public.not_at_this_migration()'; end $$;`),
    ["d"],
    "a body runs when it is called, not when the migration does",
  );
  assert.deepEqual(named("-- drop function public.e();\n/* drop function public.f(); */ select 1;"), []);
  assert.deepEqual(
    named("create trigger t after insert on public.x execute function extensions.moddatetime();"),
    [],
    "another schema's",
  );
  assert.deepEqual(named("alter default privileges in schema public revoke execute on functions from anon;"), []);
});

test("a migration that names a function only at run time cannot be read, so every database suite runs for it, as on main", () => {
  const dynamic = `do $$ declare f record; begin
    for f in select p.oid from pg_proc p loop execute format('drop function %s', f.oid::regprocedure); end loop;
  end $$;`;
  assert.equal(namesWrittenIn(dynamic).unread, true);
  assert.equal(namesWrittenIn("do $$ begin execute 'drop function ' || v_sig; end $$;").unread, true);
  assert.equal(namesWrittenIn(recreates("a_rule")).unread, false);
  assert.equal(namesWrittenIn("comment on table public.x is 'the function that writes it';").unread, false, "words");
  assert.equal(namesWrittenIn("do $$ begin raise notice 'no such function'; end $$;").unread, false, "words");
  const { targets } = dbRun(dynamic);
  assert.deepEqual([...targets].sort(), [...SUITES].sort(), "the only answer to a function that cannot be named");
});

test("the repository's migrations read as functions, every statement a plain search finds among them", () => {
  // A reader that finds nothing would pass every test above that asks for less.
  const dir = "supabase/migrations";
  const sqlOf = (f) =>
    fs
      .readFileSync(path.join(ROOT, dir, f), "utf8")
      .split("\r\n")
      .join("\n");
  const migrations = fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".sql"));
  assert.ok(migrations.length > 400, `only ${migrations.length} migrations`);
  const unread = [];
  const missed = [];
  let found = 0;
  for (const f of migrations) {
    const sql = sqlOf(f);
    const read = namesWrittenIn(sql);
    found += read.names.size;
    if (read.unread) unread.push(f.slice(0, 5));
    // Each statement at the head of a line, as the migrations write them: a body's lines are indented.
    for (const [, name] of sql.matchAll(
      /^(?:create(?: or replace)?|drop|alter|grant [a-z, ]+ on|revoke [a-z, ]+ on|comment on) function (?:if exists )?public\.([a-z0-9_]+)/gim,
    ))
      if (!read.names.has(name.toLowerCase())) missed.push(`${f.slice(0, 5)}: ${name}`);
  }
  assert.ok(found > 1000, `only ${found} functions named across the migrations`);
  assert.deepEqual(missed, [], "a statement about a function the reader did not see");
  assert.ok(unread.includes("00440"), "00440 drops functions by the oids a loop finds");
  assert.ok(unread.length < 5, `${unread.join(" ")}: a migration that cannot be read runs every database suite`);
});
