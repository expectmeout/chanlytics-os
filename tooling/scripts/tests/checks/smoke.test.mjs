/**
 * The smoke after a deploy (tooling/scripts/checks/smoke.mjs): the edge's health door and each app's version door,
 * asked over HTTP the way a pinger and the phone app ask them. Run here against a local server that answers as each
 * door does, well and badly. And its turn: which of the two projects' deployments of a commit smokes it, the one that
 * finished last, asked of a local server that answers as GitHub's deployments API does.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  argsOf,
  finishOf,
  judgeHealth,
  judgeVersion,
  newestOf,
  projectOf,
  smoke,
  turn,
  turnOf,
} from "../../checks/smoke.mjs";

const CLI = fileURLToPath(new URL("../../checks/smoke.mjs", import.meta.url));
const AT = "2026-09-29T12:00:00.000Z";

/** A host whose doors answer what `answers` says for its path: `[status, body]`. */
async function host(answers) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({
      url: req.url,
      bypass: req.headers["x-vercel-protection-bypass"] ?? null,
      authorization: req.headers.authorization ?? null,
    });
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

test("an edge still serving the build before the merge fails the smoke, though its health door answers well", async () => {
  // 6 October 2026: the smoke asked the edge only for its health, which the old build answers as well as the new one,
  // so it passed while the edge had not deployed yet.
  const edge = await host({
    "/api/health": [200, { ok: true, unhealthy: [], jobs_backlog: 0, checked_at: AT }],
    "/api/version": [200, { sha: "163f3678aee" }],
  });
  const dashboard = await host({ "/api/version": [200, { sha: "de16cc2e14f" }] });
  const results = await smoke(argsOf(["--edge", edge.base, "--dashboard", dashboard.base, "--sha", "de16cc2e1"]), {});
  assert.deepEqual(
    results.map((r) => [r.door, r.url.startsWith(edge.base) ? "edge" : "dashboard", r.problem]),
    [
      ["health", "edge", null],
      ["version", "edge", "runs 163f3678aee, not de16cc2e1"],
      ["version", "dashboard", null],
    ],
  );
  assert.deepEqual(
    edge.seen.map((s) => s.url),
    ["/api/health", "/api/version"],
  );
  const failed = await run(["--edge", edge.base, "--dashboard", dashboard.base, "--sha", "de16cc2e1"]);
  assert.equal(failed.code, 1);
  assert.match(failed.out, /FAIL .*\/api\/version: runs 163f3678aee, not de16cc2e1/);
  assert.equal((await run(["--edge", edge.base, "--dashboard", dashboard.base, "--sha", "163f3678a"])).code, 1);
});

/* ---- The turn: which project's finished deployment smokes the commit ---- */

const EDGE = "Production – chanlytics-messaging";
const DASHBOARD = "Production – chanlytics-os";
const SHA = "3f008699c";
const deployment = (id, environment, created_at) => ({ id, environment, created_at, sha: SHA });
const status = (state, created_at) => ({ state, created_at });
const edge = (state, at) => ({ project: "chanlytics-messaging", state, at });
const dashboard = (state, at) => ({ project: "chanlytics-os", state, at });

test("2 Nov 2026: the edge finished seven minutes before the dashboard, and the dashboard's event smokes, once", () => {
  // The smoke ran on the edge's event alone, found the dashboard on the commit before for five minutes, and opened an
  // issue for a deploy that was fine. The edge's event now stops, whether its run reads the dashboard still building or
  // already done; the dashboard's event, the later, smokes.
  const edgeDone = { state: "success", at: "2026-11-02T21:53:48Z" };
  const dashboardDone = { state: "success", at: "2026-11-02T22:00:49Z" };
  const early = turnOf(edge("success", edgeDone.at), "deploying");
  assert.equal(early.smoke, false);
  assert.match(early.why, /chanlytics-os is still deploying this commit: its own event smokes/);
  const late = turnOf(edge("success", edgeDone.at), dashboardDone);
  assert.equal(late.smoke, false, "a run that starts after both finished leaves the smoke to the later one");
  assert.match(late.why, /chanlytics-os \(success at 2026-11-02T22:00:49Z\) finished after chanlytics-messaging/);
  const last = turnOf(dashboard("success", dashboardDone.at), edgeDone);
  assert.equal(last.smoke, true);
  assert.equal(
    last.why,
    "chanlytics-os (success at 2026-11-02T22:00:49Z) finished last, after chanlytics-messaging (success at 2026-11-02T21:53:48Z).",
  );
});

test("10 Oct 2026: the edge finished three minutes after the dashboard, and the edge's event smokes, as it always did", () => {
  const dashboardDone = { state: "success", at: "2026-10-10T14:02:10Z" };
  const edgeDone = { state: "success", at: "2026-10-10T14:05:31Z" };
  assert.equal(turnOf(dashboard("success", dashboardDone.at), "deploying").smoke, false);
  assert.equal(turnOf(dashboard("success", dashboardDone.at), edgeDone).smoke, false);
  assert.equal(turnOf(edge("success", edgeDone.at), dashboardDone).smoke, true);
});

test("one of the two smokes, never both and never neither: a tie is the edge's, and a deployment that failed has finished", () => {
  const at = "2026-11-02T22:00:49Z";
  const earlier = "2026-11-02T21:53:48Z";
  for (const [mine, other] of [
    [edge("success", at), { state: "success", at }],
    [edge("success", at), { state: "success", at: earlier }],
    [edge("failure", at), { state: "success", at: earlier }],
    [edge("success", at), { state: "error", at: earlier }],
  ]) {
    const them = dashboard(other.state, other.at);
    const ours = { state: mine.state, at: mine.at };
    assert.equal(turnOf(mine, other).smoke, true, `the edge, ${mine.state} at ${mine.at}`);
    assert.equal(turnOf(them, ours).smoke, false, `the dashboard, ${them.state} at ${them.at}`);
  }
  assert.match(turnOf(dashboard("success", at), { state: "success", at }).why, /on a tie the edge's event smokes/);
  // A dashboard that failed after the edge deployed: its own event smokes, and the smoke fails on its host.
  const failed = turnOf(dashboard("failure", at), { state: "success", at: earlier });
  assert.equal(failed.smoke, true);
  assert.match(failed.why, /^chanlytics-os \(failure at .+\) finished last/);
});

test("nothing smokes before both have finished, nor for a deployment that is not a project's production", () => {
  assert.match(turnOf(edge("success", "2026-11-02T21:53:48Z"), null).why, /chanlytics-os has no production deployment/);
  assert.equal(turnOf(edge("success", "2026-11-02T21:53:48Z"), null).smoke, false);
  assert.equal(
    turnOf(edge("in_progress", "2026-11-02T21:53:48Z"), { state: "success", at: "2026-11-02T21:50:00Z" }).smoke,
    false,
  );
  assert.equal(turnOf({ project: null, state: "success", at: "2026-11-02T21:53:48Z" }, null).smoke, false);
  assert.equal(projectOf(EDGE), "chanlytics-messaging");
  assert.equal(projectOf(DASHBOARD), "chanlytics-os");
  assert.equal(projectOf("Preview – chanlytics-os"), null);
  assert.equal(projectOf(undefined), null);
});

test("the other project's deployment is its newest of the commit, and its finish the status that ended it", () => {
  const list = [
    deployment(7, "Preview – chanlytics-os", "2026-11-02T21:59:00Z"),
    deployment(5, DASHBOARD, "2026-11-02T21:45:00Z"),
    deployment(6, DASHBOARD, "2026-11-02T21:58:00Z"),
    deployment(4, EDGE, "2026-11-02T21:46:00Z"),
  ];
  assert.equal(newestOf(list, "chanlytics-os").id, 6, "a redeploy of the commit replaces the first");
  assert.equal(newestOf(list, "chanlytics-messaging").id, 4);
  assert.equal(newestOf([list[0]], "chanlytics-os"), null, "a preview is not production");
  assert.equal(
    newestOf(
      [deployment(8, EDGE, "2026-11-02T21:46:00Z"), deployment(9, EDGE, "2026-11-02T21:46:00Z")],
      "chanlytics-messaging",
    ).id,
    9,
  );
  // GitHub lists the newest status first, and adds `inactive` once a newer deployment replaced this one.
  assert.deepEqual(
    finishOf([
      status("inactive", "2026-11-02T23:10:00Z"),
      status("success", "2026-11-02T22:00:49Z"),
      status("in_progress", "2026-11-02T21:46:02Z"),
      status("pending", "2026-11-02T21:46:00Z"),
    ]),
    { state: "success", at: "2026-11-02T22:00:49Z" },
  );
  assert.equal(
    finishOf([status("in_progress", "2026-11-02T21:46:02Z"), status("pending", "2026-11-02T21:46:00Z")]),
    null,
  );
  assert.equal(finishOf([]), null);
});

/** GitHub's deployments API for one commit: its deployments, and each one's statuses. */
const api = (deployments, statuses) =>
  host({
    [`/repos/o/r/deployments?sha=${SHA}&per_page=100`]: [200, deployments],
    ...Object.fromEntries(
      Object.entries(statuses).map(([id, list]) => [`/repos/o/r/deployments/${id}/statuses?per_page=100`, [200, list]]),
    ),
  });
const envOf = (base, environment, state, at) => ({
  GITHUB_API_URL: base,
  GITHUB_REPOSITORY: "o/r",
  GH_TOKEN: "token-for-this-file",
  SHA,
  ENVIRONMENT: environment,
  STATE: state,
  AT: at,
});

test("the turn, asked of GitHub: the other project's newest deployment of the commit, read with the token", async () => {
  const deployments = [deployment(2, DASHBOARD, "2026-11-02T21:45:10Z"), deployment(1, EDGE, "2026-11-02T21:45:05Z")];
  const building = await api(deployments, {
    2: [status("in_progress", "2026-11-02T21:45:12Z")],
    1: [status("success", "2026-11-02T21:53:48Z")],
  });
  const early = await turn(envOf(building.base, EDGE, "success", "2026-11-02T21:53:48Z"));
  assert.equal(early.smoke, false);
  assert.match(early.why, /still deploying/);
  assert.deepEqual(
    building.seen.map((s) => [s.url, s.authorization]),
    [
      [`/repos/o/r/deployments?sha=${SHA}&per_page=100`, "Bearer token-for-this-file"],
      ["/repos/o/r/deployments/2/statuses?per_page=100", "Bearer token-for-this-file"],
    ],
    "the dashboard's statuses, never the edge's own",
  );

  const done = await api(deployments, {
    2: [status("success", "2026-11-02T22:00:49Z"), status("in_progress", "2026-11-02T21:45:12Z")],
    1: [status("success", "2026-11-02T21:53:48Z")],
  });
  assert.equal((await turn(envOf(done.base, EDGE, "success", "2026-11-02T21:53:48Z"))).smoke, false);
  assert.equal((await turn(envOf(done.base, DASHBOARD, "success", "2026-11-02T22:00:49Z"))).smoke, true);

  const none = await api([deployment(1, EDGE, "2026-11-02T21:45:05Z")], {});
  assert.match((await turn(envOf(none.base, EDGE, "success", "2026-11-02T21:53:48Z"))).why, /no production deployment/);
});

test("a deployments API that cannot be read smokes: a deploy is never left unjudged for an unanswered question", async () => {
  const down = await host({});
  const asked = await turn(envOf(down.base, EDGE, "success", "2026-11-02T21:53:48Z"));
  assert.equal(asked.smoke, true);
  assert.match(asked.why, /could not be read \(GET \/repos\/o\/r\/deployments answered 404\)/);
});

test("--turn prints smoke= and why= for $GITHUB_OUTPUT, and the reason for the log", async () => {
  const github = await api(
    [deployment(2, DASHBOARD, "2026-11-02T21:45:10Z"), deployment(1, EDGE, "2026-11-02T21:45:05Z")],
    {
      2: [status("success", "2026-11-02T22:00:49Z")],
      1: [status("success", "2026-11-02T21:53:48Z")],
    },
  );
  const first = await run(["--turn"], envOf(github.base, EDGE, "success", "2026-11-02T21:53:48Z"));
  assert.equal(first.code, 0);
  assert.match(first.out, /^smoke=no$/m);
  assert.match(first.out, /^why=chanlytics-os \(success at 2026-11-02T22:00:49Z\) finished after /m);
  const last = await run(["--turn"], envOf(github.base, DASHBOARD, "success", "2026-11-02T22:00:49Z"));
  assert.equal(last.code, 0);
  assert.match(last.out, /^smoke=yes$/m);
});
