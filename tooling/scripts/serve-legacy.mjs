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
 * One file is built rather than read: `data/reports-sample.js`, the demo's
 * Reports (see reportsSampleBundle below).
 *
 *   node tooling/scripts/serve-legacy.mjs [port] [dir]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");

const TYPES = {
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

const SAMPLE = path.join(REPO, "apps/dashboard/src/legacy-bridge/reports-sample.ts");
const CONTRACTS = path.join(REPO, "packages/contracts/dist/index.js");
let built = { stamp: "", js: "" };

/**
 * The demo's Reports, for the mockup: legacy-bridge/reports-sample.ts (a sample business through the same contracts
 * functions a real workspace's numbers go through) bundled for the browser, with contracts from its dist as the app
 * reads it. Chanlytics.html loads it as data/reports-sample.js; it publishes window.__reportsSample, which Reports
 * draws in a demo session, so the mockup shows the one Reports page there is. Built on the first request, and again
 * when the sample or the contracts dist changes.
 */
export async function reportsSampleBundle() {
  const stamp = [SAMPLE, CONTRACTS].map((f) => fs.statSync(f).mtimeMs).join(":");
  if (built.stamp === stamp) return built.js;
  const { build } = await import("esbuild");
  const out = await build({
    entryPoints: [SAMPLE],
    bundle: true,
    format: "iife",
    globalName: "__RS",
    platform: "browser",
    target: "es2020",
    write: false,
    logLevel: "silent",
    alias: { "@chanlytics/contracts": CONTRACTS },
    footer: { js: "window.__reportsSample = __RS.reportsSample;" },
  });
  built = { stamp, js: out.outputFiles[0].text };
  return built.js;
}

const send = (res, status, type, body) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store, must-revalidate" });
  res.end(body);
};

function serve(port, root) {
  http
    .createServer((req, res) => {
      // The query string is the cache-buster, never part of the path.
      const rel = decodeURIComponent((req.url || "/").split("?")[0]);
      if (rel === "/data/reports-sample.js") {
        reportsSampleBundle().then(
          (js) => send(res, 200, TYPES[".js"], js),
          (e) => send(res, 500, "text/plain", `reports-sample.js could not be built: ${e.message}`),
        );
        return;
      }
      const file = path.join(root, rel === "/" ? "/Chanlytics.html" : rel);
      // Nothing outside the mockup, whatever the path says.
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
    })
    .listen(port, () => console.log(`Chanlytics mockup on http://localhost:${port}/Chanlytics.html (no-store)`));
}

// Run as a server; imported (a test reads reportsSampleBundle), nothing listens.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  serve(Number(process.argv[2] || 3210), path.resolve(process.argv[3] || path.join(HERE, "../../apps/dashboard/src/legacy")));
}
