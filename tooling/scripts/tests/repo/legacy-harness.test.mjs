/**
 * The standalone harness loads the same files the app does.
 *
 * `Chanlytics.html` is a second, hand-kept copy of `legacy-bridge/manifest.ts`:
 * both list every file of the classic mockup, in the order the shared global
 * scope requires. Only the manifest had a test. So seventeen surfaces were
 * added to the manifest — each with its own assertion in its own test file —
 * and never to the harness, and the harness rotted where nobody was looking:
 * `app-shell.jsx` names `MessagesPage` with no `window.` guard, `AttnRow` is
 * rendered as `<window.AttnRow>` on People and Setup (the kit's), and Settings · Setup
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
 *
 * The stylesheets are one list too: the app imports them from one entry
 * (legacy-bridge/legacy.css, since Next orders nothing across imports) and the
 * harness links them one by one, the tokens first and the kit's right after
 * them. The kit's lives with the kit, outside this tree (src/surfaces/kit/), at
 * the one path the harness's server maps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import util from "node:util";
import vm from "node:vm";
import { parse } from "acorn";
import { transformSync } from "esbuild";
import { transform } from "lightningcss";
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
import { serveStatic } from "../../serve-legacy.mjs";
import { PEOPLE_GLOBALS } from "../../../../apps/dashboard/src/surfaces/people/people-globals.ts";

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

test("a file every workspace loads names nothing the demo alone defines, but the three forks' seeds and the demo's data, through window", () => {
  // A real workspace never loads the demo's files, so a bare name only they define is a ReferenceError there: the
  // route table named the Agents pages, Content, the Deal board and the seeded Lists bare until the demo left the
  // manifest, and draws them by name through demoPage now. The three real pages that draw their seeded twin where
  // the bridge has not fed them (broadcasts, outbound, live-monitor) read it off window at the draw, and
  // draw nothing where it is absent; a fourth would be a page asking for the demo's data on a real workspace. The Calendar's
  // twin left with the Calendar (decision 0015, step 6): a demo session draws the contracts sample.
  // The demo's data (demo/data/: the Agents roster and store, the seeded Today, calendar, deals, calls and trust
  // table) left every workspace's boot on 29 September; what a real file still reads of it is read off window where
  // the demo draws it, and reads as nothing where it is absent, as the forks do. Never bare.
  const own = new Set(manifest.filter((f) => f !== STUBS).flatMap((f) => [...namesSet(parseTs(`${LEGACY}/${f}`))]));
  const demoOnly = new Set(
    demoManifest.flatMap((f) => [...namesSet(parseTs(`${LEGACY}/${f}`))]).filter((n) => !own.has(n)),
  );
  const FORKS = new Set(["BroadcastsSeed", "OutboundSeed", "LiveMonitorSeed"]);
  const DEMO_DATA = new Set(
    demoManifest.filter((f) => f.startsWith("demo/data/")).flatMap((f) => [...namesSet(parseTs(`${LEGACY}/${f}`))]),
  );
  const reads = [];
  for (const f of manifest.filter((x) => x !== STUBS)) {
    const { bare, onWindow } = namesRead(parseTs(`${LEGACY}/${f}`));
    for (const n of bare) if (demoOnly.has(n)) reads.push(`${f}: ${n}`);
    for (const n of onWindow)
      if (demoOnly.has(n) && !FORKS.has(n) && !DEMO_DATA.has(n)) reads.push(`${f}: window.${n}`);
  }
  assert.deepEqual(reads, []);
  // And none of the demo's data is what the boot gate waits for: LegacyApp's REQUIRED names only a workspace's own.
  const required = [];
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "REQUIRED") {
      const list = ts.isAsExpression(n.initializer) ? n.initializer.expression : n.initializer;
      for (const e of list.elements) required.push(e.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(parseTs("apps/dashboard/src/legacy-bridge/LegacyApp.tsx"));
  assert.ok(required.includes("ChanlyticsApp"), `the boot gate is read: ${required}`);
  assert.deepEqual(
    required.filter((n) => DEMO_DATA.has(n)),
    [],
    "a real workspace would stop at 'didn't finish loading'",
  );
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

test("the mockup takes the kit's components and the Inbox's and People's names from bundles, loaded right after the stand-ins (serve-legacy.mjs builds them)", () => {
  // Plain scripts, outside the .jsx lists above: the bridge never loads them (the app publishes the kit's components from
  // seed-globals, and a workspace draws its own numbers).
  const tags = [...html.matchAll(/<script[^>]*\bsrc="([^"?]+)[^"]*"/g)].map((m) => m[1]);
  assert.equal(
    tags[tags.indexOf(STUBS) + 1],
    "data/kit-globals.js",
    "the pages here read Icon, EmptyState, FailedRead, SegmentBar, StatePill, Confirm, MoreMenu, PolicyChip, TlMedia, FieldError and the record kit by name, which the kit has drawn since decision 0015",
  );
  assert.equal(
    tags[tags.indexOf(STUBS) + 2],
    "data/inbox-globals.js",
    "the sidebar, the bell, Ask and Today read the Inbox's and Conversations' names, which surfaces/inbox/legacy-globals.ts says",
  );
  assert.equal(
    tags[tags.indexOf(STUBS) + 3],
    "data/people-globals.js",
    "the Leads scope reads plSortKeys as it loads, and the Pipeline and the person page draw People's parts by name, TSX since decision 0015",
  );
  assert.equal(
    tags[tags.indexOf(STUBS) + 4],
    "data/leads-globals.js",
    "the Leads pages draw the peek and its acts by name, TSX since decision 0015 (surfaces/leads/globals.ts)",
  );
});

test("the kit's bundle publishes the kit's own components on the page's React, under the names the pages read", async () => {
  const { kitGlobalsBundle } = await import("../../serve-legacy.mjs");
  // The page's React, as the harness loads it: the bundle takes its hooks and its elements from this and brings none.
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (v) => [v, () => {}],
    useReducer: (_reduce, v) => [v, () => {}],
    useRef: (v) => ({ current: v }),
    useLayoutEffect() {},
    useEffect() {},
  };
  const win = { React };
  // In the browser `window` is the global scope, so the bundle's bare `React` is the page's.
  vm.runInNewContext(await kitGlobalsBundle(), { window: win, React, console });
  for (const name of [
    "Icon",
    "EmptyState",
    "FailedRead",
    "SegmentBar",
    "StatePill",
    "Confirm",
    "MoreMenu",
    "PolicyChip",
    "TlMedia",
    "FieldError",
  ])
    assert.equal(typeof win[name], "function", `${name} is published`);
  // The record kit, which the pages read by name: its components and hooks, the fold registry and the rail's two answers.
  for (const name of [
    "RecordRow",
    "RecordField",
    "RecordFold",
    "RecordInline",
    "RecordSheet",
    "useRecordFold",
    "useUnsavedWork",
    "tabDraft",
    "__settingsUnsaved",
    "__settingsSaving",
  ])
    assert.equal(typeof win[name], "function", `${name} is published`);
  assert.equal(typeof win.__recordFolds.request, "function", "the fold registry is published");
  assert.equal(win.__settingsUnsaved(), false, "nothing is open, so the rail has nothing to ask");
  assert.equal(
    win.StatePill({ kind: "thread", value: "escalated" }).props.className,
    "pill pill-warn",
    "the pill is toned by contracts' stateOf, bundled: with no chrome bridge here, the mockup gets it too",
  );
  assert.equal(
    win.Icon({ name: "check", size: 12 }).type,
    "svg",
    "a glyph is an <svg> from the page's own createElement",
  );
  assert.equal(win.Icon({ name: "no-such-glyph" }).children.length, 1, "an unknown name is the circle");
  assert.equal(
    win.SegmentBar({ title: "T", rows: [{ key: "a", value: 0 }], config: {} }),
    null,
    "a bar of nothing is nothing",
  );
  // The house's three (surfaces/kit/house): the pill takes its tone from contracts where the mockup has no bridge, the chip
  // draws nothing where the mockup's charter is absent, and the menu is its trigger until it is pressed.
  assert.equal(win.StatePill({ kind: "call", value: "live" }).props.className, "pill pill-accent");
  assert.equal(win.PolicyChip({ cls: "reply" }), null, "no charter, no chip");
  assert.equal(win.MoreMenu({ items: [] }).props.className, "more-wrap");
});

test("People's bundle publishes People's shared parts on the page's React, under the names the pages read, and leaves a name the page already has", async () => {
  const { peopleGlobalsBundle, peopleGlobalsHarnessBundle } = await import("../../serve-legacy.mjs");
  const { PEOPLE_GLOBALS } = await import("../../../../apps/dashboard/src/surfaces/people/people-globals.ts");
  // The page's React, as the harness loads it: the bundle takes its hooks and its elements from this and brings none. The
  // table's rows are memoised as the module loads, so `memo` is there before anything draws.
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    memo: (component) => component,
    Fragment: "Fragment",
    useState: (v) => [v, () => {}],
    useReducer: (_reduce, v) => [v, () => {}],
    useRef: (v) => ({ current: v }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useLayoutEffect() {},
    useEffect() {},
    useSyncExternalStore: (_subscribe, get) => get(),
  };
  const win = { React, PeopleTable: "the page's own" };
  vm.runInNewContext(await peopleGlobalsBundle(), { window: win, React, console });
  for (const name of Object.keys(PEOPLE_GLOBALS)) {
    if (name === "PeopleTable") assert.equal(win[name], "the page's own", "a name the page has is left alone");
    else assert.ok(name in win, `${name} is published`);
  }
  assert.equal(typeof win.plSortKeys, "function", "the Leads scope reads it as it loads");
  assert.equal(typeof win.PeopleRail, "function");
  // The harness's copy publishes them all, and follows the People the fixture's runner lands on the window.
  const heard = [];
  const harness = {
    React,
    PeopleTable: "the page's own",
    addEventListener: (type) => heard.push(type),
  };
  vm.runInNewContext(await peopleGlobalsHarnessBundle(), { window: harness, React, console });
  assert.equal(typeof harness.PeopleTable, "function", "over the People the fixture boots, the harness's copy wins");
  assert.deepEqual(heard.sort(), ["surface:clients", "surface:people"], "and it holds People when it lands");
});

/** The stylesheets an entry stylesheet imports, in order, as repo paths: its @import rules, read as CSS. */
function cssImports(sheet) {
  const urls = [];
  transform({
    filename: sheet,
    code: fs.readFileSync(path.join(ROOT, sheet)),
    visitor: { Rule: { import: (rule) => void urls.push(rule.value.url) } },
  });
  return urls.map((url) => path.posix.join(path.posix.dirname(sheet), url));
}

/** What the harness's static serving (serve-legacy.mjs) answers for one path the document names. */
const served = (rel) =>
  new Promise((resolve) => {
    const res = {
      writeHead: (status) => {
        res.status = status;
        return res;
      },
      end: (body) => resolve({ status: res.status, body: String(body) }),
    };
    serveStatic(res, path.join(ROOT, LEGACY), rel);
  });

test("the harness links the stylesheets the app imports, in its order, the kit's right after the tokens", async () => {
  // The shell's entry puts the kit right after the tokens (the plan's §3.3). The other entry, app/globals.css, opens
  // with the tokens alone: no page outside the shell draws a kit class, and the change that first draws one imports
  // the kit there.
  const tokens = `${LEGACY}/styles/tokens.css`;
  const kit = "apps/dashboard/src/surfaces/kit/kit.css";
  const app = cssImports("apps/dashboard/src/legacy-bridge/legacy.css");
  assert.deepEqual(app.slice(0, 2), [tokens, kit], "the shell's entry imports the tokens, then the kit");
  assert.deepEqual(cssImports("apps/dashboard/app/globals.css"), [tokens], "the other entry imports the tokens alone");
  // The document links what the app imports, in the same order, each served as the file the app has at that place.
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"?:]+)[^"]*"/g)].map((m) => m[1]);
  assert.equal(links.length, app.length, `a link for each stylesheet the app imports: ${links.join(", ")}`);
  for (const [i, link] of links.entries()) {
    const { status, body } = await served(`/${link}`);
    assert.equal(status, 200, `${link} is served`);
    assert.equal(body, fs.readFileSync(path.join(ROOT, app[i]), "utf8"), `${link} is ${app[i]}, where the app has it`);
  }
  assert.equal((await served("/surfaces/kit/index.ts")).status, 404, "the kit's stylesheet is served, not its folder");
});

test("the harness serves nothing beside its tree, however the path spells the climb", async () => {
  // A path reaches serveStatic decoded (serve-legacy.mjs and the e2e harness decode it first), so an encoded slash or
  // backslash climbs out of the tree: into a folder beside it whose name begins with the tree's, which a comparison of
  // the two paths as strings let through.
  const at = (url) => served(decodeURIComponent(url));
  const beside = fs.readFileSync(path.join(ROOT, "apps/dashboard/src/legacy-bridge/legacy.css"), "utf8");
  const slashed = await at("/..%2flegacy-bridge%2flegacy.css");
  assert.equal(slashed.status, 403, "the climb into legacy-bridge is refused");
  const backslashed = await at("/..%5clegacy-bridge%5clegacy.css");
  if (path.sep === "\\") assert.equal(backslashed.status, 403, "and its backslash form, a climb on Windows");
  else
    assert.equal(
      backslashed.status,
      404,
      "and its backslash form, a name no file has where a backslash is no separator",
    );
  for (const answer of [slashed, backslashed])
    assert.notEqual(answer.body, beside, "the bridge's stylesheet stays put");
  assert.equal((await at("/..%2f..%2f..%2f..%2fpackage.json")).status, 403, "and nothing further up is served");
  assert.equal((await at("/styles/tokens.css")).status, 200, "while the tree's own files are");
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

/** How many object rests (`{ a, ...rest }`, in a parameter or a declaration) a parsed file holds, at any depth. */
const objectRestsIn = (node) => {
  if (!node || typeof node !== "object") return 0;
  if (Array.isArray(node)) return node.reduce((n, k) => n + objectRestsIn(k), 0);
  let n = node.type === "ObjectPattern" && node.properties.some((p) => p.type === "RestElement") ? 1 : 0;
  for (const [k, v] of Object.entries(node)) if (k !== "type" && v && typeof v === "object") n += objectRestsIn(v);
  return n;
};

/**
 * A legacy file as the harness runs it: JSX compiled, top-level const/let/class made var as env makes them; and how
 * many object rests it holds, which env compiles to a top-level `var _excluded` (below).
 */
const asClassicScript = (file) => {
  let code = transformSync(fs.readFileSync(path.join(ROOT, LEGACY, file), "utf8"), {
    loader: "jsx",
    jsx: "transform",
    sourcefile: file,
  }).code;
  const names = [];
  const edits = [];
  const ast = parse(code, { ecmaVersion: "latest", sourceType: "script" });
  const rests = objectRestsIn(ast);
  for (const s of ast.body) {
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
  return { code, names, rests };
};

/** One name, one meaning: the same value, or the same function written twice (a helper copied into two files). */
const sameMeaning = (a, b) =>
  Object.is(a, b) ||
  (typeof a === "function" && typeof b === "function" && String(a) === String(b)) ||
  util.isDeepStrictEqual(a, b);

const sharedScope = (() => {
  const win = vm.createContext({
    // People's shared parts, which the app publishes from seed-globals and the document from data/people-globals.js: the
    // Leads scope reads plSortKeys as it loads.
    ...PEOPLE_GLOBALS,
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
  const withRests = [];
  for (const file of harness) {
    const { code, names, rests } = asClassicScript(file);
    if (rests) withRests.push(`${file} (${rests})`);
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
  return { threw, twoMeanings, withRests };
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

test("at most one file the harness loads takes an object rest: Babel keeps each file's excluded keys in one global", () => {
  // What the shared scope above cannot see, because esbuild keeps an object rest as it is: the harness compiles each
  // file with @babel/standalone's env preset, which hoists an object rest's excluded keys to a top-level
  // `var _excluded` (`_excluded2`, … within the file), named the same in every file. Two files with a rest give that
  // one global two lists, and the file loaded last decides what every other file's rest leaves out: settings.jsx's
  // SetToggle list put LeadPeek's vm, mode and deck into its panes' acts, and put id, label and unit on the record
  // kit's <input> before RecordField gathered its rest by hand (#777). A rest is taken with window.propsWithout
  // (data-bits.jsx); one file may keep one, having nothing to clash with.
  assert.ok(
    sharedScope.withRests.length <= 1,
    `object rests in more than one file (take them with window.propsWithout): ${sharedScope.withRests.join(", ")}`,
  );
});

test("the Inbox's bundle publishes the demo's rows and the shell's rules under the names the pages still read", async () => {
  const { inboxGlobalsBundle } = await import("../../serve-legacy.mjs");
  const events = [];
  const win = {
    addEventListener: (type) => events.push(type),
    dispatchEvent: () => true,
  };
  // In the browser `window` is the global scope, so the bundle's `window.__DEMO_MODE` and its listener are the page's.
  vm.runInNewContext(await inboxGlobalsBundle(), { window: win, console, CustomEvent: class {} });
  const threads = win.INBOX_DATA.THREADS;
  assert.ok(threads.length > 0 && threads.every((t) => t.id.startsWith("th-")), "the demo's threads");
  assert.ok(win.CONVERSATIONS_DATA.CONVERSATIONS.length > 0, "the demo's conversations");
  assert.equal(JSON.stringify(win.IX_STORE.decisions), "{}", "no decision yet");
  win.IX_STORE.set("th-aisha-refund", { action: "Approve", at: "12:04", kind: "decided" });
  assert.equal(win.IX_STORE.get("th-aisha-refund").action, "Approve", "the session's decisions are kept");
  assert.equal(win.ixWaitsOnYou(threads.find((t) => t.state === "needs")), true, "what waits on you, one rule");
  assert.equal(
    JSON.stringify(win.CV_ROUTE("phone:cv-1")),
    JSON.stringify({ channel: "phone", id: "cv-1" }),
    "a tab and a row",
  );
  assert.equal(win.CV_IN_CHANNEL({ channel: "sms" }, "chats"), true, "a row on a grouped tab");
  assert.ok(events.includes("presence:changed"), "the countdowns hear the member go Away");
});
