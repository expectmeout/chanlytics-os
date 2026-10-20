/**
 * The static server the standalone mockup is opened on, and the one place its document is written.
 *
 * `python -m http.server` sends Last-Modified and NOTHING else, so a browser
 * applies heuristic freshness and serves `Chanlytics.html` from disk cache
 * without asking — for as long as a tenth of the document's age, which for a
 * file edited a few times a month is days. A stale one keeps a `<script>` tag
 * for a file that was deleted (`tweaks-panel.jsx`) and boots into a blank page
 * with a ReferenceError. That is not a bug anyone can find by reading the repo,
 * because the repo is right.
 *
 * So: no-store, everything, always. This serves a design review, not traffic, and no file it serves carries a
 * version: a `?v=N` on each script and stylesheet, bumped by hand on every edit, was 401 of the document's 414 commits
 * in the month to 17 October 2026, and every lane that touched the shell met in that one file.
 *
 * The document is `Chanlytics.html` with the app's own lists written into it (legacyDocument below): the stylesheets
 * legacy-bridge/legacy.css imports and the files legacy-bridge/manifest.ts loads, in its order. A
 * file is added to the app's list, and the mockup loads it from there.
 *
 * Seven files are built rather than read: `data/kit-globals.js`, the kit's components the pages here still draw by name,
 * `data/frame-globals.js`, the frame's helpers the pages here read by name (the toast, a thumb's gestures, the role gate:
 * surfaces/frame/frame-globals.ts), `data/frame-app.js`, the frame itself (surfaces/frame/app-shell.tsx), under the name
 * the document's own boot draws it by,
 * `data/inbox-globals.js`, the Inbox's and Conversations' seeded rows and rules under the names the pages here still read,
 * `data/people-globals.js`, People's parts the shell still draws by name (the strip's scopes and the deal and step sheets:
 * TSX since decision 0015, step 5), `data/ask-line-globals.js`, the parts only Ask's Line draws by name (its charts, its
 * hold to talk, Leads' plan card: legacy-bridge/ask/line-globals.ts), and `data/mascot.js`
 * (see SAMPLES below). The stylesheets the app imports from outside the tree are read where the app has them (the kit's
 * and Campaigns', outsideCss below).
 *
 *   node tooling/scripts/serve-legacy.mjs [port] [dir]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");

/** What each extension is served as. Exported: the e2e harness serves the same tree the same way. */
export const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".jsx": "text/babel; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

const CONTRACTS = path.join(REPO, "packages/contracts/dist/index.js");

/**
 * What the mockup takes from the app's TypeScript, bundled for the browser, with contracts from its dist as the app
 * reads it. surfaces/kit/kit-globals.ts is the kit's components that the pages here still draw by name
 * (`Icon`, `FailedRead`, `SegmentBar`, `StatePill` ...), TSX since decision 0015: built with the classic JSX runtime over
 * the page's own React, as the app publishes them from seed-globals. A surface that has left the shell (Reports) is an
 * App Router page, which only the app draws, so the mockup has none of it. Built on the first request, and again when
 * an entry or the contracts dist changes.
 */
const SAMPLES = {
  "/data/kit-globals.js": {
    entry: path.join(REPO, "apps/dashboard/src/surfaces/kit/kit-globals.ts"),
    globalName: "__KG",
    footer: "Object.assign(window, __KG.KIT_GLOBALS);",
    // TSX: elements from the page's React (`React.createElement`), and the hooks it imports are the page's React's.
    jsx: "transform",
    reactIsTheWindows: true,
  },
  // The frame itself (surfaces/frame/app-shell.tsx, TypeScript since the one-system plan's step 7e), on the page's own
  // React, under the name the document's boot draws (`ChanlyticsApp`); the app imports it (LegacyApp.tsx).
  "/data/frame-app.js": {
    entry: path.join(REPO, "apps/dashboard/src/surfaces/frame/app-shell.tsx"),
    globalName: "__FA",
    footer: "window.ChanlyticsApp = __FA.ChanlyticsApp;",
    banner: "var process = globalThis.process || { env: {} };",
    jsx: "transform",
    reactIsTheWindows: true,
    atDashboard: true,
    watch: ["apps/dashboard/src/surfaces/frame", "apps/dashboard/src/surfaces/kit", "apps/dashboard/src/legacy-bridge"],
  },
  // The frame's helpers the pages read by name (surfaces/frame/frame-globals.ts), on the page's own React, installed as the
  // app installs them from seed-globals: the functions, then the presence and policy stores, the contracts and the tip
  // where none is.
  "/data/frame-globals.js": {
    entry: path.join(REPO, "apps/dashboard/src/surfaces/frame/frame-globals.ts"),
    globalName: "__FG",
    footer: "__FG.installFrameGlobals();",
    banner: "var process = globalThis.process || { env: {} };",
    jsx: "transform",
    reactIsTheWindows: true,
    atDashboard: true,
    watch: ["apps/dashboard/src/surfaces/frame", "apps/dashboard/src/surfaces/kit", "apps/dashboard/src/legacy-bridge"],
  },
  // The Inbox's and Conversations' names (surfaces/inbox/legacy-globals.ts, through e2e-harness/inbox-src.ts): the
  // session's decisions and the two rules the shell asks (what waits on you, which tab a row is on), with the demo's seeded
  // threads and calls, which the app fetches only in a demo. Not React.
  "/data/inbox-globals.js": {
    entry: path.join(HERE, "e2e-harness/inbox-src.ts"),
    globalName: "__IG",
    footer: "Object.assign(window, __IG.INBOX_GLOBALS, __IG.INBOX_DEMO); __IG.hearPresence();",
    atDashboard: true,
    watch: "apps/dashboard/src/surfaces/inbox",
  },
  // The object the app publishes from seed-globals (surfaces/people/people-globals.ts), on the page's own React. A name the
  // page already has is left alone, so the harness's own copy (data/people-globals-harness.js, which shares the fixture's
  // People) wins where it ran first. The mockup draws no People page of its own (an App Router page, which only the app
  // draws), so what reads these names here are the Leads scope, the Pipeline and the person page.
  "/data/people-globals.js": {
    entry: path.join(REPO, "apps/dashboard/src/surfaces/people/people-globals.ts"),
    globalName: "__PG",
    footer: "for (const k of Object.keys(__PG.PEOPLE_GLOBALS)) if (!(k in window)) window[k] = __PG.PEOPLE_GLOBALS[k];",
    banner: "var process = globalThis.process || { env: {} };",
    jsx: "transform",
    reactIsTheWindows: true,
    atDashboard: true,
    watch: ["apps/dashboard/src/surfaces/people", "apps/dashboard/src/legacy-bridge"],
  },
  // The parts only Ask's Line draws by name (legacy-bridge/ask/line-globals.ts: its charts, its hold to talk, Leads' plan
  // card), on the page's own React; the app publishes them with the Line's own chunk.
  "/data/ask-line-globals.js": {
    entry: path.join(REPO, "apps/dashboard/src/legacy-bridge/ask/line-globals.ts"),
    globalName: "__AG",
    // And the frame's AskBar, which in the app draws the Line once its chunk is in (legacy-bridge/ask/line.tsx): here
    // every file is loaded up front, so it draws the Line at once.
    footer:
      "Object.assign(window, __AG.ASK_LINE_GLOBALS); window.AskBar = window.AskBar || function AskBar(p) { return window.React.createElement(window.AskLineReal, p); };",
    banner: "var process = globalThis.process || { env: {} };",
    jsx: "transform",
    reactIsTheWindows: true,
    atDashboard: true,
    watch: ["apps/dashboard/src/surfaces/kit", "apps/dashboard/src/surfaces/leads", "apps/dashboard/src/legacy-bridge"],
  },
  // The same for the e2e harness's People record: the fixture boots People (peopleOverride) in a bundle of its own, before
  // React loads, so this bundle keeps its own copy of the surface's store and takes People from the window the fixture
  // published it on (people-src.ts).
  "/data/people-globals-harness.js": {
    entry: path.join(HERE, "e2e-harness/people-src.ts"),
    globalName: "__PGH",
    footer: "Object.assign(window, __PGH.PEOPLE_GLOBALS); __PGH.followPeople(window);",
    banner: "var process = globalThis.process || { env: {} };",
    jsx: "transform",
    reactIsTheWindows: true,
    atDashboard: true,
    watch: ["apps/dashboard/src/surfaces/people", "apps/dashboard/src/legacy-bridge"],
  },
  // Not a sample either: the three (legacy-bridge/mascot), the character Ask's face draws (components/ask-face.jsx:
  // the top bar's button, the Stage and the phone's ✦), so the mockup's Ask has its face.
  "/data/mascot.js": {
    entry: path.join(REPO, "apps/dashboard/src/legacy-bridge/mascot/index.ts"),
    globalName: "__MS",
    footer: "__MS.installMascot();",
  },
};
const built = new Map();

/** The window's own React, for a bundle whose components import `react`: the page loads React once, and this is it. */
const windowReact = {
  name: "window-react",
  setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "window-react" }));
    b.onLoad({ filter: /.*/, namespace: "window-react" }, () => ({
      contents: "module.exports = window.React;",
      loader: "js",
    }));
  },
};

/** A bundle's newest source: its entry, the contracts dist, and (for TSX) every file of the kit and the bridge it can name. */
function stampOf(s) {
  const files = [s.entry, CONTRACTS];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|css)$/.test(e.name)) files.push(p);
    }
  };
  if (s.reactIsTheWindows) walk(path.join(REPO, "apps/dashboard/src/surfaces/kit"));
  for (const dir of [].concat(s.watch ?? [])) walk(path.join(REPO, dir));
  return files.map((f) => fs.statSync(f).mtimeMs).join(":");
}

async function sampleBundle(route) {
  const s = SAMPLES[route];
  const stamp = stampOf(s);
  const hit = built.get(route);
  if (hit && hit.stamp === stamp) return hit.js;
  const { build } = await import("esbuild");
  const out = await build({
    entryPoints: [s.entry],
    bundle: true,
    format: "iife",
    globalName: s.globalName,
    platform: "browser",
    target: "es2020",
    write: false,
    logLevel: "silent",
    alias: {
      // The schemas a page asks for by import() (contracts' write-rules entry), bundled in, as the mockup has no chunks.
      "@chanlytics/contracts/write-rules": path.join(REPO, "packages/contracts/dist/write-rules.js"),
      // The kinds only Ask's cards commit (contracts' ask-only entry), which the verb walk loads by import(), the same way.
      "@chanlytics/contracts/ask-only": path.join(REPO, "packages/contracts/dist/ask-only.js"),
      // The pages' verb specs, which the verb walk loads by import(): the root entry's own module, so one table.
      "@chanlytics/contracts/page-specs": CONTRACTS,
      "@chanlytics/contracts": CONTRACTS,
      ...(s.atDashboard ? { "@": path.join(REPO, "apps/dashboard/src") } : {}),
    },
    ...(s.jsx ? { jsx: s.jsx } : {}),
    ...(s.reactIsTheWindows ? { plugins: [windowReact] } : {}),
    ...(s.banner ? { banner: { js: s.banner } } : {}),
    footer: { js: s.footer },
  });
  built.set(route, { stamp, js: out.outputFiles[0].text });
  return built.get(route).js;
}

export const kitGlobalsBundle = () => sampleBundle("/data/kit-globals.js");
export const frameGlobalsBundle = () => sampleBundle("/data/frame-globals.js");
export const frameAppBundle = () => sampleBundle("/data/frame-app.js");
export const inboxGlobalsBundle = () => sampleBundle("/data/inbox-globals.js");
export const peopleGlobalsBundle = () => sampleBundle("/data/people-globals.js");
export const askLineGlobalsBundle = () => sampleBundle("/data/ask-line-globals.js");
export const peopleGlobalsHarnessBundle = () => sampleBundle("/data/people-globals-harness.js");
export const mascotBundle = () => sampleBundle("/data/mascot.js");

export const send = (res, status, type, body) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store, must-revalidate" });
  res.end(body);
};

const SRC = path.join(REPO, "apps/dashboard/src");
const LEGACY = path.join(SRC, "legacy");
const BRIDGE = path.join(SRC, "legacy-bridge");

/**
 * The stylesheets the app imports, in its order, each as a path from src/: the shell's one entry, legacy-bridge/legacy.css
 * (Next orders nothing across imports, so one file does). The tokens' and the shell's are under legacy/; the kit's and
 * Campaigns' live with their surface (a moved surface keeps its rules in its own folder).
 */
const appStylesheets = () =>
  [...fs.readFileSync(path.join(BRIDGE, "legacy.css"), "utf8").matchAll(/^@import "([^"]+)";/gm)].map((m) =>
    path.relative(SRC, path.resolve(BRIDGE, m[1])).split(path.sep).join("/"),
  );

/** Where the document asks for a stylesheet: its path under legacy/, or from src/ for one outside the tree. */
const linkOf = (sheet) => (sheet.startsWith("legacy/") ? sheet.slice("legacy/".length) : sheet);

/** The stylesheets the document names from outside the mockup's tree, each at its one path, and only those. */
const outsideCss = () =>
  appStylesheets()
    .filter((sheet) => !sheet.startsWith("legacy/"))
    .map((sheet) => ({ at: `/${sheet}`, file: path.join(SRC, sheet) }));

/**
 * The files of the shell the app loads, in its order, each as a path under legacy/: the frame's (manifest.ts), then Ask's
 * Line's (ask/line-code.ts, a chunk of its own in the app, loaded here with the rest). Their order is the
 * shared global scope's: data seeds globals that pages read at module scope. seed-globals
 * is the app's own; the document's stand-ins (data/bridge-stubs.jsx and the bundles after it) stand where it does.
 */
const appScripts = () =>
  ["manifest.ts", "ask/line-code.ts"].flatMap((list) =>
    [...fs.readFileSync(path.join(BRIDGE, list), "utf8").matchAll(/^import "([^"]+)";/gm)]
      .map((m) => m[1])
      .filter((spec) => spec !== "./seed-globals" && spec !== "./line-globals")
      .map((spec) => {
        if (!spec.startsWith("@/legacy/")) throw new Error(`${list} imports ${spec}, which the mockup cannot load`);
        return spec.slice("@/legacy/".length);
      }),
  );

/** Where Chanlytics.html says each list goes. */
const STYLESHEETS_HERE = "<!-- The app's stylesheets -->";
const SCRIPTS_HERE = "<!-- The app's files -->";

/**
 * The mockup's document: Chanlytics.html with the stylesheets the app imports linked, and the files it loads named, each
 * where the document says. Exported: the e2e harness serves this document too, and its kit gallery reads its links.
 */
export function legacyDocument() {
  const at = (doc, marker, tags) => {
    if (!doc.includes(marker)) throw new Error(`Chanlytics.html says nowhere where ${marker} go`);
    return doc.replace(marker, tags.join("\n  "));
  };
  const template = fs.readFileSync(path.join(LEGACY, "Chanlytics.html"), "utf8");
  return at(
    at(
      template,
      STYLESHEETS_HERE,
      appStylesheets().map((sheet) => `<link rel="stylesheet" href="${linkOf(sheet)}" />`),
    ),
    SCRIPTS_HERE,
    appScripts().map((file) =>
      file.endsWith(".jsx") ? `<script type="text/babel" src="${file}"></script>` : `<script src="${file}"></script>`,
    ),
  );
}

/**
 * Whether `file` is under `root`, compared as paths: `src/legacy-bridge` begins with the letters of `src/legacy`
 * and is beside it, not under it, so a path that climbs there (`/..%2flegacy-bridge%2flegacy.css` decoded, or its
 * `%5c` form on Windows) is outside the tree.
 */
const isUnder = (root, file) => {
  const rel = path.relative(root, file);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
};

/**
 * One file of the mockup, by its path under `root`, or a stylesheet the app imports from outside the tree at its one
 * path. Nothing else outside the tree, whatever the path says. Exported for the e2e harness, which serves the same tree
 * with its own routes in front of it.
 */
export function serveStatic(res, root, rel) {
  const outside = outsideCss().find((css) => css.at === rel);
  const file = outside ? outside.file : path.join(root, rel);
  if (!outside && !isUnder(root, file)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(file, (err, body) => {
    if (err) {
      send(res, 404, "text/plain", "Not found");
      return;
    }
    send(res, 200, TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", body);
  });
}

function serve(port, root) {
  http
    .createServer((req, res) => {
      // A query string is never part of the path.
      const rel = decodeURIComponent((req.url || "/").split("?")[0]);
      if (rel === "/" || rel === "/Chanlytics.html") {
        send(res, 200, TYPES[".html"], legacyDocument());
        return;
      }
      if (SAMPLES[rel]) {
        sampleBundle(rel).then(
          (js) => send(res, 200, TYPES[".js"], js),
          (e) => send(res, 500, "text/plain", `${rel.slice("/data/".length)} could not be built: ${e.message}`),
        );
        return;
      }
      serveStatic(res, root, rel);
    })
    .listen(port, () => console.log(`Chanlytics mockup on http://localhost:${port}/Chanlytics.html (no-store)`));
}

// Run as a server; imported (a test reads kitGlobalsBundle), nothing listens.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  serve(
    Number(process.argv[2] || 3210),
    path.resolve(process.argv[3] || path.join(HERE, "../../apps/dashboard/src/legacy")),
  );
}
