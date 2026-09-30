/**
 * The smoke after a deploy (tooling/scripts/checks/smoke.mjs): the edge's health door and the dashboard's version
 * door, asked over HTTP the way a pinger and the phone app ask them. Run here against a local server that answers as
 * each door does, well and badly.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { argsOf, judgeHealth, judgeVersion, smoke } from "../../checks/smoke.mjs";

const CLI = fileURLToPath(new URL("../../checks/smoke.mjs", import.meta.url));
const AT = "2026-09-29T12:00:00.000Z";

/** A host whose doors answer what `answers` says for its path: `[status, body]`. */
async function host(answers) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, bypass: req.headers["x-vercel-protection-bypass"] ?? null });
    const [status, body] = answers[req.url] ?? [404, { error: "not_found" }];
    res.writeHead(status, { "content-type": "application/json" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  after(() => server.close());
  return { base: `http://127.0.0.1:${server.address().port}`, seen };
}

/** The CLI, run to its end: its exit code and what it printed. */
const run = (args, env = {}) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, ...env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (code) => resolve({ code, out }));
  });

test("the health door's answer: 200 and ok is well; 503 is the door saying what is wrong, taken only when asked", () => {
  const well = { ok: true, unhealthy: [], jobs_backlog: 0, checked_at: AT };
  const ill = { ok: false, unhealthy: ["deadman"], jobs_backlog: 3, checked_at: AT };
  assert.equal(judgeHealth(200, well), null);
  assert.match(judgeHealth(503, ill), /answered 503: deadman/);
  assert.equal(judgeHealth(503, ill, { allowUnhealthy: true }), null);
  assert.match(judgeHealth(200, { ok: true }), /without an unhealthy list/);
  assert.match(judgeHealth(502, null), /no JSON body/);
  assert.match(judgeHealth(200, { ...well, ok: false }), /answered 200 with ok: false/);
});

test("the version door's answer names a build, and the one asked for when one is", () => {
  assert.equal(judgeVersion(200, { sha: "1388f2cc6aa" }), null);
  assert.equal(judgeVersion(200, { sha: "1388f2cc6aa" }, { sha: "1388f2cc6" }), null);
  assert.match(judgeVersion(200, { sha: "dev" }, { sha: "1388f2cc6" }), /runs dev, not 1388f2cc6/);
  assert.match(judgeVersion(200, {}), /without a sha/);
  assert.match(judgeVersion(404, null), /answered 404/);
});

test("its arguments: one host for both doors, or each named; a bare host is https", () => {
  assert.deepEqual(argsOf(["preview-abc.vercel.app"]), {
    edge: "https://preview-abc.vercel.app",
    dashboard: "https://preview-abc.vercel.app",
    sha: null,
    allowUnhealthy: false,
  });
  assert.deepEqual(argsOf(["--edge", "https://e.example.com/", "--sha", "abc"]), {
    edge: "https://e.example.com",
    dashboard: null,
    sha: "abc",
    allowUnhealthy: false,
  });
  assert.match(argsOf([]).error, /no host/);
  assert.match(argsOf(["--nope"]).error, /unknown flag/);
});

test("run against a host: both doors asked, the bypass header sent, the exit code says whether each answered well", async () => {
  const good = await host({
    "/api/health": [200, { ok: true, unhealthy: [], jobs_backlog: 0, checked_at: AT }],
    "/api/version": [200, { sha: "1388f2cc6aa" }],
  });
  const results = await smoke(argsOf([good.base]), { VERCEL_AUTOMATION_BYPASS_SECRET: "bypass-for-this-file" });
  assert.deepEqual(
    results.map((r) => [r.door, r.problem]),
    [
      ["health", null],
      ["version", null],
    ],
  );
  assert.deepEqual(
    good.seen.map((s) => s.bypass),
    ["bypass-for-this-file", "bypass-for-this-file"],
  );
  assert.equal((await run([good.base, "--sha", "1388f2cc6"])).code, 0);

  const bad = await host({
    "/api/health": [503, { ok: false, unhealthy: [], jobs_backlog: null, checked_at: AT, reason: "no_database" }],
    "/api/version": [200, { sha: "dev" }],
  });
  const failed = await run([bad.base, "--sha", "1388f2cc6"]);
  assert.equal(failed.code, 1);
  assert.match(failed.out, /FAIL .*\/api\/health: answered 503: no_database/);
  assert.match(failed.out, /FAIL .*\/api\/version: runs dev, not 1388f2cc6/);
  assert.equal((await run(["--edge", bad.base, "--allow-unhealthy"])).code, 0);
  assert.equal((await run([])).code, 2);
});
