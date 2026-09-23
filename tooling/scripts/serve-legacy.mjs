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
 * Three files are built rather than read: `data/reports-sample.js` and `data/today-sample.js`, the demo's Reports and
 * Today, and `data/business-tab.js`, the Business tab's helpers (see SAMPLES below).
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
 * The demo's samples, for the mockup: legacy-bridge/reports-sample.ts and legacy-bridge/today-sample.ts (a sample
 * business through the same contracts functions a real workspace's numbers go through) bundled for the browser,
 * with contracts from its dist as the app reads it. Chanlytics.html loads them as data/*-sample.js; each publishes
 * its function on window (`__reportsSample`, `__todaySample`), and Today's installs its surfaces where the app's
 * globals are absent, so the mockup shows the one Reports page and the one Today page there are. Built on the first
 * request, and again when the sample or the contracts dist changes.
 */
const SAMPLES = {
  "/data/reports-sample.js": {
    entry: path.join(REPO, "apps/dashboard/src/legacy-bridge/reports-sample.ts"),
    globalName: "__RS",
    footer: "window.__reportsSample = __RS.reportsSample;",
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
  // Not a sample either: the three (legacy-bridge/mascot), the character Today's band draws (pages/today-face.jsx),
  // so the mockup's Today has its face. With no Ask behind the mockup, the band's field seeds the palette.
  "/data/mascot.js": {
    entry: path.join(REPO, "apps/dashboard/src/legacy-bridge/mascot/index.ts"),
    globalName: "__MS",
    footer: "__MS.installMascot();",
  },
};
const built = new Map();

async function sampleBundle(route) {
  const s = SAMPLES[route];
  const stamp = [s.entry, CONTRACTS].map((f) => fs.statSync(f).mtimeMs).join(":");
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
    footer: { js: s.footer },
  });
  built.set(route, { stamp, js: out.outputFiles[0].text });
  return built.get(route).js;
}

export const reportsSampleBundle = () => sampleBundle("/data/reports-sample.js");
export const todaySampleBundle = () => sampleBundle("/data/today-sample.js");
export const businessTabBundle = () => sampleBundle("/data/business-tab.js");
export const mascotBundle = () => sampleBundle("/data/mascot.js");

export const send = (res, status, type, body) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store, must-revalidate" });
  res.end(body);
};

/**
 * One file of the mockup, by its path under `root`. Nothing outside it, whatever the path says. Exported for the
 * e2e harness, which serves the same tree with its own routes in front of it.
 */
export function serveStatic(res, root, rel) {
  const file = path.join(root, rel);
  if (!file.startsWith(root)) {
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

// Run as a server; imported (a test reads reportsSampleBundle), nothing listens.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  serve(
    Number(process.argv[2] || 3210),
    path.resolve(process.argv[3] || path.join(HERE, "../../apps/dashboard/src/legacy")),
  );
}
