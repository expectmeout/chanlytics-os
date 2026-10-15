/**
 * The browser's entry into contracts (decision 0024; gen/contracts-browser-entry.mjs): generated from the barrels and
 * committed, so this regenerates it in memory and refuses a stale copy; holds every value a page's module imports from
 * contracts to a name it exports, since a page's bundle reads this file and nothing else of the package; and reads the
 * built entry for the classic API it must not load.
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
import { generate, OUT, PAGE_ONLY } from "../../gen/contracts-browser-entry.mjs";

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

test("a page's bundle is pointed at the entry, and the server's at the index", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/contracts/package.json"), "utf8"));
  const root = pkg.exports["."];
  assert.deepEqual(Object.keys(root), ["types", "browser", "import", "default"], "the browser condition before import");
  assert.equal(root.browser, "./dist/browser.js");
  assert.equal(root.import, "./dist/index.js");
});

test("the built entry loads no classic zod", () => {
  const built = fs.readFileSync(path.join(ROOT, "packages/contracts/dist/browser.js"), "utf8");
  const specs = [...built.matchAll(/^import\b[^"']*["']([^"']+)["']/gm)].map((m) => m[1]);
  assert.ok(specs.length > 0, "the entry imports zod's core and mini");
  assert.deepEqual(
    specs.filter((s) => ["zod", "zod/v4", "zod/v4/classic"].includes(s)),
    [],
    "classic zod in the browser's entry",
  );
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
  // only Ask proposes come by their own entry, which Ask's bridge loads.
  for (const name of ["PROPOSAL_SPECS", "ASK_SENDS", "proposalBelowNeeds"])
    assert.ok(!current.names.includes(name), `${name} is the server's`);
  for (const name of ["proposalSpec", "verbSpec", "PROPOSAL_GATE", "askUndoOpen", "cardOpenRoute", "addProposalSpecs"])
    assert.ok(current.names.includes(name), `${name} stays in the root entry for the pages' verbs`);
  const askOnly = fs.readFileSync(path.join(ROOT, "packages/contracts/dist/ask-only.js"), "utf8");
  assert.match(askOnly, /ASK_ONLY_SPECS/);
  const browser = fs.readFileSync(path.join(ROOT, "packages/contracts/dist/browser.js"), "utf8");
  assert.doesNotMatch(browser, /leadsBulkSpec|reviewReplySpec|followUpSpec/, "Ask's own cards are in no page's entry");
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
  assert.deepEqual(pkg.exports["./report-lens"], {
    types: "./dist/report-lens.d.ts",
    import: "./dist/report-lens.js",
    default: "./dist/report-lens.js",
  });
  assert.deepEqual(pkg.exports["./ads-page"], {
    types: "./dist/ads-page.d.ts",
    import: "./dist/ads-page.js",
    default: "./dist/ads-page.js",
  });
  assert.deepEqual(pkg.exports["./ask-only"], {
    types: "./dist/ask-only.d.ts",
    import: "./dist/ask-only.js",
    default: "./dist/ask-only.js",
  });
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
  // The built files a page's bundle and Ask's bridge load (legacy-bridge/verbs moreSpecs), run as the browser runs them.
  const dist = (f) => import(pathToFileURL(path.join(ROOT, "packages/contracts/dist", f)).href);
  const page = await dist("browser.js");
  assert.ok(page.proposalSpec("answer") && page.proposalSpec("sequence_step"), "a page's verbs are in from the start");
  assert.equal(page.proposalSpec("reply"), null);
  assert.equal(page.PROPOSAL_GATE.lead_mark, undefined);
  assert.equal(page.cardOpenRoute({ kind: "lead_stage", payload: { lead_id: "l1" } }), null);
  const { ASK_ONLY_SPECS } = await dist("ask-only.js");
  for (const kind of Object.keys(ASK_ONLY_SPECS)) assert.equal(page.proposalSpec(kind), null, `${kind} is Ask's alone`);
  page.addProposalSpecs(ASK_ONLY_SPECS);
  assert.ok(page.proposalSpec("reply") && page.verbSpec("follow_up"));
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
