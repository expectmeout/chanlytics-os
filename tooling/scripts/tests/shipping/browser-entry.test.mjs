/**
 * The browser's entry into contracts (decision 0024; gen/contracts-browser-entry.mjs): generated from the barrels and
 * committed, so this regenerates it in memory and refuses a stale copy; holds every value a page's module imports from
 * contracts to a name it exports, since a page's bundle reads this file and nothing else of the package's root; and
 * reads the modules it and the page-only entries reach for the classic API they must not load. A page's bundle compiles
 * contracts' sources a module at a time (decision 0074), so it takes the modules it imports and no others: this holds
 * the package's word that none of them but zod's setting runs anything as it loads.
 *
 * A page's module is one under the browser layers (legacy-bridge, client, yes, auth, surfaces, lib), a "use client"
 * file under app/, or instrumentation-client.ts. A miss here is a page that would not build: the bundler finds no such
 * export in the browser's entry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { generate, OUT, PAGE_ENTRIES, PAGE_ONLY } from "../../gen/contracts-browser-entry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const DASH = path.join(ROOT, "apps/dashboard");
const current = generate(ROOT);

test("the browser's entry is current", () => {
  assert.equal(
    fs.readFileSync(path.join(ROOT, OUT), "utf8").replace(/\r\n/g, "\n"),
    current.text,
    "run node tooling/scripts/gen/contracts-browser-entry.mjs",
  );
});

/** Every file a page's bundle may hold. */
function pageModules() {
  const out = [path.join(DASH, "instrumentation-client.ts")];
  const walk = (d, take) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, take);
      else if (/\.(ts|tsx|jsx)$/.test(e.name) && !/\.(type-test|d)\.ts$/.test(e.name) && take(p)) out.push(p);
    }
  };
  for (const layer of ["legacy-bridge", "client", "yes", "auth", "surfaces", "lib"])
    walk(path.join(DASH, "src", layer), () => true);
  walk(path.join(DASH, "app"), (p) => /^\s*["']use client["']/.test(fs.readFileSync(p, "utf8")));
  return out;
}

/** The values a module imports from the package's root, by the name the package exports them under. */
function contractsValues(file) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const names = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || st.moduleSpecifier.text !== "@chanlytics/contracts") continue;
    const c = st.importClause;
    if (!c || c.isTypeOnly) continue;
    assert.ok(!c.name, `${file}: contracts has no default export`);
    const b = c.namedBindings;
    assert.ok(!b || !ts.isNamespaceImport(b), `${file}: a namespace import of contracts reads names this cannot see`);
    for (const el of b?.elements ?? []) if (!el.isTypeOnly) names.push((el.propertyName ?? el.name).text);
  }
  return names;
}

test("every value a page imports from contracts is the browser entry's", () => {
  const exported = new Set(current.names);
  const missing = [];
  let read = 0;
  for (const file of pageModules()) {
    for (const name of contractsValues(file)) {
      read++;
      if (!exported.has(name)) missing.push(`${path.relative(ROOT, file).split(path.sep).join("/")}: ${name}`);
    }
  }
  assert.ok(read > 500, `the pages import ${read} values from contracts: the scan found too few to be the pages`);
  assert.deepEqual(
    missing,
    [],
    "a classic schema a page needs comes by import() from @chanlytics/contracts/write-rules",
  );
});

test("a page's bundle is pointed at the entry, the edge runtime's and the server's at the index", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/contracts/package.json"), "utf8"));
  const root = pkg.exports["."];
  // Next's edge runtime matches `browser` too, and the entry lacks the server's names (instrumentation.ts reaches them
  // through the log), so `edge-light` is read first.
  assert.deepEqual(Object.keys(root), ["types", "bundled", "edge-light", "browser", "import", "default"]);
  // A package's exports are written with "/" on every machine, so the path is the POSIX one (Windows' relative says "\").
  assert.equal(root.browser, `./${path.posix.relative("packages/contracts", OUT)}`);
  assert.equal(root["edge-light"], "./src/index.ts");
  assert.equal(root.import, "./src/index.ts");
});

/** Each module the entry and the page entries reach, by its path under contracts' src, and its source. */
const reached = () =>
  new Map(
    current.modules.map((rel) => [
      rel,
      fs.readFileSync(path.join(ROOT, "packages/contracts/src", rel), "utf8").replace(/\r\n/g, "\n"),
    ]),
  );
/** What a module loads as it runs: each import and re-export that is not a type's alone, by its specifier. */
const runtimeImportsOf = (rel, code) =>
  ts
    .createSourceFile(rel, code, ts.ScriptTarget.Latest, true)
    .statements.filter((st) => {
      if (ts.isExportDeclaration(st)) return st.moduleSpecifier && !st.isTypeOnly;
      if (!ts.isImportDeclaration(st)) return false;
      const c = st.importClause;
      if (!c) return true;
      if (c.isTypeOnly) return false;
      const b = c.namedBindings;
      return Boolean(c.name) || !b || ts.isNamespaceImport(b) || b.elements.some((e) => !e.isTypeOnly);
    })
    .map((st) => st.moduleSpecifier.text);

test("what a page's bundle may take loads zod's core and mini alone, and nothing of classic zod", () => {
  const modules = reached();
  assert.ok(modules.size > 400, `the entry reaches ${modules.size} modules: too few to be the pages' contracts`);
  const bare = new Set();
  for (const [rel, code] of modules)
    for (const spec of runtimeImportsOf(rel, code)) if (!spec.startsWith(".")) bare.add(spec);
  assert.deepEqual([...bare].sort(), ["zod/mini", "zod/v4/core"], "a page's bundle loads zod's core and mini alone");
});

test("the package says no module a page may take runs anything as it loads but zod's setting", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/contracts/package.json"), "utf8"));
  assert.deepEqual(pkg.sideEffects, ["./src/zod-config.ts"]);
  // What the package's word rests on: a statement at a module's top level that declares nothing runs as it loads.
  const declares = (st) =>
    ts.isImportDeclaration(st) ||
    ts.isExportDeclaration(st) ||
    ts.isFunctionDeclaration(st) ||
    ts.isClassDeclaration(st) ||
    ts.isVariableStatement(st) ||
    ts.isTypeAliasDeclaration(st) ||
    ts.isInterfaceDeclaration(st);
  const runs = [];
  for (const [rel, code] of reached()) {
    const sf = ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true);
    if (sf.statements.some((st) => !declares(st))) runs.push(rel);
  }
  assert.deepEqual(runs, ["zod-config.ts"]);
  // A module that builds a schema runs zod's setting first itself: a page's bundle may take it without the entry.
  for (const [rel, code] of reached()) {
    if (!/from "zod\/mini"/.test(code)) continue;
    const first = code.split("\n").find((l) => /^import\b/.test(l)) ?? "";
    assert.match(first, /^import "(\.\.?\/)+zod-config";$/, `${rel}: zod's setting, first`);
  }
});

test("a page entry names its module's source, which the rest of the page shares", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/contracts/package.json"), "utf8"));
  for (const [name, rel] of Object.entries(PAGE_ENTRIES)) {
    const target = pkg.exports[`./${name}`];
    assert.equal(target.browser ?? target.import, `./src/${rel}`, name);
    assert.ok(current.modules.includes(rel), `${name}: its module is one a page may take`);
  }
  // Ask's cards and Settings' Notifications are entries of their own: a page loads them by their subpath, and the
  // server and the suite read them the same way.
  assert.equal(pkg.exports["./ask-only"].import, "./src/ask-proposals/ask-only.ts");
  assert.equal(pkg.exports["./alert-pane"].import, "./src/alert-pane.ts");
});

test("a page-only module's names are in no page's entry, and in its own", () => {
  assert.deepEqual(PAGE_ONLY, [
    "reports/report-metrics.ts",
    "reports/report-window.ts",
    "reports/report-mix.ts",
    "reports/receptionist/receptionist-report.ts",
    "reports/receptionist/receptionist-words.ts",
    "reports/people/people-report.ts",
    "reports/people/people-words.ts",
    "reports/campaigns/reach-out-lens.ts",
    "reports/campaigns/campaign-words.ts",
    "reports/campaigns/campaign-lens.ts",
    "ads/rules.ts",
    "ads/money.ts",
    "ads/words.ts",
    "ads/words-page.ts",
    "ads/words-drawer.ts",
    "ads/words-new.ts",
    "ads/results/words-results.ts",
    "ads/results/results.ts",
    "ads/words-connect.ts",
    "ads/vm-base.ts",
    "ads/page.ts",
    "ads/page-parts.ts",
    "ads/drawer.ts",
    "ads/drawer-parts.ts",
    "ads/drawer-edit.ts",
    "ads/new-ad.ts",
    "ads/new-ad-parts.ts",
    "ask-proposals/proposals.ts",
  ]);
  for (const name of [
    "metricWordsOf",
    "reportWindowOf",
    "reportPickWords",
    "reportShortcuts",
    "toReceptionistReportVM",
    "toPeopleReportVM",
    "PEOPLE_RHYTHM_UNIT",
    "toReachOutLensVM",
    "toCampaignLensVM",
  ])
    assert.ok(!current.names.includes(name), `${name} is the Reports page's, by its own entry`);
  // Campaigns › Ads: its models, rules, money and words are its page's, by its own entry; the data, the addresses and the
  // day arithmetic are the root's, since Reports, People and Campaigns' routes read them too.
  for (const name of ["adsModel", "adModel", "newAdModel", "moneyOf", "BUDGET_RULES", "DOOR_NEEDS", "DRAWER", "NEW_AD"])
    assert.ok(!current.names.includes(name), `${name} is the Ads page's, by its own entry`);
  for (const name of ["addDays", "daysBetween", "parseAds", "adRoute", "ADS_WORDS"])
    assert.ok(current.names.includes(name), `${name} stays in the root entry for the frame's routes`);
  // Ask's cards: the whole table is the server's; a page carries the verbs it presses and their readings, and the cards
  // only Ask proposes come by their own entry, which Ask's bridge loads. Which kinds send (ASK_SENDS) is a reading a plan's
  // count makes beside its words (plan-steps.ts planCountWords, 15 Oct 2026), so it rides with them.
  for (const name of ["PROPOSAL_SPECS", "proposalBelowNeeds"])
    assert.ok(!current.names.includes(name), `${name} is the server's`);
  for (const name of [
    "proposalSpec",
    "verbSpec",
    "PROPOSAL_GATE",
    "askUndoOpen",
    "cardOpenRoute",
    "addProposalSpecs",
    "ASK_SENDS",
  ])
    assert.ok(current.names.includes(name), `${name} stays in the root entry for the pages' verbs`);
  const askOnly = fs.readFileSync(path.join(ROOT, "packages/contracts/dist/ask-only.js"), "utf8");
  assert.match(askOnly, /ASK_ONLY_SPECS/);
  assert.doesNotMatch(
    current.text,
    /leadsBulkSpec|reviewReplySpec|followUpSpec/,
    "Ask's own cards are in no page's entry",
  );
  const ads = fs.readFileSync(path.join(ROOT, "packages/contracts/dist/ads-page.js"), "utf8");
  assert.match(ads, /adsModel/);
  assert.match(ads, /newAdModel/);
  assert.match(ads, /moneyOf/);
  const lens = fs.readFileSync(path.join(ROOT, "packages/contracts/dist/report-lens.js"), "utf8");
  assert.match(lens, /metricWordsOf/);
  assert.match(lens, /toReceptionistReportVM/);
  assert.match(lens, /toPeopleReportVM/);
  assert.match(lens, /PEOPLE_RHYTHM_UNIT/);
  assert.match(lens, /toReachOutLensVM/);
  assert.match(lens, /toCampaignLensVM/);
  // The Receptionist lens's record is the server's: the root barrel names it, so the browser's entry carries it, and a page
  // imports only its types. The People lens's record and the book's count are the server's the same way.
  for (const name of [
    "receptionistDtoOf",
    "isReceptionistSeriesDto",
    "MISSED_CALL_TOUCH_WORDS",
    "peopleDtoOf",
    "isPeopleSeriesDto",
    "peopleNowOf",
  ])
    assert.ok(current.names.includes(name), `${name} stays in the root barrel for the server`);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/contracts/package.json"), "utf8"));
  const own = (from, out) => ({ types: from, bundled: `./dist/${out}.js`, import: from, default: from });
  assert.deepEqual(pkg.exports["./report-lens"], own("./src/reports/report-lens.ts", "report-lens"));
  assert.deepEqual(pkg.exports["./ads-page"], own("./src/ads/ads-page.ts", "ads-page"));
  assert.deepEqual(pkg.exports["./ask-only"], own("./src/ask-proposals/ask-only.ts", "ask-only"));
  // The pages' verb specs: the root entry's own module in the browser, the index itself elsewhere, so the table Ask's
  // kinds join is one table however it was reached.
  assert.deepEqual(pkg.exports["./page-specs"], {
    types: "./src/index.ts",
    bundled: "./dist/index.js",
    "edge-light": "./src/index.ts",
    browser: "./src/ask-proposals/page-specs.ts",
    import: "./src/index.ts",
    default: "./src/index.ts",
  });
  assert.ok(current.names.includes("verbSpec"), "the root entry names the specs' readings too");
});

test("every page-only path names a file, since one that names none would filter nothing, silently", () => {
  for (const p of PAGE_ONLY) assert.ok(fs.existsSync(path.join(ROOT, "packages/contracts/src", p)), p);
  assert.throws(
    () => generate(ROOT, [...PAGE_ONLY, "reports/receptionist/receptionist-gone.ts"]),
    /PAGE_ONLY names "reports\/receptionist\/receptionist-gone\.ts", which is no file under packages\/contracts\/src/,
  );
  // A folder is no module, and a path in the wrong case matches no module's path (existsSync says yes to both on Windows).
  for (const bad of [
    "reports/receptionist",
    "reports/Report-Metrics.ts",
    "reports/receptionist/RECEPTIONIST-words.ts",
    "Reports/report-window.ts",
    "reports/report-metrics.ts/words",
  ])
    assert.throws(
      () => generate(ROOT, [bad]),
      (e) => e.message.includes(`PAGE_ONLY names "${bad}"`),
      bad,
    );
  // The list the generator is given decides what the entry leaves out: with none, the page-only names come back.
  const all = generate(ROOT, []);
  for (const name of [
    "metricWordsOf",
    "toReceptionistReportVM",
    "toPeopleReportVM",
    "toReachOutLensVM",
    "toCampaignLensVM",
    "reportWindowOf",
    "adsModel",
    "newAdModel",
  ])
    assert.ok(all.names.includes(name), `${name} is in the entry when nothing is page-only`);
});

test("a page reads the verbs it presses at once, and the kinds only Ask's cards commit once their entry is loaded", async () => {
  // The modules a page's bundle and Ask's bridge load (legacy-bridge/verbs moreSpecs), run as the browser runs them.
  const src = (f) => import(pathToFileURL(path.join(ROOT, "packages/contracts/src", f)).href);
  const page = await src("browser.generated.ts");
  assert.ok(page.proposalSpec("answer") && page.proposalSpec("sequence_step"), "a page's verbs are in from the start");
  // Today's Need you sends a reply and snoozes a thread from its rows, so those are a page's too (decision 0071).
  assert.ok(page.proposalSpec("reply") && page.proposalSpec("thread_verb") && page.proposalSpec("person_message"));
  assert.equal(page.proposalSpec("whisper"), null);
  assert.equal(page.PROPOSAL_GATE.lead_mark, undefined);
  assert.equal(page.cardOpenRoute({ kind: "lead_stage", payload: { lead_id: "l1" } }), null);
  const { ASK_ONLY_SPECS } = await src("ask-proposals/ask-only.ts");
  for (const kind of Object.keys(ASK_ONLY_SPECS)) assert.equal(page.proposalSpec(kind), null, `${kind} is Ask's alone`);
  page.addProposalSpecs(ASK_ONLY_SPECS);
  assert.ok(page.proposalSpec("whisper") && page.verbSpec("follow_up"));
  // Each reading takes them in: the gate (the same object window.PROPOSAL_GATE holds), the Open, and the undo's window.
  assert.equal(page.PROPOSAL_GATE.lead_mark, "find");
  assert.equal(page.cardOpenRoute({ kind: "thread_verb", payload: { conversation_id: "c1" } }), "inbox/th-c1");
  assert.equal(page.cardOpenRoute({ kind: "gone_kind", payload: { conversation_id: "c1" } }), "inbox/th-c1");
  const at = Date.parse("2026-10-15T12:00:00Z");
  assert.equal(page.askUndoOpen("reply", { cancelable_until: "2026-10-15T12:00:05Z" }, at, at + 10_000, null), false);
});

test("the page-only entry reaches no classic zod", () => {
  for (const entry of ["report-lens", "ads-page", "ask-only"]) {
    const built = fs.readFileSync(path.join(ROOT, `packages/contracts/dist/${entry}.js`), "utf8");
    const specs = [...built.matchAll(/^import\b[^"']*["']([^"']+)["']/gm)].map((m) => m[1]);
    assert.deepEqual(
      specs.filter((s) => ["zod", "zod/v4", "zod/v4/classic"].includes(s)),
      [],
      entry,
    );
  }
});
