/**
 * A stand-in for GitHub's API and the edge's doors, preloaded into the morning line's script:
 * `node --import <this file> tooling/scripts/ops/morning/morning-line.mjs`. What each answers is the JSON file
 * MORNING_STUB names: `main` (its newest commit), `workflows`, `runs` by workflow file, `jobs` by run id,
 * `issues` (the open ones), and
 * `health`, `diag` and `page`, each `[status, body]`. Every request is appended to the file MORNING_SEEN names, a
 * line of JSON each, so a test reads what was asked and what was sent. Nothing leaves the machine.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import fs from "node:fs";

const world = JSON.parse(fs.readFileSync(process.env.MORNING_STUB, "utf8"));
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = async (url, init = {}) => {
  const target = new URL(String(url));
  const method = init.method ?? "GET";
  fs.appendFileSync(
    process.env.MORNING_SEEN,
    `${JSON.stringify({
      method,
      host: target.hostname,
      path: target.pathname,
      key: init.headers?.["x-diag-key"] ?? null,
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
    })}\n`,
  );
  if (target.hostname !== "api.github.com") {
    const door = { "/api/health": world.health, "/api/diag": world.diag, "/api/admin/page": world.page }[
      target.pathname
    ];
    if (!door) throw new Error(`the stub has no answer for ${target.href}`);
    return json(door[0], door[1]);
  }
  const at = target.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, "");
  if (method !== "GET") return json(200, { number: 9 });
  if (at === "/commits/main") return json(200, { sha: world.main ?? "10a175d150aabbccdd" });
  if (at === "/actions/workflows") return json(200, { workflows: world.workflows ?? [] });
  const runs = /^\/actions\/workflows\/([^/]+)\/runs$/.exec(at);
  if (runs) {
    if (world.unreadable?.includes(runs[1])) return json(502, { message: "bad gateway" });
    return json(200, { workflow_runs: world.runs?.[runs[1]] ?? [] });
  }
  const jobs = /^\/actions\/runs\/(\d+)\/jobs$/.exec(at);
  if (jobs) return json(200, { jobs: world.jobs?.[jobs[1]] ?? [] });
  if (at === "/issues") return json(200, world.issues ?? []);
  throw new Error(`the stub has no answer for ${target.href}`);
};
