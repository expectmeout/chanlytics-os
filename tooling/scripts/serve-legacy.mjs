/**
 * The static server the standalone mockup is opened on.
 *
 * `python -m http.server` sends Last-Modified and NOTHING else, so a browser
 * applies heuristic freshness and serves `Chanlytics.html` from disk cache
 * without asking — for as long as a tenth of the document's age, which for a
 * file edited a few times a month is days. The `?v=N` convention protects
 * every script and stylesheet the document names; nothing protects the
 * document, and a stale one keeps a `<script>` tag for a file that was deleted
 * (`tweaks-panel.jsx`) and boots into a blank page with a ReferenceError. That
 * is not a bug anyone can find by reading the repo, because the repo is right.
 *
 * So: no-store, everything, always. This serves a design review, not traffic.
 *
 * Five files are built rather than read: `data/kit-globals.js`, the kit's components the pages here still draw by name,
 * `data/inbox-globals.js`, the Inbox's and Conversations' seeded rows and rules under the names the pages here still read,
 * `data/today-sample.js`, the demo's Today, `data/business-tab.js`, the Business tab's helpers, and `data/mascot.js`
 * (see SAMPLES below). One is read from outside the tree: the kit's stylesheet (KIT_CSS below).
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
 * reads it. legacy-bridge/today-sample.ts is the demo's Today (a sample business through the same contracts functions a
 * real workspace's numbers go through): Chanlytics.html loads it as data/today-sample.js, it publishes its function on
 * window (`__todaySample`) and installs its surfaces where the app's globals are absent, so the mockup shows the one
 * Today page there is. surfaces/kit/kit-globals.ts is the kit's components that the pages here still draw by name
 * (`Icon`, `EmptyState`, `FailedRead`, `SegmentBar`), TSX since decision 0015: built with the classic JSX runtime over
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
  // The Inbox's and Conversations' names (surfaces/inbox/legacy-globals.ts): the demo's seeded threads and calls, the
  // session's decisions, and the two rules the shell asks (what waits on you, which tab a row is on). Not React.
  "/data/inbox-globals.js": {
    entry: path.join(REPO, "apps/dashboard/src/surfaces/inbox/legacy-globals.ts"),
    globalName: "__IG",
    footer: "Object.assign(window, __IG.INBOX_GLOBALS); __IG.hearPresence();",
    watch: "apps/dashboard/src/surfaces/inbox",
  },
  "/data/today-sample.js": {
    entry: path.join(REPO, "apps/dashboard/src/legacy-bridge/today-sample.ts"),
    globalName: "__TS",
    footer: "window.__todaySample = __TS.todaySample; __TS.installTodaySample(window);",
  },
  // Not a sample: the object the app publishes as window.__businessTab (legacy-bridge/business-tab.ts). With no
  // settings read behind the mockup, a fold is told nothing.
  "/data/business-tab.js": {
    entry: path.join(REPO, "apps/dashboard/src/legacy-bridge/business-tab.ts"),
    globalName: "__BT",
    footer: "__BT.installBusinessTab();",
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
  if (s.watch) walk(path.join(REPO, s.watch));
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
    alias: { "@chanlytics/contracts": CONTRACTS },
    ...(s.jsx ? { jsx: s.jsx } : {}),
    ...(s.reactIsTheWindows ? { plugins: [windowReact] } : {}),
    footer: { js: s.footer },
  });
  built.set(route, { stamp, js: out.outputFiles[0].text });
  return built.get(route).js;
}

export const kitGlobalsBundle = () => sampleBundle("/data/kit-globals.js");
export const inboxGlobalsBundle = () => sampleBundle("/data/inbox-globals.js");
export const todaySampleBundle = () => sampleBundle("/data/today-sample.js");
export const businessTabBundle = () => sampleBundle("/data/business-tab.js");
export const mascotBundle = () => sampleBundle("/data/mascot.js");

export const send = (res, status, type, body) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store, must-revalidate" });
  res.end(body);
};

/**
 * The one file the document names from outside the mockup's tree: the kit's stylesheet, which lives with the kit and
 * which the app imports right after the tokens (legacy-bridge/legacy.css). Chanlytics.html links it in the same place,
 * as `surfaces/kit/kit.css`, so it is asked for at this path.
 */
const KIT_CSS = { at: "/surfaces/kit/kit.css", file: path.join(REPO, "apps/dashboard/src/surfaces/kit/kit.css") };

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
 * One file of the mockup, by its path under `root`, or the kit's stylesheet at its one path. Nothing else outside the
 * tree, whatever the path says. Exported for the e2e harness, which serves the same tree with its own routes in front
 * of it.
 */
export function serveStatic(res, root, rel) {
  const file = rel === KIT_CSS.at ? KIT_CSS.file : path.join(root, rel);
  if (file !== KIT_CSS.file && !isUnder(root, file)) {
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
      // The query string is the cache-buster, never part of the path.
      const rel = decodeURIComponent((req.url || "/").split("?")[0]);
      if (SAMPLES[rel]) {
        sampleBundle(rel).then(
          (js) => send(res, 200, TYPES[".js"], js),
          (e) => send(res, 500, "text/plain", `${rel.slice("/data/".length)} could not be built: ${e.message}`),
        );
        return;
      }
      serveStatic(res, root, rel === "/" ? "/Chanlytics.html" : rel);
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
