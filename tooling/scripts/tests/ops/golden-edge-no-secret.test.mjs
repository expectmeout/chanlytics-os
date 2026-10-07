/**
 * The golden probes a pull request's preview can take without a secret (tooling/scripts/ops/golden-edge.mjs
 * --no-secret): the public pages, and every door refusing a caller with no key or the wrong one. Each probe that
 * signs or keys its request is skipped and said so, never run with an empty secret and failed. Run here against a
 * local host that answers as the edge's doors answer a stranger.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../../ops/golden-edge.mjs", import.meta.url));

/** What the edge answers a caller who holds no secret, door by door. */
function stranger(req, res) {
  const url = new URL(req.url, "http://edge");
  const send = (status, body, type = "application/json") => {
    res.writeHead(status, { "content-type": type });
    res.end(body);
  };
  if (req.method === "GET" && url.pathname === "/") return send(200, "<h1>Chanlytics</h1>", "text/html");
  if (req.method === "GET" && url.pathname === "/privacy.html")
    return send(200, "<h1>Privacy policy</h1>", "text/html");
  if (url.pathname === "/api/whatsapp") return send(req.method === "GET" ? 403 : 401, '{"ok":false}');
  if (url.pathname === "/api/retell-webhook" || url.pathname === "/api/retell-fn") return send(401, '{"ok":false}');
  if (url.pathname === "/api/diag") return send(403, '{"ok":false}');
  return send(404, '{"error":"not_found"}');
}

async function edge() {
  const server = http.createServer(stranger);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

const run = (args, env) =>
  new Promise((resolve) => {
    const clean = { ...process.env };
    for (const k of [
      "BASE_URL",
      "VERCEL_URL",
      "META_APP_SECRET",
      "WHATSAPP_VERIFY_TOKEN",
      "RETELL_FN_SECRET",
      "DIAG_KEY",
    ])
      delete clean[k];
    const child = spawn(process.execPath, [SCRIPT, ...args], { env: { ...clean, ...env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (code) => resolve({ code, out }));
  });

test("--no-secret runs the probes a stranger can make, skips the seven that sign or key a request, and passes", async () => {
  const base = await edge();
  const { code, out } = await run(["--no-secret"], { BASE_URL: base });
  assert.equal(code, 0, out);
  assert.match(out, /8 passed, 0 failed, 7 skipped \(--no-secret\)/);
  assert.match(out, /skip POST \/api\/whatsapp signed status payload is 200 ok \(needs a secret; --no-secret\)/);
});

test("without --no-secret a probe that needs a secret runs, and fails with none, rather than passing unseen", async () => {
  const base = await edge();
  const { code, out } = await run([], { BASE_URL: base });
  assert.equal(code, 1);
  assert.match(out, /FAIL GET \/api\/whatsapp handshake echoes challenge/);
});

test("a preview's VERCEL_URL stands in for BASE_URL; with neither, it says what it needs", async () => {
  const none = await run(["--no-secret"], {});
  assert.equal(none.code, 2);
  assert.match(none.out, /BASE_URL \(or VERCEL_URL\) required/);
  // VERCEL_URL is a host: https is added, so a local http host cannot answer it; the probes fail to connect rather
  // than read BASE_URL's absence as a pass.
  const preview = await run(["--no-secret"], { VERCEL_URL: "127.0.0.1:9" });
  assert.equal(preview.code, 1);
  assert.match(preview.out, /FAIL GET \/ is 200/);
});
