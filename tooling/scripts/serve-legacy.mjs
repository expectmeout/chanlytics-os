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
 *   node tooling/scripts/serve-legacy.mjs [port] [dir]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 3210);
const root = path.resolve(process.argv[3] || path.join(HERE, "../../apps/dashboard/src/legacy"));

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

http
  .createServer((req, res) => {
    // The query string is the cache-buster, never part of the path.
    const rel = decodeURIComponent((req.url || "/").split("?")[0]);
    const file = path.join(root, rel === "/" ? "/Chanlytics.html" : rel);
    // Nothing outside the mockup, whatever the path says.
    if (!file.startsWith(root)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain", "cache-control": "no-store" }).end("Not found");
        return;
      }
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store, must-revalidate",
      });
      res.end(body);
    });
  })
  .listen(port, () => console.log(`Chanlytics mockup on http://localhost:${port}/Chanlytics.html (no-store)`));
