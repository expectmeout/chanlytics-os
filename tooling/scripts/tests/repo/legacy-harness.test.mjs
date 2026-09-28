/**
 * The standalone harness loads the same files the app does.
 *
 * `Chanlytics.html` is a second, hand-kept copy of `legacy-bridge/manifest.ts`:
 * both list every file of the classic mockup, in the order the shared global
 * scope requires. Only the manifest had a test. So seventeen surfaces were
 * added to the manifest — each with its own assertion in its own test file —
 * and never to the harness, and the harness rotted where nobody was looking:
 * `app-shell.jsx` names `MessagesPage` with no `window.` guard, `AttnRow` is
 * rendered as `<window.AttnRow>` on Today and on People, and Settings · Setup
 * is a pane that renders nothing. A blank page for the one person who opens
 * this file, which is the only reason it exists.
 *
 * The reverse rot is here too, and it happened: a `<script>` tag for
 * `tweaks-panel.jsx` outlived the file, and the harness threw on boot for as
 * long as it took anyone to look.
 *
 * So the two lists are asserted to be ONE list. Order is part of it — data
 * seeds globals that pages read at module scope — which makes "added at the
 * bottom" as loud as "not added at all".
 *
 * The bridge keeps two lists since the demo left the real one: `manifest.ts`,
 * every file a real workspace draws, and `manifest-demo.ts`, the mockup's own
 * (legacy/demo/), which the bridge asks for after the first and only in a
 * session that declared itself a demo. The harness is such a session, so its
 * list is the first and then the second.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import util from "node:util";
import vm from "node:vm";
import { parse } from "acorn";
import { transformSync } from "esbuild";
import {
  identityWords,
  memberWords,
  personInitials,
  DEFAULT_TIMEZONE,
  timezoneCity,
  timezoneWords,
  SOURCE_WORDS,
  samePhone,
  whyNotAPhone,
  whyNotAHandoff,
  handoffE164,
  cleanTimezone,
} from "@chanlytics/contracts";
import ts from "typescript";
import { ROOT, readCode, readRaw } from "../_source.mjs";
import { parse as parseTs } from "../_ast.mjs";

const LEGACY = "apps/dashboard/src/legacy";
const html = readRaw(`${LEGACY}/Chanlytics.html`);

/** The harness's own seed file, standing where the bridge puts seed-globals.ts. */
const STUBS = "data/bridge-stubs.jsx";

/** Where the mockup's files are: the shell's three directories, and the demo's two under legacy/demo/. */
const DIRS = ["components", "data", "pages", "demo/data", "demo/pages"];
const DIR = "(?:components|data|pages|demo\\/data|demo\\/pages)";

/** Every `src="dir/file.jsx?v=N"` the harness loads, in order, without the cache-buster. */
const harness = [...html.matchAll(new RegExp(`<script[^>]*\\bsrc="(${DIR}\\/[^"?]+\\.jsx)[^"]*"`, "g"))].map(
  (m) => m[1],
);

/** The files one of the bridge's lists imports, in order, as the harness names them (seed-globals is the stub file). */
const importsOf = (list) =>
  parseTs(`${LEGACY}-bridge/${list}`)
    .statements.filter(ts.isImportDeclaration)
    .map((s) =>
      s.moduleSpecifier.text === "./seed-globals" ? STUBS : s.moduleSpecifier.text.replace(/^@\/legacy\//, ""),
    );

/** Every legacy file the bridge loads for every workspace, in order. */
const manifest = importsOf("manifest.ts");

/** The mockup's own files, which the bridge loads after those only in a session that declared itself a demo. */
const demoManifest = importsOf("manifest-demo.ts");

/** The shell, which is where a deleted page keeps its last reference. */
const shell = readCode(`${LEGACY}/pages/app-shell.jsx`);

/** Every file of the mockup on disk, in the shape both lists name it. */
const onDisk = DIRS.flatMap((dir) =>
  fs
    .readdirSync(path.join(ROOT, LEGACY, dir))
    .filter((f) => f.endsWith(".jsx"))
    .map((f) => `${dir}/${f}`),
);

test("a file of the mockup that exists is a file the harness loads", () => {
  const missing = onDisk.filter((f) => f !== STUBS && !harness.includes(f));
  assert.deepEqual(missing, [], `Chanlytics.html has no <script> tag for: ${missing.join(", ")}`);
});

test("the harness loads nothing that is no longer on disk", () => {
  const gone = harness.filter((f) => !fs.existsSync(path.join(ROOT, LEGACY, f)));
  assert.deepEqual(gone, [], `Chanlytics.html loads files that do not exist: ${gone.join(", ")}`);
});

test("the harness and the bridge load the same files in the same order: every workspace's, then the demo's", () => {
  // Not a set comparison: `data/` seeds globals that `pages/` read at module
  // scope, and people-data mutates clients-data's CLIENT_SEGMENTS. A file in
  // the list but in the wrong place is the same blank page as a file missing.
  // The harness is a demo session, so it loads what the app loads in one, in
  // the app's order: manifest.ts's files, then manifest-demo.ts's.
  assert.deepEqual(harness, [...manifest, ...demoManifest]);
});

test("a real workspace loads no file of the demo, and the demo's list holds nothing else", () => {
  // A demo file in manifest.ts ships the mockup to every workspace again; a file of the app's in manifest-demo.ts is
  // missing from every workspace but a demo.
  const isDemo = (f) => f.startsWith("demo/");
  assert.deepEqual(manifest.filter(isDemo), [], "manifest.ts, which every workspace loads");
  assert.deepEqual(
    demoManifest.filter((f) => !isDemo(f)),
    [],
    "manifest-demo.ts, which only a demo session loads",
  );
});

test("the bridge asks for the demo's files only in a session that declared itself a demo, after its own, and waits", () => {
  // manifest.ts's last statement before its export is `if (window.__DEMO_MODE) await import("./manifest-demo");`.
  // Unguarded, a real workspace downloads the demo; not awaited, the shell draws a demo route before its page is
  // there; above a static import, the demo runs before a file it reads.
  const sf = parseTs(`${LEGACY}-bridge/manifest.ts`);
  const asked = [];
  const visit = (n) => {
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) asked.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  assert.deepEqual(
    asked.map((c) => c.arguments[0].text),
    ["./manifest-demo"],
    "one dynamic import, of the demo's list",
  );
  const awaited = asked[0].parent;
  const statement = awaited.parent;
  const guard = statement.parent;
  assert.ok(ts.isAwaitExpression(awaited) && ts.isExpressionStatement(statement), "awaited, as a statement");
  assert.ok(ts.isIfStatement(guard) && guard.thenStatement === statement && !guard.elseStatement, "under an if");
  assert.equal(guard.expression.getText(sf), "window.__DEMO_MODE", "the demo switch seed-globals.ts sets");
  const at = sf.statements.indexOf(guard);
  assert.ok(at > 0, "at the top level of the list");
  assert.ok(sf.statements.slice(0, at).every(ts.isImportDeclaration), "after every file the list imports");
  assert.ok(sf.statements.slice(at + 1).every(ts.isExportDeclaration), "and nothing after it but the export");
});

/** Every name a binding pattern declares, in TypeScript's tree. */
const tsBound = (b, out) => {
  if (ts.isIdentifier(b)) out.add(b.text);
  else if (ts.isObjectBindingPattern(b) || ts.isArrayBindingPattern(b))
    for (const e of b.elements) if (!ts.isOmittedExpression(e)) tsBound(e.name, out);
  return out;
};

/** What a file puts on the harness's one scope: its top-level declarations, and what it publishes on window. */
const namesSet = (sf) => {
  const out = new Set();
  for (const s of sf.statements) {
    if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) tsBound(d.name, out);
    if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name) out.add(s.name.text);
  }
  const isWindow = (e) => !!e && ts.isIdentifier(e) && e.text === "window";
  const visit = (n) => {
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(n.left) &&
      isWindow(n.left.expression)
    )
      out.add(n.left.name.text);
    if (ts.isCallExpression(n) && n.expression.getText(sf) === "Object.assign" && isWindow(n.arguments[0]))
      for (const a of n.arguments.slice(1))
        if (ts.isObjectLiteralExpression(a)) for (const p of a.properties) if (p.name) out.add(p.name.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

/**
 * The names a file reads without declaring them anywhere in itself: a bare identifier in an expression (a JSX tag
 * included), and `window.<name>`. Declared anywhere in the file counts as declared: coarser than scope, never louder.
 */
const namesRead = (sf) => {
  const declared = new Set();
  const bare = new Set();
  const onWindow = new Set();
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) || ts.isParameter(n)) tsBound(n.name, declared);
    if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isClassDeclaration(n)) && n.name)
      declared.add(n.name.text);
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "window")
      onWindow.add(n.name.text);
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const aName =
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)) && p.name === n) ||
        (ts.isBindingElement(p) && p.propertyName === n) ||
        ts.isJsxAttribute(p) ||
        ts.isLabeledStatement(p) ||
        ts.isBreakOrContinueStatement(p);
      if (!aName) bare.add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { bare: [...bare].filter((n) => !declared.has(n)), onWindow: [...onWindow] };
};

test("a file every workspace loads names nothing the demo alone defines, but the four forks' seeds, through window", () => {
  // A real workspace never loads the demo's files, so a bare name only they define is a ReferenceError there: the
  // route table named the Agents pages, Content, the Deal board and the seeded Lists bare until the demo left the
  // manifest, and draws them by name through demoPage now. The four real pages that draw their seeded twin where
  // the bridge has not fed them (calendar, broadcasts, outbound, live-monitor) read it off window at the draw, and
  // draw nothing where it is absent; a fifth would be a page asking for the demo's data on a real workspace.
  const own = new Set(manifest.filter((f) => f !== STUBS).flatMap((f) => [...namesSet(parseTs(`${LEGACY}/${f}`))]));
  const demoOnly = new Set(
    demoManifest.flatMap((f) => [...namesSet(parseTs(`${LEGACY}/${f}`))]).filter((n) => !own.has(n)),
  );
  const FORKS = new Set(["CalendarSeed", "BroadcastsSeed", "OutboundSeed", "LiveMonitorSeed"]);
  const reads = [];
  for (const f of manifest.filter((x) => x !== STUBS)) {
    const { bare, onWindow } = namesRead(parseTs(`${LEGACY}/${f}`));
    for (const n of bare) if (demoOnly.has(n)) reads.push(`${f}: ${n}`);
    for (const n of onWindow) if (demoOnly.has(n) && !FORKS.has(n)) reads.push(`${f}: window.${n}`);
  }
  assert.deepEqual(reads, []);
});

test("every page the route table draws through demoPage is one a file of the demo publishes", () => {
  // demoPage draws nothing for a name that is not there: right on a real workspace, and a blank route in the demo for
  // a name spelled wrong.
  const published = new Set(demoManifest.flatMap((f) => [...namesSet(parseTs(`${LEGACY}/${f}`))]));
  const drawn = [];
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "demoPage")
      drawn.push(n.arguments[0].text);
    ts.forEachChild(n, visit);
  };
  visit(parseTs(`${LEGACY}/pages/app-routes.jsx`));
  assert.ok(drawn.length > 0, "the route table draws the demo's pages through demoPage");
  assert.deepEqual(
    drawn.filter((n) => !published.has(n)),
    [],
  );
});

test("every script the harness loads is cache-busted", () => {
  // Nothing here is fingerprinted and the mockup is served off a plain static
  // server, so an edited file without a bumped ?v= is an edit the reviewer
  // does not see. (The document itself is the one exception: a browser holding
  // a stale Chanlytics.html is a hard reload, not a version.)
  const bare = [...html.matchAll(new RegExp(`<script[^>]*\\bsrc="(${DIR}\\/[^"]+)"`, "g"))]
    .map((m) => m[1])
    .filter((s) => !s.includes("?v="));
  assert.deepEqual(bare, [], `no ?v= on: ${bare.join(", ")}`);
});

/** The stub file is plain JS in an IIFE, so it runs against any object. */
const seed = (win) => {
  new Function("window", readRaw(`${LEGACY}/${STUBS}`))(win);
  return win;
};

/** What the bridge publishes and the classic pages read without asking first. */
const BRIDGED = [
  "__DEMO_MODE",
  "__identity",
  "__tz",
  "DEFAULT_TIMEZONE",
  "__FACT_WORDS",
  "__samePhone",
  "__whyNotAPhone",
  "__whyNotAHandoff",
  "__handoffE164",
  "__workspace",
];

test("the harness seeds the bridge's globals before anything reads them", () => {
  // data/inbox-data.jsx and data/people-data.jsx read __DEMO_MODE at module
  // scope; components/sidebar.jsx and pages/settings.jsx call __identity
  // unguarded. First, or it may as well not be there.
  assert.equal(harness[0], STUBS, "bridge-stubs.jsx is the first script the harness loads");

  const win = seed({});
  for (const g of BRIDGED) assert.notEqual(win[g], undefined, `bridge-stubs.jsx publishes ${g}`);
});

test("the stubs stand IN for the bridge, never over it", () => {
  // This file lives in the tree the Next bundle imports. A stub that
  // overwrote a real implementation would be a mockup's arithmetic deciding
  // what a real workspace sees, so every write is conditional — including the
  // demo switch, which the bridge deliberately sets to FALSE.
  const bridge = { note: "the real one" };
  const win = seed(Object.fromEntries([["__DEMO_MODE", false], ...BRIDGED.slice(1).map((g) => [g, bridge])]));
  assert.equal(win.__DEMO_MODE, false, "an explicit false is not a missing value");
  for (const g of BRIDGED.slice(1)) assert.equal(win[g], bridge, `${g} kept the bridge's`);
});

test("the stubs answer the way contracts answers", () => {
  // Ported, not invented: these answers are read ON SCREEN — initials in an
  // avatar, a timezone's local time, why a typed number is not one anyone can
  // be reached on. A stub that drifts sends a design review to the wrong
  // conclusion about the real interface.
  const win = seed({});
  const me = { email: "sales@chanlytics.com", display_name: "Sarah Chen", role: "owner" };
  assert.deepEqual(win.__identity.words(me), identityWords(me));
  assert.deepEqual(win.__identity.words(null), identityWords(null));
  assert.deepEqual(
    win.__identity.member({ email: "hi@chanlytics.agency" }),
    memberWords({ email: "hi@chanlytics.agency" }),
  );
  assert.equal(win.__identity.initials(null, "hi@chanlytics.agency"), personInitials(null, "hi@chanlytics.agency"));

  assert.equal(win.DEFAULT_TIMEZONE, DEFAULT_TIMEZONE);
  assert.equal(win.__tz.city("America/New_York"), timezoneCity("America/New_York"));
  const at = Date.UTC(2026, 3, 26, 16, 4);
  assert.deepEqual(win.__tz.words("America/New_York", at), timezoneWords("America/New_York", at));

  assert.deepEqual(win.__FACT_WORDS, SOURCE_WORDS);
  assert.equal(win.__samePhone("(212) 555-0142", "+12125550142"), samePhone("(212) 555-0142", "+12125550142"));
  for (const n of ["", "12345", "5550142", "212 555 0142", "nonsense"]) {
    assert.equal(win.__whyNotAPhone(n), whyNotAPhone(n), `whyNotAPhone(${JSON.stringify(n)})`);
  }
  for (const n of ["", "2125550142", "+12125550142"]) {
    assert.equal(
      win.__whyNotAHandoff(n, "+12125550142"),
      whyNotAHandoff(n, "+12125550142"),
      `whyNotAHandoff(${JSON.stringify(n)})`,
    );
    assert.equal(win.__handoffE164(n), handoffE164(n), `handoffE164(${JSON.stringify(n)})`);
  }
  // The number the business keeps and forwards to the line (F2), made up in 555-01xx: refused in contracts' words.
  for (const n of ["+12125550142", "+1 (212) 555-0142", "+19175550100", "+13055550123"]) {
    assert.equal(
      win.__whyNotAHandoff(n, "+13055550123", "+12125550142"),
      whyNotAHandoff(n, "+13055550123", "+12125550142"),
      `whyNotAHandoff(${JSON.stringify(n)}, line, kept)`,
    );
  }
});

test("the workspace's own write refuses a zone as the route does, and keeps the one it takes where the bridge keeps it", async () => {
  // The Business tab's Timezone row offers no act without a door to save through, so the mockup had a row that said
  // its zone and could not be changed. Nothing stands behind the harness to PATCH: the zone is checked by the route's
  // own rule (contracts cleanTimezone) and kept in the page's list of workspaces, as identity.ts keeps it once the
  // server answers, and the change is told as that file tells it.
  const heard = [];
  const win = seed({
    __WORKSPACES: [
      { id: "t-a", timezone: "America/New_York" },
      { id: "t-b", timezone: "Europe/London" },
    ],
    __ACTIVE_WORKSPACE: "t-a",
    dispatchEvent: (e) => heard.push(e.type),
  });
  for (const raw of ["", "   ", "Mars/Olympus_Mons"]) {
    const refused = cleanTimezone(raw);
    assert.deepEqual(
      await win.__workspace.setTimezone(raw),
      { ok: false, tz: "", message: refused.reason },
      JSON.stringify(raw),
    );
  }
  assert.deepEqual(heard, [], "a refused zone changes nothing, so nothing is told");
  assert.deepEqual(await win.__workspace.setTimezone(" America/Chicago "), {
    ok: true,
    tz: "America/Chicago",
    message: "",
  });
  assert.deepEqual(
    win.__WORKSPACES,
    [
      { id: "t-a", timezone: "America/Chicago" },
      { id: "t-b", timezone: "Europe/London" },
    ],
    "the active workspace's, and no other's",
  );
  assert.deepEqual(heard, ["workspace:changed"]);
});

test("the harness is a demo, and the app is not", () => {
  // Around fifty gates ask window.__DEMO_MODE whether they are looking at
  // theater or at a real workspace: Today's whole rail, the sidebar's persona
  // and agent list, the Leads and Live tabs, the scripted lead arrival. Unset,
  // the standalone mockup renders the production half of every one of them —
  // a UI review of a mockup with most of the mockup missing.
  assert.equal(seed({}).__DEMO_MODE, true);
  assert.match(readCode(`${LEGACY}-bridge/seed-globals.ts`), /window\.__DEMO_MODE = false/);
});

test("the seeded leads page is retired: no file, no script tag, no import, and nothing renders it", () => {
  // The mockup's Leads was a page of its own, fed by invented leads with
  // invented first-touch times. Leads is a SCOPE of People now (clients/leads),
  // drawn from the leads surface, so the seeded page is not hidden or gated --
  // it is gone, and the two lists and the shell have to say so together. A file
  // deleted from disk and left in either list is the blank page this file exists
  // to catch; a shell still naming LeadsPage is a ReferenceError on that route.
  assert.equal(fs.existsSync(path.join(ROOT, LEGACY, "pages/leads.jsx")), false);
  assert.equal(manifest.includes("pages/leads.jsx"), false);
  assert.equal(html.includes("pages/leads.jsx"), false);
  assert.equal(new RegExp(String.raw`\bLeadsPage\b`).test(shell), false, "app-shell draws no LeadsPage");
});

test("the mockup draws Reports and Today from their samples, loaded right after the stand-ins (serve-legacy.mjs builds them)", () => {
  // Plain scripts, outside the .jsx lists above: the bridge never loads them, because a workspace draws its own numbers.
  const tags = [...html.matchAll(/<script[^>]*\bsrc="([^"?]+)[^"]*"/g)].map((m) => m[1]);
  assert.equal(
    tags[tags.indexOf(STUBS) + 1],
    "data/reports-sample.js",
    "the demo's Reports reads window.__reportsSample",
  );
  assert.equal(
    tags[tags.indexOf(STUBS) + 2],
    "data/today-sample.js",
    "the demo's Today reads what installTodaySample published",
  );
});

/**
 * The harness's one shared scope, run on node: every file it loads, in its order, as the browser runs it.
 *
 * Each `<script type="text/babel">` is compiled by @babel/standalone with its default presets (react + env), and env
 * turns a top-level `const`, `let` or `class` into a `var`. A classic script's top-level `var` is a property of
 * `window`, so every file's top-level names are ONE namespace, and the file loaded last decides what a name means.
 * The bridge never sees this (manifest.ts imports each file as a module), so only the harness breaks, and only when
 * someone opens it.
 *
 * Here: JSX compiled by esbuild, env's rewrite done at the top level only (acorn finds the declarations), and every
 * file run in one vm context whose global is `window`. React is a stand-in that answers anything, since nothing is
 * drawn; each file's top level runs, which is all that decides a global.
 */
const anything = () => {
  const kids = new Map();
  const fn = function () {
    return me;
  };
  const me = new Proxy(fn, {
    get: (_, k) => {
      if (k === Symbol.toPrimitive) return () => "";
      if (!kids.has(k)) kids.set(k, anything());
      return kids.get(k);
    },
    apply: () => me,
    construct: () => me,
  });
  return me;
};

/** Every name a binding pattern declares: `const { useState: useXState } = React` declares useXState. */
const boundNames = (p, out = []) => {
  if (!p) return out;
  if (p.type === "Identifier") out.push(p.name);
  else if (p.type === "ObjectPattern")
    for (const q of p.properties) boundNames(q.type === "RestElement" ? q : q.value, out);
  else if (p.type === "ArrayPattern") for (const q of p.elements) boundNames(q, out);
  else if (p.type === "RestElement") boundNames(p.argument, out);
  else if (p.type === "AssignmentPattern") boundNames(p.left, out);
  return out;
};

/** A legacy file as the harness runs it: JSX compiled, top-level const/let/class made var as env makes them. */
const asClassicScript = (file) => {
  let code = transformSync(fs.readFileSync(path.join(ROOT, LEGACY, file), "utf8"), {
    loader: "jsx",
    jsx: "transform",
    sourcefile: file,
  }).code;
  const names = [];
  const edits = [];
  for (const s of parse(code, { ecmaVersion: "latest", sourceType: "script" }).body) {
    if (s.type === "VariableDeclaration") {
      for (const d of s.declarations) boundNames(d.id, names);
      if (s.kind !== "var") edits.push([s.start, s.start + s.kind.length, "var"]);
    } else if (s.type === "FunctionDeclaration") names.push(s.id.name);
    else if (s.type === "ClassDeclaration") {
      names.push(s.id.name);
      edits.push([s.end, s.end, ";"], [s.start, s.start, `var ${s.id.name} = `]);
    }
  }
  for (const [from, to, text] of edits.sort((a, b) => b[0] - a[0])) code = code.slice(0, from) + text + code.slice(to);
  return { code, names };
};

/** One name, one meaning: the same value, or the same function written twice (a helper copied into two files). */
const sameMeaning = (a, b) =>
  Object.is(a, b) ||
  (typeof a === "function" && typeof b === "function" && String(a) === String(b)) ||
  util.isDeepStrictEqual(a, b);

const sharedScope = (() => {
  const win = vm.createContext({
    React: anything(),
    ReactDOM: anything(),
    document: anything(),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    console,
  });
  vm.runInContext("globalThis.window = globalThis;", win);
  const threw = [];
  const declared = new Map();
  const twoMeanings = [];
  for (const file of harness) {
    const { code, names } = asClassicScript(file);
    try {
      new vm.Script(code, { filename: file }).runInContext(win);
    } catch (e) {
      threw.push(`${file}: ${e.message}`);
    }
    for (const name of names) {
      const before = declared.get(name);
      if (before && !sameMeaning(before.value, win[name])) twoMeanings.push(`${name}: ${before.file} and ${file}`);
      declared.set(name, { file, value: win[name] });
    }
  }
  return { threw, twoMeanings };
})();

test("every file the harness loads runs in its shared scope", () => {
  // A file that throws at its top level leaves every name after the throw undefined, so the check below would pass
  // over a file it never finished reading.
  assert.deepEqual(sharedScope.threw, []);
});

test("no two files the harness loads give one top-level name two meanings", () => {
  // pages/pipeline.jsx, the retired seeded demo, loads after pages/pipeline-board.jsx. Both declared a top-level
  // PipelineBoard, so the demo's replaced the real one on window, and the Pipeline's Board threw "Cannot read
  // properties of undefined (reading 'map')" drawing the demo's board with the real board's props. The same happened
  // to the seed palette's AskAnswer (dashboard-a-ask.jsx), replaced by ask-turn.jsx's. A name a later file sets on
  // purpose with `window.X = ...` (the *-real.jsx pages) is an assignment, not a declaration, and is not held here.
  assert.deepEqual(sharedScope.twoMeanings, []);
});
